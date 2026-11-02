import { storageUnavailable } from '../../src/core/errors';
import type { KeyValueStore } from '../../src/core/ports';
import { err, ok } from '../../src/core/result';

export interface FailureModes {
  get: boolean;
  set: boolean;
  remove: boolean;
}

/**
 * Map-backed store with per-operation forced failures and call counts. `fail` makes an operation return
 * `err(storage_unavailable)` (the adapter contract); `throws` makes it THROW instead, simulating a browser that throws on
 * storage access, which callers must still tolerate (architecture 5.4).
 */
export class InMemoryKeyValueStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  readonly fail: FailureModes = { get: false, set: false, remove: false };
  readonly throws: FailureModes = { get: false, set: false, remove: false };
  getCalls = 0;
  setCalls = 0;
  removeCalls = 0;

  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.data.set(k, v);
  }

  /** Force every operation to fail (or recover) at once. */
  failAll(value = true): void {
    this.fail.get = value;
    this.fail.set = value;
    this.fail.remove = value;
  }

  /** Make every operation throw (or recover) at once. */
  throwAll(value = true): void {
    this.throws.get = value;
    this.throws.set = value;
    this.throws.remove = value;
  }

  get(key: string) {
    this.getCalls += 1;
    if (this.throws.get) throw new Error('storage access threw (get)');
    if (this.fail.get) return err(storageUnavailable());
    return ok(this.data.get(key));
  }

  set(key: string, value: string) {
    this.setCalls += 1;
    if (this.throws.set) throw new Error('storage access threw (set)');
    if (this.fail.set) return err(storageUnavailable());
    this.data.set(key, value);
    return ok(undefined);
  }

  remove(key: string) {
    this.removeCalls += 1;
    if (this.throws.remove) throw new Error('storage access threw (remove)');
    if (this.fail.remove) return err(storageUnavailable());
    this.data.delete(key);
    return ok(undefined);
  }
}
