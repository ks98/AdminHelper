const STATUS_PRIORITY = { critical: 4, warning: 3, unknown: 2, pending: 1, ok: 0 };

export function worstStatus(checks) {
  let worst = "ok";
  for (const c of checks) {
    const s = c.state?.status || "pending";
    if ((STATUS_PRIORITY[s] || 0) > (STATUS_PRIORITY[worst] || 0)) {
      worst = s;
    }
  }
  return worst;
}

export function groupChecksByServer(checks, connections = []) {
  const map = new Map();
  for (const c of checks) {
    const key = c.serverId || "__none";
    if (!map.has(key)) {
      const match = c.serverId ? connections.find((conn) => conn.serverId === c.serverId) : null;
      const serverName = match ? (match.name || match.host || c.serverId) : c.serverId;
      map.set(key, { serverId: c.serverId, serverName, checks: [] });
    }
    map.get(key).checks.push(c);
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    const nameA = a.serverName || a.serverId || "";
    const nameB = b.serverName || b.serverId || "";
    return nameA.localeCompare(nameB);
  });
  return groups;
}

export function filterChecks(checks, filters) {
  const query = (filters.search || "").toLowerCase();
  return checks.filter((c) => {
    if (filters.server && c.serverId !== filters.server) return false;
    if (filters.type && c.checkType !== filters.type) return false;
    if (filters.status) {
      const s = c.state?.status || "pending";
      if (s !== filters.status) return false;
    }
    if (query) {
      const hay = `${c.name} ${c.description || ""} ${c.checkType} ${c.state?.message || ""}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

export function statusClass(status) {
  const s = status || "pending";
  return `mon-${s}`;
}

export function formatCheckTime(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function computeSummary(checks) {
  const s = { total: 0, ok: 0, warning: 0, critical: 0, unknown: 0, pending: 0 };
  for (const c of checks) {
    s.total++;
    const status = c.state?.status || "pending";
    if (s[status] !== undefined) s[status]++;
  }
  return s;
}
