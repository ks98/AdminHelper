<!--
SPDX-FileCopyrightText: 2026 Kevin Stenzel

SPDX-License-Identifier: GPL-3.0-or-later
-->

<script lang="ts">
  import { t } from '$lib/i18n';
  import { monitoringTemplates } from '$lib/stores/monitoring';
  import { showToast } from '$lib/stores/notifications';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { confirmDialog } from '$lib/components/ui/ConfirmDialog.svelte';
  import MonitoringTemplateModal from '$modals/MonitoringTemplateModal.svelte';
  import type { MonitoringTemplateFull } from '$lib/api/types';

  let templateModalOpen = $state(false);
  let editingTemplate = $state<MonitoringTemplateFull | null>(null);

  function openCreateTemplate() {
    editingTemplate = null;
    templateModalOpen = true;
  }

  function editTemplate(tpl: MonitoringTemplateFull) {
    editingTemplate = tpl;
    templateModalOpen = true;
  }

  async function removeTemplate(tpl: MonitoringTemplateFull) {
    if (
      !(await confirmDialog($t('confirm.template.delete'), { confirmLabel: $t('action.delete') }))
    )
      return;
    try {
      await monitoringTemplates.remove(tpl.id);
      showToast($t('toast.template.deleted'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : $t('error.generic'), 'error');
    }
  }

  function closeTemplateModal() {
    templateModalOpen = false;
    editingTemplate = null;
    void monitoringTemplates.refresh();
  }
</script>

<div class="monitor-tab-content active">
  <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
    <Button variant="primary" onclick={openCreateTemplate}>
      {$t('page.templates.add')}
    </Button>
  </div>
  {#if $monitoringTemplates.length === 0}
    <EmptyState message={$t('page.templates.empty')} />
  {:else}
    <table class="data-table" style="margin:0">
      <thead>
        <tr>
          <th>{$t('label.name')}</th>
          <th>{$t('label.description')}</th>
          <th>{$t('label.details')}</th>
          <th>Server</th>
          <th>{$t('label.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {#each $monitoringTemplates as tpl (tpl.id)}
          {@const checkCount = (tpl.checkDefinitions ?? []).length}
          {@const alertCount = (tpl.alertDefinitions ?? []).length}
          {@const serverCount = (tpl.assignments ?? []).length}
          {@const serverNames =
            (tpl.assignments ?? []).map((a) => a.serverName ?? a.serverId).join(', ') || '–'}
          <tr>
            <td><strong>{tpl.name}</strong></td>
            <td style="color:var(--text-muted)">{tpl.description ?? ''}</td>
            <td>
              {$t('template.checks', { count: checkCount, alerts: alertCount })}
            </td>
            <td style="color:var(--text-muted);font-size:12px" title={serverNames}>
              {$t('template.servers', { count: serverCount })}
            </td>
            <td style="white-space:nowrap">
              <button class="btn small" onclick={() => editTemplate(tpl)}>
                {$t('action.edit')}
              </button>
              <button class="btn small ghost" onclick={() => removeTemplate(tpl)}>
                {$t('action.delete')}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<MonitoringTemplateModal
  open={templateModalOpen}
  editing={editingTemplate}
  onClose={closeTemplateModal}
/>
