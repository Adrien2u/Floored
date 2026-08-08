/**
 * Storage adapters.
 *
 * The working store is OPFS (ADR-0005), which is available in Chrome, Edge,
 * Firefox 111+, and Safari 15.2+ — unlike the File System Access API, which is
 * Chromium-only and is used solely as progressive enhancement for save-in-place.
 *
 * Everything above this layer talks to the interface, so autosave and crash
 * recovery can be tested against an in-memory adapter without a browser.
 */

/** A named blob of text. Documents are JSON, so text is all we need. */
export interface StorageAdapter {
  read(name: string): Promise<string | null>;
  write(name: string, contents: string): Promise<void>;
  remove(name: string): Promise<void>;
  list(): Promise<string[]>;
}

/** In-memory adapter, for tests and for browsers where OPFS is unavailable. */
export class MemoryStorage implements StorageAdapter {
  private readonly files = new Map<string, string>();

  read(name: string): Promise<string | null> {
    return Promise.resolve(this.files.get(name) ?? null);
  }

  write(name: string, contents: string): Promise<void> {
    this.files.set(name, contents);
    return Promise.resolve();
  }

  remove(name: string): Promise<void> {
    this.files.delete(name);
    return Promise.resolve();
  }

  list(): Promise<string[]> {
    return Promise.resolve([...this.files.keys()].sort());
  }
}

/** Is the Origin Private File System available in this environment? */
export function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage !== 'undefined' &&
    typeof navigator.storage.getDirectory === 'function'
  );
}

/**
 * `FileSystemDirectoryHandle.keys()` is part of the File System API and is
 * implemented in every browser we support, but TypeScript's DOM library does not
 * declare it yet. Narrowly typed here rather than reaching for a blanket cast,
 * so the day the lib catches up this is one line to delete.
 */
interface DirectoryKeys {
  keys(): AsyncIterableIterator<string>;
}

/** OPFS-backed storage. Construct via {@link createStorage}. */
export class OpfsStorage implements StorageAdapter {
  private async root(): Promise<FileSystemDirectoryHandle> {
    return navigator.storage.getDirectory();
  }

  async read(name: string): Promise<string | null> {
    try {
      const dir = await this.root();
      const handle = await dir.getFileHandle(name);
      const file = await handle.getFile();
      return await file.text();
    } catch {
      // A missing file is not an error worth propagating — the caller asked
      // whether anything was there, and the answer is no.
      return null;
    }
  }

  async write(name: string, contents: string): Promise<void> {
    const dir = await this.root();
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(contents);
    } finally {
      // Closing in `finally` matters: an unclosed writable leaves the file
      // truncated on disk, which turns a failed autosave into data loss.
      await writable.close();
    }
  }

  async remove(name: string): Promise<void> {
    try {
      const dir = await this.root();
      await dir.removeEntry(name);
    } catch {
      // Already gone is the desired end state.
    }
  }

  async list(): Promise<string[]> {
    const dir = (await this.root()) as FileSystemDirectoryHandle & DirectoryKeys;
    const names: string[] = [];
    for await (const key of dir.keys()) names.push(key);
    return names.sort();
  }
}

/**
 * The best storage this environment supports.
 *
 * Falls back to memory rather than failing, so the app still runs — but callers
 * must tell the user their work is not being kept, because a silent fallback to
 * volatile storage is exactly the kind of quiet data loss ADR-0005 forbids.
 */
export function createStorage(): { storage: StorageAdapter; durable: boolean } {
  return isOpfsAvailable()
    ? { storage: new OpfsStorage(), durable: true }
    : { storage: new MemoryStorage(), durable: false };
}
