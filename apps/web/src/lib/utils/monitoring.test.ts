// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from 'vitest';
import type { MonCheckSummary, MonitorCheck, Server } from '$lib/api/types';
import {
  worstStatusForServer,
  worstStatusOf,
  gaugeClass,
  checkTypeUnit,
  toCsv,
  parseCsv,
  parseIntCsv,
  filterChecks,
  summarizeChecks,
  groupChecksByServer,
  serverNameMap,
  distinctServerIds,
  distinctCheckTypes,
  distinctServerTags,
  NO_SERVER_GROUP_KEY,
  type CheckViewFilter,
} from './monitoring';

const summary = (serverId: string, status?: MonCheckSummary['state']): MonCheckSummary => ({
  id: Math.random().toString(36),
  serverId,
  state: status ?? null,
});

describe('worstStatusForServer', () => {
  it('returns null when no checks match the server', () => {
    expect(worstStatusForServer([summary('s1', { status: 'ok' })], 's2')).toBeNull();
  });

  it('picks the most severe status by precedence order', () => {
    const checks = [
      summary('s1', { status: 'ok' }),
      summary('s1', { status: 'warning' }),
      summary('s1', { status: 'critical' }),
    ];
    expect(worstStatusForServer(checks, 's1')).toBe('critical');
  });

  it('treats a missing status as pending', () => {
    const checks = [summary('s1', { status: 'ok' }), summary('s1', {})];
    expect(worstStatusForServer(checks, 's1')).toBe('pending');
  });

  it('only considers checks for the given server', () => {
    const checks = [summary('s1', { status: 'ok' }), summary('s2', { status: 'critical' })];
    expect(worstStatusForServer(checks, 's1')).toBe('ok');
  });
});

describe('worstStatusOf', () => {
  it('defaults to ok for an empty list', () => {
    expect(worstStatusOf([])).toBe('ok');
  });

  it('returns the worst status across checks', () => {
    const checks = [
      { state: { status: 'warning' } },
      { state: { status: 'unknown' } },
    ] as unknown as MonitorCheck[];
    // warning(3) outranks unknown(2)
    expect(worstStatusOf(checks)).toBe('warning');
  });

  it('treats null/missing state as pending', () => {
    const checks = [{ state: null }] as unknown as MonitorCheck[];
    expect(worstStatusOf(checks)).toBe('pending');
  });
});

describe('gaugeClass', () => {
  it('returns crit at or above the crit threshold', () => {
    expect(gaugeClass(95, 80, 95)).toBe('gauge-crit');
    expect(gaugeClass(99, 80, 95)).toBe('gauge-crit');
  });

  it('returns warn at or above warn but below crit', () => {
    expect(gaugeClass(80, 80, 95)).toBe('gauge-warn');
    expect(gaugeClass(94, 80, 95)).toBe('gauge-warn');
  });

  it('returns ok below the warn threshold', () => {
    expect(gaugeClass(0, 80, 95)).toBe('gauge-ok');
    expect(gaugeClass(79, 80, 95)).toBe('gauge-ok');
  });
});

describe('checkTypeUnit', () => {
  it('returns " ms" for latency check types', () => {
    expect(checkTypeUnit('ping')).toBe(' ms');
    expect(checkTypeUnit('tcp')).toBe(' ms');
    expect(checkTypeUnit('http')).toBe(' ms');
  });

  it('returns "%" for percentage check types', () => {
    expect(checkTypeUnit('agent_resources')).toBe('%');
    expect(checkTypeUnit('zfs_health')).toBe('%');
  });

  it('returns " s" for agent_ping', () => {
    expect(checkTypeUnit('agent_ping')).toBe(' s');
  });

  it('returns empty string for unitless types', () => {
    expect(checkTypeUnit('service_process')).toBe('');
  });
});

// ── Overview view logic ──────────────────────────────────────────────────

let nextId = 0;
const check = (over: Partial<MonitorCheck> = {}): MonitorCheck => ({
  id: `c${++nextId}`,
  name: 'Check',
  checkType: 'ping',
  interval: '5m',
  severity: 'critical',
  enabled: true,
  ...over,
});

const server = (id: string, name: string, tags: string[] = []): Server => ({
  id,
  name,
  hostname: `${name}.local`,
  tags,
});

const noFilter: CheckViewFilter = { serverId: '', checkType: '', status: '', tag: '', search: '' };

describe('filterChecks', () => {
  const servers = [server('s1', 'alpha', ['prod']), server('s2', 'beta', ['test'])];

  it('returns everything when no filter is set', () => {
    const checks = [check(), check()];
    expect(filterChecks(checks, servers, noFilter)).toEqual(checks);
  });

  it('returns an empty list for an empty input', () => {
    expect(filterChecks([], servers, noFilter)).toEqual([]);
  });

  it('filters by server id', () => {
    const a = check({ serverId: 's1' });
    const b = check({ serverId: 's2' });
    expect(filterChecks([a, b], servers, { ...noFilter, serverId: 's1' })).toEqual([a]);
  });

  it('filters by check type', () => {
    const a = check({ checkType: 'ping' });
    const b = check({ checkType: 'http' });
    expect(filterChecks([a, b], servers, { ...noFilter, checkType: 'http' })).toEqual([b]);
  });

  it('filters by status and treats missing state as pending', () => {
    const ok = check({ state: { status: 'ok' } });
    const crit = check({ state: { status: 'critical' } });
    const fresh = check({ state: null });
    expect(filterChecks([ok, crit, fresh], servers, { ...noFilter, status: 'critical' })).toEqual([
      crit,
    ]);
    expect(filterChecks([ok, crit, fresh], servers, { ...noFilter, status: 'pending' })).toEqual([
      fresh,
    ]);
  });

  it('filters by server tag and drops checks without (known) server', () => {
    const tagged = check({ serverId: 's1' });
    const otherTag = check({ serverId: 's2' });
    const unknownServer = check({ serverId: 's3' });
    const noServer = check({ serverId: null });
    expect(
      filterChecks([tagged, otherTag, unknownServer, noServer], servers, {
        ...noFilter,
        tag: 'prod',
      }),
    ).toEqual([tagged]);
  });

  it('searches case-insensitively in name, message and server name', () => {
    const byName = check({ name: 'Disk Usage' });
    const byMessage = check({ state: { status: 'ok', message: 'all DISKS healthy' } });
    const byServer = check({ serverId: 's2', name: 'cpu' });
    const miss = check({ name: 'memory' });
    expect(filterChecks([byName, byMessage, byServer, miss], servers, noFilter).length).toBe(4);
    expect(
      filterChecks([byName, byMessage, byServer, miss], servers, { ...noFilter, search: 'disk' }),
    ).toEqual([byName, byMessage]);
    expect(
      filterChecks([byName, byMessage, byServer, miss], servers, { ...noFilter, search: 'BETA' }),
    ).toEqual([byServer]);
  });
});

