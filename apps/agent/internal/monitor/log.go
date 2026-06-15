// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

package monitor

import "adminhelper-agent/internal/logging"

// logger tags all monitor operational logs with component=monitor and routes
// them through the shared rotating-file + stdout handler (see internal/logging).
var logger = logging.For("monitor")
