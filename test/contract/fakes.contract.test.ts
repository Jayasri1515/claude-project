import {
  FakeClock,
  FakeGeocodingProvider,
  FakeLocationService,
  FakeWeatherProvider,
  InMemoryKeyValueStore,
} from '../fakes';
import {
  clockContract,
  geocodingProviderContract,
  keyValueStoreContract,
  locationServiceContract,
  weatherProviderContract,
} from './portContracts';

// The fakes are held to the same contract the real adapters will be (impl-plan T-13).
weatherProviderContract('FakeWeatherProvider', () => new FakeWeatherProvider());
geocodingProviderContract('FakeGeocodingProvider', () => new FakeGeocodingProvider());
geocodingProviderContract('FakeGeocodingProvider with reverse', () => new FakeGeocodingProvider({ withReverse: true }));
locationServiceContract('FakeLocationService', () => new FakeLocationService());
keyValueStoreContract('InMemoryKeyValueStore', () => new InMemoryKeyValueStore());
clockContract('FakeClock', () => new FakeClock('2026-01-01T00:00:00Z'));
