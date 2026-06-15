// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

//go:build windows

package frpc

import "os/exec"

// enableFrpcService starts the frpc process on Windows.
// In service mode, frpc is managed by the AdminHelper agent service itself.
func enableFrpcService() error {
	// Start frpc as a background process — in service mode the Windows
	// service takes over management.
	// TODO: integrate with the Windows Service Manager
	return exec.Command("sc", "start", "frpc").Run()
}

// restartFrpc restarts frpc on Windows.
func restartFrpc() error {
	if err := exec.Command("sc", "stop", "frpc").Run(); err != nil {
		logger.Warnf("frpc stop: %v", err)
	}
	return exec.Command("sc", "start", "frpc").Run()
}
