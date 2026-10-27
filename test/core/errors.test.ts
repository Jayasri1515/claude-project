import { describe, expect, it } from 'vitest';
import {
  APP_ERROR_CODES,
  appError,
  emptyInput,
  inputTooLong,
  locationDenied,
  locationUnavailable,
  MESSAGE_KEYS,
  messageKeyFor,
  networkError,
  notFound,
  serviceUnavailable,
  storageUnavailable,
  timeoutError,
} from '../../src/core/errors';
import type { AppError, AppErrorCode, MessageKey } from '../../src/core/errors';
import { messageForKey } from '../../src/core/messages';
import { err, ok } from '../../src/core/result';

describe('AppError model', () => {
  it('defines exactly the eight architecture codes plus INPUT_TOO_LONG (user-approved amendment 2026-10-27, C2)', () => {
    expect([...APP_ERROR_CODES]).toEqual([
      'EMPTY_INPUT',
      'INPUT_TOO_LONG',
      'NOT_FOUND',
      'SERVICE_UNAVAILABLE',
      'NETWORK',
      'TIMEOUT',
      'LOCATION_DENIED',
      'LOCATION_UNAVAILABLE',
      'STORAGE_UNAVAILABLE',
    ]);
  });

  it.each(APP_ERROR_CODES.map((c) => [c]))('%s has a non-empty message key and message', (code) => {
    const e = appError(code as AppErrorCode);
    expect(e.code).toBe(code);
    expect(e.messageKey.length).toBeGreaterThan(0);
    expect(messageKeyFor(code as AppErrorCode)).toBe(e.messageKey);
    expect(messageForKey(e.messageKey).trim().length).toBeGreaterThan(0);
  });

  it('every messageKey on every AppError resolves to non-empty text', () => {
    for (const code of APP_ERROR_CODES) {
      const e = appError(code);
      expect(messageForKey(e.messageKey).trim().length).toBeGreaterThan(0);
    }
  });

  it('every key in MESSAGE_KEYS resolves and the key set matches the codes', () => {
    const keys: MessageKey[] = Object.values(MESSAGE_KEYS);
    expect(keys).toHaveLength(APP_ERROR_CODES.length);
    for (const key of keys) {
      expect(messageForKey(key).trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(MESSAGE_KEYS).sort()).toEqual([...APP_ERROR_CODES].sort());
  });

  it('rejects unknown message keys at compile time', () => {
    // @ts-expect-error 'error.bogus' is not a MessageKey; typecheck fails if this stops erroring.
    const bad: AppError = { code: 'NOT_FOUND', messageKey: 'error.bogus' };
    expect(bad.code).toBe('NOT_FOUND');
  });

  it('message keys are unique per code', () => {
    const keys = APP_ERROR_CODES.map((c) => messageKeyFor(c));
    expect(new Set(keys).size).toBe(APP_ERROR_CODES.length);
  });

  it('helper constructors return the matching code', () => {
    expect(emptyInput().code).toBe('EMPTY_INPUT');
    expect(inputTooLong().code).toBe('INPUT_TOO_LONG');
    expect(notFound().code).toBe('NOT_FOUND');
    expect(serviceUnavailable().code).toBe('SERVICE_UNAVAILABLE');
    expect(networkError().code).toBe('NETWORK');
    expect(timeoutError().code).toBe('TIMEOUT');
    expect(locationDenied().code).toBe('LOCATION_DENIED');
    expect(locationUnavailable().code).toBe('LOCATION_UNAVAILABLE');
    expect(storageUnavailable().code).toBe('STORAGE_UNAVAILABLE');
  });

  it('constructors accept no input other than the code, so raw input cannot be interpolated', () => {
    expect(appError.length).toBe(1);
    for (const make of [
      emptyInput,
      inputTooLong,
      notFound,
      serviceUnavailable,
      networkError,
      timeoutError,
      locationDenied,
      locationUnavailable,
      storageUnavailable,
    ]) {
      expect(make.length).toBe(0);
    }
  });

  it('errors expose only code and messageKey', () => {
    for (const code of APP_ERROR_CODES) {
      expect(Object.keys(appError(code)).sort()).toEqual(['code', 'messageKey']);
    }
  });

  it('messages contain no URLs, stack traces, credentials or placeholders', () => {
    for (const code of APP_ERROR_CODES) {
      const text = `${messageForKey(messageKeyFor(code))} ${messageKeyFor(code)}`;
      expect(text).not.toMatch(/https?:\/\//i);
      expect(text).not.toMatch(/\bat\s+\S+\s+\(|stack|Error:/i);
      expect(text).not.toMatch(/api[_-]?key|token|secret|password/i);
      expect(text).not.toMatch(/\$\{|\{\{|%s|\{0\}/);
    }
  });
});

describe('Result', () => {
  it('ok and err build discriminated values', () => {
    const good = ok(5);
    const bad = err(notFound());
    expect(good).toEqual({ ok: true, value: 5 });
    expect(bad.ok).toBe(false);
    expect(bad.error.code).toBe('NOT_FOUND');
  });
});
