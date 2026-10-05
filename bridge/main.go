// wa-bridge — WhatsApp-клиент на whatsmeow для wa-group-sender.
//
// Java-сервис ходит сюда по HTTP внутри compose-сети; наружу порт не
// публикуется. Сессия (sqlite) лежит в /data.
//
//	GET  /status                 состояние, QR, счётчики
//	POST /connect                подключиться (или напомнить о текущем состоянии)
//	POST /disconnect             отключиться
//	GET  /events?after=N&wait=S  события после N (long-poll); after=-1 — только курсор
//	GET  /groups                 группы номера с признаком архива (ждёт синхронизации настроек)
//	POST /send    {jid,text}     отправить текст
//	POST /typing  {jid}          «печатает…»
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/appstate"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

const (
	maxEvents       = 500
	appStateTimeout = 150 * time.Second
	// Пауза между отдельными запросами названий групп, чтобы не упереться в лимит запросов.
	nameQueryDelay = 300 * time.Millisecond
	// Сколько всего времени одна выдача /groups может потратить на названия; остальное доберётся в следующий раз.
	nameQueryBudget = 80 * time.Second
)

type event struct {
	Seq           int64  `json:"seq"`
	Type          string `json:"type"`
	Payload       string `json:"payload,omitempty"`
	Reason        string `json:"reason,omitempty"`
	AutoReconnect bool   `json:"autoReconnect"`
	JID           string `json:"jid,omitempty"`
}

type bridge struct {
	container *sqlstore.Container
	waLog     waLog.Logger
	instance  string

	mu    sync.Mutex
	cli   *whatsmeow.Client
	state string
	qr    string

	evMu   sync.Mutex
	evCond *sync.Cond
	seq    int64
	events []event

	undecryptable atomic.Int64
	decrypted     atomic.Int64

	nameMu sync.Mutex
	names  map[string]string
}

func main() {
	healthcheck := flag.Bool("healthcheck", false, "проверить /status и выйти")
	flag.Parse()
	addr := env("BRIDGE_ADDR", ":8081")
	if *healthcheck {
		resp, err := http.Get("http://127.0.0.1" + addr[strings.LastIndex(addr, ":"):] + "/status")
		if err != nil || resp.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		os.Exit(0)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	store.SetOSInfo(env("WA_DEVICE_NAME", "wa-group-sender"), [3]uint32{1, 0, 0})
	store.DeviceProps.RequireFullSync = proto.Bool(false)

	logLevel := env("BRIDGE_LOG_LEVEL", "INFO")
	// WAL и транзакции, сразу берущие блокировку на запись: когда сотни участников группы разом присылают
	// retry receipt, отложенные транзакции упирались в «database is locked» — SQLite не ждёт busy_timeout,
	// если чтение внутри транзакции пытается стать записью. Получатели тогда так и не получали сообщение.
	dsn := "file:" + env("BRIDGE_DB", "/data/bridge.db") +
		"?_foreign_keys=on&_journal_mode=WAL&_synchronous=NORMAL&_busy_timeout=30000&_txlock=immediate"
	container, err := sqlstore.New(ctx, "sqlite3", dsn, waLog.Stdout("DB", "WARN", false))
	if err != nil {
		slog.Error("store", "err", err)
		os.Exit(1)
	}
	b := &bridge{container: container, waLog: waLog.Stdout("WA", logLevel, false), instance: randomID(), state: "STARTING",
		names: map[string]string{}}
	b.evCond = sync.NewCond(&b.evMu)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /status", b.handleStatus)
	mux.HandleFunc("POST /connect", b.handleConnect)
	mux.HandleFunc("POST /disconnect", b.handleDisconnect)
	mux.HandleFunc("GET /events", b.handleEvents)
	mux.HandleFunc("GET /groups", b.handleGroups)
	mux.HandleFunc("POST /send", b.handleSend)
	mux.HandleFunc("POST /typing", b.handleTyping)
	server := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}

	go func() {
		<-ctx.Done()
		b.mu.Lock()
		if b.cli != nil {
			b.cli.RemoveEventHandlers()
			b.cli.Disconnect()
		}
		b.mu.Unlock()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	slog.Info("BRIDGE listening", "addr", addr, "instance", b.instance)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("http", "err", err)
		os.Exit(1)
	}
}

