<script lang="ts">
  import { capacityReport } from '$lib/catalog/capacity';
  import { formatLength } from '$lib/geometry/units';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
  }

  const { editor }: Props = $props();

  const report = $derived(capacityReport(editor.document));
  const violations = $derived(report.issues.filter((i) => i.severity === 'violation'));
  const tight = $derived(report.issues.filter((i) => i.severity === 'tight'));
  const units = $derived(editor.document.meta.unitSystem);

  /**
   * What to call an element in a warning.
   *
   * Ids are opaque UUIDs. Showing one to a planner is worse than showing
   * nothing — it looks like a fault in the software rather than a fault in the
   * plan. Unlabelled elements fall back to their type.
   */
  function nameOf(id: string): string {
    const element = editor.document.elements.find((e) => e.id === id);
    if (!element) return 'a deleted item';
    if (element.label !== '') return element.label;

    switch (element.type) {
      case 'roundTable':
        return 'a round table';
      case 'rectTable':
        return 'a banquet table';
      case 'seatingBlock':
        return 'a seating block';
      case 'fixture':
        return element.kind;
      default:
        return element.type;
    }
  }

  /**
   * How to describe the gap.
   *
   * A negative gap means the two objects overlap, and printing "-5 ft" as a
   * clearance invites the reader to work out what a negative distance means.
   * It is a placement mistake, not a tight fit, and deserves its own word.
   */
  function gapText(gapMm: number): string {
    return gapMm < 0 ? 'Overlapping' : formatLength(gapMm, units);
  }
</script>

<aside class="panel" aria-label="Capacity and clearance">
  <h2>Capacity</h2>

  <dl class="metrics">
    <div class="metric">
      <dt>Seats</dt>
      <dd data-testid="seat-count">{report.seats}</dd>
    </div>

    <div class="metric" data-state={report.overCapacity ? 'warn' : 'ok'}>
      <dt>Occupant load</dt>
      <dd data-testid="occupant-load">
        {report.occupantLoad}
        <small>{report.roomAreaSqFt} sq ft</small>
      </dd>
    </div>

    <div class="metric" data-state={violations.length > 0 ? 'warn' : 'ok'}>
      <dt>Clearance</dt>
      <dd data-testid="clearance">
        {#if violations.length > 0}
          {violations.length} too tight
        {:else if tight.length > 0}
          {tight.length} snug
        {:else}
          Clear
        {/if}
      </dd>
    </div>
  </dl>

  {#if report.overCapacity}
    <p class="alert" data-testid="over-capacity">
      Seated for {report.seats} in a room estimated to hold {report.occupantLoad}.
    </p>
  {/if}

  {#if report.issues.length > 0}
    <ul class="issues" data-testid="issue-list">
      {#each report.issues.slice(0, 5) as issue (issue.between.join('-'))}
        <li data-severity={issue.severity}>
          <span class="gap">{gapText(issue.gapMm)}</span>
          between {nameOf(issue.between[0])} and {nameOf(issue.between[1])}
          <small>needs {formatLength(issue.requiredMm, units)}</small>
        </li>
      {/each}
      {#if report.issues.length > 5}
        <li class="more">and {report.issues.length - 5} more</li>
      {/if}
    </ul>
  {/if}

  <p class="note">
    Occupant load estimated at 15 sq ft per person, unconcentrated (NFPA 101). An estimate for
    planning, not a code determination — the authority having jurisdiction decides.
  </p>
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--color-line);
    border-radius: 8px;
    background: var(--color-surface);
    max-height: 68vh;
    overflow-y: auto;
  }

  h2 {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.625rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-muted);
    font-weight: 600;
  }

  .metrics {
    display: grid;
    gap: 0.4rem;
    margin: 0;
  }

  .metric {
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--color-line);
    border-radius: 6px;
  }

  .metric[data-state='warn'] {
    border-color: var(--color-warn);
    background: var(--color-warn-soft);
  }

  .metric[data-state='warn'] dd {
    color: var(--color-warn);
  }

  .metric dt {
    font-family: ui-monospace, monospace;
    font-size: 0.5625rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .metric dd {
    margin: 0.1rem 0 0;
    font-family: ui-monospace, monospace;
    font-size: 1rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .metric dd small {
    font-size: 0.625rem;
    font-weight: 400;
    color: var(--color-muted);
  }

  .alert {
    margin: 0;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--color-warn);
    border-radius: 6px;
    background: var(--color-warn-soft);
    color: var(--color-warn);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .issues {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .issues li {
    padding: 0.3rem 0.45rem;
    border-left: 2px solid var(--color-line);
  }

  .issues li[data-severity='violation'] {
    border-left-color: var(--color-warn);
  }

  .gap {
    font-family: ui-monospace, monospace;
    font-weight: 600;
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
  }

  .issues small {
    display: block;
    font-size: 0.6875rem;
  }

  .more {
    border-left-color: transparent;
    font-style: italic;
  }

  .note {
    margin: 0;
    font-size: 0.6875rem;
    line-height: 1.45;
    color: var(--color-muted);
  }
</style>
