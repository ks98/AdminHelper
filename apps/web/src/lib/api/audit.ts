// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { http } from './client';
import type { AuditEntry, AuditQuery } from './types';

export function list(params: AuditQuery = {}): Promise<AuditEntry[]> {
  const qs = new URLSearchParams();
  if (params.action) qs.set('action', params.action);
  if (params.actorType) qs.set('actor_type', params.actorType);
  if (params.objectType) qs.set('object_type', params.objectType);
  if (params.objectId) qs.set('object_id', params.objectId);
  if (params.status) qs.set('status', params.status);
  if (params.q) qs.set('q', params.q);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  const query = qs.toString();
  return http.get<AuditEntry[]>(`/api/audit${query ? `?${query}` : ''}`);
}
