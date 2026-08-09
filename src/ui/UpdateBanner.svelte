<script lang="ts">
  import { registerServiceWorker, type UpdateHandle } from '$lib/pwa/register';

  let update = $state<UpdateHandle | null>(null);
  let offline = $state(false);

  registerServiceWorker({
    onUpdateReady: (handle) => {
      update = handle;
    },
    onOfflineReady: () => {
      offline = true;
      setTimeout(() => {
        offline = false;
      }, 8000);
    },
  });
</script>

{#if update}
  <!--
    Offered, never applied on its own. The user may be mid-plan, and a reload
    they did not ask for is the one bug this app cannot apologise its way out
    of.
  -->
  <div class="banner" role="status" data-testid="update-banner">
    <span>A new version of Floored is ready.</span>
    <button
      onclick={() => {
        update?.apply();
      }}
      data-testid="update-apply">Reload to update</button
    >
    <button
      class="dismiss"
      onclick={() => {
        update = null;
      }}
      data-testid="update-dismiss">Later</button
    >
  </div>
{:else if offline}
  <div class="banner quiet" role="status" data-testid="offline-ready">
    <span>Ready to work offline. Your plans stay on this device.</span>
  </div>
{/if}

<style>
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
    border: 1px solid var(--color-accent);
    border-radius: 8px;
    background: var(--color-surface);
    font-size: 0.8125rem;
  }

  .quiet {
    border-color: var(--color-line);
    color: var(--color-muted);
  }

  button {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--color-accent);
    border-radius: 5px;
    background: none;
    color: var(--color-accent);
    cursor: pointer;
  }

  .dismiss {
    border-color: var(--color-line);
    color: var(--color-muted);
  }

  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
