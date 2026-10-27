package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/appstate"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

func (s *session) handleStatus(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	status := map[string]any{
		"account":       s.account(),
		"instance":      s.instance,
		"state":         s.state,
		"qr":            s.qr,
		"proxy":         maskProxy(s.proxy),
		"connected":     s.cli != nil && s.cli.IsConnected(),
		"loggedIn":      s.cli != nil && s.cli.IsLoggedIn(),
		"decrypted":     s.decrypted.Load(),
		"undecryptable": s.undecryptable.Load(),
	}
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, status)
}

type connectRequest struct {
	Proxy string `json:"proxy"`
}

func (s *session) handleConnect(w http.ResponseWriter, r *http.Request) {
	var req connectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid connect request"})
		return
	}
	proxy, err := parseProxy(req.Proxy)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	if err := s.connect(proxy); err != nil {
		s.log.Error("SESSION connect failed", "err", err)
		s.dropped(err.Error())
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *session) handleDisconnect(w http.ResponseWriter, _ *http.Request) {
	s.disconnect()
	w.WriteHeader(http.StatusNoContent)
}

func (s *session) handleEvents(w http.ResponseWriter, r *http.Request) {
	after, err := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
	if err != nil {
		after = -1
	}
	wait := 20 * time.Second
	if v, err := strconv.Atoi(r.URL.Query().Get("wait")); err == nil && v >= 0 && v <= 60 {
		wait = time.Duration(v) * time.Second
	}
	next, list := s.eventsAfter(after, wait)
	if list == nil {
		list = []event{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"instance": s.instance, "next": next, "events": list})
}

type groupDTO struct {
	JID          string `json:"jid"`
	Name         string `json:"name"`
	Archived     bool   `json:"archived"`
	Member       bool   `json:"member"`
	CanSend      bool   `json:"canSend"`
	Participants int    `json:"participants"`
	Community    bool   `json:"community"`
}

func (s *session) handleGroups(w http.ResponseWriter, r *http.Request) {
	cli, err := s.client()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": err.Error()})
		return
	}
	ctx := r.Context()
	// The archived flag arrives with the regular_low app state; right after pairing every group would look unarchived.
	if err := waitAppState(ctx, cli, appstate.WAPatchRegularLow); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": err.Error()})
		return
	}
	groups, err := cli.GetJoinedGroups(ctx)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "get joined groups: " + err.Error()})
		return
	}
	s.fillNames(ctx, cli, groups)
	out := make([]groupDTO, 0, len(groups))
	archived := 0
	for _, g := range groups {
		settings, err := cli.Store.ChatSettings.GetChatSettings(ctx, g.JID)
		if err != nil {
			s.log.Warn("GROUPS chat settings", "jid", g.JID.String(), "err", err)
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
		participants := len(g.Participants)
		if g.ParticipantCount > participants {
			participants = g.ParticipantCount
		}
		out = append(out, groupDTO{
			JID:          g.JID.String(),
			Name:         g.Name,
			Archived:     settings.Archived,
			Member:       true,
			CanSend:      !g.IsParent && (!g.IsAnnounce || admin),
			Participants: participants,
			Community:    g.IsParent,
		})
	}
	s.log.Info("GROUPS listed", "total", len(out), "archived", archived)
	writeJSON(w, http.StatusOK, out)
}

