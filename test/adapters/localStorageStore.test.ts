import { describe, expect, it } from 'vitest';
import { LocalStorageStore } from '../../src/adapters/web/localStorageStore';
import type { StorageLike } from '../../src/adapters/web/localStorageStore';

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('LocalStorageStore', () => {
  it('round-trips values; a missing key is undefined, not an error', () => {
    const storage = memoryStorage();
    const store = new LocalStorageStore(() => storage);
    expect(store.get('k')).toEqual({ ok: true, value: undefined });
    expect(store.set('k', 'v')).toEqual({ ok: true, value: undefined });
    expect(store.get('k')).toEqual({ ok: true, value: 'v' });
    expect(store.remove('k')).toEqual({ ok: true, value: undefined });
    expect(store.get('k')).toEqual({ ok: true, value: undefined });
  });

  it('an empty string value is returned as an empty string', () => {
    const storage = memoryStorage();
    const store = new LocalStorageStore(() => storage);
    store.set('k', '');
    expect(store.get('k')).toEqual({ ok: true, value: '' });
  });

  it('every operation returns STORAGE_UNAVAILABLE when access to storage throws', () => {
    const store = new LocalStorageStore(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    for (const result of [store.get('k'), store.set('k', 'v'), store.remove('k')]) {
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe('STORAGE_UNAVAILABLE');
    }
  });

  it('set returns STORAGE_UNAVAILABLE when the write throws (quota exceeded)', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const store = new LocalStorageStore(() => storage);
    const r = store.set('k', 'v');
    expect(!r.ok && r.error.code).toBe('STORAGE_UNAVAILABLE');
    expect(store.get('k')).toEqual({ ok: true, value: undefined });
  });

  it('get and remove return STORAGE_UNAVAILABLE when those calls throw', () => {
    const storage = memoryStorage();
    storage.getItem = () => {
      throw new Error('boom');
    };
    storage.removeItem = () => {
      throw new Error('boom');
    };
    const store = new LocalStorageStore(() => storage);
    const g = store.get('k');
    const r = store.remove('k');
    expect(!g.ok && g.error.code).toBe('STORAGE_UNAVAILABLE');
    expect(!r.ok && r.error.code).toBe('STORAGE_UNAVAILABLE');
  });

  it('error results carry no thrown detail', () => {
    const store = new LocalStorageStore(() => {
      throw new Error('secret detail');
    });
    const r = store.get('k');
    expect(JSON.stringify(r)).not.toContain('secret');
  });
});
