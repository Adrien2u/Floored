<script lang="ts">
  import PlanCanvas from './PlanCanvas.svelte';
  import Toolbar from './Toolbar.svelte';
  import FileMenu from './FileMenu.svelte';
  import CatalogRail from './CatalogRail.svelte';
  import CapacityPanel from './CapacityPanel.svelte';
  import GuestPanel from './GuestPanel.svelte';
  import NumberingControl from './NumberingControl.svelte';
  import StartScreen from './StartScreen.svelte';
  import { Editor } from './editor.svelte';

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

  function startOver() {
    started = false;
  }
</script>

<main>
  <header>
    <h1>Floored</h1>
    <p>Event floor planning that stays free, works offline, and prints to scale.</p>
  </header>

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
