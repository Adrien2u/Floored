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

<!--
  The first tab stop. The catalog, the toolbar and the file menu sit between the
  top of the page and the drawing, and stepping through all of them on every
  visit is the kind of tax that makes keyboard use exhausting rather than
  merely slower.
-->
<!--
  tabindex is not redundant here. Safari does not put links in the tab order
  unless "Press Tab to highlight each item on a webpage" is switched on, which
  it is not by default — so without this the skip link is unreachable by exactly
  the users it exists for.
-->
<a class="skip" href="#plan" tabindex="0">Skip to the plan</a>

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

  .skip {
    position: absolute;
    left: -9999px;
    top: 0;
    z-index: 10;
    padding: 0.5rem 0.9rem;
    background: var(--color-surface);
    color: var(--color-accent);
    border: 1px solid var(--color-accent);
    border-radius: 0 0 6px 0;
  }

  .skip:focus {
    left: 0;
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
