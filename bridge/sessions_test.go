package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"go.mau.fi/whatsmeow/proto/waAdv"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
)

const legacyKey = "t1"

func testManager(t *testing.T) (*manager, string) {
	t.Helper()
	dir := t.TempDir()
	deviceStore, err := openStore(context.Background(), "file:"+filepath.Join(dir, "bridge.db")+"?_foreign_keys=on", waLog.Noop)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = deviceStore.close() })
	m := newManager(deviceStore, waLog.Noop, sessionFiles{
		legacy:     legacyKey,
		legacyLast: filepath.Join(dir, lastFile),
		legacyKeys: filepath.Join(dir, senderKeysFile),
		dir:        filepath.Join(dir, "sessions"),
	}, "", 10)
	t.Cleanup(func() {
		for _, s := range m.snapshot() {
			_ = s.close()
		}
	})
	return m, dir
}

func pairedDevice(t *testing.T, m *manager, user string) types.JID {
	t.Helper()
	device := m.devices.container.NewDevice()
	jid := types.NewADJID(user, 0, 7)
	device.ID = &jid
	device.Account = &waAdv.ADVSignedDeviceIdentity{Details: []byte{}, AccountSignature: make([]byte, 64), AccountSignatureKey: make([]byte, 32), DeviceSignature: make([]byte, 64)}
	if err := m.devices.container.PutDevice(context.Background(), device); err != nil {
		t.Fatal(err)
	}
	return jid
}

func call(t *testing.T, h http.Handler, method, path string, out any) int {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	if out != nil {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("%s %s: %v: %s", method, path, err, rec.Body.String())
		}
	}
	return rec.Code
}

func TestSessionKeyValidation(t *testing.T) {
	for key, valid := range map[string]bool{
		"t1": true, "t42": true, "tenant-2": true, "a": true, "abcdefghijklmnopqrstuvwxyz012345": true,
		"": false, "T1": false, "t_1": false, "t.1": false, "abcdefghijklmnopqrstuvwxyz0123456": false,
	} {
		if sessionKey.MatchString(key) != valid {
			t.Errorf("%q valid = %v", key, !valid)
		}
	}
}

