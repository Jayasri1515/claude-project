import type { AppError } from '../errors';
import type { Result } from '../result';

/** Architecture 5.4. Synchronous; failures are returned as STORAGE_UNAVAILABLE, never thrown. */
export interface KeyValueStore {
  get(key: string): Result<string | undefined, AppError>;
  set(key: string, value: string): Result<void, AppError>;
  remove(key: string): Result<void, AppError>;
}
