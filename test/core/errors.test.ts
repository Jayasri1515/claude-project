import { describe, expect, it } from 'vitest';
import {
  aborted,
  APP_ERROR_KINDS,
  appError,
  emptyInput,
  inputTooLong,
  invalidResponse,
  isPresentable,
  MESSAGE_KEYS,
  messageKeyFor,
  networkError,
  notFound,
  permissionDenied,
  positionUnavailable,
  PRESENTABLE_ERROR_KINDS,
  rateLimited,
  serviceUnavailable,
  storageUnavailable,
  timeoutError,
  unsupported,
} from '../../src/core/errors';
import type { AppError, MessageKey, PresentableErrorKind } from '../../src/core/errors';
import { messageForError, messageForKey } from '../../src/core/messages';
import { err, ok } from '../../src/core/result';

describe('AppError model (architecture 3.1, impl-plan T-12)', () => {
  it('defines exactly the approved kinds plus the internal aborted outcome', () => {
    expect([...APP_ERROR_KINDS]).toEqual([
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
    ]);
  });

  it('INPUT_TOO_LONG has no kind of its own: no invented kind exists', () => {
    expect((APP_ERROR_KINDS as readonly string[]).some((k) => /too_long|input_too/i.test(k))).toBe(false);
  });

  it('presentable kinds are every kind but aborted', () => {
    expect([...PRESENTABLE_ERROR_KINDS]).toEqual(APP_ERROR_KINDS.filter((k) => k !== 'aborted'));
  });

  it.each(PRESENTABLE_ERROR_KINDS.map((k) => [k]))('%s has a message key and non-empty message', (kind) => {
    const e = appError(kind as PresentableErrorKind);
    expect(e.kind).toBe(kind);
    expect(e.messageKey.length).toBeGreaterThan(0);
    expect(messageKeyFor(kind as PresentableErrorKind)).toBe(e.messageKey);
    expect(messageForKey(e.messageKey).trim().length).toBeGreaterThan(0);
    expect(messageForError(e)).toBe(messageForKey(e.messageKey));
  });


  it('MESSAGE_KEYS covers exactly the presentable kinds and every key resolves', () => {
    expect(Object.keys(MESSAGE_KEYS).sort()).toEqual([...PRESENTABLE_ERROR_KINDS].sort());
    for (const key of Object.values(MESSAGE_KEYS)) expect(messageForKey(key).trim().length).toBeGreaterThan(0);
  });

  it('rejects unknown message keys and unknown kinds at compile time', () => {
    // @ts-expect-error 'error.bogus' is not a MessageKey; typecheck fails if this stops erroring.
    const badKey: AppError = { kind: 'not_found', messageKey: 'error.bogus' };
    // @ts-expect-error 'bogus' is not an AppError kind; typecheck fails if this stops erroring.
    const badKind: AppError = { kind: 'bogus', messageKey: 'error.notFound' };
    expect(badKey.kind).toBe('not_found');
    expect(badKind.kind).toBe('bogus');
  });

  it('helper constructors return the matching kind', () => {
    expect(emptyInput().kind).toBe('empty_input');
    expect(notFound().kind).toBe('not_found');
    expect(networkError().kind).toBe('network');
    expect(timeoutError().kind).toBe('timeout');
    expect(rateLimited().kind).toBe('rate_limited');
    expect(rateLimited().messageKey).toBe('error.rateLimited'); // not the service-unavailable key (M-05)
    expect(serviceUnavailable().kind).toBe('service');
    expect(invalidResponse().kind).toBe('invalid_response');
    expect(permissionDenied().kind).toBe('permission_denied');
    expect(positionUnavailable().kind).toBe('position_unavailable');
    expect(unsupported().kind).toBe('unsupported');
    expect(storageUnavailable().kind).toBe('storage_unavailable');
    expect(aborted().kind).toBe('aborted');
  });

  it('the old over-long-input error reports empty_input with its provisional message (open question, no new kind)', () => {
    const e = inputTooLong();
    expect(e.kind).toBe('empty_input');
    expect(e.messageKey).toBe('error.inputTooLong');
    expect(messageForError(e)).toMatch(/too long/i);
  });
});

