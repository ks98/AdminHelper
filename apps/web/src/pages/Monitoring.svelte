<!--
SPDX-FileCopyrightText: 2026 Kevin Stenzel

SPDX-License-Identifier: GPL-3.0-or-later
-->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import 'uplot/dist/uPlot.min.css';
  import { t, language } from '$lib/i18n';
  import { monitorChecks, alertRules, alertLog, monitoringTemplates } from '$lib/stores/monitoring';
  import { servers as serversStore } from '$lib/stores/servers';
  import { showToast } from '$lib/stores/notifications';
  import { formatTime } from '$lib/utils/monitoring';
  import ChecksOverviewTab from '$lib/components/monitoring/ChecksOverviewTab.svelte';
  import AlertRulesTab from '$lib/components/monitoring/AlertRulesTab.svelte';
  import AlertLogTab from '$lib/components/monitoring/AlertLogTab.svelte';
  import TemplatesTab from '$lib/components/monitoring/TemplatesTab.svelte';

  type Tab = 'overview' | 'alerts' | 'log' | 'templates';

  let activeTab = $state<Tab>('overview');
  let logLoaded = $state(false);

  // ── Auto-Refresh (30 s, pausiert bei verstecktem Tab) ─────────────────
  const REFRESH_INTERVAL_MS = 30_000;
  let lastUpdated = $state<Date | null>(null);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  async function pollChecks() {
    try {
      await monitorChecks.refresh();
      lastUpdated = new Date();
    } catch (err) {
      showToast(err instanceof Error ? err.message : $t('error.generic'), 'error');
    }
  }

  function startPolling() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => void pollChecks(), REFRESH_INTERVAL_MS);
  }

  function stopPolling() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopPolling();
    } else {
      void pollChecks();
      startPolling();
    }
  }

  onMount(async () => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (!document.hidden) startPolling();
    try {
      await Promise.all([
        monitorChecks.refresh(),
        alertRules.refresh(),
        monitoringTemplates.refresh(),
        $serversStore.length === 0 ? serversStore.refresh() : Promise.resolve(),
      ]);
      lastUpdated = new Date();
    } catch (err) {
      showToast(err instanceof Error ? err.message : $t('error.generic'), 'error');
    }
  });

  onDestroy(() => {
    stopPolling();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  // ── Tab change ─────────────────────────────────────────────────────────
  async function switchTab(tab: Tab) {
    activeTab = tab;
    if (tab === 'log' && !logLoaded) {
      try {
        await alertLog.refresh();
        logLoaded = true;
      } catch (err) {
        showToast(err instanceof Error ? err.message : $t('error.generic'), 'error');
      }
    }
  }

  async function refreshLog() {
    try {
      await alertLog.refresh();
      logLoaded = true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : $t('error.generic'), 'error');
    }
  }
</script>

<div class="page active">
  <div class="page-header">
    <div>
      <div class="page-title">{$t('page.monitoring.title')}</div>
      <div class="page-subtitle">{$t('page.monitoring.subtitle')}</div>
    </div>
    {#if lastUpdated}
      <div style="color:var(--text-muted);font-size:12px">
        {$t('monitor.lastUpdated', { time: formatTime(lastUpdated.toISOString(), $language) })}
      </div>
    {/if}
  </div>

  <div class="monitor-tabs">
    <button
      class="monitor-tab"
      class:active={activeTab === 'overview'}
      onclick={() => switchTab('overview')}>{$t('page.monitoring.tabOverview')}</button
    >
    <button
      class="monitor-tab"
      class:active={activeTab === 'alerts'}
      onclick={() => switchTab('alerts')}>{$t('page.monitoring.tabAlerts')}</button
    >
    <button class="monitor-tab" class:active={activeTab === 'log'} onclick={() => switchTab('log')}
      >{$t('page.monitoring.tabLog')}</button
    >
    <button
      class="monitor-tab"
      class:active={activeTab === 'templates'}
      onclick={() => switchTab('templates')}>{$t('page.monitoring.tabTemplates')}</button
    >
  </div>

  {#if activeTab === 'overview'}
    <ChecksOverviewTab />
  {/if}

  {#if activeTab === 'alerts'}
    <AlertRulesTab />
  {/if}

  {#if activeTab === 'log'}
    <AlertLogTab {logLoaded} onRefresh={refreshLog} />
  {/if}

  {#if activeTab === 'templates'}
    <TemplatesTab />
  {/if}
</div>
