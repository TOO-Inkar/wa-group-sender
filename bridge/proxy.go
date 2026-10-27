package main

import (
	"errors"
	"net/http"
	"net/url"
)

var (
	proxySchemes    = map[string]bool{"socks5": true, "http": true, "https": true}
	errInvalidProxy = errors.New("proxy must be socks5://, http:// or https:// with host and port")
)

func parseProxy(raw string) (*url.URL, error) {
	if raw == "" {
		return nil, nil
	}
	u, err := url.Parse(raw)
	if err != nil || !proxySchemes[u.Scheme] || u.Hostname() == "" || u.Port() == "" || (u.Path != "" && u.Path != "/") || u.RawQuery != "" {
		return nil, errInvalidProxy
	}
	return u, nil
}

func maskProxy(u *url.URL) string {
	if u == nil {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

func sameProxy(a, b *url.URL) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.String() == b.String()
}

func proxyClient(u *url.URL) *http.Client {
	if u == nil {
		return http.DefaultClient
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = http.ProxyURL(u)
	return &http.Client{Transport: transport}
}
