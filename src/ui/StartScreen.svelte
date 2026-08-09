<script lang="ts">
  import { TEMPLATES, type Template } from '$lib/templates/templates';
  import { createDocument } from '$lib/document/document';
  import { feet, formatLength } from '$lib/geometry/units';
  import { parse } from '$lib/document/serialize';
  import { readFile } from '$lib/export/download';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    /** Called once a plan exists, so the shell can show the workspace. */
    onstart: () => void;
  }

  const { editor, onstart }: Props = $props();

  let name = $state('');
  let fileInput: HTMLInputElement;
  let error = $state<string | null>(null);
  let widthFeet = $state(60);
  let depthFeet = $state(40);

  /**
   * Room size is asked for once, here, and never again.
   *
   * The research found the app has to produce a usable plan in under a minute,
   * and the only thing a template genuinely cannot guess is the venue. Two
   * numbers is the whole interview.
   */
  const roomWidthMm = $derived(feet(clampFeet(widthFeet)));
  const roomDepthMm = $derived(feet(clampFeet(depthFeet)));

  function clampFeet(value: number): number {
    if (!Number.isFinite(value)) return 20;
    return Math.min(400, Math.max(10, value));
  }

  function start(template: Template) {
    editor.load(
      template.create({
        roomWidthMm,
        roomDepthMm,
        ...(name.trim() === '' ? {} : { name: name.trim() }),
      })
    );
    onstart();
  }

  /**
   * Open a saved plan.
   *
   * Offered here and not only inside the workspace: a returning user's first
   * action is to open the plan they were working on, and making them start a
   * throwaway plan to reach the Open button would be a small daily insult.
   */
  async function openFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const result = parse(await readFile(file));
    input.value = '';

    if (!result.ok) {
      error = result.error;
      return;
    }

    editor.load(result.document, result.seating);
    onstart();
  }

  function startEmpty() {
    editor.load(createDocument(name.trim() === '' ? {} : { name: name.trim() }));
    onstart();
  }
</script>

<section class="start" data-testid="start-screen">
  <h2>Start a plan</h2>
  <p class="lead">
    Pick an arrangement and adjust it. Everything stays on this device — no account, no upload.
  </p>

  <div class="fields">
    <label>
      Event name
      <input type="text" bind:value={name} placeholder="Untitled plan" data-testid="start-name" />
    </label>

    <label>
      Room width
      <input type="number" bind:value={widthFeet} min="10" max="400" data-testid="start-width" />
      <span class="unit">ft</span>
    </label>

    <label>
      Room depth
      <input type="number" bind:value={depthFeet} min="10" max="400" data-testid="start-depth" />
      <span class="unit">ft</span>
    </label>

    <button
      class="open"
      onclick={() => {
        fileInput.click();
      }}
      data-testid="start-open"
    >
      Open a plan
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".floored,application/json"
      onchange={openFile}
      hidden
    />

    <span class="computed" data-testid="start-room-size">
      {formatLength(roomWidthMm, 'imperial')} × {formatLength(roomDepthMm, 'imperial')}
    </span>
  </div>

  {#if error}
    <p class="error" data-testid="start-error">{error}</p>
  {/if}

  <ul class="templates">
    {#each TEMPLATES as template (template.id)}
      <li>
        <button
          onclick={() => {
            start(template);
          }}
          data-testid={`template-${template.id}`}
        >
          <span class="name">{template.name}</span>
          <span class="summary">{template.summary}</span>
        </button>
      </li>
    {/each}

    <li>
      <button class="blank" onclick={startEmpty} data-testid="template-blank">
        <span class="name">Empty plan</span>
        <span class="summary">No room, no furniture. Draw it yourself.</span>
      </button>
    </li>
  </ul>
</section>

<style>
  .start {
    max-width: 60rem;
    margin: 0 auto;
    padding: 1.5rem 0 0;
  }

  h2 {
    margin: 0 0 0.35rem;
    font-size: 1.25rem;
    letter-spacing: -0.02em;
  }

  .lead {
    margin: 0 0 1.25rem;
    font-size: 0.9375rem;
    color: var(--color-muted);
  }

  .fields {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.75rem;
    padding-bottom: 1.25rem;
    margin-bottom: 1.25rem;
    border-bottom: 1px solid var(--color-line);
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8125rem;
    color: var(--color-muted);
  }

  input {
    font: inherit;
    font-size: 0.875rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--color-line);
    border-radius: 5px;
    background: var(--color-surface);
    color: var(--color-text);
  }

  input[type='number'] {
    width: 5rem;
  }

  .open {
    font: inherit;
    font-size: 0.8125rem;
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--color-line);
    border-radius: 5px;
    background: none;
    color: var(--color-text);
    cursor: pointer;
  }

  .open:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .open:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .error {
    margin: 0 0 1rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-warn);
  }

  .unit,
  .computed {
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .templates {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 0.6rem;
  }

  .templates button {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    height: 100%;
    text-align: left;
    font: inherit;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--color-line);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    transition:
      border-color 150ms ease,
      transform 150ms ease;
  }

  .templates button:hover {
    border-color: var(--color-accent);
    transform: translateY(-1px);
  }

  .templates button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .blank {
    border-style: dashed;
  }

  .name {
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .summary {
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--color-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .templates button {
      transition: none;
    }
    .templates button:hover {
      transform: none;
    }
  }
</style>
