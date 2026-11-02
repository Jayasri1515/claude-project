import { describe, expect, it } from 'vitest';
import { CONDITION_CODES } from '../../src/core/domain';
import type { Current, Day, Location, Section } from '../../src/core/domain';
import { sampleCurrent, sampleForecast, sampleLocation, sampleSnapshot } from '../fixtures/domain';

describe('domain model', () => {
  it('ConditionCode includes the architecture set and UNKNOWN', () => {
    expect([...CONDITION_CODES]).toEqual([
      'CLEAR',
      'PARTLY_CLOUDY',
      'CLOUDY',
      'DRIZZLE',
      'RAIN',
      'SNOW',
      'THUNDERSTORM',
      'FOG',
      'UNKNOWN',
    ]);
  });

  it('optional fields may be omitted (compile-time check, strict mode)', () => {
    const minimalLocation: Location = {
      key: 'name:x||',
      name: 'X',
      latitude: 0,
      longitude: 0,
      source: 'device',
    };
    const emptyCurrent: Current = {};
    const emptyDay: Day = { localDate: '2026-01-02' };
    const idle: Section<Current> = { status: 'idle' };
    expect(minimalLocation.country).toBeUndefined();
    expect(emptyCurrent.tempCanonical).toBeUndefined();
    expect(emptyDay.highCanonical).toBeUndefined();
    expect(idle.updatedAt).toBeUndefined();
  });

  it('fixtures are well-formed for later tasks', () => {
    expect(sampleLocation.latitude).toBeTypeOf('number');
    expect(sampleCurrent.humidityPct).toBe(60);
    expect(sampleForecast).toHaveLength(3);
    expect(sampleSnapshot.current.status).toBe('ready');
    expect(sampleSnapshot.key).toBe(sampleLocation.key);
    expect(sampleSnapshot.label).toBe('Placeholder City, Testshire, Testland');
  });
});
