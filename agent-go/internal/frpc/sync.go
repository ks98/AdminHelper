package frpc

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"adminhelper-agent/internal/config"
)

// Sync prueft auf Config-Aenderungen und aktualisiert frpc (Portierung von do_sync).
func Sync() error {
	cfg, err := config.LoadFrpcConfig()
	if err != nil {
		if os.IsNotExist(err) {
			logMsg("Keine Konfiguration gefunden. Ueberspringe.")
			return nil
		}
		return fmt.Errorf("Config laden: %w", err)
	}

	if cfg.AdminHelperURL == "" || cfg.APIKey == "" || cfg.ServerID == "" {
		return fmt.Errorf("adminhelper.conf unvollstaendig")
	}

	client, err := httpClient(cfg.CACert, cfg.Insecure)
	if err != nil {
		return fmt.Errorf("HTTP-Client: %w", err)
	}

	// Remote-Hash abrufen
	hashURL := fmt.Sprintf("%s/api/frp/provision/%s/config-hash", cfg.AdminHelperURL, cfg.ServerID)
	hashBody, err := httpGet(client, hashURL, cfg.APIKey)
	if err != nil {
		logMsg("WARNUNG: Config-Hash konnte nicht abgefragt werden: %v", err)
		return nil
	}
	remoteHash, err := parseConfigHash(hashBody)
	if err != nil {
		return fmt.Errorf("Hash-Antwort parsen: %w", err)
	}

	// Lokalen Hash lesen
	localHash := ""
	if data, err := os.ReadFile(config.FrpHashFile()); err == nil {
		localHash = strings.TrimSpace(string(data))
	}

	if remoteHash == localHash {
		return nil
	}
	logMsg("Config-Aenderung erkannt. Aktualisiere...")

	// Neue Config holen
	configURL := fmt.Sprintf("%s/api/frp/provision/%s/config", cfg.AdminHelperURL, cfg.ServerID)
	newConfig, err := httpGet(client, configURL, cfg.APIKey)
	if err != nil {
		return fmt.Errorf("neue Config laden: %w", err)
	}

	// Config schreiben (0600: enthaelt frp-Auth-Token).
	if err := os.WriteFile(config.FrpConfigFile(), newConfig, 0600); err != nil {
		return fmt.Errorf("frpc.toml schreiben: %w", err)
	}
	if err := os.WriteFile(config.FrpHashFile(), []byte(remoteHash), 0644); err != nil {
		return fmt.Errorf("Hash schreiben: %w", err)
	}

	// frpc neustarten
	if err := restartFrpc(); err != nil {
		return fmt.Errorf("frpc neustarten: %w", err)
	}
	logMsg("frpc.toml aktualisiert und frpc neugestartet.")
	return nil
}

// parseConfigHash liest den Hash-Wert aus der Server-Antwort (`{"hash": "..."}`).
func parseConfigHash(body []byte) (string, error) {
	var hashResp struct {
		Hash string `json:"hash"`
	}
	if err := json.Unmarshal(body, &hashResp); err != nil {
		return "", err
	}
	return hashResp.Hash, nil
}

// hashConfig berechnet den hex-kodierten SHA256-Hash der Config-Bytes.
func hashConfig(data []byte) string {
	return fmt.Sprintf("%x", sha256.Sum256(data))
}

// writeConfigHash berechnet den SHA256-Hash der aktuellen frpc.toml.
func writeConfigHash() error {
	data, err := os.ReadFile(config.FrpConfigFile())
	if err != nil {
		return err
	}
	return os.WriteFile(config.FrpHashFile(), []byte(hashConfig(data)), 0644)
}
