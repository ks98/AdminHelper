// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"adminhelper-agent/internal/config"
	"adminhelper-agent/internal/enroll"
	"adminhelper-agent/internal/frpc"
	"adminhelper-agent/internal/logging"
	"adminhelper-agent/internal/monitor"
)

const defaultInterval = 5 * time.Minute

var logger = logging.For("agent")

func runCmd() *cobra.Command {
	var once bool

	cmd := &cobra.Command{
		Use:   "run",
		Short: "FRPC-Sync + Monitor-Push ausfuehren",
		Long:  "Ohne --once: Dauerbetrieb (alle 5 Minuten). Mit --once: einmaliger Durchlauf (fuer systemd-Timer).",
		RunE: func(cmd *cobra.Command, args []string) error {
			if once {
				runOnce(context.Background())
				return nil
			}
			// On Windows, run under the SCM when started as a service (reports
			// SERVICE_RUNNING; otherwise sc start times out with error 1053).
			// Interactive runs and all other platforms fall through to runLoop.
			if handled, err := runService(); handled {
				return err
			}
			return runLoop()
		},
	}
	cmd.Flags().BoolVar(&once, "once", false, "Einmaliger Durchlauf (fuer systemd-Timer / Task Scheduler)")
	return cmd
}

func runLoop() error {
	logger.Infof("Starte Dauerbetrieb (Intervall: %s)", defaultInterval)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	// Cancel the ctx on shutdown so an in-flight push retry backoff aborts
	// instead of blocking the exit.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ticker := time.NewTicker(defaultInterval)
	defer ticker.Stop()

	runOnce(ctx)

	for {
		select {
		case <-ticker.C:
			runOnce(ctx)
		case s := <-sig:
			logger.Infof("Signal %v empfangen, beende...", s)
			return nil
		}
	}
}

func runOnce(ctx context.Context) {
	// The agent runs as a oneshot (systemd timer / scheduled task), so renewal
	// is a check-at-each-run rather than a background timer: if the enrolled cert
	// is past ~50 % of its lifetime, renew it before the pushes.
	maybeRenewIdentity()
	if err := frpc.Sync(); err != nil {
		logger.Errorf("FRPC-Sync Fehler: %v", err)
	}
	if err := monitor.Push(ctx); err != nil {
		logger.Errorf("Monitor-Push Fehler: %v", err)
	}
}

// maybeRenewIdentity renews the enrolled mTLS cert when due. Best-effort: a
// transient issuer outage must not abort the cycle — the current cert is still
// valid for the remaining lifetime.
func maybeRenewIdentity() {
	dir := config.AgentPkiDir()
	if !enroll.Provisioned(dir) {
		return
	}
	base, err := config.ServerBaseURL()
	if err != nil {
		return // no server URL configured yet; nothing to renew against
	}
	renewed, err := enroll.MaybeRenew(dir, base, 30*time.Second)
	if err != nil {
		logger.Warnf("Cert-Renew Fehler: %v", err)
		return
	}
	if renewed {
		logger.Infof("mTLS-Client-Zertifikat erneuert.")
	}
}
