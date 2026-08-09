<script lang="ts">
  import type { Editor } from './editor.svelte';
  import { hasEditableElements } from '$lib/tools/selection';
  import { inches } from '$lib/geometry/units';

  interface Props {
    editor: Editor;
  }

  const { editor }: Props = $props();

  // Controls that cannot act are disabled rather than enabled-and-silent.
  // Offering a button that does nothing teaches users the app is unreliable.
  const editable = $derived(hasEditableElements(editor.document, editor.selection));
  const multiple = $derived(editor.selection.size > 1);
  const distributable = $derived(editor.selection.size > 2);

  // 60" table plus a 60" gap: the comfortable spacing from RESEARCH.md.
  const ARRAY_PITCH = inches(120);
</script>

<div class="toolbar">
  <div class="group">
    <button
      onclick={() => {
        editor.undo();
      }}
      disabled={!editor.canUndo}
      title={editor.undoLabel ? `Undo ${editor.undoLabel}` : 'Nothing to undo'}
      data-testid="undo"
    >
      Undo
    </button>
    <button
      onclick={() => {
        editor.redo();
      }}
      disabled={!editor.canRedo}
      title={editor.redoLabel ? `Redo ${editor.redoLabel}` : 'Nothing to redo'}
      data-testid="redo"
    >
      Redo
    </button>
  </div>

  <div class="group">
    <span class="label">Align</span>
    <button
      onclick={() => {
        editor.align('left');
      }}
      disabled={!multiple}
      data-testid="align-left"
    >
      Left
    </button>
    <button
      onclick={() => {
        editor.align('centerX');
      }}
      disabled={!multiple}>Centre</button
    >
    <button
      onclick={() => {
        editor.align('right');
      }}
      disabled={!multiple}>Right</button
    >
    <button
      onclick={() => {
        editor.align('top');
      }}
      disabled={!multiple}>Top</button
    >
    <button
      onclick={() => {
        editor.align('bottom');
      }}
      disabled={!multiple}>Bottom</button
    >
  </div>

  <div class="group">
    <span class="label">Distribute</span>
    <button
      onclick={() => {
        editor.distribute('horizontal');
      }}
      disabled={!distributable}
      data-testid="distribute-h"
    >
      Across
    </button>
    <button
      onclick={() => {
        editor.distribute('vertical');
      }}
      disabled={!distributable}>Down</button
    >
  </div>

  <div class="group">
    <span class="label">Arrange</span>
    <button
      onclick={() => {
        editor.duplicate();
      }}
      disabled={!editable}
      data-testid="duplicate"
    >
      Duplicate
    </button>
    <button
      onclick={() => {
        editor.array(3, 2, { x: ARRAY_PITCH, y: ARRAY_PITCH });
      }}
      disabled={!editable}
      data-testid="array"
    >
      Array 3×2
    </button>
    <button
      onclick={() => {
        editor.rotateBy(90);
      }}
      disabled={!editable}
      data-testid="rotate"
    >
      Rotate 90°
    </button>
    <button
      onclick={() => {
        editor.deleteSelection();
      }}
      disabled={!editable}
      data-testid="delete"
    >
      Delete
    </button>
  </div>

  <div class="group">
    <label class="toggle">
      <input type="checkbox" bind:checked={editor.snapEnabled} data-testid="snap" />
      Snap
    </label>
    {#each editor.document.layers as layer (layer)}
      <label class="toggle">
        <input
          type="checkbox"
          checked={!editor.hiddenLayers.has(layer)}
          onchange={() => {
            editor.toggleLayer(layer);
          }}
        />
        {layer}
      </label>
    {/each}
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
    border: 1px solid var(--color-line);
    border-radius: 8px;
    background: var(--color-surface);
  }

  .group {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .label {
    font-family: ui-monospace, monospace;
    font-size: 0.625rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-muted);
    margin-right: 0.15rem;
  }

  button {
    font: inherit;
    font-size: 0.8125rem;
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--color-line);
    border-radius: 5px;
    background: none;
    color: var(--color-text);
    cursor: pointer;
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
  input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8125rem;
    color: var(--color-muted);
    cursor: pointer;
  }
</style>
