<!--
SPDX-FileCopyrightText: 2026 Kevin Stenzel

SPDX-License-Identifier: GPL-3.0-or-later
-->

<script lang="ts">
  import { t, language } from '$lib/i18n';
  import { formatTime, type CheckGroup } from '$lib/utils/monitoring';
  import CheckDetail from './CheckDetail.svelte';
  import type { MonitorCheck } from '$lib/api/types';

  interface Props {
    group: CheckGroup;
    open: boolean;
    expandedCheckId: string | null;
    onToggleOpen: () => void;
    onToggleCheck: (id: string) => void;
    onRun: (c: MonitorCheck) => void;
    onEdit: (c: MonitorCheck) => void;
    onToggleEnabled: (c: MonitorCheck) => void;
    onRemove: (c: MonitorCheck) => void;
  }

  let {
    group,
    open,
    expandedCheckId,
    onToggleOpen,
    onToggleCheck,
    onRun,
    onEdit,
    onToggleEnabled,
    onRemove,
  }: Props = $props();
</script>

<div class="server-card">
  <div
    class="server-card-header"
    role="button"
    tabindex="0"
    onclick={onToggleOpen}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') onToggleOpen();
    }}
  >
    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
      <span class="server-chevron" class:rotated={open}>&#x25B6;</span>
      <span class="monitor-dot monitor-{group.worst}"></span>
      <strong>{group.title}</strong>
      <span style="color:var(--text-muted);font-size:12px">
        {group.checks.length !== 1
          ? $t('monitor.checkCountPlural', { count: group.checks.length })
          : $t('monitor.checkCount', { count: group.checks.length })}
      </span>
    </div>
  </div>
  {#if open}
    <div class="server-card-body">
      <table class="data-table" style="margin:0">
        <thead>
          <tr>
            <th></th>
            <th>{$t('label.type')}</th>
            <th>{$t('label.name')}</th>
            <th>{$t('label.status')}</th>
            <th>{$t('monitor.lastCheck')}</th>
            <th>{$t('label.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each group.checks as c (c.id)}
            {@const st = c.state?.status ?? 'pending'}
            {@const msg = c.state?.message ?? '–'}
            {@const last = c.state?.lastCheck
              ? formatTime(c.state.lastCheck, $language)
              : $t('monitor.neverChecked')}
            <tr class="check-row" style="cursor:pointer" onclick={() => onToggleCheck(c.id)}>
              <td><span class="monitor-dot monitor-{st}"></span></td>
              <td>
                <span class="badge badge-{c.checkType}">
                  {c.checkType.toUpperCase()}
                </span>
              </td>
              <td>
                <strong>{c.name}</strong>
                {#if c.templateId}
                  <span class="badge badge-tpl" title="Von Template verwaltet">TPL</span>
                {/if}
              </td>
              <td
                style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)"
              >
                {msg}
              </td>
              <td style="color:var(--text-muted);font-size:12px">{last}</td>
              <td style="white-space:nowrap" onclick={(e) => e.stopPropagation()}>
                <button
                  class="btn small"
                  title={$t('monitor.runNow')}
                  aria-label={$t('monitor.runNow')}
                  onclick={() => onRun(c)}>&#x25B6;</button
                >
                <button class="btn small" onclick={() => onEdit(c)}>
                  {$t('action.edit')}
                </button>
                <button class="btn small ghost" onclick={() => onToggleEnabled(c)}>
                  {c.enabled ? $t('action.disable') : $t('action.enable')}
                </button>
                <button class="btn small ghost" onclick={() => onRemove(c)}>
                  {$t('action.delete')}
                </button>
              </td>
            </tr>
            {#if expandedCheckId === c.id}
              <tr class="check-detail-row">
                <td colspan="6">
                  <CheckDetail check={c} />
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .server-chevron {
    display: inline-block;
    transition: transform 0.15s ease;
  }
  .server-chevron.rotated {
    transform: rotate(90deg);
  }
</style>
