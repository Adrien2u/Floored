<script lang="ts">
  import {
    guestsAt,
    unseatedGuests,
    seatedCount,
    seatingConflicts,
    findGuest,
    type Guest,
  } from '$lib/seating/guest';
  import { parseCsv, guessMapping, mappingIsUsable } from '$lib/seating/csv';
  import { previewImport, applyImport, type ImportPreview } from '$lib/seating/import';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
  }

  const { editor }: Props = $props();

  let search = $state('');
  let fileInput: HTMLInputElement;
  let pendingRows = $state<ReturnType<typeof parseCsv> | null>(null);
  let preview = $state<ImportPreview | null>(null);
  let message = $state<string | null>(null);

  const plan = $derived(editor.seating);
  const conflicts = $derived(seatingConflicts(plan));

  /**
   * The table currently selected on the plan, if exactly one is.
   *
   * This is the linking half of the two-panel selector: choosing a table on the
   * canvas brings its guests forward here, and choosing a guest here highlights
   * their table. It is the direct answer to the top-ranked complaint in the
   * research — users "constantly clicking between different tools to select and
   * alter seats".
   */
  const focusedTable = $derived(editor.selection.size === 1 ? [...editor.selection][0] : undefined);

  const capacities = $derived(editor.seatCapacities());

  const focusedGuests = $derived(focusedTable ? guestsAt(plan, focusedTable) : []);
  const focusedCapacity = $derived(focusedTable ? (capacities.get(focusedTable) ?? 0) : 0);

  const unseated = $derived(unseatedGuests(plan));

  const matches = $derived(
    search.trim() === ''
      ? unseated
      : plan.guests.filter((g) => matchesSearch(g, search.trim().toLowerCase()))
  );

  function matchesSearch(guest: Guest, needle: string): boolean {
    const group = guest.groupId
      ? (plan.groups.find((gr) => gr.id === guest.groupId)?.name ?? '')
      : '';
    return [guest.name, guest.email, group, guest.notes].some((field) =>
      field.toLowerCase().includes(needle)
    );
  }

  function seatLabel(guest: Guest): string {
    if (!guest.seat) return '';
    const element = editor.document.elements.find((e) => e.id === guest.seat?.elementId);
    return element?.label !== '' && element ? element.label : 'Table';
  }

  function say(text: string) {
    message = text;
    setTimeout(() => {
      message = null;
    }, 6000);
  }

  /* ---- import ---- */

  async function chooseFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const parsed = parseCsv(await file.text());
    input.value = '';

    const mapping = guessMapping(parsed.headers);
    if (!mappingIsUsable(mapping)) {
      say('No name column found. The file needs a Name, or First and Last name.');
      return;
    }

    pendingRows = parsed;
    preview = previewImport(plan, parsed.rows, mapping);
  }

  function confirmImport(removeMissing: boolean) {
    if (!pendingRows) return;
    const mapping = guessMapping(pendingRows.headers);

    const result = applyImport(plan, pendingRows.rows, { mapping, removeMissing });
    editor.setSeating(result.plan);

    say(
      `Imported: ${String(result.preview.added)} added, ${String(result.preview.updated)} updated, ` +
        `${String(result.preview.unchanged)} unchanged.`
    );
    pendingRows = null;
    preview = null;
  }

  function cancelImport() {
    pendingRows = null;
    preview = null;
  }

  function runAutoAssign() {
    const result = editor.autoAssign();
    if (result.unplaced.length === 0) {
      say(`Seated ${String(result.seated)}.`);
      return;
    }
    say(
      `Seated ${String(result.seated)}. ${String(result.unplaced.length)} could not be placed: ` +
        (result.unplaced[0]?.reason ?? '')
    );
  }
</script>

