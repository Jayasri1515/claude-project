/**
 * KeyValueStore decorator that prefixes every key. Demo mode wraps the browser
 * store with it so demo favorites and settings are written under their own
 * keys and can never mix with, or overwrite, real saved data (TASK-036).
 */
import type { KeyValueStore } from '../core/ports';

export class PrefixedKeyValueStore implements KeyValueStore {
  constructor(
    private readonly inner: KeyValueStore,
    private readonly prefix: string,
  ) {}

  get(key: string) {
    return this.inner.get(this.prefix + key);
  }

  set(key: string, value: string) {
    return this.inner.set(this.prefix + key, value);
  }

  remove(key: string) {
    return this.inner.remove(this.prefix + key);
  }
}
