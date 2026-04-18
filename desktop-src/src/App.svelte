<script lang="ts">
  import { onMount } from 'svelte';

  let tauriVersion = $state<string>('');
  let tauriStatus = $state<string>('lade…');

  onMount(async () => {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      tauriVersion = await getVersion();
      tauriStatus = 'laeuft';
    } catch (err) {
      tauriStatus = `nicht in Tauri-Kontext (${String(err)})`;
    }
  });
</script>

<div class="app-shell" style="display: flex; align-items: center; justify-content: center;">
  <div class="editor-panel compact" style="position: static; max-width: 520px; padding: var(--sp-5);">
    <div class="panel-header">
      <div>
        <div class="eyebrow">Phase 2</div>
        <h2>AdminHelper Desktop</h2>
      </div>
    </div>
    <p style="color: var(--text-muted); margin: 0 0 var(--sp-4) 0;">
      Svelte 5 + TypeScript + Vite — Design-System aus <code>app.css</code> aktiv
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
        <span>Styles geladen</span>
        <div class="meta-value">app.css (1778 Zeilen) + uPlot</div>
      </div>
    </div>
  </div>
</div>
