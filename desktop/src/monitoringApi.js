export function createMonitoringApi(session) {
  const basePath = "/api/monitoring";

  async function request(method, path, body) {
    const fullPath = `${basePath}${path}`;
    const result = await window.__TAURI__.core.invoke("api_proxy", {
      serverUrl: session.serverUrl,
      token: session.token,
      method,
      path: fullPath,
      body: body ? JSON.stringify(body) : null,
    });
    return result;
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