func (s *session) fillNames(ctx context.Context, cli *whatsmeow.Client, groups []*types.GroupInfo) {
	deadline := time.Now().Add(nameQueryBudget)
	queried, missing := 0, 0
	for _, g := range groups {
		key := g.JID.String()
		s.nameMu.Lock()
		if g.Name != "" {
			s.names[key] = g.Name
		} else {
			g.Name = s.names[key]
		}
		s.nameMu.Unlock()
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
			s.log.Warn("GROUPS name query failed", "jid", key, "err", err)
			missing++
			if errors.Is(err, whatsmeow.ErrIQRateOverLimit) {
				deadline = time.Now()
			}
			continue
		}
		if info.Name == "" {
			missing++
			continue
		}
		g.Name = info.Name
		s.nameMu.Lock()
		s.names[key] = info.Name
		s.nameMu.Unlock()
	}
	if queried > 0 || missing > 0 {
		s.log.Info("GROUPS names", "queried", queried, "still_missing", missing)
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

func (s *session) handleSend(w http.ResponseWriter, r *http.Request) {
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
	cli, err := s.client()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": err.Error(), "unavailable": false, "offline": true})
		return
	}
	resp, err := cli.SendMessage(r.Context(), jid, &waE2E.Message{Conversation: proto.String(req.Text)})
	if err != nil {
		// 479 is returned for very large groups (one stanza carries a key per participant device): a group property, not a ban signal.
		serverError := errors.Is(err, whatsmeow.ErrServerReturnedError)
		rejected := serverError && strings.HasSuffix(err.Error(), " 479")
		if serverError {
			go s.logRejectedGroup(cli, jid, err)
		}
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": err.Error(), "unavailable": groupUnavailable(err), "rejected": rejected, "offline": offline(err)})
		return
	}
	if jid.Server == types.GroupServer {
		s.recordLast(jid.String(), true, resp.Timestamp)
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": resp.ID, "timestamp": resp.Timestamp})
}

func (s *session) logRejectedGroup(cli *whatsmeow.Client, jid types.JID, sendErr error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	info, err := cli.GetGroupInfo(ctx, jid)
	if err != nil {
		s.log.Warn("SEND rejected by server", "jid", jid.String(), "err", sendErr, "group_info_err", err)
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
	s.log.Warn("SEND rejected by server", "jid", jid.String(), "name", info.Name, "err", sendErr,
		"addressing", string(info.AddressingMode), "participants", len(info.Participants), "participant_lid", lids, "participant_pn", pns,
		"announce", info.IsAnnounce, "locked", info.IsLocked, "community", info.IsParent, "default_sub", info.IsDefaultSubGroup,
		"linked_parent", info.LinkedParentJID.String(), "ephemeral", info.IsEphemeral, "incognito", info.IsIncognito)
}

func groupUnavailable(err error) bool {
	return isAny(err, whatsmeow.ErrNotInGroup, whatsmeow.ErrGroupNotFound, whatsmeow.ErrIQForbidden,
		whatsmeow.ErrIQNotFound, whatsmeow.ErrIQNotAcceptable, whatsmeow.ErrIQGone)
}

// The connection dropped while sending: a network problem, not a sign that WhatsApp is restricting the number.
func offline(err error) bool {
	return isAny(err, whatsmeow.ErrNotConnected, whatsmeow.ErrIQTimedOut, whatsmeow.ErrIQDisconnected, context.DeadlineExceeded)
}

func isAny(err error, targets ...error) bool {
	for _, target := range targets {
		if errors.Is(err, target) {
			return true
		}
	}
	return false
}

func (s *session) handleTyping(w http.ResponseWriter, r *http.Request) {
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
	cli, err := s.client()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": err.Error()})
		return
	}
	// Typing is only shown while the device is online.
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

// Reactions and protocol messages (edits, revokes) do not push our post up, so they do not count as the last message.
func (s *session) onMessage(cli *whatsmeow.Client, e *events.Message) {
	if e.Message == nil || e.Message.GetReactionMessage() != nil || e.Message.GetProtocolMessage() != nil {
		return
	}
	chat := e.Info.Chat
	switch chat.Server {
	case types.GroupServer:
		s.recordLast(chat.String(), e.Info.IsFromMe || isSelf(cli, e.Info.Sender), e.Info.Timestamp)
	case types.DefaultUserServer, types.HiddenUserServer:
		if e.Info.IsFromMe || isSelf(cli, e.Info.Sender) || time.Since(e.Info.Timestamp) > directMessageMaxAge {
			return
		}
		s.emit(event{Type: "direct_message", JID: chat.String(), Payload: e.Info.PushName, At: e.Info.Timestamp.Unix()})
	}
}

func (s *session) recordLast(jid string, fromMe bool, at time.Time) {
	if at.IsZero() {
		at = time.Now()
	}
	_, err := s.last.Exec(`insert into last_message(jid, from_me, at) values (?, ?, ?)
		on conflict(jid) do update set from_me = excluded.from_me, at = excluded.at where excluded.at >= last_message.at`,
		jid, fromMe, at.Unix())
	if err != nil {
		s.log.Warn("LAST record failed", "jid", jid, "err", err)
	}
}

func (s *session) handleLast(w http.ResponseWriter, r *http.Request) {
	jid := r.URL.Query().Get("jid")
	if jid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "jid is required"})
		return
	}
	var fromMe bool
	var at int64
	err := s.last.QueryRowContext(r.Context(), `select from_me, at from last_message where jid = ?`, jid).Scan(&fromMe, &at)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusOK, map[string]any{"known": false})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"known": true, "fromMe": fromMe, "at": at})
}

func (s *session) handlePicture(w http.ResponseWriter, r *http.Request) {
	jid, err := types.ParseJID(r.URL.Query().Get("jid"))
	if err != nil || jid.Server != types.GroupServer {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "group jid is required"})
		return
	}
	cli, err := s.client()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": err.Error()})
		return
	}
	info, err := cli.GetProfilePictureInfo(r.Context(), jid, &whatsmeow.GetProfilePictureParams{Preview: true})
	if isAny(err, whatsmeow.ErrProfilePictureNotSet, whatsmeow.ErrProfilePictureUnauthorized) || (err == nil && (info == nil || info.URL == "")) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, info.URL, nil)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	resp, err := s.httpClient().Do(req)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxPictureBytes))
	if err != nil || resp.StatusCode != http.StatusOK {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": fmt.Sprintf("download: status %d %v", resp.StatusCode, err)})
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	_, _ = w.Write(body)
}

func (s *session) handleDevices(w http.ResponseWriter, r *http.Request) {
	jid, err := types.ParseJID(r.URL.Query().Get("jid"))
	if err != nil || jid.Server != types.GroupServer {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "group jid is required"})
		return
	}
	cli, err := s.client()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": err.Error()})
		return
	}
	info, err := cli.GetGroupInfo(r.Context(), jid)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	participants := make([]types.JID, 0, len(info.Participants))
	for _, p := range info.Participants {
		participants = append(participants, p.JID)
	}
	devices, err := cli.GetUserDevices(r.Context(), participants)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"participants": len(participants), "devices": len(devices)})
}

type rejectCallRequest struct {
	JID    string `json:"jid"`
	CallID string `json:"callId"`
}

func (s *session) handleRejectCall(w http.ResponseWriter, r *http.Request) {
	var req rejectCallRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.JID == "" || req.CallID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "jid and callId are required"})
		return
	}
	from, err := types.ParseJID(req.JID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	cli, err := s.client()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": err.Error()})
		return
	}
	if err := cli.RejectCall(r.Context(), from, req.CallID); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func isSelf(cli *whatsmeow.Client, jid types.JID) bool {
	if jid.User == "" {
		return false
	}
	return jid.User == cli.Store.GetJID().User || jid.User == cli.Store.GetLID().User
}