// --- соединение ---------------------------------------------------------------

func (b *bridge) connect() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.cli != nil && b.cli.IsConnected() {
		// Java могла перезапуститься и не видеть прошлых событий: повторяем текущее состояние.
		switch {
		case b.state == "CONNECTED":
			b.emit(event{Type: "connected"})
		case b.state == "WAITING_QR" && b.qr != "":
			b.emit(event{Type: "qr", Payload: b.qr})
		}
		return nil
	}
	if b.cli != nil {
		b.cli.RemoveEventHandlers()
		b.cli.Disconnect()
	}
	// После разлогина whatsmeow удаляет устройство из базы; GetFirstDevice отдаёт новое.
	device, err := b.container.GetFirstDevice(context.Background())
	if err != nil {
		return fmt.Errorf("device: %w", err)
	}
	cli := whatsmeow.NewClient(device, b.waLog)
	cli.AddEventHandler(func(evt any) { b.onEvent(cli, evt) })
	b.cli = cli
	b.setState("CONNECTING", "")

	if cli.Store.ID == nil {
		qr, err := cli.GetQRChannel(context.Background())
		if err != nil {
			return fmt.Errorf("qr channel: %w", err)
		}
		if err := cli.Connect(); err != nil {
			return fmt.Errorf("connect: %w", err)
		}
		go b.consumeQR(cli, qr)
		return nil
	}
	if err := cli.Connect(); err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	return nil
}

func (b *bridge) consumeQR(cli *whatsmeow.Client, qr <-chan whatsmeow.QRChannelItem) {
	for item := range qr {
		if !b.current(cli) {
			return
		}
		switch item.Event {
		case whatsmeow.QRChannelEventCode:
			b.mu.Lock()
			b.setState("WAITING_QR", item.Code)
			b.mu.Unlock()
			b.emit(event{Type: "qr", Payload: item.Code})
		case whatsmeow.QRChannelEventPasskeyRequest:
			slog.Error("PAIRING WhatsApp requires a passkey (WebAuthn) to link this device; headless pairing is not possible for this number")
		case whatsmeow.QRChannelEventError:
			slog.Error("PAIRING failed", "err", item.Error)
			b.dropped("pairing failed: " + fmt.Sprint(item.Error))
		case "success":
			slog.Info("PAIRING success")
		case "timeout":
			slog.Warn("PAIRING QR codes expired")
			b.dropped("qr timeout")
		default:
			slog.Warn("PAIRING event", "event", item.Event)
			if strings.HasPrefix(item.Event, "err") {
				b.dropped(item.Event)
			}
		}
	}
}

func (b *bridge) dropped(reason string) {
	b.mu.Lock()
	b.setState("DISCONNECTED", "")
	b.mu.Unlock()
	b.emit(event{Type: "disconnected", Reason: reason})
}

