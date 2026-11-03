package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func fakeProxy(t *testing.T, whatsAppStatus int) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Host {
		case "ipinfo.test":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"ip":"203.0.113.7","country":"KZ","city":"Almaty","org":"AS48503 Tele2"}`))
		case "whatsapp.test":
			w.WriteHeader(whatsAppStatus)
		default:
			w.WriteHeader(http.StatusBadGateway)
		}
	}))
	t.Cleanup(server.Close)
	return server
}

func proxyURL(t *testing.T, server *httptest.Server) *url.URL {
	t.Helper()
	u, err := parseProxy(strings.Replace(server.URL, "http://", "http://user:secret@", 1))
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func TestProxyCheckReportsEgressAndWhatsApp(t *testing.T) {
	proxy := proxyURL(t, fakeProxy(t, http.StatusOK))
	result := checkProxy(context.Background(), proxy, "http://ipinfo.test/json", "http://whatsapp.test/")
	if !result.OK || !result.WhatsApp || result.IP != "203.0.113.7" || result.Country != "KZ" || result.City != "Almaty" {
		t.Fatalf("unexpected result %+v", result)
	}
}

func TestProxyCheckFailsWhenWhatsAppIsBlocked(t *testing.T) {
	proxy := proxyURL(t, fakeProxy(t, http.StatusServiceUnavailable))
	result := checkProxy(context.Background(), proxy, "http://ipinfo.test/json", "http://whatsapp.test/")
	if result.OK || result.WhatsApp || result.IP != "203.0.113.7" || !strings.Contains(result.Error, "WhatsApp") {
		t.Fatalf("unexpected result %+v", result)
	}
}

func TestProxyCheckErrorDoesNotLeakCredentials(t *testing.T) {
	server := fakeProxy(t, http.StatusOK)
	proxy := proxyURL(t, server)
	server.Close()
	result := checkProxy(context.Background(), proxy, "http://ipinfo.test/json", "http://whatsapp.test/")
	if result.OK || result.Error == "" || strings.Contains(result.Error, "secret") {
		t.Fatalf("unexpected result %+v", result)
	}
}

func TestProxyCheckRejectsInvalidProxy(t *testing.T) {
	for _, body := range []string{`{}`, `{"proxy":"ftp://u:secret@h:21"}`, `not json`} {
		rec := httptest.NewRecorder()
		handleProxyCheck(rec, httptest.NewRequest(http.MethodPost, "/proxy-check", strings.NewReader(body)))
		if rec.Code != http.StatusBadRequest || strings.Contains(rec.Body.String(), "secret") {
			t.Errorf("%s -> %d %s", body, rec.Code, rec.Body.String())
		}
	}
}
