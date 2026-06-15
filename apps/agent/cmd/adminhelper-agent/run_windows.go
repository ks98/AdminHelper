// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

//go:build windows

package main

import (
	"context"
	"time"

	"golang.org/x/sys/windows/svc"
)

// windowsServiceName must match the name `sc create` registers in
// internal/service/service_windows.go.
const windowsServiceName = "AdminHelper-Agent"

// agentService implements svc.Handler: it reports SERVICE_RUNNING to the SCM and
// drives the same runOnce() loop as runLoop(), but stops on SCM Stop/Shutdown
// instead of an OS signal (the SCM does not send SIGINT/SIGTERM).
type agentService struct{}

func (s *agentService) Execute(_ []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	changes <- svc.Status{State: svc.StartPending}

	// Cancel the ctx on Stop/Shutdown so an in-flight push retry backoff aborts
	// at once instead of blocking the SCM stop for up to the full backoff.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ticker := time.NewTicker(defaultInterval)
	defer ticker.Stop()

	// Run the cycle on a worker goroutine so the SCM control loop stays
	// responsive: a Stop arriving during a push retry can cancel the ctx
	// immediately instead of waiting for the cycle to finish. busy guards
	// against overlapping cycles when one runs longer than the interval.
	busy := false
	done := make(chan struct{}, 1)
	start := func() {
		if busy {
			return
		}
		busy = true
		go func() {
			runOnce(ctx)
			done <- struct{}{}
		}()
	}

	start()
	changes <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}

	for {
		select {
		case <-done:
			busy = false
		case <-ticker.C:
			start()
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				changes <- svc.Status{State: svc.StopPending}
				cancel()
				return false, 0
			}
		}
	}
}

// runService runs the agent under the Windows SCM when started by it, so
// `sc start` gets a SERVICE_RUNNING report instead of timing out (error 1053).
// When NOT launched as a service (interactive run), it returns handled=false so
// the caller falls back to the normal runLoop().
func runService() (handled bool, err error) {
	isSvc, err := svc.IsWindowsService()
	if err != nil {
		return false, err
	}
	if !isSvc {
		return false, nil
	}
	return true, svc.Run(windowsServiceName, &agentService{})
}