func (b *bridge) onEvent(cli *whatsmeow.Client, evt any) {
	if !b.current(cli) {
		return
	}
	switch e := evt.(type) {
	case *events.Connected:
		b.mu.Lock()
		b.setState("CONNECTED", "")
		b.mu.Unlock()
		slog.Info("SESSION connected", "jid", cli.Store.GetJID().String(), "lid", cli.Store.GetLID().String())
		b.emit(event{Type: "connected"})
	case *events.Disconnected:
		b.mu.Lock()
		b.setState("RECONNECTING", "")
		b.mu.Unlock()
		b.emit(event{Type: "disconnected", Reason: "socket closed", AutoReconnect: cli.EnableAutoReconnect})
	case *events.KeepAliveTimeout:
		slog.Warn("SESSION keepalive timeout", "errors", e.ErrorCount)
	case *events.StreamReplaced:
		slog.Warn("SESSION replaced by another connection of this device")
		b.dropped("stream replaced")
	case *events.ClientOutdated:
		slog.Error("SESSION client outdated (405): update whatsmeow")
		b.dropped("client outdated")
	case *events.LoggedOut:
		slog.Warn("SESSION logged out", "reason", e.Reason.String(), "on_connect", e.OnConnect)
		b.mu.Lock()
		b.setState("LOGGED_OUT", "")
		b.mu.Unlock()
		b.emit(event{Type: "logged_out", Reason: e.Reason.String()})
	case *events.TemporaryBan:
		slog.Error("SESSION temporary ban", "detail", e.String())
		b.mu.Lock()
		b.setState("BANNED", "")
		b.mu.Unlock()
		b.emit(event{Type: "banned", Reason: e.String()})
	case *events.GroupInfo:
		for _, left := range e.Leave {
			if isSelf(cli, left) {
				b.emit(event{Type: "removed_from_group", JID: e.JID.String()})
			}
		}
	case *events.AppStateSyncComplete:
		slog.Info("APPSTATE synced", "name", string(e.Name), "version", e.Version)
	case *events.AppStateSyncError:
		slog.Warn("APPSTATE sync failed", "name", string(e.Name), "full_sync", e.FullSync, "err", e.Error)
	case *events.Message:
		b.decrypted.Add(1)
	case *events.UndecryptableMessage:
		b.undecryptable.Add(1)
	}
}

func (b *bridge) current(cli *whatsmeow.Client) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.cli == cli
}

// setState вызывается под b.mu.
func (b *bridge) setState(state, qr string) {
	if b.state != state {
		slog.Info("SESSION state", "from", b.state, "to", state)
	}
	b.state = state
	b.qr = qr
}

func (b *bridge) client() (*whatsmeow.Client, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.cli == nil || b.state != "CONNECTED" || !b.cli.IsConnected() {
		return nil, errors.New("whatsapp session is not connected: " + b.state)
	}
	return b.cli, nil
}

// --- события -----------------------------------------------------------------

func (b *bridge) emit(e event) {
	b.evMu.Lock()
	defer b.evMu.Unlock()
	b.seq++
	e.Seq = b.seq
	b.events = append(b.events, e)
	if len(b.events) > maxEvents {
		b.events = b.events[len(b.events)-maxEvents:]
	}
	b.evCond.Broadcast()
}

func (b *bridge) eventsAfter(after int64, wait time.Duration) (int64, []event) {
	deadline := time.Now().Add(wait)
	timer := time.AfterFunc(wait, func() {
		b.evMu.Lock()
		b.evCond.Broadcast()
		b.evMu.Unlock()
	})
	defer timer.Stop()
	b.evMu.Lock()
	defer b.evMu.Unlock()
	for {
		if after < 0 {
			return b.seq, nil
		}
		if b.seq > after {
			var out []event
			for _, e := range b.events {
				if e.Seq > after {
					out = append(out, e)
				}
			}
			return b.seq, out
		}
		if !time.Now().Before(deadline) {
			return b.seq, nil
		}
		b.evCond.Wait()
	}
}

// --- HTTP --------------------------------------------------------------------

func (b *bridge) handleStatus(w http.ResponseWriter, _ *http.Request) {
	b.mu.Lock()
	status := map[string]any{
		"instance":      b.instance,
		"state":         b.state,
		"qr":            b.qr,
		"connected":     b.cli != nil && b.cli.IsConnected(),
		"loggedIn":      b.cli != nil && b.cli.IsLoggedIn(),
		"decrypted":     b.decrypted.Load(),
		"undecryptable": b.undecryptable.Load(),
	}
	b.mu.Unlock()
	writeJSON(w, http.StatusOK, status)
}

