<!--
SPDX-FileCopyrightText: 2026 Kevin Stenzel

SPDX-License-Identifier: GPL-3.0-or-later
-->

<script lang="ts">
  import { t } from '$lib/i18n';
  import { monitorChecks } from '$lib/stores/monitoring';
  import { servers as serversStore } from '$lib/stores/servers';
  import { showToast } from '$lib/stores/notifications';
  import {
    filterChecks,
    summarizeChecks,
    groupChecksByServer,
    serverNameMap,
    distinctServerIds,
    distinctCheckTypes,
    distinctServerTags,
  } from '$lib/utils/monitoring';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { confirmDialog } from '$lib/components/ui/ConfirmDialog.svelte';
  import CheckGroupCard from './CheckGroupCard.svelte';
  import MonitorCheckModal from '$modals/MonitorCheckModal.svelte';
  import type { MonitorCheck } from '$lib/api/types';

  // ── Filter-State ───────────────────────────────────────────────────────
  let serverFilter = $state('');
  let typeFilter = $state('');
  let statusFilter = $state('');
  let tagFilter = $state('');
  let searchQuery = $state('');

  // ── Modal ──────────────────────────────────────────────────────────────
  let checkModalOpen = $state(false);
  let editingCheck = $state<MonitorCheck | null>(null);

  // ── Expandable Check-Rows ─────────────────────────────────────────────
  let expandedCheckId = $state<string | null>(null);
  let expandedServers = $state<Record<string, boolean>>({});

  const serverMap = $derived(serverNameMap($serversStore));
  const filteredChecks = $derived(
    filterChecks($monitorChecks, $serversStore, {
      serverId: serverFilter,
      checkType: typeFilter,
      status: statusFilter,
      tag: tagFilter,
      search: searchQuery,
    }),
  );
  const summaryCounts = $derived(summarizeChecks(filteredChecks));
  const serverIdsInUse = $derived(distinctServerIds($monitorChecks));
  const typesInUse = $derived(distinctCheckTypes($monitorChecks));
  const tagsInUse = $derived(distinctServerTags($monitorChecks, $serversStore));
  const checkGroups = $derived(
    groupChecksByServer(filteredChecks, serverMap, $t('monitor.noServer')),
  );

  // ── Check-Actions ─────────────────────────────────────────────────────
  function openCreateCheck() {
    editingCheck = null;
    checkModalOpen = true;
  }

  function editCheck(c: MonitorCheck) {
    editingCheck = c;
    checkModalOpen = true;
  }

  async function runCheckNow(c: MonitorCheck) {
    try {
      await monitorChecks.run(c.id);
      showToast($t('toast.check.executed'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : $t('error.generic'), 'error');
    }
  }

  async function toggleCheck(c: MonitorCheck) {
    try {
      await monitorChecks.toggle(c.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : $t('error.generic'), 'error');
    }
  }

  async function removeCheck(c: MonitorCheck) {
    if (!(await confirmDialog($t('confirm.check.delete'), { confirmLabel: $t('action.delete') })))
      return;
    try {
      await monitorChecks.remove(c.id);
      showToast($t('toast.check.deleted'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : $t('error.generic'), 'error');
    }
  }

  function closeCheckModal() {
    checkModalOpen = false;
    editingCheck = null;
    void monitorChecks.refresh();
  }

  function toggleServer(key: string) {
    expandedServers = { ...expandedServers, [key]: !expandedServers[key] };
  }

  function toggleCheckRow(id: string) {
    expandedCheckId = expandedCheckId === id ? null : id;
  }
</script>

<div class="monitor-tab-content active">
  <div class="monitor-filters">
    <select class="filter-select" bind:value={serverFilter}>
      <option value="">{$t('label.allServers')}</option>
      {#each serverIdsInUse as id (id)}
        <option value={id}>{serverMap.get(id) ?? id.substring(0, 8)}</option>
      {/each}
    </select>
    <select class="filter-select" bind:value={typeFilter}>
      <option value="">{$t('label.allTypes')}</option>
      {#each typesInUse as tp (tp)}
        <option value={tp}>{tp}</option>
      {/each}
    </select>
    <select class="filter-select" bind:value={statusFilter}>
      <option value="">{$t('label.allStatus')}</option>
      <option value="ok">{$t('monitor.ok')}</option>
      <option value="warning">{$t('monitor.warning')}</option>
      <option value="critical">{$t('monitor.critical')}</option>
      <option value="unknown">{$t('monitor.unknown')}</option>
    </select>
    <select class="filter-select" bind:value={tagFilter}>
      <option value="">{$t('label.allTags')}</option>
      {#each tagsInUse as tg (tg)}
        <option value={tg}>{tg}</option>
      {/each}
    </select>
    <input
      type="search"
      class="search-input"
      placeholder={$t('action.searchShort')}
      bind:value={searchQuery}
    />
    <Button variant="primary" onclick={openCreateCheck}>
      {$t('page.monitoring.addCheck')}
    </Button>
  </div>

  <div id="monitorOverview" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
    <div class="monitor-summary-card">
      <div class="monitor-summary-value">{summaryCounts.total}</div>
      <div class="monitor-summary-label">{$t('monitor.total')}</div>
    </div>
    <div class="monitor-summary-card monitor-summary-ok">
      <div class="monitor-summary-value">{summaryCounts.ok}</div>
      <div class="monitor-summary-label">{$t('monitor.ok')}</div>
    </div>
    <div class="monitor-summary-card monitor-summary-warning">
      <div class="monitor-summary-value">{summaryCounts.warning}</div>
      <div class="monitor-summary-label">{$t('monitor.warning')}</div>
    </div>
    <div class="monitor-summary-card monitor-summary-critical">
      <div class="monitor-summary-value">{summaryCounts.critical}</div>
      <div class="monitor-summary-label">{$t('monitor.critical')}</div>
    </div>
  </div>

  {#if filteredChecks.length === 0}
    <EmptyState message={$t('page.monitoring.empty')} />
  {:else}
    <div style="display:flex;flex-direction:column;gap:12px">
      {#each checkGroups as group (group.key)}
        <CheckGroupCard
          {group}
          open={expandedServers[group.key] ?? false}
          {expandedCheckId}
          onToggleOpen={() => toggleServer(group.key)}
          onToggleCheck={toggleCheckRow}
          onRun={runCheckNow}
          onEdit={editCheck}
          onToggleEnabled={toggleCheck}
          onRemove={removeCheck}
        />
      {/each}
    </div>
  {/if}
</div>

<MonitorCheckModal open={checkModalOpen} editing={editingCheck} onClose={closeCheckModal} />
