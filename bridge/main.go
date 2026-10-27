// Package main is the WhatsApp (whatsmeow) sidecar for wa-group-sender, reachable only inside the compose network.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"go.mau.fi/whatsmeow/store"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

const (
	maxEvents       = 500
	appStateTimeout = 150 * time.Second
	nameQueryDelay  = 300 * time.Millisecond
	nameQueryBudget = 80 * time.Second
	// Older direct messages are a backlog replayed after a reconnect, not something to auto-reply to.
	directMessageMaxAge = 10 * time.Minute
	maxPictureBytes     = 1 << 20
	storeMaxOpenConns   = 8
)

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
	// _txlock=immediate: deferred transactions hit "database is locked" on bursts of retry receipts (busy_timeout is not honoured on upgrade).
	dsn := "file:" + env("BRIDGE_DB", "/data/bridge.db") +
		"?_foreign_keys=on&_journal_mode=WAL&_synchronous=NORMAL&_busy_timeout=30000&_txlock=immediate"
	deviceStore, err := openStore(ctx, dsn, waLog.Stdout("DB", "WARN", false))
	if err != nil {
		slog.Error("store", "err", err)
		os.Exit(1)
	}
	keyLimit, err := strconv.Atoi(env("BRIDGE_SENDER_KEY_LIMIT", "600"))
	if err != nil {
		slog.Error("BRIDGE_SENDER_KEY_LIMIT", "err", err)
		os.Exit(1)
	}
	m := newManager(deviceStore, waLog.Stdout("WA", logLevel, false), sessionFiles{
		legacy:     env("BRIDGE_LEGACY_SESSION", "t1"),
		legacyLast: env("BRIDGE_LAST_DB", "/data/last.db"),
		legacyKeys: env("BRIDGE_SENDER_KEYS_DB", "/data/sender-keys.db"),
		dir:        env("BRIDGE_SESSIONS_DIR", "/data/sessions"),
	}, os.Getenv("BRIDGE_SENDER_KEY_GROUPS"), keyLimit)
	if !sessionKey.MatchString(m.files.legacy) {
		slog.Error("BRIDGE_LEGACY_SESSION", "value", m.files.legacy)
		os.Exit(1)
	}
	if err := m.restore(ctx); err != nil {
		slog.Error("sessions", "err", err)
		os.Exit(1)
	}
	server := &http.Server{Addr: addr, Handler: m.routes(), ReadHeaderTimeout: 10 * time.Second}

	go func() {
		<-ctx.Done()
		m.shutdown()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	slog.Info("BRIDGE listening", "addr", addr, "instance", m.instance, "legacy", m.files.legacy)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("http", "err", err)
		os.Exit(1)
	}
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
