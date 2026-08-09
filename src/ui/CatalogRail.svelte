<script lang="ts">
  import { catalogByCategory, type CatalogItem } from '$lib/catalog/catalog';
  import { seatCount } from '$lib/document/element';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
  }

  const { editor }: Props = $props();

  const groups = [
    { label: 'Tables', items: catalogByCategory('table') },
    { label: 'Seating', items: catalogByCategory('seating') },
    { label: 'Fixtures', items: catalogByCategory('fixture') },
  ];

  /**
   * Place an item at the centre of the current view.
   *
   * Drag-and-drop onto the canvas arrives with the placement tool; clicking to
   * drop at the centre is the path that works today and needs no explanation.
   */
  function place(item: CatalogItem) {
    editor.placeCatalogItem(item);
  }

  function seatsFor(item: CatalogItem): number {
    return seatCount(item.create('preview', { x: 0, y: 0 }));
  }
</script>

<aside class="rail" aria-label="Object catalog">
  {#each groups as group (group.label)}
    <section>
      <h2>{group.label}</h2>
      <div class="items">
        {#each group.items as item (item.id)}
          <button
            class="item"
            onclick={() => {
              place(item);
            }}
            title={item.note}
            data-testid={`catalog-${item.id}`}
          >
            <span class="name">{item.name}</span>
            {#if seatsFor(item) > 0}
              <span class="seats">{seatsFor(item)}p</span>
            {/if}
          </button>
        {/each}
      </div>
    </section>
  {/each}

  <p class="note">
    Dimensions and seat counts follow published banquet and ADA guidance. Click to place at the
    centre of the view.
  </p>
</aside>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.75rem;
    border: 1px solid var(--color-line);
    border-radius: 8px;
    background: var(--color-surface);
    max-height: 68vh;
    overflow-y: auto;
  }

  h2 {
    margin: 0 0 0.4rem;
    font-family: ui-monospace, monospace;
    font-size: 0.625rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-muted);
    font-weight: 600;
  }

  .items {
    display: grid;
    gap: 0.25rem;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    font: inherit;
    font-size: 0.8125rem;
    text-align: left;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--color-line);
    border-radius: 5px;
    background: none;
    color: var(--color-text);
    cursor: pointer;
  }

  .item:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .item:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .seats {
    margin-left: auto;
    font-family: ui-monospace, monospace;
    font-size: 0.6875rem;
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }

  .note {
    margin: 0;
    font-size: 0.6875rem;
    line-height: 1.45;
    color: var(--color-muted);
  }
</style>
