<script lang="ts">
  import { monitoringChecks, monitoringServers, monitoring, setFilter } from '$lib/stores/monitoring';
  import { t } from '$lib/i18n';

  let serverIds = $derived(
    [...new Set($monitoringChecks.map((c) => c.serverId).filter(Boolean) as string[])].sort(),
  );
  let types = $derived([...new Set($monitoringChecks.map((c) => c.checkType))].sort());

  function serverLabel(id: string): string {
    const srv = $monitoringServers.find((s) => s.id === id);
    return srv ? srv.name || srv.hostname || id : id;
  }

  let filters = $derived($monitoring.filters);
</script>

<div class="mon-filter-bar" id="monFilterBar">
  <select
    class="mon-filter-select"
    value={filters.server}
    onchange={(e) => setFilter('server', (e.currentTarget as HTMLSelectElement).value)}
  >
    <option value="">{$t('monitoring.filter.allServers')}</option>
    {#each serverIds as id}
      <option value={id}>{serverLabel(id)}</option>
    {/each}
  </select>

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
