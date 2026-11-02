import type { AppError } from '../errors';
import type { Result } from '../result';

/**
 * Architecture 3.1 / 5.4. Synchronous. The adapter returns failures as `storage_unavailable` instead of throwing; a
 * caller must still tolerate a store that throws (the browser can throw on access), so the favorites and settings
 * services (T-22, T-23) wrap calls and fall back to a session-only list. The test fake can be set to throw.
 */
export interface KeyValueStore {
  get(key: string): Result<string | undefined, AppError>;
  set(key: string, value: string): Result<void, AppError>;
  remove(key: string): Result<void, AppError>;
}
