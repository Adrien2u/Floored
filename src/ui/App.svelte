<script lang="ts">
  import PlanCanvas from './PlanCanvas.svelte';
  import { sampleBallroom } from './sample-plan';
  import { totalSeats, roomAreaMm2 } from '$lib/document/document';
  import { occupantLoad } from '$lib/geometry/clearance';
  import { formatLength } from '$lib/geometry/units';
  import { documentBounds } from '$lib/document/document';

  // Phase 3 shows the renderer against a fixed sample. Editing tools arrive in
  // Phase 4, at which point this becomes a real document store.
  const plan = sampleBallroom();
  const bounds = documentBounds(plan);
</script>

<main>
  <header>
    <h1>Floored</h1>
    <p>Event floor planning that stays free, works offline, and prints to scale.</p>
  </header>

  <PlanCanvas document={plan} />

  <dl class="readout">
    <div>
      <dt>Room</dt>
      <dd>{formatLength(bounds.width, 'imperial')} × {formatLength(bounds.height, 'imperial')}</dd>
    </div>
    <div>
      <dt>Seats</dt>
      <dd>{totalSeats(plan)}</dd>
    </div>
    <div>
      <dt>Occupant load</dt>
      <dd>{occupantLoad(roomAreaMm2(plan))} <small>NFPA estimate</small></dd>
    </div>
  </dl>

  <p class="hint">
    Scroll to zoom, shift-drag to pan, click a table to select it. Editing tools arrive in Phase 4.
  </p>
</main>

<style>
  main {
    max-width: 68rem;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 4rem;
  }

  header {
    margin-bottom: 1.5rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: clamp(2rem, 1.4rem + 2.4vw, 3rem);
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
    margin: 1rem 0 0;
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
    color: var(--color-muted);
  }
</style>
