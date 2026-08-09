<script lang="ts">
  import PlanCanvas from './PlanCanvas.svelte';
  import Toolbar from './Toolbar.svelte';
  import FileMenu from './FileMenu.svelte';
  import CatalogRail from './CatalogRail.svelte';
  import CapacityPanel from './CapacityPanel.svelte';
  import GuestPanel from './GuestPanel.svelte';
  import NumberingControl from './NumberingControl.svelte';
  import StartScreen from './StartScreen.svelte';
  import UpdateBanner from './UpdateBanner.svelte';
  import { Editor } from './editor.svelte';
  import { decodeShare, payloadFromHash } from '$lib/share/share';

  const editor = new Editor();

  /**
   * Whether the user has a plan yet.
   *
   * The app opens on the template picker rather than on a demo document: a
   * sample plan someone has to clear before starting is the "overkill for small
   * events" complaint in miniature, and a plan the user did not make is a plan
   * they cannot trust the dimensions of.
   */
  let started = $state(false);

  /** Set when this plan arrived over a share link, so the copy says so. */
  let shared = $state(false);
  let shareError = $state<string | null>(null);

  /**
   * A plan in the URL opens straight into the workspace.
   *
   * Someone following a link wants to see the plan, not a template picker —
   * and the fragment never reached a server on the way here, so there is
   * nothing to fetch and no spinner to show.
   */
  const payload = payloadFromHash(window.location.hash);
  if (payload) {
    void decodeShare(payload).then((result) => {
      if (!result.ok) {
        shareError = result.error;
        return;
      }
      editor.load(result.document, result.seating);
      shared = true;
      started = true;
    });
  }

  function startOver() {
    started = false;
  }
</script>

<main>
  <header>
    <h1>Floored</h1>
    <p>Event floor planning that stays free, works offline, and prints to scale.</p>
  </header>

  <UpdateBanner />

  {#if shareError}
    <p class="share-error" data-testid="share-error">{shareError}</p>
  {/if}

  {#if shared && started}
    <p class="shared" data-testid="shared-notice">
      Opened from a share link. This is your own copy — editing it changes nothing for whoever sent
      it.
    </p>
  {/if}

  {#if !started}
    <StartScreen
      {editor}
      onstart={() => {
        started = true;
      }}
    />
  {:else}
    <FileMenu {editor} onopen={() => (started = true)} />
    <Toolbar {editor} />
    <NumberingControl {editor} />

    <div class="workspace">
      <CatalogRail {editor} />
      <PlanCanvas {editor} />
      <div class="right">
        <GuestPanel {editor} />
        <CapacityPanel {editor} />
      </div>
    </div>

    <p class="hint">
      Click a catalog item to place it. Click to select, drag to move, drag empty space to
      marquee-select. Shift-drag pans, scroll zooms. Ctrl-click adds to the selection. Arrow keys
      nudge, shift-arrow nudges ten. Alt suspends snapping. Ctrl+Z undoes.
      <button class="restart" onclick={startOver} data-testid="start-over">
        Start a different plan
      </button>
    </p>
  {/if}
</main>

<style>
  main {
    max-width: 96rem;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
  }

  header {
    margin-bottom: 1rem;
  }

  h1 {
    margin: 0 0 0.2rem;
    font-size: clamp(1.5rem, 1.2rem + 1.6vw, 2.25rem);
    letter-spacing: -0.03em;
  }

  header p {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--color-muted);
  }

  .workspace {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr) 260px;
    gap: 0.75rem;
    align-items: start;
  }

  .right {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  @media (max-width: 1000px) {
    .workspace {
      grid-template-columns: 1fr;
    }
  }

  .shared,
  .share-error {
    margin: 0 0 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-line);
    border-radius: 8px;
    font-size: 0.8125rem;
    color: var(--color-muted);
  }

  .share-error {
    border-color: var(--color-warn);
    color: var(--color-warn);
    font-weight: 600;
  }

  .restart {
    font: inherit;
    font-size: 0.8125rem;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-accent);
    text-decoration: underline;
    cursor: pointer;
  }

  .hint {
    margin-top: 1rem;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--color-muted);
  }
</style>
