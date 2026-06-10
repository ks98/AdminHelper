// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Package httpclient builds the TLS-aware HTTP client shared by the agent
// components (frpc sync, monitor push, provisioning).
package httpclient

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"os"
	"time"
)

// New creates an HTTP client with optional TLS settings: a pinned CA
// certificate (cacert, PEM file path) or disabled verification (insecure).
func New(cacert string, insecure bool, timeout time.Duration) (*http.Client, error) {
	tlsCfg := &tls.Config{}
	if insecure {
		tlsCfg.InsecureSkipVerify = true
	} else if cacert != "" {
		pem, err := os.ReadFile(cacert)
		if err != nil {
			return nil, fmt.Errorf("CA-Zertifikat lesen: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("CA-Zertifikat ungueltig")
		}
		tlsCfg.RootCAs = pool
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: &http.Transport{TLSClientConfig: tlsCfg},
	}, nil
}
