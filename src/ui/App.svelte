<script lang="ts">
  import PlanCanvas from './PlanCanvas.svelte';
  import Toolbar from './Toolbar.svelte';
  import { Editor } from './editor.svelte';
  import { sampleBallroom } from './sample-plan';
  import { totalSeats, roomAreaMm2, documentBounds } from '$lib/document/document';
  import { occupantLoad } from '$lib/geometry/clearance';
  import { formatLength } from '$lib/geometry/units';

  const editor = new Editor(sampleBallroom());

  const bounds = $derived(documentBounds(editor.document));
  const seats = $derived(totalSeats(editor.document));
  const load = $derived(occupantLoad(roomAreaMm2(editor.document)));
</script>

<main>
  <header>
    <h1>Floored</h1>
    <p>Event floor planning that stays free, works offline, and prints to scale.</p>
  </header>

  <Toolbar {editor} />
  <PlanCanvas {editor} />

  <dl class="readout">
    <div>
      <dt>Room</dt>
      <dd>{formatLength(bounds.width, 'imperial')} × {formatLength(bounds.height, 'imperial')}</dd>
    </div>
    <div>
      <dt>Seats</dt>
      <dd data-testid="seat-count">{seats}</dd>
    </div>
    <div>
      <dt>Occupant load</dt>
      <dd>{load} <small>NFPA estimate</small></dd>
    </div>
  </dl>

  <p class="hint">
    Click to select, drag to move, drag empty space to marquee-select. Shift-drag pans, scroll
    zooms. Ctrl/Cmd-click adds to the selection. Arrow keys nudge, shift-arrow nudges ten. Alt
    suspends snapping. Ctrl+Z undoes.
  </p>
</main>

<style>
  main {
    max-width: 72rem;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }

  header {
    margin-bottom: 1.25rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: clamp(1.75rem, 1.3rem + 2vw, 2.5rem);
    letter-spacing: -0.03em;
  }

  header p {
    margin: 0;
    color: var(--color-muted);
  }

  .readout {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 0.75rem 0 0;
    padding: 0;
  }

  .readout div {
    flex: 1 1 10rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--color-line);
    border-radius: 6px;
    background: var(--color-surface);
  }

  .readout dt {
    font-family: ui-monospace, monospace;
    font-size: 0.625rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .readout dd {
    margin: 0.15rem 0 0;
    font-family: ui-monospace, monospace;
    font-size: 1.05rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .readout dd small {
    font-size: 0.6875rem;
    font-weight: 400;
    color: var(--color-muted);
  }

  .hint {
    margin-top: 1rem;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--color-muted);
  }
</style>