func (b *bridge) handleConnect(w http.ResponseWriter, _ *http.Request) {
	if err := b.connect(); err != nil {
		slog.Error("SESSION connect failed", "err", err)
		b.dropped(err.Error())
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (b *bridge) handleDisconnect(w http.ResponseWriter, _ *http.Request) {
	b.mu.Lock()
	if b.cli != nil {
		b.cli.RemoveEventHandlers()
		b.cli.Disconnect()
		b.cli = nil
	}
	b.setState("DISCONNECTED", "")
	b.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (b *bridge) handleEvents(w http.ResponseWriter, r *http.Request) {
	after, err := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
	if err != nil {
		after = -1
	}
	wait := 20 * time.Second
	if v, err := strconv.Atoi(r.URL.Query().Get("wait")); err == nil && v >= 0 && v <= 60 {
		wait = time.Duration(v) * time.Second
	}
	next, list := b.eventsAfter(after, wait)
	if list == nil {
		list = []event{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"instance": b.instance, "next": next, "events": list})
}

type groupDTO struct {
	JID      string `json:"jid"`
	Name     string `json:"name"`
	Archived bool   `json:"archived"`
	Member   bool   `json:"member"`
	CanSend  bool   `json:"canSend"`
}

func (b *bridge) handleGroups(w http.ResponseWriter, r *http.Request) {
	cli, err := b.client()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": err.Error()})
		return
	}
	ctx := r.Context()
	// Признак архива приходит синхронизацией настроек (коллекция regular_low).
	// Сразу после привязки её ещё нет — без неё все группы выглядели бы неархивными.
	if err := waitAppState(ctx, cli, appstate.WAPatchRegularLow); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": err.Error()})
		return
	}
	groups, err := cli.GetJoinedGroups(ctx)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "get joined groups: " + err.Error()})
		return
	}
	b.fillNames(ctx, cli, groups)
	out := make([]groupDTO, 0, len(groups))
	archived := 0
	for _, g := range groups {
		settings, err := cli.Store.ChatSettings.GetChatSettings(ctx, g.JID)
		if err != nil {
			slog.Warn("GROUPS chat settings", "jid", g.JID.String(), "err", err)
		}
		admin := false
		for _, p := range g.Participants {
			if (isSelf(cli, p.JID) || isSelf(cli, p.PhoneNumber) || isSelf(cli, p.LID)) && (p.IsAdmin || p.IsSuperAdmin) {
				admin = true
			}
		}
		if settings.Archived {
			archived++
		}
		out = append(out, groupDTO{
			JID:      g.JID.String(),
			Name:     g.Name,
			Archived: settings.Archived,
			Member:   true,
			CanSend:  !g.IsAnnounce || admin,
		})
	}
	slog.Info("GROUPS listed", "total", len(out), "archived", archived)
	writeJSON(w, http.StatusOK, out)
}

// fillNames дополняет названия: в общем списке групп сервер отдаёт название не для всех.
// Для остальных группа запрашивается отдельно, результат запоминается до перезапуска.
func (b *bridge) fillNames(ctx context.Context, cli *whatsmeow.Client, groups []*types.GroupInfo) {
	deadline := time.Now().Add(nameQueryBudget)
	queried, missing := 0, 0
	for _, g := range groups {
		key := g.JID.String()
		b.nameMu.Lock()
		if g.Name != "" {
			b.names[key] = g.Name
		} else {
			g.Name = b.names[key]
		}
		b.nameMu.Unlock()
		if g.Name != "" {
			continue
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			missing++
			continue
		}
		if queried > 0 {
			time.Sleep(nameQueryDelay)
		}
		queried++
		info, err := cli.GetGroupInfo(ctx, g.JID)
		if err != nil {
			slog.Warn("GROUPS name query failed", "jid", key, "err", err)
			missing++
			if errors.Is(err, whatsmeow.ErrIQRateOverLimit) {
				// Сервер просит притормозить: остальные названия доберём в следующую синхронизацию.
				deadline = time.Now()
			}
			continue
		}
		if info.Name == "" {
			missing++
			continue
		}
		g.Name = info.Name
		b.nameMu.Lock()
		b.names[key] = info.Name
		b.nameMu.Unlock()
	}
	if queried > 0 || missing > 0 {
		slog.Info("GROUPS names", "queried", queried, "still_missing", missing)
	}
}

