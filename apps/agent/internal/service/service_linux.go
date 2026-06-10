// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

//go:build linux

package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

const serviceName = "adminhelper-agent"

// Install registers the AdminHelper agent as a systemd service with a timer.
func Install() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("eigenen Pfad ermitteln: %w", err)
	}

	// Write the service unit.
	// Twin of the packaged units in apps/agent/systemd/ (adminhelper-agent.service
	// + .timer, shipped via deb/rpm): both install paths must share the
	// `run --once` + timer semantics — keep them in sync. Only ExecStart differs
	// (dynamic exe path instead of /usr/bin).
	serviceUnit := fmt.Sprintf(`[Unit]
Description=AdminHelper Agent — FRPC Sync + Monitoring
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=%s run --once
TimeoutStartSec=60
`, exePath)

	// Write the timer unit
	timerUnit := `[Unit]
Description=AdminHelper Agent Timer (FRPC Sync + Monitoring alle 5 Minuten)

[Timer]
OnBootSec=60
OnUnitActiveSec=300
RandomizedDelaySec=30
Persistent=true

[Install]
WantedBy=timers.target
`

	unitDir := "/etc/systemd/system"
	svcFile := filepath.Join(unitDir, serviceName+".service")
	tmrFile := filepath.Join(unitDir, serviceName+".timer")

	if err := os.WriteFile(svcFile, []byte(serviceUnit), 0644); err != nil {
		return fmt.Errorf("Service-Unit schreiben: %w", err)
	}
	if err := os.WriteFile(tmrFile, []byte(timerUnit), 0644); err != nil {
		return fmt.Errorf("Timer-Unit schreiben: %w", err)
	}

	if err := exec.Command("systemctl", "daemon-reload").Run(); err != nil {
		return fmt.Errorf("daemon-reload: %w", err)
	}
	if err := exec.Command("systemctl", "enable", "--now", serviceName+".timer").Run(); err != nil {
		return fmt.Errorf("Timer aktivieren: %w", err)
	}
	fmt.Printf("Service installiert: %s.timer aktiv\n", serviceName)
	return nil
}

// Uninstall deregisters the AdminHelper agent service.
func Uninstall() error {
	exec.Command("systemctl", "stop", serviceName+".timer").Run()
	exec.Command("systemctl", "disable", serviceName+".timer").Run()
	exec.Command("systemctl", "stop", serviceName+".service").Run()
	exec.Command("systemctl", "disable", serviceName+".service").Run()

	unitDir := "/etc/systemd/system"
	os.Remove(filepath.Join(unitDir, serviceName+".service"))
	os.Remove(filepath.Join(unitDir, serviceName+".timer"))

	exec.Command("systemctl", "daemon-reload").Run()
	fmt.Println("Service deinstalliert.")
	return nil
}
