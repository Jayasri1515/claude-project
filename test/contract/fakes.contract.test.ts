import { OpenMeteoWeatherProvider } from '../../src/adapters/openMeteo/weather';
import { fixtureResponse, stubFetch } from '../support/openMeteo';
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

// The real Open-Meteo adapter is held to the same weather contract, over the recorded fixtures and a stub fetch.
weatherProviderContract('OpenMeteoWeatherProvider (recorded fixtures)', () => {
  const { fetch } = stubFetch((call) =>
    fixtureResponse(new URL(call.url).searchParams.has('daily') ? 'forecast-daily.json' : 'forecast-current.json'),
  );
  return new OpenMeteoWeatherProvider({ fetch });
});

// The fakes are held to the same contract the real adapters will be (impl-plan T-13).
weatherProviderContract('FakeWeatherProvider', () => new FakeWeatherProvider());
geocodingProviderContract('FakeGeocodingProvider', () => new FakeGeocodingProvider());
geocodingProviderContract('FakeGeocodingProvider with reverse', () => new FakeGeocodingProvider({ withReverse: true }));
locationServiceContract('FakeLocationService', () => new FakeLocationService());
keyValueStoreContract('InMemoryKeyValueStore', () => new InMemoryKeyValueStore());
clockContract('FakeClock', () => new FakeClock('2026-01-01T00:00:00Z'));
