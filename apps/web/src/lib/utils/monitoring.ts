// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  MonCheckSummary,
  MonitorCheck,
  MonitorCheckType,
  MonStatus,
  Server,
} from '$lib/api/types';

const ORDER: Record<MonStatus, number> = {
  critical: 4,
  warning: 3,
  unknown: 2,
  pending: 1,
  ok: 0,
};

export function worstStatusForServer(
  checks: MonCheckSummary[],
  serverId: string,
): MonStatus | null {
  const matching = checks.filter((c) => c.serverId === serverId);
  if (matching.length === 0) return null;
  let worst: MonStatus = 'ok';
  for (const c of matching) {
    const s: MonStatus = c.state?.status ?? 'pending';
    if (ORDER[s] > ORDER[worst]) worst = s;
  }
  return worst;
}

export function worstStatusOf(checks: MonitorCheck[]): MonStatus {
  let worst: MonStatus = 'ok';
  for (const c of checks) {
    const s: MonStatus = c.state?.status ?? 'pending';
    if (ORDER[s] > ORDER[worst]) worst = s;
  }
  return worst;
}

// ── Overview view logic (filter / summary / grouping) ───────────────────

export interface CheckViewFilter {
  serverId: string;
  checkType: string;
  status: string;
  tag: string;
  search: string;
}

export function serverNameMap(servers: Server[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of servers) m.set(s.id, s.name);
  return m;
}

export function filterChecks(
  checks: MonitorCheck[],
  servers: Server[],
  filter: CheckViewFilter,
): MonitorCheck[] {
  let list = checks;
  if (filter.serverId) list = list.filter((c) => c.serverId === filter.serverId);
  if (filter.checkType) list = list.filter((c) => c.checkType === filter.checkType);
  if (filter.status) {
    list = list.filter((c) => (c.state?.status ?? 'pending') === filter.status);
  }
  if (filter.tag) {
    const tag = filter.tag;
    const byId = new Map(servers.map((s) => [s.id, s]));
    list = list.filter((c) => {
      const srv = c.serverId ? byId.get(c.serverId) : null;
      return !!srv && (srv.tags ?? []).includes(tag);
    });
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    const names = serverNameMap(servers);
    list = list.filter((c) => {
      const sn = c.serverId ? (names.get(c.serverId) ?? '') : '';
      return (
        c.name.toLowerCase().includes(q) ||
        (c.state?.message ?? '').toLowerCase().includes(q) ||
        sn.toLowerCase().includes(q)
      );
    });
  }
  return list;
}

export interface CheckStatusCounts {
  total: number;
  ok: number;
  warning: number;
  critical: number;
}

export function summarizeChecks(checks: MonitorCheck[]): CheckStatusCounts {
  const counts: CheckStatusCounts = { total: checks.length, ok: 0, warning: 0, critical: 0 };
  for (const c of checks) {
    const s = c.state?.status ?? 'pending';
    if (s === 'ok') counts.ok++;
    else if (s === 'warning') counts.warning++;
    else if (s === 'critical') counts.critical++;
  }
  return counts;
}

export const NO_SERVER_GROUP_KEY = '__nosrv__';

export interface CheckGroup {
  key: string;
  title: string;
  checks: MonitorCheck[];
  worst: MonStatus;
}

export function groupChecksByServer(
  checks: MonitorCheck[],
  serverNames: ReadonlyMap<string, string>,
  noServerTitle: string,
): CheckGroup[] {
  const byServer = new Map<string, MonitorCheck[]>();
  const noServer: MonitorCheck[] = [];
  for (const c of checks) {
    if (c.serverId) {
      const bucket = byServer.get(c.serverId) ?? [];
      bucket.push(c);
      byServer.set(c.serverId, bucket);
    } else {
      noServer.push(c);
    }
  }
  const groups: CheckGroup[] = [];
  for (const [sid, list] of byServer.entries()) {
    groups.push({
      key: sid,
      title: serverNames.get(sid) ?? sid,
      checks: list,
      worst: worstStatusOf(list),
    });
  }
  if (noServer.length > 0) {
    groups.push({
      key: NO_SERVER_GROUP_KEY,
      title: noServerTitle,
      checks: noServer,
      worst: worstStatusOf(noServer),
    });
  }
  return groups;
}

export function distinctServerIds(checks: MonitorCheck[]): string[] {
  return Array.from(new Set(checks.map((c) => c.serverId).filter((x): x is string => !!x)));
}

export function distinctCheckTypes(checks: MonitorCheck[]): MonitorCheckType[] {
  return Array.from(new Set(checks.map((c) => c.checkType))).sort();
}

export function distinctServerTags(checks: MonitorCheck[], servers: Server[]): string[] {
  const set = new Set<string>();
  for (const id of distinctServerIds(checks)) {
    const s = servers.find((srv) => srv.id === id);
    for (const tg of s?.tags ?? []) set.add(tg);
  }
  return Array.from(set).sort();
}

// ── Default thresholds (central) ─────────────────────────────────────────
export const TEMP_GAUGE_MAX = 120;
export const DEF_CPU_WARN = 80;
export const DEF_CPU_CRIT = 95;
export const DEF_MEM_WARN = 80;
export const DEF_MEM_CRIT = 95;
export const DEF_DISK_WARN = 85;
export const DEF_DISK_CRIT = 95;
export const DEF_TEMP_WARN = 80;
export const DEF_TEMP_CRIT = 95;

// Check types without an automatic chart
export const NO_CHART_TYPES: readonly MonitorCheckType[] = [
  'service_process',
  'docker_health',
  'proxmox_backup',
];

// Colors for uPlot series (verbatim from the original)
export const CHART_COLORS = ['#4a9eff', '#ff6b6b', '#ffa726', '#66bb6a', '#ab47bc', '#26c6da'];

export function gaugeClass(
  pct: number,
  warn: number,
  crit: number,
): 'gauge-ok' | 'gauge-warn' | 'gauge-crit' {
  if (pct >= crit) return 'gauge-crit';
  if (pct >= warn) return 'gauge-warn';
  return 'gauge-ok';
}

export function checkTypeUnit(type: MonitorCheckType): string {
  if (type === 'ping' || type === 'tcp' || type === 'http') return ' ms';
  if (type === 'agent_resources' || type === 'zfs_health') return '%';
  if (type === 'agent_ping') return ' s';
  return '';
}

export function formatTime(iso: string | null | undefined, lang: 'de' | 'en'): string {
  if (!iso) return '';
  try {
    const loc = lang === 'en' ? 'en-GB' : 'de-DE';
    return new Date(iso).toLocaleString(loc, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function toCsv(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  if (v == null) return '';
  return String(v);
}

export function parseCsv(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseIntCsv(v: string): number[] {
  return v
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}
