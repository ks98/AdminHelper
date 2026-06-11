// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

package enroll

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

// selfSigned builds a self-signed leaf + PKCS#8 key PEM with the given validity.
func selfSigned(t *testing.T, cn string, notBefore, notAfter time.Time) (certPEM, keyPEM []byte) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: cn},
		NotBefore:             notBefore,
		NotAfter:              notAfter,
		KeyUsage:              x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	certPEM = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyDER, _ := x509.MarshalPKCS8PrivateKey(key)
	keyPEM = pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})
	return certPEM, keyPEM
}

func TestNeedsRenewal(t *testing.T) {
	now := time.Now()
	day := 24 * time.Hour
	cases := []struct {
		name          string
		before, after time.Time
		wantDue       bool
	}{
		{"fresh 11pct", now.Add(-10 * day), now.Add(80 * day), false},
		{"just past half", now.Add(-46 * day), now.Add(44 * day), true},
		{"well past half", now.Add(-80 * day), now.Add(10 * day), true},
		{"degenerate window", now, now, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			certPEM, _ := selfSigned(t, "x", tc.before, tc.after)
			due, err := NeedsRenewal(certPEM, RenewalFraction)
			if err != nil {
				t.Fatalf("NeedsRenewal: %v", err)
			}
			if due != tc.wantDue {
				t.Fatalf("due = %v, erwartet %v", due, tc.wantDue)
			}
		})
	}
}

func TestNeedsRenewalRejectsGarbage(t *testing.T) {
	if _, err := NeedsRenewal([]byte("nope"), RenewalFraction); err == nil {
		t.Fatal("erwartet Fehler bei Nicht-PEM")
	}
}

func TestServerClientFallsBackWhenNotProvisioned(t *testing.T) {
	dir := t.TempDir() // empty -> not provisioned
	client, err := ServerClient(dir, "", true, time.Second)
	if err != nil || client == nil {
		t.Fatalf("Fallback-Client erwartet, err=%v", err)
	}
}

func TestServerClientUsesIdentityWhenProvisioned(t *testing.T) {
	dir := t.TempDir()
	now := time.Now()
	certPEM, keyPEM := selfSigned(t, "agent", now.Add(-time.Hour), now.Add(time.Hour))
	mustWrite(t, CertPath(dir), certPEM)
	mustWrite(t, KeyPath(dir), keyPEM)
	mustWrite(t, CAPath(dir), certPEM) // any valid CA bundle
	if !Provisioned(dir) {
		t.Fatal("sollte provisioned sein")
	}
	client, err := ServerClient(dir, "", false, time.Second)
	if err != nil || client == nil {
		t.Fatalf("mTLS-Client erwartet, err=%v", err)
	}
}

// TestRenewSwapsIdentity drives a real renewal against a TLS test server: the
// agent presents its current cert (mTLS), the server returns a new fullchain,
// and Renew must persist it (new key + cert).
func TestRenewSwapsIdentity(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/ca/renew" {
			t.Errorf("Pfad = %q, erwartet /ca/renew", r.URL.Path)
		}
		var body RenewRequest
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.CSR == "" {
			t.Error("CSR fehlt im Renew-Body")
		}
		_ = json.NewEncoder(w).Encode(IssueResponse{
			Cert: "new-leaf", Fullchain: "new-leaf+int", Chain: "int+root",
		})
	}))
	defer srv.Close()

	dir := t.TempDir()
	now := time.Now()
	certPEM, keyPEM := selfSigned(t, "agent", now.Add(-time.Hour), now.Add(time.Hour))
	mustWrite(t, CertPath(dir), certPEM)
	mustWrite(t, KeyPath(dir), keyPEM)
	// Trust the test server's own cert (so the client verifies it under custom-root).
	srvCertPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: srv.Certificate().Raw})
	mustWrite(t, CAPath(dir), srvCertPEM)

	if err := Renew(dir, srv.URL, 5*time.Second); err != nil {
		t.Fatalf("Renew: %v", err)
	}

	if got, _ := os.ReadFile(CertPath(dir)); string(got) != "new-leaf+int" {
		t.Fatalf("agent.crt = %q, erwartet new-leaf+int", string(got))
	}
	if got, _ := os.ReadFile(KeyPath(dir)); string(got) == string(keyPEM) {
		t.Fatal("Key wurde nicht rotiert")
	}
}

func mustWrite(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
}