describe('summarizeChecks', () => {
  it('returns zeros for an empty list', () => {
    expect(summarizeChecks([])).toEqual({ total: 0, ok: 0, warning: 0, critical: 0 });
  });

  it('counts ok/warning/critical; unknown and pending only count into total', () => {
    const checks = [
      check({ state: { status: 'ok' } }),
      check({ state: { status: 'ok' } }),
      check({ state: { status: 'warning' } }),
      check({ state: { status: 'critical' } }),
      check({ state: { status: 'unknown' } }),
      check({ state: null }),
    ];
    expect(summarizeChecks(checks)).toEqual({ total: 6, ok: 2, warning: 1, critical: 1 });
  });
});

describe('groupChecksByServer', () => {
  const names = serverNameMap([server('s1', 'alpha'), server('s2', 'beta')]);

  it('returns no groups for an empty list', () => {
    expect(groupChecksByServer([], names, 'Ohne Server')).toEqual([]);
  });

  it('does not emit groups for servers without checks', () => {
    const checks = [check({ serverId: 's1' })];
    const groups = groupChecksByServer(checks, names, 'Ohne Server');
    expect(groups.map((g) => g.key)).toEqual(['s1']);
  });

  it('groups by server in first-seen order and computes the worst status', () => {
    const a1 = check({ serverId: 's1', state: { status: 'ok' } });
    const b1 = check({ serverId: 's2', state: { status: 'warning' } });
    const a2 = check({ serverId: 's1', state: { status: 'critical' } });
    const groups = groupChecksByServer([a1, b1, a2], names, 'Ohne Server');
    expect(groups.map((g) => g.key)).toEqual(['s1', 's2']);
    expect(groups[0]).toMatchObject({ title: 'alpha', checks: [a1, a2], worst: 'critical' });
    expect(groups[1]).toMatchObject({ title: 'beta', checks: [b1], worst: 'warning' });
  });

  it('falls back to the server id as title when the name is unknown', () => {
    const groups = groupChecksByServer([check({ serverId: 'sX' })], names, 'Ohne Server');
    expect(groups[0].title).toBe('sX');
  });

  it('appends a no-server group last', () => {
    const orphan = check({ serverId: null, state: { status: 'warning' } });
    const groups = groupChecksByServer([orphan, check({ serverId: 's1' })], names, 'Ohne Server');
    expect(groups.map((g) => g.key)).toEqual(['s1', NO_SERVER_GROUP_KEY]);
    expect(groups[1]).toMatchObject({ title: 'Ohne Server', checks: [orphan], worst: 'warning' });
  });
});

describe('distinct values for the filter dropdowns', () => {
  it('distinctServerIds dedupes and skips checks without server', () => {
    const checks = [
      check({ serverId: 's1' }),
      check({ serverId: 's1' }),
      check({ serverId: 's2' }),
      check({ serverId: null }),
    ];
    expect(distinctServerIds(checks)).toEqual(['s1', 's2']);
  });

  it('distinctCheckTypes dedupes and sorts', () => {
    const checks = [
      check({ checkType: 'tcp' }),
      check({ checkType: 'http' }),
      check({ checkType: 'tcp' }),
    ];
    expect(distinctCheckTypes(checks)).toEqual(['http', 'tcp']);
  });

  it('distinctServerTags collects sorted tags only from servers in use', () => {
    const servers = [server('s1', 'alpha', ['web', 'prod']), server('s2', 'beta', ['unused'])];
    expect(distinctServerTags([check({ serverId: 's1' })], servers)).toEqual(['prod', 'web']);
  });

  it('distinctServerTags is empty for an empty check list', () => {
    expect(distinctServerTags([], [server('s1', 'alpha', ['prod'])])).toEqual([]);
  });
});

describe('toCsv', () => {
  it('joins arrays with ", "', () => {
    expect(toCsv(['a', 'b', 'c'])).toBe('a, b, c');
  });

  it('returns empty string for null/undefined', () => {
    expect(toCsv(null)).toBe('');
    expect(toCsv(undefined)).toBe('');
  });

  it('stringifies scalar values', () => {
    expect(toCsv(42)).toBe('42');
  });
});

describe('parseCsv', () => {
  it('splits, trims and drops empties', () => {
    expect(parseCsv('a, b ,, c ')).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('parseIntCsv', () => {
  it('parses integers and drops non-numeric entries', () => {
    expect(parseIntCsv('1, 2, x, 3')).toEqual([1, 2, 3]);
  });

  it('returns empty array when nothing parses', () => {
    expect(parseIntCsv('a, b')).toEqual([]);
  });
});