<aside class="panel" aria-label="Guests and seating">
  <header>
    <h2>Guests</h2>
    <span class="count" data-testid="seated-count">
      {seatedCount(plan)}/{plan.guests.length} seated
    </span>
  </header>

  <div class="actions">
    <button
      onclick={() => {
        fileInput.click();
      }}
      data-testid="import-guests">Import CSV</button
    >
    <button
      onclick={runAutoAssign}
      disabled={plan.guests.length === 0 || plan.assignmentsLocked}
      data-testid="auto-assign">Auto-assign</button
    >
    <button
      onclick={() => {
        editor.undoSeating();
      }}
      disabled={!editor.canUndoSeating}
      data-testid="undo-seating">Undo</button
    >
    <input bind:this={fileInput} type="file" accept=".csv,text/csv" onchange={chooseFile} hidden />
  </div>

  <label class="lock">
    <input
      type="checkbox"
      checked={plan.assignmentsLocked}
      onchange={() => {
        editor.toggleAssignmentLock();
      }}
      data-testid="lock-assignments"
    />
    Lock assignments
  </label>

  {#if preview}
    <!--
      The import preview. Nothing changes until this is confirmed: a planner
      receiving an updated list days before the event needs to see what it will
      do before it does it.
    -->
    <div class="preview" data-testid="import-preview">
      <h3>Import preview</h3>
      <ul>
        <li>{preview.added} added</li>
        <li>{preview.updated} updated</li>
        <li>{preview.unchanged} unchanged</li>
        <li>{preview.removed} missing from the file</li>
        {#if preview.skippedRows > 0}
          <li>{preview.skippedRows} rows with no name, skipped</li>
        {/if}
      </ul>

      {#if preview.seatedRemovals > 0}
        <p class="warn">
          {preview.seatedRemovals} of the missing guests currently hold a seat.
        </p>
      {/if}

      <div class="preview-actions">
        <button
          onclick={() => {
            confirmImport(false);
          }}
          data-testid="import-keep">Import, keep missing</button
        >
        <button
          onclick={() => {
            confirmImport(true);
          }}
          data-testid="import-remove">Import, remove missing</button
        >
        <button onclick={cancelImport} data-testid="import-cancel">Cancel</button>
      </div>
    </div>
  {/if}

  {#if editor.pendingGuest}
    <p class="pending" role="status" data-testid="pending-guest">
      Placing <strong>{findGuest(plan, editor.pendingGuest)?.name}</strong> — click a table.
      <button
        onclick={() => {
          editor.pickUpGuest(editor.pendingGuest ?? '');
        }}>Cancel</button
      >
    </p>
  {/if}

  {#if conflicts.length > 0}
    <p class="warn" role="status" data-testid="seating-conflicts">
      {conflicts.length} seating {conflicts.length === 1 ? 'conflict' : 'conflicts'}
    </p>
  {/if}

  {#if focusedTable && focusedCapacity > 0}
    <section class="table-detail" data-testid="table-detail">
      <h3>
        {editor.document.elements.find((e) => e.id === focusedTable)?.label || 'Selected table'}
        <span class="count">{focusedGuests.length}/{focusedCapacity}</span>
      </h3>

      {#if focusedGuests.length === 0}
        <p class="empty">Nobody seated here yet.</p>
      {:else}
        <ul class="guest-list">
          {#each focusedGuests as guest (guest.id)}
            <li>
              <span class="name" title={guest.name}>{guest.name}</span>
              {#if guest.dietary}<span class="flag" title={guest.dietary}>diet</span>{/if}
              {#if guest.accessibility}<span class="flag" title={guest.accessibility}>access</span
                >{/if}
              <button
                class="link"
                onclick={() => {
                  editor.unseatGuest(guest.id);
                }}>Unseat</button
              >
            </li>
          {/each}
        </ul>
        <button
          class="link"
          onclick={() => {
            editor.clearTable(focusedTable);
          }}
          data-testid="clear-table">Clear table</button
        >
      {/if}
    </section>
  {/if}

  <label class="search">
    <span class="sr-only">Search guests</span>
    <input
      type="search"
      bind:value={search}
      placeholder="Search guests"
      data-testid="guest-search"
    />
  </label>

  {#if plan.guests.length === 0}
    <p class="empty">No guests yet. Import a CSV with a name column to begin.</p>
  {:else if matches.length === 0}
    <p class="empty" data-testid="no-results">
      Nobody matches “{search}”. Try a surname, a company, or clear the search.
    </p>
  {:else}
    <ul class="guest-list" data-testid="guest-list">
      {#each matches.slice(0, 200) as guest (guest.id)}
        <li class:picked={editor.pendingGuest === guest.id}>
          <button
            class="guest"
            draggable="true"
            ondragstart={(e) => {
              e.dataTransfer?.setData('text/floored-guest', guest.id);
            }}
            onclick={() => {
              editor.pickUpGuest(guest.id);
            }}
            title={guest.name}
            data-testid={`guest-${guest.id}`}
          >
            <span class="name">{guest.name}</span>
            {#if guest.seat}
              <span class="seat">{seatLabel(guest)}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>

    {#if matches.length > 200}
      <p class="empty">Showing 200 of {matches.length}. Search to narrow it down.</p>
    {/if}
  {/if}

  {#if message}
    <p class="message" role="status" data-testid="guest-message">{message}</p>
  {/if}
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.75rem;
    border: 1px solid var(--color-line);
    border-radius: 8px;
    background: var(--color-surface);
    max-height: 68vh;
    overflow-y: auto;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2,
  h3 {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.625rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-muted);
    font-weight: 600;
  }

  h3 {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.35rem;
  }

  .count {
    font-family: ui-monospace, monospace;
    font-size: 0.6875rem;
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  button {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
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
  input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .link {
    border: none;
    padding: 0;
    font-size: 0.6875rem;
    color: var(--color-muted);
    text-decoration: underline;
  }

  .lock,
  .search {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .search input {
    flex: 1;
    font: inherit;
    font-size: 0.8125rem;
    padding: 0.3rem 0.45rem;
    border: 1px solid var(--color-line);
    border-radius: 5px;
    background: var(--color-surface);
    color: var(--color-text);
  }

  .guest-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.15rem;
  }

  .guest-list li {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8125rem;
  }

  .guest {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    text-align: left;
    /* 44px would dwarf a dense list; 32 keeps a comfortable target while
       leaving 200 names scannable. */
    min-height: 32px;
    cursor: grab;
  }

  li.picked .guest {
    border-color: var(--color-accent);
    background: var(--color-warn-soft);
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seat,
  .flag {
    font-family: ui-monospace, monospace;
    font-size: 0.625rem;
    color: var(--color-muted);
    border: 1px solid var(--color-line);
    border-radius: 3px;
    padding: 0 0.25rem;
    flex: none;
  }

  .seat {
    color: var(--color-accent);
    border-color: var(--color-accent);
  }

  .preview {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--color-accent);
    border-radius: 6px;
    background: var(--color-panel);
  }

  .preview ul {
    list-style: none;
    margin: 0 0 0.4rem;
    padding: 0;
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .preview-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .table-detail {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--color-line);
    border-radius: 6px;
    background: var(--color-panel);
  }

  .pending {
    margin: 0;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--color-accent);
    border-radius: 6px;
    font-size: 0.75rem;
    color: var(--color-accent);
  }

  .warn {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-warn);
  }

  .empty,
  .message {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.45;
    color: var(--color-muted);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
