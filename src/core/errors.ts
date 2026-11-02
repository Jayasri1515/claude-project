/**
 * Error model (C2/C11, architecture 3.1 "Ports", impl-plan T-12).
 *
 * An AppError carries only a stable `kind` and, for every kind except the internal `aborted`, a user-safe message key.
 * There is deliberately no field or constructor parameter for raw provider payloads, request URLs, coordinates, stack
 * traces, credentials or user input, so none of them can reach a message or a log (NFR-006, DR-10). The user-facing
 * text for each message key lives in the central message table (`messages.ts`), not here.
 *
 * `aborted` means the app itself cancelled or superseded a request (DR-09). It is never shown to the user, has no
 * message key and is never mapped to `network`.
 *
 * Message keys follow the approved wording of message-wording.md (kind to message mapping table): `not_found` M-02,
 * `empty_input` M-01, `service` M-03, `network` M-04, `rate_limited` M-05, `permission_denied` M-07,
 * `position_unavailable` M-09, `unsupported` M-12, the location `timeout` M-10 / M-11, `storage_unavailable` M-15, and
 * a provider `timeout` reuses M-03 (the approved mapping), and `invalid_response` M-06.
 */
export const APP_ERROR_KINDS = [
  'not_found',
  'empty_input',
  'network',
  'timeout',
  'rate_limited',
  'service',
  'invalid_response',
  'permission_denied',
  'position_unavailable',
  'unsupported',
  'storage_unavailable',
  'aborted',
] as const;

export type AppErrorKind = (typeof APP_ERROR_KINDS)[number];

/** Every kind that can be shown to the user (all but the internal `aborted`). */
export type PresentableErrorKind = Exclude<AppErrorKind, 'aborted'>;

/** The presentable kinds as a list (every kind but `aborted`), for tables and tests. */
export const PRESENTABLE_ERROR_KINDS: readonly PresentableErrorKind[] = APP_ERROR_KINDS.filter(
  (kind): kind is PresentableErrorKind => kind !== 'aborted',
);

/**
 * Provisional message key for each presentable kind. `satisfies` keeps the lookup total at compile time (a new kind
 * without a key fails typecheck) while `as const` keeps the literal key types, from which `MessageKey` is derived.
 * `aborted` is intentionally absent: it has no message.
 */
export const MESSAGE_KEYS = {
  not_found: 'error.notFound',
  empty_input: 'error.emptyInput',
  network: 'error.network',
  timeout: 'error.serviceUnavailable',
  rate_limited: 'error.rateLimited',
  service: 'error.serviceUnavailable',
  invalid_response: 'error.invalidResponse',
  permission_denied: 'error.locationDenied',
  position_unavailable: 'error.locationUnavailable',
  unsupported: 'error.locationUnsupported',
  storage_unavailable: 'error.storageUnavailable',
} as const satisfies Readonly<Record<PresentableErrorKind, string>>;

/**
 * Closed union of all valid message keys, checked at compile time. `error.inputTooLong` is the one key that is not the
 * default of any kind: the old INPUT_TOO_LONG code has no approved kind (open question, see `inputTooLong`). The two
 * location timeout keys are the other non-default keys: a location timeout has its own approved texts (M-10, M-11),
 * apart from the provider `timeout` text.
 */
export type MessageKey =
  | (typeof MESSAGE_KEYS)[PresentableErrorKind]
  | 'error.inputTooLong'
  | 'error.locationTimeout'
  | 'error.locationTimeoutPromptPending';

export interface PresentableAppError {
  readonly kind: PresentableErrorKind;
  /** Key into the user-facing message table. Never contains interpolated data. */
  readonly messageKey: MessageKey;
}

/** The app cancelled or superseded the request. Never shown, no message key. */
export interface AbortedError {
  readonly kind: 'aborted';
}

export type AppError = PresentableAppError | AbortedError;

/** Provisional message key for a presentable kind. */
export function messageKeyFor(kind: PresentableErrorKind): MessageKey {
  return MESSAGE_KEYS[kind];
}

/** False for `aborted`, the only error that must never reach the user. */
export function isPresentable(error: AppError): error is PresentableAppError {
  return error.kind !== 'aborted';
}

export function appError(kind: PresentableErrorKind): PresentableAppError {
  return { kind, messageKey: MESSAGE_KEYS[kind] };
}

export const emptyInput = (): PresentableAppError => appError('empty_input');
/**
 * OPEN QUESTION (raised to the Orchestrator/Architect): the old INPUT_TOO_LONG code has no approved `AppError.kind`.
 * No kind is invented here. Until impl-plan T-21 decides how the 100-character cap behaves (reject as `empty_input`
 * or cap per Config), an over-long input keeps its provisional message and reports the nearest approved kind.
 */
export const inputTooLong = (): PresentableAppError => ({ kind: 'empty_input', messageKey: 'error.inputTooLong' });
export const notFound = (): PresentableAppError => appError('not_found');
export const networkError = (): PresentableAppError => appError('network');
export const timeoutError = (): PresentableAppError => appError('timeout');
/** The app-owned location watchdog expired and the Permissions API reported the permission as granted (M-11). */
export const locationTimeout = (): PresentableAppError => ({ kind: 'timeout', messageKey: 'error.locationTimeout' });
/** The watchdog expired without a Permissions API, so the browser prompt may still be waiting for an answer (M-10). */
export const locationTimeoutPromptPending = (): PresentableAppError => ({
  kind: 'timeout',
  messageKey: 'error.locationTimeoutPromptPending',
});
export const rateLimited = (): PresentableAppError => appError('rate_limited');
export const serviceUnavailable = (): PresentableAppError => appError('service');
export const invalidResponse = (): PresentableAppError => appError('invalid_response');
export const permissionDenied = (): PresentableAppError => appError('permission_denied');
export const positionUnavailable = (): PresentableAppError => appError('position_unavailable');
export const unsupported = (): PresentableAppError => appError('unsupported');
export const storageUnavailable = (): PresentableAppError => appError('storage_unavailable');
export const aborted = (): AbortedError => ({ kind: 'aborted' });
