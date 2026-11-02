/**
 * KeyValueStore over the browser's localStorage (architecture 5.4; FR-037,
 * EC-016, D-003). Every operation catches exceptions (storage blocked,
 * disabled, full, or access denied) and returns STORAGE_UNAVAILABLE. It never
 * throws. Even reading `window.localStorage` can throw, so the storage object
 * is obtained inside each operation.
 */
import { storageUnavailable } from '../../core/errors';
import type { KeyValueStore } from '../../core/ports';
import { err, ok } from '../../core/result';

/** The subset of the Web Storage API used here. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultGetStorage(): StorageLike {
  return globalThis.localStorage;
}

export class LocalStorageStore implements KeyValueStore {
  constructor(private readonly getStorage: () => StorageLike = defaultGetStorage) {}

  get(key: string) {
    try {
      const value = this.getStorage().getItem(key);
      return ok(value === null ? undefined : value);
    } catch {
      return err(storageUnavailable());
    }
  }

  set(key: string, value: string) {
    try {
      this.getStorage().setItem(key, value);
      return ok(undefined);
    } catch {
      return err(storageUnavailable());
    }
  }

  remove(key: string) {
    try {
      this.getStorage().removeItem(key);
      return ok(undefined);
    } catch {
      return err(storageUnavailable());
    }
  }
}
