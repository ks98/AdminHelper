import {
  groupChecksByServer,
  filterChecks,
  worstStatus,
  statusClass,
  formatCheckTime,
  computeSummary
} from "./monitoringModel.js";

export function initMonitoring(state, t, monitoringApiFactory) {
  let monitoringApi = null;
  let refreshTimer = null;
  let activeChart = null;
  let resizeObserver = null;
  let expandedCheckId = null;

  const section = document.getElementById("monitoringSection");
  const summaryContainer = document.getElementById("monSummaryCards");
  const filterBar = document.getElementById("monFilterBar");
  const checkListContainer = document.getElementById("monCheckList");
  const alertListContainer = document.getElementById("monAlertList");
  const alertLogContainer = document.getElementById("monAlertLog");

  function ensureApi() {
    if (!state.session) return false;
    if (!monitoringApi) {
      monitoringApi = monitoringApiFactory(state.session);
    }
    return true;
  }

  function destroyChart() {
    if (activeChart) {
      activeChart.destroy();
      activeChart = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  }

  function startRefresh() {
    stopRefresh();
    refreshTimer = setInterval(() => loadMonitoring(), 30_000);
  }

  function stopRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // ── Summary Cards ──────────────────────────────────────────────────
  function renderSummaryCards(checks) {
    summaryContainer.innerHTML = "";
    const summary = computeSummary(checks);
    const cards = [
      { key: "total", label: t("monitoring.total"), value: summary.total, cls: "" },
      { key: "ok", label: t("monitoring.ok"), value: summary.ok, cls: "mon-summary-ok" },
      { key: "warning", label: t("monitoring.warning"), value: summary.warning, cls: "mon-summary-warning" },
      { key: "critical", label: t("monitoring.critical"), value: summary.critical, cls: "mon-summary-critical" }
    ];
    for (const c of cards) {
      const card = document.createElement("div");
      card.className = `mon-summary-card ${c.cls}`;
      const val = document.createElement("div");
      val.className = "mon-summary-value";
      val.textContent = String(c.value);
      const lbl = document.createElement("div");
      lbl.className = "mon-summary-label";
      lbl.textContent = c.label;
      card.append(val, lbl);
      summaryContainer.appendChild(card);
    }
  }

  // ── Filter Bar ─────────────────────────────────────────────────────
  function renderFilterBar(checks) {
    filterBar.innerHTML = "";

    const servers = [...new Set(checks.map((c) => c.serverId).filter(Boolean))].sort();
    const types = [...new Set(checks.map((c) => c.checkType))].sort();

    const serverSelect = buildSelect("monFilterServer", t("monitoring.filter.allServers"), servers.map((s) => ({ value: s, label: s })));
    serverSelect.value = state.monitorFilters.server || "";
    serverSelect.addEventListener("change", () => { state.monitorFilters.server = serverSelect.value; applyFilters(); });

    const typeSelect = buildSelect("monFilterType", t("monitoring.filter.allTypes"), types.map((tp) => ({ value: tp, label: tp.toUpperCase() })));
    typeSelect.value = state.monitorFilters.type || "";
    typeSelect.addEventListener("change", () => { state.monitorFilters.type = typeSelect.value; applyFilters(); });

    const statusOpts = ["ok", "warning", "critical", "unknown", "pending"].map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
    const statusSelect = buildSelect("monFilterStatus", t("monitoring.filter.allStatus"), statusOpts);
    statusSelect.value = state.monitorFilters.status || "";
    statusSelect.addEventListener("change", () => { state.monitorFilters.status = statusSelect.value; applyFilters(); });

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = t("monitoring.filter.search");
    searchInput.className = "mon-filter-search";
    searchInput.value = state.monitorFilters.search || "";
    searchInput.addEventListener("input", () => { state.monitorFilters.search = searchInput.value; applyFilters(); });

    filterBar.append(serverSelect, typeSelect, statusSelect, searchInput);
  }

  function buildSelect(id, allLabel, options) {
    const sel = document.createElement("select");
    sel.id = id;
    sel.className = "mon-filter-select";
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = allLabel;
    sel.appendChild(allOpt);
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    }
    return sel;
  }

  function applyFilters() {
    const filtered = filterChecks(state.monitorChecks, state.monitorFilters);
    renderSummaryCards(filtered);
    renderCheckList(filtered);
  }

  // ── Check List ─────────────────────────────────────────────────────
  function renderCheckList(checks) {
    checkListContainer.innerHTML = "";
    if (checks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "mon-empty";
      empty.textContent = t("monitoring.noChecks");
      checkListContainer.appendChild(empty);
      return;
    }
    const groups = groupChecksByServer(checks, state.connections);
    for (const group of groups) {
      const groupEl = buildServerGroup(group);
      checkListContainer.appendChild(groupEl);
    }
  }

  function buildServerGroup(group) {
    const wrapper = document.createElement("div");
    wrapper.className = "mon-server-group open";
    const worst = worstStatus(group.checks);

    const header = document.createElement("div");
    header.className = "mon-server-header";
    header.addEventListener("click", () => wrapper.classList.toggle("open"));

    const dot = document.createElement("span");
    dot.className = `mon-dot ${statusClass(worst)}`;
    const name = document.createElement("span");
    name.className = "mon-server-name";
    name.textContent = group.serverName || group.serverId || t("monitoring.noServer");
    const count = document.createElement("span");
    count.className = "mon-server-count";
    count.textContent = `${group.checks.length}`;
    const chevron = document.createElement("span");
    chevron.className = "mon-chevron";
    chevron.textContent = "▸";

    header.append(chevron, dot, name, count);

    const body = document.createElement("div");
    body.className = "mon-server-body";
    for (const check of group.checks) {
      body.appendChild(buildCheckRow(check));
    }

    wrapper.append(header, body);
    return wrapper;
  }

  function buildCheckRow(check) {
    const status = check.state?.status || "pending";
    const row = document.createElement("div");
    row.className = "mon-check-row";
    row.dataset.checkId = check.id;

    const dot = document.createElement("span");
    dot.className = `mon-dot ${statusClass(status)}`;

    const typeBadge = document.createElement("span");
    typeBadge.className = `mon-type-badge badge-${check.checkType}`;
    typeBadge.textContent = check.checkType.toUpperCase();

    const nameEl = document.createElement("span");
    nameEl.className = "mon-check-name";
    nameEl.textContent = check.name;

    const msgEl = document.createElement("span");
    msgEl.className = "mon-check-msg";
    msgEl.textContent = check.state?.message || "";

    const timeEl = document.createElement("span");
    timeEl.className = "mon-check-time";
    timeEl.textContent = formatCheckTime(check.state?.lastCheck);

    const actions = document.createElement("div");
    actions.className = "mon-check-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = `btn small ${check.enabled ? "ghost" : "primary"}`;
    toggleBtn.textContent = check.enabled ? t("monitoring.action.disable") : t("monitoring.action.enable");
    toggleBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await handleToggleCheck(check.id);
    });

    const runBtn = document.createElement("button");
    runBtn.className = "btn small accent";
    runBtn.textContent = t("monitoring.action.run");
    runBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await handleRunCheck(check.id);
    });

    actions.append(toggleBtn, runBtn);
    row.append(dot, typeBadge, nameEl, msgEl, timeEl, actions);

    row.addEventListener("click", () => toggleDetailPanel(check, row));

    return row;
  }

  // ── Detail Panel (Metrics) ─────────────────────────────────────────
  function toggleDetailPanel(check, rowEl) {
    const existingPanel = rowEl.parentElement.querySelector(`.mon-detail-panel[data-check-id="${check.id}"]`);
    if (existingPanel) {
      destroyChart();
      existingPanel.remove();
      expandedCheckId = null;
      return;
    }

    // Close any other open panel
    const openPanels = checkListContainer.querySelectorAll(".mon-detail-panel");
    openPanels.forEach((p) => p.remove());
    destroyChart();

    expandedCheckId = check.id;
    const panel = document.createElement("div");
    panel.className = "mon-detail-panel";
    panel.dataset.checkId = check.id;

    const info = document.createElement("div");
    info.className = "mon-detail-info";
    info.innerHTML = `<strong>${check.name}</strong> &mdash; ${check.checkType.toUpperCase()}`;
    if (check.description) {
      const desc = document.createElement("div");
      desc.className = "mon-detail-desc";
      desc.textContent = check.description;
      info.appendChild(desc);
    }

    const periodBar = document.createElement("div");
    periodBar.className = "mon-period-selector";
    const periods = ["1h", "6h", "24h", "7d"];
    let activePeriod = "1h";
    for (const p of periods) {
      const chip = document.createElement("button");
      chip.className = `chip ${p === activePeriod ? "active" : ""}`;
      chip.textContent = p;
      chip.addEventListener("click", () => {
        activePeriod = p;
        periodBar.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.textContent === p));
        loadAndRenderChart(check.id, p, chartContainer);
      });
      periodBar.appendChild(chip);
    }

    const chartContainer = document.createElement("div");
    chartContainer.className = "mon-chart-container";

    panel.append(info, periodBar, chartContainer);
    rowEl.after(panel);

    loadAndRenderChart(check.id, activePeriod, chartContainer);
  }

  async function loadAndRenderChart(checkId, period, container) {
    if (!ensureApi()) return;
    container.innerHTML = `<div class="mon-chart-loading">${t("monitoring.chart.loading")}</div>`;
    try {
      const metricsData = await monitoringApi.fetchMetrics(checkId, period);
      renderChart(container, metricsData);
    } catch (err) {
      container.innerHTML = `<div class="mon-chart-loading">${t("monitoring.chart.error")}</div>`;
    }
  }

  function renderChart(container, metricsData) {
    destroyChart();
    container.innerHTML = "";

    const results = metricsData?.data || [];
    if (results.length === 0) {
      container.innerHTML = `<div class="mon-chart-loading">${t("monitoring.chart.noData")}</div>`;
      return;
    }

    // Skip the status metric, prefer duration/value metrics
    const filtered = results.filter((r) => {
      const name = Object.keys(r.metric).find((k) => k === "__name__") ? r.metric.__name__ : "";
      return !name.includes("status");
    });
    const series = filtered.length > 0 ? filtered : results;

    // Build uPlot data
    const timestamps = series[0].values.map((v) => Number(v[0]));
    const data = [timestamps];
    const uplotSeries = [{}];
    const colors = ["#38bdf8", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6"];

    for (let i = 0; i < series.length; i++) {
      const values = series[i].values.map((v) => {
        const n = parseFloat(v[1]);
        return isNaN(n) ? null : n;
      });
      data.push(values);

      const metricName = series[i].metric.__name__ || series[i].metric.name || `Series ${i + 1}`;
      const label = metricName
        .replace("monitor_check_", "")
        .replace("monitor_agent_", "")
        .replace(/_/g, " ");

      uplotSeries.push({
        label,
        stroke: colors[i % colors.length],
        width: 2
      });
    }

    if (typeof window.uPlot === "undefined") {
      container.innerHTML = `<div class="mon-chart-loading">uPlot not loaded</div>`;
      return;
    }

    const opts = {
      width: container.offsetWidth || 600,
      height: 250,
      series: uplotSeries,
      axes: [
        {
          stroke: "#94a3b8",
          grid: { stroke: "rgba(148,163,184,0.12)" },
          ticks: { stroke: "rgba(148,163,184,0.12)" }
        },
        {
          stroke: "#94a3b8",
          grid: { stroke: "rgba(148,163,184,0.12)" },
          ticks: { stroke: "rgba(148,163,184,0.12)" }
        }
      ],
      cursor: {
        drag: { x: false, y: false }
      },
      scales: {
        x: { time: true }
      }
    };

    activeChart = new window.uPlot(opts, data, container);

    resizeObserver = new ResizeObserver(() => {
      if (activeChart && container.offsetWidth > 0) {
        activeChart.setSize({ width: container.offsetWidth, height: 250 });
      }
    });
    resizeObserver.observe(container);
  }

  // ── Alerts Tab ─────────────────────────────────────────────────────
  async function loadAlerts() {
    if (!ensureApi()) return;
    try {
      state.monitorAlertRules = await monitoringApi.fetchAlerts();
    } catch (_) {
      state.monitorAlertRules = [];
    }
    renderAlerts();
  }

  function renderAlerts() {
    alertListContainer.innerHTML = "";
    if (state.monitorAlertRules.length === 0) {
      const empty = document.createElement("div");
      empty.className = "mon-empty";
      empty.textContent = t("monitoring.alerts.noRules");
      alertListContainer.appendChild(empty);
      return;
    }
    for (const rule of state.monitorAlertRules) {
      alertListContainer.appendChild(buildAlertCard(rule));
    }
  }

  function buildAlertCard(rule) {
    const card = document.createElement("div");
    card.className = "mon-alert-card";

    const left = document.createElement("div");
    left.className = "mon-alert-info";

    const name = document.createElement("div");
    name.className = "mon-alert-name";
    name.textContent = rule.name;

    const meta = document.createElement("div");
    meta.className = "mon-alert-meta";
    const parts = [];
    parts.push(`${t("monitoring.alerts.channel")}: ${rule.channel}`);
    if (rule.matchSeverity) parts.push(`${t("monitoring.alerts.severity")}: ${rule.matchSeverity}`);
    parts.push(`${t("monitoring.alerts.cooldown")}: ${rule.cooldownMinutes}m`);
    meta.textContent = parts.join(" · ");

    left.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "mon-alert-actions";
    const toggleBtn = document.createElement("button");
    toggleBtn.className = `btn small ${rule.enabled ? "ghost" : "primary"}`;
    toggleBtn.textContent = rule.enabled ? t("monitoring.action.disable") : t("monitoring.action.enable");
    toggleBtn.addEventListener("click", async () => {
      await handleToggleAlert(rule.id);
    });
    const statusDot = document.createElement("span");
    statusDot.className = `mon-dot ${rule.enabled ? "mon-ok" : "mon-unknown"}`;
    actions.append(statusDot, toggleBtn);

    card.append(left, actions);
    return card;
  }

  // ── Alert Log Tab ──────────────────────────────────────────────────
  async function loadAlertLog() {
    if (!ensureApi()) return;
    try {
      state.monitorAlertLog = await monitoringApi.fetchAlertLog(50);
    } catch (_) {
      state.monitorAlertLog = [];
    }
    renderAlertLog();
  }

  function renderAlertLog() {
    alertLogContainer.innerHTML = "";
    if (state.monitorAlertLog.length === 0) {
      const empty = document.createElement("div");
      empty.className = "mon-empty";
      empty.textContent = t("monitoring.log.noEntries");
      alertLogContainer.appendChild(empty);
      return;
    }
    for (const entry of state.monitorAlertLog) {
      alertLogContainer.appendChild(buildLogEntry(entry));
    }
  }

  function buildLogEntry(entry) {
    const row = document.createElement("div");
    row.className = "mon-log-entry";

    const time = document.createElement("span");
    time.className = "mon-log-time";
    time.textContent = formatCheckTime(entry.sentAt);

    const transition = document.createElement("span");
    transition.className = "mon-log-transition";
    const oldDot = document.createElement("span");
    oldDot.className = `mon-dot-sm ${statusClass(entry.oldStatus)}`;
    const arrow = document.createElement("span");
    arrow.textContent = " → ";
    const newDot = document.createElement("span");
    newDot.className = `mon-dot-sm ${statusClass(entry.newStatus)}`;
    const labels = document.createElement("span");
    labels.textContent = ` ${entry.oldStatus} → ${entry.newStatus}`;
    transition.append(oldDot, arrow, newDot, labels);

    const success = document.createElement("span");
    success.className = `mon-log-result ${entry.success ? "mon-ok" : "mon-critical"}`;
    success.textContent = entry.success ? "✓" : "✗";

    const error = document.createElement("span");
    error.className = "mon-log-error";
    error.textContent = entry.error || "";

    row.append(time, transition, success, error);
    return row;
  }

  // ── Actions ────────────────────────────────────────────────────────
  async function handleToggleCheck(checkId) {
    if (!ensureApi()) return;
    try {
      await monitoringApi.toggleCheck(checkId);
      await loadMonitoring();
    } catch (err) {
      showMonitoringError(err);
    }
  }

  async function handleRunCheck(checkId) {
    if (!ensureApi()) return;
    try {
      await monitoringApi.runCheck(checkId);
      setTimeout(() => loadMonitoring(), 2000);
    } catch (err) {
      showMonitoringError(err);
    }
  }

  async function handleToggleAlert(ruleId) {
    if (!ensureApi()) return;
    try {
      await monitoringApi.toggleAlert(ruleId);
      await loadAlerts();
    } catch (err) {
      showMonitoringError(err);
    }
  }

  function showMonitoringError(err) {
    const target = document.getElementById("globalStatus");
    if (!target) return;
    const msg = err.message === "SESSION_EXPIRED" ? t("monitoring.error.session") : t("monitoring.error.action");
    target.textContent = msg;
    target.classList.add("show");
    target.style.border = "1px solid rgba(248, 113, 113, 0.4)";
    target.style.color = "#fca5a5";
  }

  // ── Tab Switching ──────────────────────────────────────────────────
  function switchMonitorTab(tab) {
    state.monitorTab = tab;
    document.querySelectorAll(".mon-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    document.querySelectorAll(".mon-tab-content").forEach((c) => c.classList.toggle("hidden", c.dataset.tab !== tab));
    destroyChart();
    expandedCheckId = null;

    if (tab === "alerts") loadAlerts();
    else if (tab === "log") loadAlertLog();
  }

  // ── Main Load ──────────────────────────────────────────────────────
  async function loadMonitoring() {
    if (!ensureApi()) return;
    try {
      state.monitorChecks = await monitoringApi.fetchStatus();
    } catch (err) {
      if (err.message === "SESSION_EXPIRED") {
        showMonitoringError(err);
        return;
      }
      state.monitorChecks = [];
    }
    if (state.monitorTab === "overview") {
      const filtered = filterChecks(state.monitorChecks, state.monitorFilters);
      renderSummaryCards(filtered);
      renderFilterBar(state.monitorChecks);
      renderCheckList(filtered);
    }
  }

  function activate() {
    monitoringApi = null; // re-create with fresh session
    ensureApi();
    loadMonitoring();
    startRefresh();
    switchMonitorTab(state.monitorTab || "overview");
  }

  function deactivate() {
    stopRefresh();
    destroyChart();
    expandedCheckId = null;
  }

  // ── Wire up tabs ───────────────────────────────────────────────────
  document.querySelectorAll(".mon-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchMonitorTab(tab.dataset.tab));
  });

  return { loadMonitoring, activate, deactivate };
}
