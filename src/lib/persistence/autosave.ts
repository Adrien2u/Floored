/**
 * Autosave and crash recovery.
 *
 * The promise (ADR-0005) is that closing the tab mid-edit does not lose the
 * evening's work. The mechanism is deliberately dull: debounce writes to the
 * working store, and offer whatever was there on next load.
 *
 * What this is *not* is a substitute for saving a real file. Browser storage can
 * be evicted, and events happen once — the UI must say so plainly rather than
 * letting the user infer permanence from the absence of a warning.
 */

import type { StorageAdapter } from './storage';
import type { FlooredDocument } from '$lib/document/document';
import { serialize, parse } from '$lib/document/serialize';

/** Filename of the working document in the store. */
export const AUTOSAVE_FILE = 'autosave.floored';

/** Filename holding metadata about the autosave, kept separate so it stays readable. */
export const AUTOSAVE_META_FILE = 'autosave.meta.json';

/**
 * Idle time before a write.
 *
 * Long enough that dragging a table does not write on every frame, short enough
 * that a crash costs a couple of seconds of work rather than a couple of
 * minutes.
 */
export const AUTOSAVE_DEBOUNCE_MS = 2000;

export interface AutosaveMeta {
  /** Milliseconds since the epoch. Supplied by the caller, never read from a clock here. */
  readonly savedAt: number;
  readonly documentName: string;
  readonly elementCount: number;
}

export interface RecoveredAutosave {
  readonly document: FlooredDocument;
  readonly meta: AutosaveMeta | null;
}

/**
 * Debounced autosaver.
 *
 * Time is injected rather than read from `Date.now()` so the behaviour is
 * testable without waiting on a real clock, and so a document never picks up a
 * timestamp from wherever it happened to be saved.
 */
export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: FlooredDocument | null = null;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: StorageAdapter,
    private readonly now: () => number = () => Date.now(),
    private readonly debounceMs: number = AUTOSAVE_DEBOUNCE_MS
  ) {}

  /** Note that the document changed. Writes after the debounce interval elapses. */
  schedule(doc: FlooredDocument): void {
    this.pending = doc;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.debounceMs);
  }

  /**
   * Write immediately, cancelling any pending timer.
   *
   * Call this on `visibilitychange` and `pagehide` — those are the only
   * reliable signals a browser gives before a tab goes away.
   */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const doc = this.pending;
    if (!doc) return;
    this.pending = null;

    // Serialize writes so a slow flush cannot be overtaken by a later one and
    // leave older content on disk.
    this.inFlight = this.inFlight.then(async () => {
      const meta: AutosaveMeta = {
        savedAt: this.now(),
        documentName: doc.meta.name,
        elementCount: doc.elements.length,
      };
      await this.storage.write(AUTOSAVE_FILE, serialize(doc));
      await this.storage.write(AUTOSAVE_META_FILE, JSON.stringify(meta));
    });

    return this.inFlight;
  }

  /** Stop any pending write. Used when the document is closed deliberately. */
  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }

  get hasPendingWrite(): boolean {
    return this.pending !== null;
  }
}

/**
 * Look for a recoverable autosave.
 *
 * Returns `null` when there is nothing to recover, or when what is there cannot
 * be read — a corrupt autosave must not block startup, because the user's next
 * action is to get on with their event.
 */
export async function recoverAutosave(storage: StorageAdapter): Promise<RecoveredAutosave | null> {
  const text = await storage.read(AUTOSAVE_FILE);
  if (text === null) return null;

  const result = parse(text);
  if (!result.ok) return null;

  return { document: result.document, meta: await readMeta(storage) };
}

async function readMeta(storage: StorageAdapter): Promise<AutosaveMeta | null> {
  const raw = await storage.read(AUTOSAVE_META_FILE);
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record['savedAt'] !== 'number') return null;
    return {
      savedAt: record['savedAt'],
      documentName: typeof record['documentName'] === 'string' ? record['documentName'] : '',
      elementCount: typeof record['elementCount'] === 'number' ? record['elementCount'] : 0,
    };
  } catch {
    return null;
  }
}

/** Discard the autosave, after the user saves a real file or dismisses recovery. */
export async function clearAutosave(storage: StorageAdapter): Promise<void> {
  await storage.remove(AUTOSAVE_FILE);
  await storage.remove(AUTOSAVE_META_FILE);
}