describe('errors never carry a URL, coordinates or other request data (DR-10)', () => {
  const makers = [
    emptyInput,
    inputTooLong,
    notFound,
    networkError,
    timeoutError,
    rateLimited,
    serviceUnavailable,
    invalidResponse,
    permissionDenied,
    positionUnavailable,
    unsupported,
    storageUnavailable,
    aborted,
  ];

  it('constructors accept no input, so raw input cannot be interpolated', () => {
    expect(appError.length).toBe(1);
    for (const make of makers) expect(make.length).toBe(0);
  });

  it('an error built where a URL-bearing failure was caught holds no URL or coordinates', () => {
    // What an adapter sees when fetch fails: the platform error text contains the URL and the coordinates.
    const cause = new TypeError('Failed to fetch https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41');
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41';
    // Even if extra arguments are passed (a typed call cannot), the constructors ignore them.
    const loose = networkError as unknown as (...args: unknown[]) => AppError;
    for (const e of [loose(cause, url, { lat: 52.52, lon: 13.41 }), serviceUnavailable(), timeoutError(), aborted()]) {
      const text = JSON.stringify(e);
      expect(text).not.toMatch(/https?:|open-meteo|latitude|longitude|52\.52|13\.41|lat|lon/i);
    }
    expect(Object.keys(loose(cause, url))).toEqual(['kind', 'messageKey']);
  });

  it('errors expose only kind and messageKey (aborted: only kind)', () => {
    for (const kind of PRESENTABLE_ERROR_KINDS) expect(Object.keys(appError(kind)).sort()).toEqual(['kind', 'messageKey']);
    expect(Object.keys(aborted())).toEqual(['kind']);
  });

  it('passing extra data to appError is a compile error', () => {
    // @ts-expect-error appError takes the kind only; typecheck fails if a second parameter is added.
    const e = appError('network', 'https://example.invalid/?lat=1');
    expect(JSON.stringify(e)).not.toContain('example.invalid');
  });

  it('messages contain no URLs, stack traces, credentials or placeholders', () => {
    for (const kind of PRESENTABLE_ERROR_KINDS) {
      const text = `${messageForKey(messageKeyFor(kind))} ${messageKeyFor(kind)}`;
      expect(text).not.toMatch(/https?:\/\//i);
      expect(text).not.toMatch(/\bat\s+\S+\s+\(|stack|Error:/i);
      expect(text).not.toMatch(/api[_-]?key|token|secret|password/i);
      expect(text).not.toMatch(/\$\{|\{\{|%s|\{0\}/);
    }
  });
});

describe('aborted is internal and never user-presentable (DR-09)', () => {
  it('has no message key and no message text', () => {
    const e = aborted();
    expect('messageKey' in e).toBe(false);
    expect(messageForError(e)).toBeUndefined();
    expect(isPresentable(e)).toBe(false);
  });

  it('is never mapped to network', () => {
    expect(aborted().kind).not.toBe('network');
    expect(Object.values(MESSAGE_KEYS)).not.toContain(undefined);
    expect((MESSAGE_KEYS as Record<string, string>)['aborted']).toBeUndefined();
  });

  it('every presentable error has presentable text, and only aborted lacks it', () => {
    for (const kind of APP_ERROR_KINDS) {
      const e: AppError = kind === 'aborted' ? aborted() : appError(kind);
      expect(messageForError(e) === undefined).toBe(kind === 'aborted');
      expect(isPresentable(e)).toBe(kind !== 'aborted');
    }
  });

  it('a presentable error narrows to one with a MessageKey', () => {
    const e: AppError = notFound();
    if (isPresentable(e)) {
      const key: MessageKey = e.messageKey;
      expect(key).toBe('error.notFound');
    } else {
      throw new Error('not_found must be presentable');
    }
  });
});

describe('Result', () => {
  it('ok and err build discriminated values', () => {
    const good = ok(5);
    const bad = err(notFound());
    expect(good).toEqual({ ok: true, value: 5 });
    expect(bad.ok).toBe(false);
    expect(bad.error.kind).toBe('not_found');
  });
});
