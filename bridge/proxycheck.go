package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	proxyCheckTimeout = 20 * time.Second
	proxyCheckMaxBody = 1 << 16
	ipInfoURL         = "https://ipinfo.io/json"
	whatsAppURL       = "https://web.whatsapp.com/"
)

type proxyCheckResult struct {
	OK       bool   `json:"ok"`
	IP       string `json:"ip,omitempty"`
	Country  string `json:"country,omitempty"`
	City     string `json:"city,omitempty"`
	Org      string `json:"org,omitempty"`
	WhatsApp bool   `json:"whatsapp"`
	Error    string `json:"error,omitempty"`
}

type ipInfo struct {
	IP      string `json:"ip"`
	Country string `json:"country"`
	City    string `json:"city"`
	Org     string `json:"org"`
}

func handleProxyCheck(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Proxy string `json:"proxy"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, proxyCheckMaxBody)).Decode(&req); err != nil || req.Proxy == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "proxy is required"})
		return
	}
	proxy, err := parseProxy(req.Proxy)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), proxyCheckTimeout)
	defer cancel()
	writeJSON(w, http.StatusOK, checkProxy(ctx, proxy, ipInfoURL, whatsAppURL))
}

func checkProxy(ctx context.Context, proxy *url.URL, infoURL, waURL string) proxyCheckResult {
	client := proxyClient(proxy)
	var info ipInfo
	if err := getJSON(ctx, client, infoURL, &info); err != nil {
		return proxyCheckResult{Error: scrubProxy(err, proxy)}
	}
	result := proxyCheckResult{OK: true, IP: info.IP, Country: info.Country, City: info.City, Org: info.Org}
	if err := reach(ctx, client, waURL); err != nil {
		result.OK = false
		result.Error = "WhatsApp недоступен через прокси: " + scrubProxy(err, proxy)
		return result
	}
	result.WhatsApp = true
	return result
}

func getJSON(ctx context.Context, client *http.Client, target string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, proxyCheckMaxBody)).Decode(out)
}

func reach(ctx context.Context, client *http.Client, target string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, target, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= http.StatusInternalServerError {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return nil
}

func scrubProxy(err error, proxy *url.URL) string {
	message := err.Error()
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		message = urlErr.Err.Error()
	}
	if proxy.User != nil {
		message = strings.ReplaceAll(message, proxy.User.String(), "***")
		if password, ok := proxy.User.Password(); ok && password != "" {
			message = strings.ReplaceAll(message, password, "***")
		}
	}
	return message
}
