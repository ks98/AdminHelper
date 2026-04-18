<script lang="ts">
  import MonSummaryCards from './MonSummaryCards.svelte';
  import MonServerList from './MonServerList.svelte';
  import MonCheckPanel from './MonCheckPanel.svelte';
</script>

<MonSummaryCards />

<div class="mon-split">
  <aside class="mon-split-sidebar">
    <MonServerList />
  </aside>
  <section class="mon-split-main">
    <MonCheckPanel />
  </section>
</div>
