import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryStorage } from './storage';
import {
  Autosaver,
  recoverAutosave,
  clearAutosave,
  AUTOSAVE_FILE,
  AUTOSAVE_META_FILE,
} from './autosave';
import { createDocument, addElement } from '$lib/document/document';
import { serialize } from '$lib/document/serialize';
import type { FloorElement } from '$lib/document/element';
import { inches } from '$lib/geometry/units';

const table = (id: string): FloorElement => ({
  id,
  type: 'roundTable',
  layer: 'furniture',
  rotationDeg: 0,
  locked: false,
  label: id,
  center: { x: 1000, y: 1000 },
  diameterMm: inches(60),
  seats: 8,
});

const clock = () => 1_700_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('debouncing', () => {
  it('does not write until the interval elapses', async () => {
    const storage = new MemoryStorage();
    const saver = new Autosaver(storage, clock, 2000);

    saver.schedule(createDocument());
    expect(await storage.read(AUTOSAVE_FILE)).toBeNull();

    await vi.advanceTimersByTimeAsync(2000);
    expect(await storage.read(AUTOSAVE_FILE)).not.toBeNull();
  });

  it('collapses a burst of edits into one write', async () => {
    const storage = new MemoryStorage();
    const write = vi.spyOn(storage, 'write');
    const saver = new Autosaver(storage, clock, 2000);

    // Sixty scheduled saves, as a one-second drag would produce.
    let doc = createDocument();
    for (let i = 0; i < 60; i++) {
      doc = addElement(doc, table(`t${String(i)}`));
      saver.schedule(doc);
      await vi.advanceTimersByTimeAsync(16);
    }
    await vi.advanceTimersByTimeAsync(2000);

    // Two calls: the document and its metadata. Not 120.
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('writes the latest document, not the first of the burst', async () => {
    const storage = new MemoryStorage();
    const saver = new Autosaver(storage, clock, 2000);

    saver.schedule(createDocument({ name: 'first' }));
    saver.schedule(createDocument({ name: 'second' }));
    saver.schedule(createDocument({ name: 'third' }));
    await vi.advanceTimersByTimeAsync(2000);

    const recovered = await recoverAutosave(storage);
    expect(recovered?.document.meta.name).toBe('third');
  });
});

describe('flush', () => {
  it('writes immediately, for pagehide and visibilitychange', async () => {
    const storage = new MemoryStorage();
    const saver = new Autosaver(storage, clock, 2000);

    saver.schedule(addElement(createDocument(), table('t1')));
    await saver.flush();

    const recovered = await recoverAutosave(storage);
    expect(recovered?.document.elements).toHaveLength(1);
  });

  it('is a no-op when nothing is pending', async () => {
    const storage = new MemoryStorage();
    const write = vi.spyOn(storage, 'write');
    await new Autosaver(storage, clock, 2000).flush();
    expect(write).not.toHaveBeenCalled();
  });

  it('reports whether a write is outstanding', async () => {
    const storage = new MemoryStorage();
    const saver = new Autosaver(storage, clock, 2000);

    expect(saver.hasPendingWrite).toBe(false);
    saver.schedule(createDocument());
    expect(saver.hasPendingWrite).toBe(true);

    await saver.flush();
    expect(saver.hasPendingWrite).toBe(false);
  });

  it('cancel discards the pending write', async () => {
    const storage = new MemoryStorage();
    const saver = new Autosaver(storage, clock, 2000);

    saver.schedule(createDocument());
    saver.cancel();
    await vi.advanceTimersByTimeAsync(5000);

    expect(await storage.read(AUTOSAVE_FILE)).toBeNull();
  });
});

describe('recovery', () => {
  it('returns null when there is nothing saved', async () => {
    expect(await recoverAutosave(new MemoryStorage())).toBeNull();
  });

  it('restores the document and its metadata', async () => {
    const storage = new MemoryStorage();
    const saver = new Autosaver(storage, clock, 2000);
    const doc = addElement(createDocument({ name: 'Spring Gala' }), table('t1'));

    saver.schedule(doc);
    await saver.flush();

    const recovered = await recoverAutosave(storage);
    expect(recovered?.document).toEqual(doc);
    expect(recovered?.meta?.savedAt).toBe(clock());
    expect(recovered?.meta?.documentName).toBe('Spring Gala');
    expect(recovered?.meta?.elementCount).toBe(1);
  });

  it('returns null for a corrupt autosave rather than blocking startup', async () => {
    const storage = new MemoryStorage();
    await storage.write(AUTOSAVE_FILE, 'not json at all {{{');
    expect(await recoverAutosave(storage)).toBeNull();
  });

  it('still recovers the document when only the metadata is corrupt', async () => {
    const storage = new MemoryStorage();
    await storage.write(AUTOSAVE_FILE, serialize(createDocument({ name: 'Intact' })));
    await storage.write(AUTOSAVE_META_FILE, 'garbage');

    const recovered = await recoverAutosave(storage);
    expect(recovered?.document.meta.name).toBe('Intact');
    expect(recovered?.meta).toBeNull();
  });

  it('clears both files when dismissed', async () => {
    const storage = new MemoryStorage();
    const saver = new Autosaver(storage, clock, 2000);
    saver.schedule(createDocument());
    await saver.flush();

    await clearAutosave(storage);
    expect(await storage.list()).toEqual([]);
  });
});

describe('MemoryStorage', () => {
  it('reads back what it wrote', async () => {
    const storage = new MemoryStorage();
    await storage.write('a.floored', 'contents');
    expect(await storage.read('a.floored')).toBe('contents');
  });

  it('returns null for a missing file rather than throwing', async () => {
    expect(await new MemoryStorage().read('nope')).toBeNull();
  });

  it('lists names in a stable order', async () => {
    const storage = new MemoryStorage();
    await storage.write('c', '');
    await storage.write('a', '');
    await storage.write('b', '');
    expect(await storage.list()).toEqual(['a', 'b', 'c']);
  });

  it('removing a missing file is not an error', async () => {
    await expect(new MemoryStorage().remove('nope')).resolves.toBeUndefined();
  });
});
