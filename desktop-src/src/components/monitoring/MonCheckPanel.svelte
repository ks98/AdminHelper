<script lang="ts">
  import {
    monitoringChecks,
    monitoringServers,
    selectedServerId,
    monitoring,
    setFilter,
    monitoringViewMode,
    toggleViewMode,
  } from '$lib/stores/monitoring';
  import { computeSummary, statusClass } from '$lib/models/monitoring';
  import MonCheckCard from './MonCheckCard.svelte';
  import MonCheckRow from './MonCheckRow.svelte';
  import { t } from '$lib/i18n';

  let selected = $derived($selectedServerId);
  let filters = $derived($monitoring.filters);
  let mode = $derived($monitoringViewMode);

  let serverName = $derived.by(() => {
    if (!selected) return '';
    if (selected === '__none') return $t('monitoring.server.noServer');
    const srv = $monitoringServers.find((s) => s.id === selected);
    if (srv) return srv.name || srv.hostname || selected;
    const check = $monitoringChecks.find((c) => c.serverId === selected);
    return check?.serverId || selected;
  });

  let serverChecks = $derived.by(() => {
    if (!selected) return [];
    return $monitoringChecks.filter((c) => (c.serverId || '__none') === selected);
  });

  let summary = $derived(computeSummary(serverChecks));
  let worst = $derived.by(() => {
    if (summary.critical > 0) return 'critical';
    if (summary.warning > 0) return 'warning';
    if (summary.unknown > 0) return 'unknown';
    if (summary.pending > 0) return 'pending';
    return 'ok';
  });

  let types = $derived([...new Set(serverChecks.map((c) => c.checkType))].sort());

  let visibleChecks = $derived.by(() => {
    const q = filters.search.toLowerCase();
    return serverChecks.filter((c) => {
      if (filters.type && c.checkType !== filters.type) return false;
      if (filters.status) {
        const s = (c.state?.status ?? 'pending') as string;
        if (s !== filters.status) return false;
      }
      if (q) {
        const hay = `${c.name} ${c.description || ''} ${c.checkType} ${c.state?.message || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });
</script>

<div class="mon-check-panel">
  {#if !selected}
    <div class="mon-panel-empty">
      <span class="mon-panel-empty-icon" aria-hidden="true">⇦</span>
      <span>{$t('monitoring.panel.selectServer')}</span>
    </div>
  {:else}
    <div class="mon-panel-head">
      <div class="mon-panel-title">
        <span class="mon-dot {statusClass(worst)}"></span>
        <span class="mon-panel-server-name">{serverName}</span>
        <span class="mon-panel-badges">
          {#if summary.critical > 0}<span class="mon-pill pill-crit">{summary.critical} crit</span>{/if}
          {#if summary.warning > 0}<span class="mon-pill pill-warn">{summary.warning} warn</span>{/if}
          <span class="mon-pill pill-ok">{summary.ok} ok</span>
        </span>
      </div>

      <div class="mon-view-switch" role="group" aria-label={$t('monitoring.view.label')}>
        <button
          class="mon-view-btn"
          class:active={mode === 'cards'}
          onclick={() => mode !== 'cards' && toggleViewMode()}
          title={$t('monitoring.view.cards')}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <rect x="1" y="1" width="6" height="6" rx="1" />
            <rect x="9" y="1" width="6" height="6" rx="1" />
            <rect x="1" y="9" width="6" height="6" rx="1" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
          </svg>
        </button>
        <button
          class="mon-view-btn"
          class:active={mode === 'compact'}
          onclick={() => mode !== 'compact' && toggleViewMode()}
          title={$t('monitoring.view.compact')}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <rect x="1" y="2" width="14" height="2" rx="1" />
            <rect x="1" y="7" width="14" height="2" rx="1" />
            <rect x="1" y="12" width="14" height="2" rx="1" />
          </svg>
        </button>
      </div>
    </div>

    <div class="mon-panel-filters">
      <select
        class="mon-filter-select"
        value={filters.type}
        onchange={(e) => setFilter('type', (e.currentTarget as HTMLSelectElement).value)}
      >
        <option value="">{$t('monitoring.filter.allTypes')}</option>
        {#each types as tp}
          <option value={tp}>{tp.toUpperCase()}</option>
        {/each}
      </select>
      <select
        class="mon-filter-select"
        value={filters.status}
        onchange={(e) => setFilter('status', (e.currentTarget as HTMLSelectElement).value)}
      >
        <option value="">{$t('monitoring.filter.allStatus')}</option>
        <option value="ok">{$t('monitoring.status.ok')}</option>
        <option value="warning">{$t('monitoring.status.warning')}</option>
        <option value="critical">{$t('monitoring.status.critical')}</option>
        <option value="unknown">{$t('monitoring.status.unknown')}</option>
        <option value="pending">{$t('monitoring.status.pending')}</option>
      </select>
      <input
        type="search"
        class="mon-filter-search"
        placeholder={$t('monitoring.filter.search')}
        value={filters.search}
        oninput={(e) => setFilter('search', (e.currentTarget as HTMLInputElement).value)}
      />
    </div>

    <div class="mon-panel-body" class:cards={mode === 'cards'}>
      {#if visibleChecks.length === 0}
        <div class="mon-panel-empty-inline">{$t('monitoring.panel.noChecks')}</div>
      {:else}
        {#each visibleChecks as check (check.id)}
          {#if mode === 'cards'}
            <MonCheckCard {check} />
          {:else}
            <MonCheckRow {check} />
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
</div>
