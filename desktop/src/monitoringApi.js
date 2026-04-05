export function createMonitoringApi(session) {
  const baseUrl = `${session.serverUrl}/api/monitoring`;
  const headers = {
    Authorization: `Bearer ${session.token}`,
    "Content-Type": "application/json"
  };

  async function request(method, path, body) {
    const url = `${baseUrl}${path}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401) {
      throw new Error("SESSION_EXPIRED");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(text || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  return {
    fetchStatus() {
      return request("GET", "/status");
    },
    fetchSummary() {
      return request("GET", "/status/summary");
    },
    fetchAlerts() {
      return request("GET", "/alerts");
    },
    fetchAlertLog(limit = 50) {
      return request("GET", `/alerts/log?limit=${limit}`);
    },
    fetchMetrics(checkId, period = "1h") {
      return request("GET", `/checks/${checkId}/metrics?period=${period}`);
    },
    toggleCheck(checkId) {
      return request("POST", `/checks/${checkId}/toggle`);
    },
    toggleAlert(ruleId) {
      return request("POST", `/alerts/${ruleId}/toggle`);
    },
    runCheck(checkId) {
      return request("POST", `/checks/${checkId}/run`);
    }
  };
}
