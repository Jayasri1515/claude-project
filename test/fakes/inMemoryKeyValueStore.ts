import { storageUnavailable } from '../../src/core/errors';
import type { KeyValueStore } from '../../src/core/ports';
import { err, ok } from '../../src/core/result';

export interface FailureModes {
  get: boolean;
  set: boolean;
  remove: boolean;
}

/** Map-backed store with per-operation forced failures and call counts. */
export class InMemoryKeyValueStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  readonly fail: FailureModes = { get: false, set: false, remove: false };
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

  get(key: string) {
    this.getCalls += 1;
    if (this.fail.get) return err(storageUnavailable());
    return ok(this.data.get(key));
  }

  set(key: string, value: string) {
    this.setCalls += 1;
    if (this.fail.set) return err(storageUnavailable());
    this.data.set(key, value);
    return ok(undefined);
  }

  remove(key: string) {
    this.removeCalls += 1;
    if (this.fail.remove) return err(storageUnavailable());
    this.data.delete(key);
    return ok(undefined);
  }
}