func TestLegacySessionAdoptsExistingDevice(t *testing.T) {
	ctx := context.Background()
	m, dir := testManager(t)
	jid := pairedDevice(t, m, "77000000001")

	if err := m.restore(ctx); err != nil {
		t.Fatal(err)
	}

	mapped, err := m.devices.mapped(ctx)
	if err != nil || len(mapped) != 1 || mapped[legacyKey] != jid.String() {
		t.Fatalf("mapped = %v, %v", mapped, err)
	}
	legacy, err := m.devices.device(ctx, legacyKey)
	if err != nil || legacy.ID == nil || *legacy.ID != jid {
		t.Fatalf("legacy device = %v, %v", legacy.ID, err)
	}
	fresh, err := m.devices.device(ctx, "t2")
	if err != nil || fresh.ID != nil {
		t.Fatalf("new session device = %v, %v", fresh.ID, err)
	}
	if _, err := os.Stat(filepath.Join(dir, lastFile)); err != nil {
		t.Fatalf("legacy last.db: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, senderKeysFile)); err != nil {
		t.Fatalf("legacy sender-keys.db: %v", err)
	}
}

func TestExistingMappingIsNotReassigned(t *testing.T) {
	ctx := context.Background()
	m, _ := testManager(t)
	first := pairedDevice(t, m, "77000000001")
	pairedDevice(t, m, "77000000002")
	if err := m.devices.bind(ctx, "t2", first); err != nil {
		t.Fatal(err)
	}

	if err := m.restore(ctx); err != nil {
		t.Fatal(err)
	}

	mapped, err := m.devices.mapped(ctx)
	if err != nil || len(mapped) != 1 || mapped["t2"] != first.String() {
		t.Fatalf("mapped = %v, %v", mapped, err)
	}
	if err := m.devices.bind(ctx, "t3", first); err == nil {
		t.Fatal("a mapped device was bound to a second session")
	}
}

func TestEmptyStoreMapsNothing(t *testing.T) {
	ctx := context.Background()
	m, _ := testManager(t)

	if err := m.restore(ctx); err != nil {
		t.Fatal(err)
	}

	mapped, err := m.devices.mapped(ctx)
	if err != nil || len(mapped) != 0 {
		t.Fatalf("mapped = %v, %v", mapped, err)
	}
}

func TestForgetDropsDeviceAndMapping(t *testing.T) {
	ctx := context.Background()
	m, _ := testManager(t)
	jid := pairedDevice(t, m, "77000000001")
	if err := m.devices.bind(ctx, "t2", jid); err != nil {
		t.Fatal(err)
	}

	if err := m.devices.forget(ctx, "t2"); err != nil {
		t.Fatal(err)
	}

	if device, err := m.devices.container.GetDevice(ctx, jid); err != nil || device != nil {
		t.Fatalf("device = %v, %v", device, err)
	}
	if mapped, err := m.devices.mapped(ctx); err != nil || len(mapped) != 0 {
		t.Fatalf("mapped = %v, %v", mapped, err)
	}
}

func TestMissingDeviceGivesFreshDevice(t *testing.T) {
	ctx := context.Background()
	m, _ := testManager(t)
	if err := m.devices.bind(ctx, "t2", types.NewADJID("77000000009", 0, 3)); err != nil {
		t.Fatal(err)
	}

	device, err := m.devices.device(ctx, "t2")
	if err != nil || device.ID != nil {
		t.Fatalf("device = %v, %v", device.ID, err)
	}
	if mapped, err := m.devices.mapped(ctx); err != nil || len(mapped) != 0 {
		t.Fatalf("mapped = %v, %v", mapped, err)
	}
}

func TestRoutes(t *testing.T) {
	m, dir := testManager(t)
	h := m.routes()
	sessionDir := filepath.Join(dir, "sessions", "t2")

	var global map[string]any
	if code := call(t, h, http.MethodGet, "/status", &global); code != http.StatusOK || global["sessions"] != 0.0 || global["instance"] != m.instance {
		t.Fatalf("GET /status = %d %v", code, global)
	}
	if code := call(t, h, http.MethodGet, "/s/T2/status", nil); code != http.StatusBadRequest {
		t.Fatalf("invalid key = %d", code)
	}
	if code := call(t, h, http.MethodGet, "/status/t2", nil); code != http.StatusNotFound {
		t.Fatalf("unknown route = %d", code)
	}

	var status map[string]any
	if code := call(t, h, http.MethodGet, "/s/t2/status", &status); code != http.StatusOK || status["state"] != "STARTING" || status["instance"] == m.instance {
		t.Fatalf("GET /s/t2/status = %d %v", code, status)
	}
	if _, err := os.Stat(filepath.Join(sessionDir, lastFile)); err != nil {
		t.Fatalf("session last.db: %v", err)
	}
	var send map[string]any
	if code := call(t, h, http.MethodPost, "/s/t2/send", &send); code != http.StatusBadRequest {
		t.Fatalf("POST /s/t2/send = %d %v", code, send)
	}
	var groups map[string]any
	if code := call(t, h, http.MethodGet, "/s/t2/groups", &groups); code != http.StatusServiceUnavailable {
		t.Fatalf("GET /s/t2/groups = %d %v", code, groups)
	}
	var events map[string]any
	if code := call(t, h, http.MethodGet, "/s/t2/events?wait=0", &events); code != http.StatusOK || events["instance"] != status["instance"] {
		t.Fatalf("GET /s/t2/events = %d %v", code, events)
	}

	var sessions []sessionDTO
	if code := call(t, h, http.MethodGet, "/sessions", &sessions); code != http.StatusOK || len(sessions) != 1 || sessions[0] != (sessionDTO{Session: "t2", State: "STARTING"}) {
		t.Fatalf("GET /sessions = %d %v", code, sessions)
	}

	if code := call(t, h, http.MethodDelete, "/s/"+legacyKey, nil); code != http.StatusConflict {
		t.Fatalf("DELETE legacy = %d", code)
	}
	if code := call(t, h, http.MethodDelete, "/s/t2", nil); code != http.StatusNoContent {
		t.Fatalf("DELETE /s/t2 = %d", code)
	}
	if _, err := os.Stat(sessionDir); !os.IsNotExist(err) {
		t.Fatalf("session dir after delete: %v", err)
	}
	if code := call(t, h, http.MethodGet, "/sessions", &sessions); code != http.StatusOK || len(sessions) != 0 {
		t.Fatalf("GET /sessions after delete = %d %v", code, sessions)
	}
}
