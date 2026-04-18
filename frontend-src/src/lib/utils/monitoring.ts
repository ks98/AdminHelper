import type {
  MonCheckSummary,
  MonitorCheck,
  MonitorCheckType,
  MonStatus,
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

// ── Default-Schwellwerte (zentral) ───────────────────────────────────────
export const TEMP_GAUGE_MAX = 120;
export const DEF_CPU_WARN = 80;
export const DEF_CPU_CRIT = 95;
export const DEF_MEM_WARN = 80;
export const DEF_MEM_CRIT = 95;
export const DEF_DISK_WARN = 85;
export const DEF_DISK_CRIT = 95;
export const DEF_TEMP_WARN = 80;
export const DEF_TEMP_CRIT = 95;

// Check-Typen ohne automatischen Chart
export const NO_CHART_TYPES: readonly MonitorCheckType[] = [
  'service_process',
  'docker_health',
  'proxmox_backup',
];

// Farben fuer uPlot-Serien (1:1 aus dem Original)
export const CHART_COLORS = [
  '#4a9eff',
  '#ff6b6b',
  '#ffa726',
  '#66bb6a',
  '#ab47bc',
  '#26c6da',
];

export function gaugeClass(pct: number, warn: number, crit: number): 'gauge-ok' | 'gauge-warn' | 'gauge-crit' {
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
