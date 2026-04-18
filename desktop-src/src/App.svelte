<script lang="ts">
  import { onMount } from 'svelte';
  import * as bridge from '$lib/bridge';
  import type { Settings } from '$lib/bridge/types';

  let tauriVersion = $state<string>('');
  let tauriStatus = $state<string>('lade…');
  let settings = $state<Settings | null>(null);
  let bridgeError = $state<string>('');

  onMount(async () => {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      tauriVersion = await getVersion();
      tauriStatus = 'laeuft';
    } catch (err) {
      tauriStatus = `kein Tauri (${String(err)})`;
    }
    try {
      settings = await bridge.loadSettings();
    } catch (err) {
      bridgeError = String(err);
    }
  });
</script>

<div class="app-shell" style="display: flex; align-items: center; justify-content: center;">
  <div class="editor-panel compact" style="position: static; max-width: 560px; padding: var(--sp-5);">
    <div class="panel-header">
      <div>
        <div class="eyebrow">Phase 4</div>
        <h2>AdminHelper Desktop</h2>
      </div>
    </div>
    <p style="color: var(--text-muted); margin: 0 0 var(--sp-4) 0;">
      Svelte 5 + Typisierte Tauri-Bridge aktiv
    </p>
    <div class="form-grid single">
      <div class="field meta">
        <span>Tauri-Bridge</span>
        <div class="meta-value">{tauriStatus}</div>
      </div>
      <div class="field meta">
        <span>App-Version</span>
        <div class="meta-value">{tauriVersion || '—'}</div>
      </div>
      <div class="field meta">
        <span>loadSettings() Bridge-Call</span>
        <div class="meta-value">
          {#if settings}
            OK — mode={settings.mode}, lang={settings.language ?? 'default'}
          {:else if bridgeError}
            FEHLER: {bridgeError}
          {:else}
            …
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
