<!--
SPDX-FileCopyrightText: 2026 Kevin Stenzel

SPDX-License-Identifier: GPL-3.0-or-later
-->

<script lang="ts">
  import { t, language } from '$lib/i18n';
  import { alertLog, monitorChecks } from '$lib/stores/monitoring';
  import { formatTime } from '$lib/utils/monitoring';

  interface Props {
    logLoaded: boolean;
    onRefresh: () => void;
  }

  let { logLoaded, onRefresh }: Props = $props();
</script>

<div class="monitor-tab-content active">
  <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
    <button class="btn small" onclick={onRefresh}>{$t('action.refresh')}</button>
  </div>
  <table class="data-table">
    <thead>
      <tr>
        <th>{$t('alertLog.time')}</th>
        <th>{$t('alertLog.check')}</th>
        <th>{$t('alertLog.from')}</th>
        <th>{$t('alertLog.to')}</th>
        <th>{$t('alertLog.status')}</th>
        <th>{$t('alertLog.error')}</th>
      </tr>
    </thead>
    <tbody>
      {#if $alertLog.length === 0}
        <tr>
          <td colspan="6" style="text-align:center;color:var(--text-muted)">
            {logLoaded ? $t('alerts.noAlerts') : $t('alerts.loadOnTab')}
          </td>
        </tr>
      {:else}
        {#each $alertLog as l (l.id)}
          {@const check = $monitorChecks.find((c) => c.id === l.checkId)}
          {@const checkName = check ? check.name : l.checkId.substring(0, 8)}
          <tr>
            <td style="font-size:12px;color:var(--text-muted)">
              {formatTime(l.sentAt, $language)}
            </td>
            <td>{checkName}</td>
            <td>
              <span class="monitor-dot monitor-{l.oldStatus}"></span>
              {l.oldStatus}
            </td>
            <td>
              <span class="monitor-dot monitor-{l.newStatus}"></span>
              {l.newStatus}
            </td>
            <td>
              {#if l.success}
                <span style="color:var(--green)">{$t('alerts.sent')}</span>
              {:else}
                <span style="color:var(--red)">{$t('alerts.error')}</span>
              {/if}
            </td>
            <td style="font-size:12px;color:var(--text-muted)">{l.error ?? '–'}</td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
