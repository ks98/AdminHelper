// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

package frpc

import "adminhelper-agent/internal/logging"

// logger tags all frpc operational logs with component=frpc and routes them
// through the shared rotating-file + stdout handler (see internal/logging).
var logger = logging.For("frpc")
