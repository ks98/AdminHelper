// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({ http: { get: vi.fn(() => Promise.resolve([])) } }));

import { http } from './client';
import { list } from './audit';

describe('audit api', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a query string from the given filters', async () => {
    await list({ action: 'connection.created', actorType: 'user', q: 'prod', limit: 50 });
    const url = vi.mocked(http.get).mock.calls[0][0];
    expect(url).toContain('/api/audit?');
    expect(url).toContain('action=connection.created');
    expect(url).toContain('actor_type=user');
    expect(url).toContain('q=prod');
    expect(url).toContain('limit=50');
  });

  it('omits empty params and the query string when there are no filters', async () => {
    await list();
    expect(http.get).toHaveBeenCalledWith('/api/audit');
  });
});
