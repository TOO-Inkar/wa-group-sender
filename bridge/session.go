package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

type event struct {
	Seq           int64  `json:"seq"`
	Type          string `json:"type"`
	Payload       string `json:"payload,omitempty"`
	Reason        string `json:"reason,omitempty"`
	AutoReconnect bool   `json:"autoReconnect"`
	JID           string `json:"jid,omitempty"`
	At            int64  `json:"at,omitempty"`
}

type session struct {
	key      string
	instance string
	devices  *devices
	waLog    waLog.Logger
	log      *slog.Logger

	mu    sync.Mutex
	cli   *whatsmeow.Client
	state string
	qr    string
	proxy *url.URL
	http  *http.Client

	evMu   sync.Mutex
	evCond *sync.Cond
	seq    int64
	events []event

	undecryptable atomic.Int64
	decrypted     atomic.Int64

	nameMu sync.Mutex
	names  map[string]string

	last *sql.DB
	keys *senderKeyRecipients
}

func newSession(key string, devices *devices, log waLog.Logger, last *sql.DB, keys *senderKeyRecipients) *session {
	s := &session{key: key, instance: randomID(), devices: devices, waLog: log, log: slog.With("session", key),
		state: "STARTING", http: proxyClient(nil), names: map[string]string{}, last: last, keys: keys}
	s.evCond = sync.NewCond(&s.evMu)
	return s
}

func (s *session) connect(proxy *url.URL) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cli != nil && s.cli.IsConnected() && sameProxy(s.proxy, proxy) {
		// Replay the state: a restarted Java service missed the original events.
		switch {
		case s.state == "CONNECTED":
			s.emit(event{Type: "connected"})
		case s.state == "WAITING_QR" && s.qr != "":
			s.emit(event{Type: "qr", Payload: s.qr})
		}
		return nil
	}
	s.release()
	device, err := s.devices.device(context.Background(), s.key)
	if err != nil {
		return fmt.Errorf("device: %w", err)
	}
	cli := whatsmeow.NewClient(device, s.waLog)
	if proxy != nil {
		if err := cli.SetProxyAddress(proxy.String()); err != nil {
			return fmt.Errorf("proxy %s: %w", maskProxy(proxy), err)
		}
	}
	s.proxy = proxy
	s.http = proxyClient(proxy)
	keys := s.keys.forClient(cli)
	cli.SenderKeyRecipients = keys
	cli.UseRetryMessageStore = true
	cli.PreRetryCallback = func(receipt *events.Receipt, _ types.MessageID, _ int, _ *waE2E.Message) bool {
		keys.markRetry(receipt)
		return true
	}
	cli.AddEventHandler(func(evt any) { s.onEvent(cli, evt) })
	s.cli = cli
	s.log.Info("SESSION connecting", "proxy", maskProxy(proxy))
	s.setState("CONNECTING", "")

	if cli.Store.ID == nil {
		qr, err := cli.GetQRChannel(context.Background())
		if err != nil {
			return fmt.Errorf("qr channel: %w", err)
		}
		if err := cli.Connect(); err != nil {
			return fmt.Errorf("connect: %w", err)
		}
		go s.consumeQR(cli, qr)
		return nil
	}
	if err := cli.Connect(); err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	return nil
}

func (s *session) release() {
	if s.cli != nil {
		s.cli.RemoveEventHandlers()
		s.cli.Disconnect()
		s.cli = nil
	}
}

func (s *session) disconnect() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.release()
	s.setState("DISCONNECTED", "")
}

func (s *session) stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.release()
}

func (s *session) logout(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cli != nil && s.cli.IsLoggedIn() {
		s.cli.RemoveEventHandlers()
		if err := s.cli.Logout(ctx); err != nil {
			s.log.Warn("SESSION logout failed", "err", err)
		}
	}
	s.release()
	s.setState("LOGGED_OUT", "")
}

func (s *session) close() error {
	return errors.Join(s.last.Close(), s.keys.db.Close())
}

func (s *session) consumeQR(cli *whatsmeow.Client, qr <-chan whatsmeow.QRChannelItem) {
	for item := range qr {
		if !s.current(cli) {
			return
		}
		switch item.Event {
		case whatsmeow.QRChannelEventCode:
			s.mu.Lock()
			s.setState("WAITING_QR", item.Code)
			s.mu.Unlock()
			s.emit(event{Type: "qr", Payload: item.Code})
		case whatsmeow.QRChannelEventPasskeyRequest:
			s.log.Error("PAIRING WhatsApp requires a passkey (WebAuthn) to link this device; headless pairing is not possible for this number")
		case whatsmeow.QRChannelEventError:
			s.log.Error("PAIRING failed", "err", item.Error)
			s.dropped("pairing failed: " + fmt.Sprint(item.Error))
		case "success":
			s.log.Info("PAIRING success")
		case "timeout":
			s.log.Warn("PAIRING QR codes expired")
			s.dropped("qr timeout")
		default:
			s.log.Warn("PAIRING event", "event", item.Event)
			if strings.HasPrefix(item.Event, "err") {
				s.dropped(item.Event)
			}
		}
	}
}

