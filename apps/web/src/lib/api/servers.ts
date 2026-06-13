// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Read-only server list. The web no longer manages servers (server CRUD moved to
// the desktop client), but user management lives in the web and still needs the
// list to assign servers to a user (controls what a non-admin sees in the
// desktop). This is the only server endpoint the web calls — there is
// deliberately no create/update/remove here.

import { http } from './client';
import type { Server } from './types';

export function list(): Promise<Server[]> {
  return http.get<Server[]>('/api/servers');
}
