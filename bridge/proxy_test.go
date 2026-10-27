package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProxyValidationAndMasking(t *testing.T) {
	for raw, masked := range map[string]string{
		"":                                   "",
		"socks5://user:secret@10.0.0.1:1080": "socks5://10.0.0.1:1080",
		"http://proxy.example:3128":          "http://proxy.example:3128",
		"https://u:p@proxy.example:443/":     "https://proxy.example:443",
		"socks5://[2001:db8::1]:1080":        "socks5://[2001:db8::1]:1080",
	} {
		u, err := parseProxy(raw)
		if err != nil || maskProxy(u) != masked {
			t.Errorf("%q -> %q, %v", raw, maskProxy(u), err)
		}
	}
	for _, raw := range []string{
		"socks4://10.0.0.1:1080", "ftp://h:21", "socks5://10.0.0.1", "socks5://:1080", "10.0.0.1:1080",
		"http://u:secret@h:80/path", "http://h:80?x=1", "http://u:secret@h:bad",
	} {
		if _, err := parseProxy(raw); err == nil {
			t.Errorf("%q accepted", raw)
		} else if strings.Contains(err.Error(), "secret") {
			t.Errorf("%q error leaks credentials: %v", raw, err)
		}
	}
}

func TestSameProxy(t *testing.T) {
	a, _ := parseProxy("socks5://u:p@h:1")
	b, _ := parseProxy("socks5://u:p@h:1")
	c, _ := parseProxy("socks5://u:other@h:1")
	if !sameProxy(nil, nil) || !sameProxy(a, b) || sameProxy(a, c) || sameProxy(a, nil) || sameProxy(nil, a) {
		t.Fatal("sameProxy")
	}
}

func TestConnectRejectsInvalidProxy(t *testing.T) {
	m, _ := testManager(t)
	h := m.routes()
	for body, code := range map[string]int{
		`{"proxy":"socks4://u:secret@h:1"}`: http.StatusBadRequest,
		`{"proxy":`:                         http.StatusBadRequest,
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/s/t2/connect", strings.NewReader(body)))
		if rec.Code != code || strings.Contains(rec.Body.String(), "secret") {
			t.Errorf("%s -> %d %s", body, rec.Code, rec.Body.String())
		}
	}
	var status map[string]any
	if code := call(t, h, http.MethodGet, "/s/t2/status", &status); code != http.StatusOK || status["proxy"] != "" || status["state"] != "STARTING" {
		t.Fatalf("status = %d %v", code, status)
	}
}
