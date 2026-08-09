<script lang="ts">
  import {
    saveDocument,
    savePdf,
    saveSvg,
    savePng,
    saveDayOfPack,
    readFile,
  } from '$lib/export/download';
  import { parse } from '$lib/document/serialize';
  import { shareLink, MAX_SHARE_URL_LENGTH } from '$lib/share/share';
  import { SCALE, type DrawingScale } from '$lib/export/projection';
  import { exportPlanPdf } from '$lib/export/plan-pdf';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    /** Called after a file is opened, so the shell can leave the start screen. */
    onopen?: () => void;
  }

  const { editor, onopen }: Props = $props();

  /**
   * The plan's static canvas layer.
   *
   * Looked up when the export runs rather than passed in: threading a canvas
   * reference up through the component tree meant the button was still
   * disabled at the moment the user could see it, because the binding resolves
   * after the parent has already rendered.
   */
  function planCanvas(): HTMLCanvasElement | null {
    return document.querySelector<HTMLCanvasElement>('canvas[data-plan-layer="static"]');
  }

  let fileInput: HTMLInputElement;
  let message = $state<{ text: string; kind: 'ok' | 'error' } | null>(null);
  let scaleChoice = $state<DrawingScale | 'auto'>('auto');

  const scales: { label: string; value: DrawingScale | 'auto' }[] = [
    { label: 'Fit to page', value: 'auto' },
    { label: '1/8" = 1\'-0"', value: SCALE.imperial1_8 },
    { label: '1/4" = 1\'-0"', value: SCALE.imperial1_4 },
    { label: '1/2" = 1\'-0"', value: SCALE.imperial1_2 },
    { label: '1:100', value: SCALE.metric1_100 },
    { label: '1:50', value: SCALE.metric1_50 },
  ];

  /** What the PDF export would produce, so the user knows before they click. */
  const preview = $derived(
    exportPlanPdf(editor.document, scaleChoice === 'auto' ? {} : { scale: scaleChoice })
  );

  function say(text: string, kind: 'ok' | 'error' = 'ok') {
    message = { text, kind };
    setTimeout(() => {
      message = null;
    }, 6000);
  }

  function exportPdf() {
    savePdf(editor.document, scaleChoice === 'auto' ? {} : { scale: scaleChoice });
    say(
      preview.tiled
        ? `Saved ${String(preview.pages)} sheets at ${preview.scaleLabel}.`
        : `Saved one sheet at ${preview.scaleLabel}.`
    );
  }

  async function openFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const result = parse(await readFile(file));
    // Reset first, so picking the same file twice fires a change event again.
    input.value = '';

    if (!result.ok) {
      say(result.error, 'error');
      return;
    }

    editor.load(result.document, result.seating);
    onopen?.();
    say(
      result.migratedFrom === undefined
        ? `Opened ${result.document.meta.name}.`
        : `Opened ${result.document.meta.name}, upgraded from format ${String(result.migratedFrom)}.`
    );
  }

  /**
   * Copy a link that carries the whole plan.
   *
   * The payload lives in the fragment, so it never reaches a server — there is
   * nothing to host and nothing to expire. And the recipient opens a copy, so
   * they cannot silently change the original, which is the specific way the
   * incumbents' sharing was reported to fail.
   */
  async function copyShareLink() {
    const link = await shareLink(window.location.href, editor.document, editor.seating);

    if (!link.withinLimit) {
      say(
        `This plan needs ${String(link.length)} characters, past the ${String(
          MAX_SHARE_URL_LENGTH
        )} a link survives. Save the .floored file and send that instead.`,
        'error'
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(link.url);
      say('Link copied. It holds the whole plan — nothing was uploaded.');
    } catch {
      // Clipboard access can be refused, and a silent failure would have the
      // user pasting whatever was there before.
      window.prompt('Copy this link:', link.url);
    }
  }

  async function exportPng() {
    const canvas = planCanvas();
    if (!canvas) {
      say('The plan canvas is not ready yet.', 'error');
      return;
    }
    try {
      await savePng(canvas, editor.document.meta.name);
      say('Saved a screen-resolution PNG. Use PDF for anything measured.');
    } catch {
      say('This browser could not produce a PNG.', 'error');
    }
  }
</script>

<div class="file-menu" role="group" aria-label="File and export">
  <div class="group">
    <button
      onclick={() => {
        fileInput.click();
      }}
      data-testid="open">Open</button
    >
    <button
      onclick={() => {
        saveDocument(editor.document, editor.seating);
      }}
      data-testid="save">Save .floored</button
    >
    <input
      bind:this={fileInput}
      type="file"
      accept=".floored,application/json"
      onchange={openFile}
      hidden
    />
  </div>

  <div class="group">
    <label class="scale">
      Scale
      <select bind:value={scaleChoice} data-testid="scale-select">
        {#each scales as option (option.label)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>

    <button onclick={exportPdf} data-testid="export-pdf">Export PDF</button>
    <button
      onclick={() => {
        saveSvg(editor.document, scaleChoice === 'auto' ? {} : { scale: scaleChoice });
      }}
      data-testid="export-svg">SVG</button
    >
    <button onclick={exportPng} data-testid="export-png">PNG</button>
    <button
      onclick={() => {
        void copyShareLink();
      }}
      title="Copies a link containing the plan. Nothing is uploaded."
      data-testid="share-link">Copy share link</button
    >
  </div>

  <div class="group">
    <button
      onclick={() => {
        saveDayOfPack(editor.document, editor.seating);
        say('Saved four sheets in one PDF: find-my-seat, table sheets, place cards, check-in.');
      }}
      disabled={editor.seating.guests.length === 0}
      title="Find-my-seat list, per-table sheets, place cards, and a check-in sheet"
      data-testid="export-day-of">Day-of sheets</button
    >
  </div>

  <span class="preview" data-testid="export-preview">
    {preview.scaleLabel} ·
    {preview.pages === 1 ? '1 sheet' : `${String(preview.pages)} sheets`}
  </span>

  {#if message}
    <span class="message" role="status" data-state={message.kind} data-testid="file-message"
      >{message.text}</span
    >
  {/if}
</div>

<style>
  .file-menu {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
    border: 1px solid var(--color-line);
    border-radius: 8px;
    background: var(--color-surface);
  }

  .group {
    display: flex;
    /* Wraps, or the export row runs off the side of a phone. The outer menu
       already wrapped; the groups inside it did not, so a single group of four
       buttons stayed one unbreakable line 350px wide. */
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
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
  select:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .scale {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  select {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.2rem 0.3rem;
    border: 1px solid var(--color-line);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-text);
  }

  .preview {
    font-family: ui-monospace, monospace;
    font-size: 0.6875rem;
    color: var(--color-muted);
  }

  .message {
    font-size: 0.75rem;
    color: var(--color-muted);
  }

  .message[data-state='error'] {
    color: var(--color-warn);
    font-weight: 600;
  }
</style>
