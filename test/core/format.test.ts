import { describe, expect, it } from 'vitest';
import {
  celsiusToFahrenheit,
  convertTemperature,
  formatDataFrom,
  formatDateTime,
  formatForecastDate,
  formatForecastRange,
  formatHumidity,
  formatLabeledHumidity,
  formatLabeledTemperature,
  formatLastUpdated,
  formatTemperature,
  formatTime,
} from '../../src/core/format';
import formatSource from '../../src/core/format.ts?raw';
import { MESSAGES, message, messageForError } from '../../src/core/messages';
import { appError, APP_ERROR_CODES } from '../../src/core/errors';

const en = { locale: 'en-US' };

describe('temperature conversion', () => {
  it('converts edge values', () => {
    expect(celsiusToFahrenheit(-40)).toBe(-40);
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(celsiusToFahrenheit(21.5)).toBeCloseTo(70.7, 10);
    expect(celsiusToFahrenheit(-0.5)).toBeCloseTo(31.1, 10);
  });

  it('convertTemperature leaves Celsius unchanged', () => {
    expect(convertTemperature(12.3, 'C')).toBe(12.3);
    expect(convertTemperature(0, 'F')).toBe(32);
  });
});

describe('formatTemperature', () => {
  it('shows the degree symbol and unit', () => {
    expect(formatTemperature(21.4, 'C', en)).toBe('21°C');
    expect(formatTemperature(21.5, 'F', en)).toBe('71°F');
    expect(formatTemperature(0, 'C', en)).toBe('0°C');
    expect(formatTemperature(-40, 'F', en)).toBe('-40°F');
  });

  it('never shows negative zero', () => {
    expect(formatTemperature(-0.4, 'C', en)).toBe('0°C');
  });

  it('missing or non-finite values show Unavailable, never 0 or blank', () => {
    for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatTemperature(bad, 'C', en)).toBe('Unavailable');
      expect(formatTemperature(bad, 'F', en)).toBe('Unavailable');
    }
  });
});

describe('formatHumidity', () => {
  it('uses a percent sign', () => {
    expect(formatHumidity(60, en)).toBe('60%');
    expect(formatHumidity(0, en)).toBe('0%');
    expect(formatHumidity(59.6, en)).toBe('60%');
  });

  it('missing values show Unavailable', () => {
    expect(formatHumidity(undefined, en)).toBe('Unavailable');
    expect(formatHumidity(Number.NaN, en)).toBe('Unavailable');
  });
});

describe('labeled strings', () => {
  it('include label and unit', () => {
    expect(formatLabeledTemperature(20, 'C', en)).toBe('Temperature: 20°C');
    expect(formatLabeledHumidity(55, en)).toBe('Humidity: 55%');
  });

  it('labels stay when the value is missing', () => {
    expect(formatLabeledTemperature(undefined, 'C', en)).toBe('Temperature: Unavailable');
    expect(formatLabeledHumidity(undefined, en)).toBe('Humidity: Unavailable');
  });

  it('forecast range shows high and low, each independently unavailable', () => {
    expect(formatForecastRange({ tempMaxC: 20, tempMinC: 10 }, 'C', en)).toBe('High 20°C, Low 10°C');
    expect(formatForecastRange({ tempMaxC: 20 }, 'C', en)).toBe('High 20°C, Low Unavailable');
    expect(formatForecastRange({}, 'F', en)).toBe('High Unavailable, Low Unavailable');
  });
});

