<!--
SPDX-FileCopyrightText: 2026 Kevin Stenzel

SPDX-License-Identifier: GPL-3.0-or-later
-->

<script lang="ts">
  import { t } from '$lib/i18n';
  import { alertRules } from '$lib/stores/monitoring';
  import { servers as serversStore } from '$lib/stores/servers';
  import { showToast } from '$lib/stores/notifications';
  import { serverNameMap } from '$lib/utils/monitoring';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { confirmDialog } from '$lib/components/ui/ConfirmDialog.svelte';
  import AlertRuleModal from '$modals/AlertRuleModal.svelte';
  import type { AlertRule } from '$lib/api/types';

  let alertModalOpen = $state(false);
  let editingAlert = $state<AlertRule | null>(null);

  const serverMap = $derived(serverNameMap($serversStore));

  function openCreateAlert() {
    editingAlert = null;
    alertModalOpen = true;
  }

  function editAlert(r: AlertRule) {
    editingAlert = r;
    alertModalOpen = true;
  }

  async function toggleAlert(r: AlertRule) {
    try {
      await alertRules.toggle(r.id);
      showToast($t('toast.alert.updated'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : $t('error.generic'), 'error');
    }
  }

  async function removeAlert(r: AlertRule) {
    if (!(await confirmDialog($t('confirm.alert.delete'), { confirmLabel: $t('action.delete') })))
      return;
    try {
      await alertRules.remove(r.id);
      showToast($t('toast.alert.deleted'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : $t('error.generic'), 'error');
    }
  }

  function closeAlertModal() {
    alertModalOpen = false;
    editingAlert = null;
    void alertRules.refresh();
  }

  function alertFilterLabel(r: AlertRule): string {
    const parts: string[] = [];
    if (r.matchSeverity) parts.push(`Severity: ${r.matchSeverity}`);
    if (r.matchServerId) {
      const name = serverMap.get(r.matchServerId) ?? r.matchServerId.substring(0, 8);
      parts.push(`Server: ${name}`);
    }
    return parts.length > 0 ? parts.join(', ') : $t('label.all');
  }
</script>

<div class="monitor-tab-content active">
  <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
    <Button variant="primary" onclick={openCreateAlert}>{$t('page.alerts.add')}</Button>
  </div>
  {#if $alertRules.length === 0}
    <EmptyState message={$t('page.alerts.empty')} />
  {:else}
    <table class="data-table" style="margin:0">
      <thead>
        <tr>
          <th>{$t('label.name')}</th>
          <th>{$t('modal.alert.channel')}</th>
          <th>Filter</th>
          <th>Cooldown</th>
          <th>{$t('label.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {#each $alertRules as r (r.id)}
          <tr class:disabled-row={!r.enabled}>
            <td><strong>{r.name}</strong></td>
            <td>
              <span class="badge badge-{r.channel}">
                {r.channel === 'webhook'
                  ? $t('alerts.channel.webhook')
                  : $t('alerts.channel.email')}
              </span>
            </td>
            <td style="color:var(--text-muted)">{alertFilterLabel(r)}</td>
            <td style="color:var(--text-muted)">
              {$t('alerts.cooldown', { min: r.cooldownMinutes })}
            </td>
            <td style="white-space:nowrap">
              <button class="btn small" onclick={() => editAlert(r)}>
                {$t('action.edit')}
              </button>
              <button class="btn small ghost" onclick={() => toggleAlert(r)}>
                {r.enabled ? $t('action.disable') : $t('action.enable')}
              </button>
              <button class="btn small ghost" onclick={() => removeAlert(r)}>
                {$t('action.delete')}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<AlertRuleModal open={alertModalOpen} editing={editingAlert} onClose={closeAlertModal} />
