/**
 * Error model (C11, architecture 4.11).
 *
 * An AppError carries only a stable code and a user-safe message key. There is
 * deliberately no field or constructor parameter for raw provider payloads,
 * request URLs, stack traces, credentials or user input, so none of them can
 * reach a message (NFR-006). The user-facing text for each message key lives in
 * the central message table (`messages.ts`, TASK-009), not here.
 */
export const APP_ERROR_CODES = [
  'EMPTY_INPUT',
  'INPUT_TOO_LONG',
  'NOT_FOUND',
  'SERVICE_UNAVAILABLE',
  'NETWORK',
  'TIMEOUT',
  'LOCATION_DENIED',
  'LOCATION_UNAVAILABLE',
  'STORAGE_UNAVAILABLE',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

/**
 * Message key for each code. `satisfies` keeps the lookup total at compile time
 * (a new code without a key fails typecheck) while `as const` keeps the literal
 * key types, from which `MessageKey` is derived.
 */
export const MESSAGE_KEYS = {
  EMPTY_INPUT: 'error.emptyInput',
  INPUT_TOO_LONG: 'error.inputTooLong',
  NOT_FOUND: 'error.notFound',
  SERVICE_UNAVAILABLE: 'error.serviceUnavailable',
  NETWORK: 'error.network',
  TIMEOUT: 'error.timeout',
  LOCATION_DENIED: 'error.locationDenied',
  LOCATION_UNAVAILABLE: 'error.locationUnavailable',
  STORAGE_UNAVAILABLE: 'error.storageUnavailable',
} as const satisfies Readonly<Record<AppErrorCode, string>>;

/** Closed union of all valid message keys, checked at compile time. */
export type MessageKey = (typeof MESSAGE_KEYS)[AppErrorCode];

export interface AppError {
  readonly code: AppErrorCode;
  /** Key into the user-facing message table. Never contains interpolated data. */
  readonly messageKey: MessageKey;
}

export function appError(code: AppErrorCode): AppError {
  return { code, messageKey: MESSAGE_KEYS[code] };
}

export function messageKeyFor(code: AppErrorCode): MessageKey {
  return MESSAGE_KEYS[code];
}

export const emptyInput = (): AppError => appError('EMPTY_INPUT');
export const inputTooLong = (): AppError => appError('INPUT_TOO_LONG');
export const notFound = (): AppError => appError('NOT_FOUND');
export const serviceUnavailable = (): AppError => appError('SERVICE_UNAVAILABLE');
export const networkError = (): AppError => appError('NETWORK');
export const timeoutError = (): AppError => appError('TIMEOUT');
export const locationDenied = (): AppError => appError('LOCATION_DENIED');
export const locationUnavailable = (): AppError => appError('LOCATION_UNAVAILABLE');
export const storageUnavailable = (): AppError => appError('STORAGE_UNAVAILABLE');
