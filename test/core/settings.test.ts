import { describe, expect, it } from 'vitest';
import { createConfig } from '../../src/core/config';
import { SETTINGS_STORAGE_KEY, SettingsService } from '../../src/core/settings';
import { InMemoryKeyValueStore } from '../fakes';

function make(store = new InMemoryKeyValueStore(), overrides = {}) {
  return { store, service: new SettingsService({ store, config: createConfig(overrides) }) };
}

describe('SettingsService', () => {
  it('defaults to the configured unit (Celsius)', () => {
    expect(make().service.getTemperatureUnit()).toBe('C');
    expect(make(undefined, { defaultTemperatureUnit: 'F' }).service.getTemperatureUnit()).toBe('F');
  });

  it('set then get', () => {
    const { service } = make();
    service.setTemperatureUnit('F');
    expect(service.getTemperatureUnit()).toBe('F');
    expect(service.storageUnavailable).toBe(false);
  });

  it('persists across a new service instance', () => {
    const { store, service } = make();
    service.setTemperatureUnit('F');
    expect(new SettingsService({ store, config: createConfig() }).getTemperatureUnit()).toBe('F');
  });

  it.each([
    ['corrupt JSON', '{nope'],
    ['unknown unit', JSON.stringify({ version: 1, temperatureUnit: 'K' })],
    ['wrong version', JSON.stringify({ version: 9, temperatureUnit: 'F' })],
    ['non-object', '"F"'],
    ['null', 'null'],
  ])('uses the default for a %s record', (_name, raw) => {
    const store = new InMemoryKeyValueStore({ [SETTINGS_STORAGE_KEY]: raw });
    const { service } = make(store);
    expect(service.getTemperatureUnit()).toBe('C');
    expect(service.storageUnavailable).toBe(false);
  });

  it('a read failure uses the default and raises the notice', () => {
    const store = new InMemoryKeyValueStore();
    store.fail.get = true;
    const { service } = make(store);
    expect(service.getTemperatureUnit()).toBe('C');
    expect(service.storageUnavailable).toBe(true);
  });

  it('a write failure still applies the choice for the session and raises the notice', () => {
    const { store, service } = make();
    store.fail.set = true;
    service.setTemperatureUnit('F');
    expect(service.getTemperatureUnit()).toBe('F');
    expect(service.storageUnavailable).toBe(true);
    store.fail.set = false;
    service.setTemperatureUnit('C');
    expect(service.storageUnavailable).toBe(false);
  });
});