func waitAppState(ctx context.Context, cli *whatsmeow.Client, name appstate.WAPatchName) error {
	deadline := time.Now().Add(appStateTimeout)
	for {
		version, _, err := cli.Store.AppState.GetAppStateVersion(ctx, string(name))
		if err == nil && version > 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("app state %s not synced after %s", name, appStateTimeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}

type sendRequest struct {
	JID  string `json:"jid"`
	Text string `json:"text"`
}

func (b *bridge) handleSend(w http.ResponseWriter, r *http.Request) {
	var req sendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.JID == "" || req.Text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "jid and text are required"})
		return
	}
	jid, err := types.ParseJID(req.JID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	cli, err := b.client()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": err.Error(), "unavailable": false})
		return
	}
	resp, err := cli.SendMessage(r.Context(), jid, &waE2E.Message{Conversation: proto.String(req.Text)})
	if err != nil {
		// Сервер отклонил само сообщение для этой группы (например, 479 smax-invalid): это не признак бана.
		rejected := errors.Is(err, whatsmeow.ErrServerReturnedError)
		if rejected {
			go logRejectedGroup(cli, jid, err)
		}
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": err.Error(), "unavailable": groupUnavailable(err), "rejected": rejected})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": resp.ID, "timestamp": resp.Timestamp})
}

// logRejectedGroup пишет свойства группы, в которую сервер не принял сообщение, чтобы найти общее у таких групп.
func logRejectedGroup(cli *whatsmeow.Client, jid types.JID, sendErr error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	info, err := cli.GetGroupInfo(ctx, jid)
	if err != nil {
		slog.Warn("SEND rejected by server", "jid", jid.String(), "err", sendErr, "group_info_err", err)
		return
	}
	lids, pns := 0, 0
	for _, p := range info.Participants {
		if p.JID.Server == types.HiddenUserServer {
			lids++
		} else {
			pns++
		}
	}
	slog.Warn("SEND rejected by server", "jid", jid.String(), "name", info.Name, "err", sendErr,
		"addressing", string(info.AddressingMode), "participants", len(info.Participants), "participant_lid", lids, "participant_pn", pns,
		"announce", info.IsAnnounce, "locked", info.IsLocked, "community", info.IsParent, "default_sub", info.IsDefaultSubGroup,
		"linked_parent", info.LinkedParentJID.String(), "ephemeral", info.IsEphemeral, "incognito", info.IsIncognito)
}

func groupUnavailable(err error) bool {
	for _, target := range []error{whatsmeow.ErrNotInGroup, whatsmeow.ErrGroupNotFound, whatsmeow.ErrIQForbidden,
		whatsmeow.ErrIQNotFound, whatsmeow.ErrIQNotAcceptable, whatsmeow.ErrIQGone} {
		if errors.Is(err, target) {
			return true
		}
	}
	return false
}

func (b *bridge) handleTyping(w http.ResponseWriter, r *http.Request) {
	var req sendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.JID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "jid is required"})
		return
	}
	jid, err := types.ParseJID(req.JID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	cli, err := b.client()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": err.Error()})
		return
	}
	// «Печатает…» видно, только пока устройство «в сети».
	if err := cli.SendPresence(r.Context(), types.PresenceAvailable); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "presence: " + err.Error()})
		return
	}
	if err := cli.SendChatPresence(r.Context(), jid, types.ChatPresenceComposing, types.ChatPresenceMediaText); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- мелочи ------------------------------------------------------------------

func isSelf(cli *whatsmeow.Client, jid types.JID) bool {
	if jid.User == "" {
		return false
	}
	return jid.User == cli.Store.GetJID().User || jid.User == cli.Store.GetLID().User
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func randomID() string {
	buf := make([]byte, 8)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}
