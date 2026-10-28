package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"

	waLog "go.mau.fi/whatsmeow/util/log"
)

const (
	lastFile       = "last.db"
	senderKeysFile = "sender-keys.db"
	sessionDirMode = 0o700
)

var sessionKey = regexp.MustCompile(`^[a-z0-9-]{1,32}$`)

type sessionFiles struct {
	legacy     string
	legacyLast string
	legacyKeys string
	dir        string
}

func (f sessionFiles) paths(key string) (last, keys string) {
	if key == f.legacy {
		return f.legacyLast, f.legacyKeys
	}
	dir := filepath.Join(f.dir, key)
	return filepath.Join(dir, lastFile), filepath.Join(dir, senderKeysFile)
}

type manager struct {
	devices   *devices
	waLog     waLog.Logger
	instance  string
	files     sessionFiles
	keyGroups string
	keyLimit  int

	mu       sync.Mutex
	sessions map[string]*session
}

type sessionRoute struct {
	method  string
	path    string
	handler func(*session, http.ResponseWriter, *http.Request)
}

var sessionRoutes = []sessionRoute{
	{http.MethodGet, "/status", (*session).handleStatus},
	{http.MethodPost, "/connect", (*session).handleConnect},
	{http.MethodPost, "/disconnect", (*session).handleDisconnect},
	{http.MethodGet, "/events", (*session).handleEvents},
	{http.MethodGet, "/groups", (*session).handleGroups},
	{http.MethodPost, "/send", (*session).handleSend},
	{http.MethodPost, "/typing", (*session).handleTyping},
	{http.MethodGet, "/last", (*session).handleLast},
	{http.MethodGet, "/picture", (*session).handlePicture},
	{http.MethodGet, "/devices", (*session).handleDevices},
	{http.MethodPost, "/reject-call", (*session).handleRejectCall},
}

func newManager(devices *devices, log waLog.Logger, files sessionFiles, keyGroups string, keyLimit int) *manager {
	return &manager{devices: devices, waLog: log, instance: randomID(), files: files,
		keyGroups: keyGroups, keyLimit: keyLimit, sessions: map[string]*session{}}
}

func (m *manager) restore(ctx context.Context) error {
	jid, err := m.devices.adoptLegacy(ctx, m.files.legacy)
	if err != nil {
		return err
	}
	if !jid.IsEmpty() {
		slog.Info("SESSION legacy device adopted", "session", m.files.legacy, "jid", jid.String())
	}
	mapped, err := m.devices.mapped(ctx)
	if err != nil {
		return err
	}
	for key := range mapped {
		if _, err := m.session(key); err != nil {
			return err
		}
	}
	return nil
}

func (m *manager) routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /status", m.handleStatus)
	mux.HandleFunc("GET /sessions", m.handleSessions)
	mux.HandleFunc("POST /proxy-check", handleProxyCheck)
	mux.HandleFunc("DELETE /s/{session}", m.handleDelete)
	for _, route := range sessionRoutes {
		mux.HandleFunc(route.method+" /s/{session}"+route.path, m.withSession(route.handler))
	}
	return mux
}

func (m *manager) withSession(h func(*session, http.ResponseWriter, *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key, ok := requestKey(w, r)
		if !ok {
			return
		}
		s, err := m.session(key)
		if err != nil {
			slog.Error("SESSION open failed", "session", key, "err", err)
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		h(s, w, r)
	}
}

func requestKey(w http.ResponseWriter, r *http.Request) (string, bool) {
	key := r.PathValue("session")
	if !sessionKey.MatchString(key) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid session key"})
		return "", false
	}
	return key, true
}

func (m *manager) session(key string) (*session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[key]; ok {
		return s, nil
	}
	lastPath, keysPath := m.files.paths(key)
	if key != m.files.legacy {
		if err := os.MkdirAll(filepath.Dir(lastPath), sessionDirMode); err != nil {
			return nil, err
		}
	}
	last, err := openLastMessages(lastPath)
	if err != nil {
		return nil, err
	}
	keys, err := openSenderKeyRecipients(keysPath, m.keyGroups, m.keyLimit)
	if err != nil {
		_ = last.Close()
		return nil, err
	}
	s := newSession(key, m.devices, m.waLog.Sub(key), last, keys)
	m.sessions[key] = s
	return s, nil
}

func (m *manager) snapshot() []*session {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*session, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, s)
	}
	slices.SortFunc(out, func(a, b *session) int { return strings.Compare(a.key, b.key) })
	return out
}

func (m *manager) handleStatus(w http.ResponseWriter, _ *http.Request) {
	m.mu.Lock()
	count := len(m.sessions)
	m.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"instance": m.instance, "sessions": count})
}

type sessionDTO struct {
	Session string `json:"session"`
	Account string `json:"account"`
	State   string `json:"state"`
}

func (m *manager) handleSessions(w http.ResponseWriter, _ *http.Request) {
	all := m.snapshot()
	out := make([]sessionDTO, 0, len(all))
	for _, s := range all {
		account, state := s.summary()
		out = append(out, sessionDTO{Session: s.key, Account: account, State: state})
	}
	writeJSON(w, http.StatusOK, out)
}

func (m *manager) handleDelete(w http.ResponseWriter, r *http.Request) {
	key, ok := requestKey(w, r)
	if !ok {
		return
	}
	if key == m.files.legacy {
		writeJSON(w, http.StatusConflict, map[string]any{"error": "legacy session cannot be deleted"})
		return
	}
	if err := m.remove(r.Context(), key); err != nil {
		slog.Error("SESSION delete failed", "session", key, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	slog.Info("SESSION deleted", "session", key)
	w.WriteHeader(http.StatusNoContent)
}

func (m *manager) remove(ctx context.Context, key string) error {
	m.mu.Lock()
	s := m.sessions[key]
	delete(m.sessions, key)
	m.mu.Unlock()
	var errs []error
	if s != nil {
		s.logout(ctx)
		errs = append(errs, s.close())
	}
	errs = append(errs, m.devices.forget(ctx, key))
	errs = append(errs, os.RemoveAll(filepath.Join(m.files.dir, key)))
	return errors.Join(errs...)
}

func (m *manager) shutdown() {
	for _, s := range m.snapshot() {
		s.stop()
	}
}
