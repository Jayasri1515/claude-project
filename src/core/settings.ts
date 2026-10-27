/**
 * Settings Service (C8, architecture 4.8; FR-016, FR-017, ODD-2).
 *
 * Holds the temperature unit preference and persists it through KeyValueStore.
 * Storage failure is non-blocking: the choice still applies for the session and
 * `storageUnavailable` is raised.
 */
import type { Config } from './config';
import type { TemperatureUnit } from './domain';
import type { KeyValueStore } from './ports';

export const SETTINGS_STORAGE_KEY = 'weather-app.settings';
export const SETTINGS_RECORD_VERSION = 1;

export interface SettingsServiceDeps {
  readonly store: KeyValueStore;
  readonly config: Pick<Config, 'defaultTemperatureUnit'>;
}

function isUnit(value: unknown): value is TemperatureUnit {
  return value === 'C' || value === 'F';
}

export class SettingsService {
  private readonly store: KeyValueStore;
  private unit: TemperatureUnit;
  private storageProblem = false;

  /** Loads the stored preference. Missing, corrupt or unknown records give the default. */
  constructor(deps: SettingsServiceDeps) {
    this.store = deps.store;
    this.unit = deps.config.defaultTemperatureUnit;
    this.load();
  }

  getTemperatureUnit(): TemperatureUnit {
    return this.unit;
  }

  setTemperatureUnit(unit: TemperatureUnit): void {
    this.unit = unit;
    const written = this.store.set(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: SETTINGS_RECORD_VERSION, temperatureUnit: unit }),
    );
    this.storageProblem = !written.ok;
  }

  get storageUnavailable(): boolean {
    return this.storageProblem;
  }

  private load(): void {
    const read = this.store.get(SETTINGS_STORAGE_KEY);
    if (!read.ok) {
      this.storageProblem = true;
      return;
    }
    if (read.value === undefined) return;
    try {
      const parsed: unknown = JSON.parse(read.value);
      if (typeof parsed !== 'object' || parsed === null) return;
      const record = parsed as Record<string, unknown>;
      if (record['version'] === SETTINGS_RECORD_VERSION && isUnit(record['temperatureUnit'])) {
        this.unit = record['temperatureUnit'];
      }
    } catch {
      // corrupt record: keep the default
    }
  }
}