func (s *session) dropped(reason string) {
	s.mu.Lock()
	s.setState("DISCONNECTED", "")
	s.mu.Unlock()
	s.emit(event{Type: "disconnected", Reason: reason})
}

func (s *session) bind(jid types.JID) {
	if err := s.devices.bind(context.Background(), s.key, jid); err != nil {
		s.log.Error("SESSION device mapping not saved", "jid", jid.String(), "err", err)
	}
}

func (s *session) onEvent(cli *whatsmeow.Client, evt any) {
	if !s.current(cli) {
		return
	}
	switch e := evt.(type) {
	case *events.PairSuccess:
		s.log.Info("SESSION paired", "jid", e.ID.String())
		s.bind(e.ID)
	case *events.Connected:
		if cli.Store.ID != nil {
			s.bind(*cli.Store.ID)
		}
		s.mu.Lock()
		s.setState("CONNECTED", "")
		s.mu.Unlock()
		s.log.Info("SESSION connected", "jid", cli.Store.GetJID().String(), "lid", cli.Store.GetLID().String())
		s.emit(event{Type: "connected"})
	case *events.Disconnected:
		s.mu.Lock()
		s.setState("RECONNECTING", "")
		s.mu.Unlock()
		s.emit(event{Type: "disconnected", Reason: "socket closed", AutoReconnect: cli.EnableAutoReconnect})
	case *events.KeepAliveTimeout:
		s.log.Warn("SESSION keepalive timeout", "errors", e.ErrorCount)
	case *events.StreamReplaced:
		s.log.Warn("SESSION replaced by another connection of this device")
		s.dropped("stream replaced")
	case *events.ClientOutdated:
		s.log.Error("SESSION client outdated (405): update whatsmeow")
		s.dropped("client outdated")
	case *events.LoggedOut:
		s.log.Warn("SESSION logged out", "reason", e.Reason.String(), "on_connect", e.OnConnect)
		if err := s.devices.forget(context.Background(), s.key); err != nil {
			s.log.Error("SESSION device mapping not dropped", "err", err)
		}
		s.mu.Lock()
		s.setState("LOGGED_OUT", "")
		s.mu.Unlock()
		s.emit(event{Type: "logged_out", Reason: e.Reason.String()})
	case *events.TemporaryBan:
		s.log.Error("SESSION temporary ban", "detail", e.String())
		s.mu.Lock()
		s.setState("BANNED", "")
		s.mu.Unlock()
		s.emit(event{Type: "banned", Reason: e.String()})
	case *events.GroupInfo:
		for _, left := range e.Leave {
			if isSelf(cli, left) {
				s.emit(event{Type: "removed_from_group", JID: e.JID.String()})
			}
		}
	case *events.AppStateSyncComplete:
		s.log.Info("APPSTATE synced", "name", string(e.Name), "version", e.Version)
	case *events.AppStateSyncError:
		s.log.Warn("APPSTATE sync failed", "name", string(e.Name), "full_sync", e.FullSync, "err", e.Error)
	case *events.Message:
		s.decrypted.Add(1)
		s.onMessage(cli, e)
	case *events.CallOffer:
		s.log.Info("CALL offer", "from", e.From.String(), "call_id", e.CallID)
		s.emit(event{Type: "call", JID: e.From.String(), Payload: e.CallID, At: e.Timestamp.Unix()})
	case *events.UndecryptableMessage:
		s.undecryptable.Add(1)
	}
}

func (s *session) current(cli *whatsmeow.Client) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cli == cli
}

// setState must be called with s.mu held.
func (s *session) setState(state, qr string) {
	if s.state != state {
		s.log.Info("SESSION state", "from", s.state, "to", state)
	}
	s.state = state
	s.qr = qr
}

func (s *session) summary() (account, state string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.account(), s.state
}

func (s *session) account() string {
	if s.cli != nil && s.cli.Store.ID != nil {
		return s.cli.Store.GetJID().User
	}
	return ""
}

func (s *session) httpClient() *http.Client {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.http
}

func (s *session) client() (*whatsmeow.Client, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cli == nil || s.state != "CONNECTED" || !s.cli.IsConnected() {
		return nil, errors.New("whatsapp session is not connected: " + s.state)
	}
	return s.cli, nil
}

func (s *session) emit(e event) {
	s.evMu.Lock()
	defer s.evMu.Unlock()
	s.seq++
	e.Seq = s.seq
	s.events = append(s.events, e)
	if len(s.events) > maxEvents {
		s.events = s.events[len(s.events)-maxEvents:]
	}
	s.evCond.Broadcast()
}

func (s *session) eventsAfter(after int64, wait time.Duration) (int64, []event) {
	deadline := time.Now().Add(wait)
	timer := time.AfterFunc(wait, func() {
		s.evMu.Lock()
		s.evCond.Broadcast()
		s.evMu.Unlock()
	})
	defer timer.Stop()
	s.evMu.Lock()
	defer s.evMu.Unlock()
	for {
		if after < 0 {
			return s.seq, nil
		}
		if s.seq > after {
			var out []event
			for _, e := range s.events {
				if e.Seq > after {
					out = append(out, e)
				}
			}
			return s.seq, out
		}
		if !time.Now().Before(deadline) {
			return s.seq, nil
		}
		s.evCond.Wait()
	}
}
