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

<main>
  <img src="/logo.svg" alt="AdminHelper" width="64" height="64" />
  <h1>AdminHelper Desktop</h1>
  <p class="sub">Svelte 5 + TypeScript + Vite — Migrations-Skelett (Phase 1)</p>
  <div class="status">
    <div><strong>Tauri-Bridge:</strong> {tauriStatus}</div>
    <div><strong>App-Version:</strong> {tauriVersion || '—'}</div>
    <div><strong>Svelte-Runes:</strong> aktiv</div>
    <div><strong>HMR:</strong> via Vite auf Port 1420</div>
  </div>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 16px;
    font-family: system-ui, -apple-system, sans-serif;
  }
  h1 {
    margin: 0;
    font-size: 2rem;
  }
  .sub {
    color: #666;
    margin: 0;
  }
  .status {
    margin-top: 24px;
    padding: 16px 24px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-family: monospace;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