describe('dates and times', () => {
  const instant = new Date('2026-03-05T23:30:00Z');

  it('formats a time in a given time zone', () => {
    expect(formatTime(instant, { ...en, timeZone: 'UTC' })).toBe('11:30 PM');
    expect(formatTime(instant, { ...en, timeZone: 'Asia/Tokyo' })).toBe('8:30 AM');
  });

  // L5: half-hour and quarter-hour offsets and the two date-line extremes, by zone name.
  it.each([
    ['UTC+5:30', 'Asia/Kolkata', '5:00 AM', 'Mar 6, 2026'],
    ['UTC+5:45', 'Asia/Kathmandu', '5:15 AM', 'Mar 6, 2026'],
    ['UTC+14:00', 'Pacific/Kiritimati', '1:30 PM', 'Mar 6, 2026'],
    ['UTC-12:00', 'Etc/GMT+12', '11:30 AM', 'Mar 5, 2026'],
  ])('%s (%s): the same instant reads %s on the next/same calendar day', (_label, zone, time, date) => {
    expect(formatTime(instant, { ...en, timeZone: zone })).toBe(time);
    expect(formatDateTime(instant, { ...en, timeZone: zone })).toContain(date);
    expect(formatLastUpdated(instant, { ...en, timeZone: zone })).toBe(`Last updated ${time}`);
  });

  it('falls back to the device zone for an invalid zone name instead of throwing', () => {
    expect(() => formatTime(instant, { ...en, timeZone: 'Not/AZone' })).not.toThrow();
  });

  it('formats date and time', () => {
    expect(formatDateTime(instant, { ...en, timeZone: 'UTC' })).toContain('Mar 5, 2026');
  });

  it('forecast calendar dates do not shift with the device zone', () => {
    expect(formatForecastDate('2026-03-05', en)).toBe('Thu, Mar 5');
    expect(formatForecastDate('2026-12-31', en)).toBe('Thu, Dec 31');
  });

  it('invalid dates show Unavailable', () => {
    expect(formatForecastDate('2026-02-30', en)).toBe('Unavailable');
    expect(formatForecastDate('not a date', en)).toBe('Unavailable');
    expect(formatForecastDate(undefined, en)).toBe('Unavailable');
    expect(formatTime(undefined)).toBe('Unavailable');
    expect(formatTime(new Date(Number.NaN))).toBe('Unavailable');
    expect(formatDateTime(undefined)).toBe('Unavailable');
  });

  it('last updated and data-from text include the time', () => {
    expect(formatLastUpdated(instant, { ...en, timeZone: 'UTC' })).toBe('Last updated 11:30 PM');
    expect(formatDataFrom(instant, { ...en, timeZone: 'UTC' })).toBe('Showing data from 11:30 PM');
    expect(formatLastUpdated(undefined)).toBe('Unavailable');
    expect(formatDataFrom(undefined)).toBe('Unavailable');
  });
});

describe('message table', () => {
  it('fills placeholders and shows Unavailable for a missing parameter', () => {
    expect(message('ui.labeledValue', { label: 'A', value: 'B' })).toBe('A: B');
    expect(message('ui.labeledValue', { label: 'A' })).toBe('A: Unavailable');
  });

  it('every message is non-empty', () => {
    for (const text of Object.values(MESSAGES)) expect(text.trim().length).toBeGreaterThan(0);
  });

  it('error messages are static: no placeholders, URLs or secrets', () => {
    for (const code of APP_ERROR_CODES) {
      const text = messageForError(appError(code));
      expect(text).not.toMatch(/\{\w+\}/);
      expect(text).not.toMatch(/https?:\/\//i);
    }
  });
});

describe('UI text lives only in the message table', () => {
  it('format.ts contains no string literals other than message IDs and Intl option names', () => {
    const withoutComments = formatSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const literals = [...withoutComments.matchAll(/'([^'\\\n]*)'/g)].map((m) => m[1] ?? '');
    const allowed = new Set([
      'C',
      'F',
      'UTC',
      'numeric',
      '2-digit',
      'short',
      // Property names used in a type-level Pick, not UI text.
      'tempMaxC',
      'tempMinC',
    ]);
    const offenders = literals.filter(
      (text) => !allowed.has(text) && !/^(ui|error|condition)\.[A-Za-z.]+$/.test(text) && !/^\.\/[a-z]+$/.test(text),
    );
    expect(offenders).toEqual([]);
  });
});
