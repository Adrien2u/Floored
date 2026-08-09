<script lang="ts">
  import {
    NUMBERING_PATTERNS,
    patternName,
    numberingLabels,
    DEFAULT_NUMBERING,
    type NumberingPattern,
  } from '$lib/seating/numbering';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
  }

  const { editor }: Props = $props();

  let pattern = $state<NumberingPattern>('leftToRight');
  let startAt = $state(1);
  let prefix = $state('T');

  const options = $derived({ ...DEFAULT_NUMBERING, pattern, startAt, prefix });

  /**
   * What applying would produce, shown before it is applied.
   *
   * Numbering is computed from positions and stored nowhere, so previewing it
   * costs a recalculation and no state — which is exactly why the rule against
   * a shadow mapping (ADR-0013) makes this cheap.
   */
  const preview = $derived(numberingLabels(editor.document, options));
  const count = $derived(preview.size);
</script>

<div class="numbering" role="group" aria-label="Table numbering">
  <span class="label">Number tables</span>

  <select bind:value={pattern} aria-label="Numbering pattern" data-testid="numbering-pattern">
    {#each NUMBERING_PATTERNS as option (option)}
      <option value={option}>{patternName(option)}</option>
    {/each}
  </select>

  <label class="field">
    Prefix
    <input type="text" bind:value={prefix} size="2" maxlength="4" data-testid="numbering-prefix" />
  </label>

  <label class="field">
    From
    <input type="number" bind:value={startAt} min="1" max="999" data-testid="numbering-start" />
  </label>

  <button
    onclick={() => {
      editor.applyNumbering(options);
    }}
    disabled={count === 0}
    data-testid="apply-numbering"
  >
    Apply to {count}
  </button>

  <span class="hint" data-testid="numbering-hint">Labels only — no guest moves.</span>
</div>

<style>
  .numbering {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    margin-bottom: 0.5rem;
    border: 1px solid var(--color-line);
    border-radius: 8px;
    background: var(--color-surface);
  }

  .label {
    font-family: ui-monospace, monospace;
    font-size: 0.625rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .field {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  select,
  input {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.2rem 0.3rem;
    border: 1px solid var(--color-line);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-text);
  }

  input[type='number'] {
    width: 4rem;
  }

  button {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--color-line);
    border-radius: 5px;
    background: none;
    color: var(--color-text);
    cursor: pointer;
    transition: border-color 150ms ease;
  }

  button:hover:not(:disabled) {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  button:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .hint {
    font-size: 0.6875rem;
    color: var(--color-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
