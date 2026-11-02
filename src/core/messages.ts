/**
 * Central English message table (architecture 4.9, NFR-008, A-006).
 *
 * Every user-visible string lives here. Code elsewhere refers to a message ID
 * and never embeds UI text, so localization is a change in this one place.
 * Templates use {name} placeholders that `message()` fills from `params`.
 * Error messages are static and have no placeholders (NFR-006).
 */
import type { AppError, MessageKey } from './errors';

/** Text for every AppError message key. Typed so a missing entry fails typecheck. */
const ERROR_MESSAGES: Readonly<Record<MessageKey, string>> = {
  'error.emptyInput': 'Please enter a city name.',
  'error.inputTooLong': 'That search is too long. Please enter a shorter city name.',
  // Texts below are message-wording.md, approved 2026-10-30, matched by M-number.
  'error.notFound': 'No matching city was found. Try a different name.', // M-02
  'error.serviceUnavailable': 'The weather service is unavailable right now. Please try again.', // M-03 (also a provider timeout)
  'error.network': 'Could not connect to the weather service. Check your internet connection and try again.', // M-04
  'error.rateLimited': 'The weather service is busy. Please wait a minute and try again.', // M-05
  'error.invalidResponse': 'The weather service sent a response this app could not read. Please try again later.', // M-06
  // Device-location texts (M-07, M-09, M-10, M-11, M-12).
  'error.locationDenied': 'Location access is turned off for this site. You can search for a city instead.',
  'error.locationUnavailable':
    'Your location could not be determined. You can search for a city instead.',
  'error.locationTimeout':
    'Finding your location took too long. You can search for a city instead, or choose Use my location to try again.',
  'error.locationTimeoutPromptPending':
    'Finding your location took too long. Your browser may still be waiting for your answer to its location prompt. You can search for a city instead, or choose Use my location to try again.',
  'error.locationUnsupported': 'Location detection is not available in this browser. You can search for a city instead.',
  // M-15
  'error.storageUnavailable': 'Favorites cannot be saved on this device. They will be kept only until you close this page.',
};

const UI_MESSAGES = {
  'ui.unavailable': 'Unavailable',
  'ui.currentLocation': 'Current location',

  'ui.label.temperature': 'Temperature',
  'ui.label.humidity': 'Humidity',
  'ui.label.condition': 'Condition',
  'ui.labeledValue': '{label}: {value}',

  'ui.temperatureC': '{value}°C',
  'ui.temperatureF': '{value}°F',
  'ui.humidity': '{value}%',
  'ui.forecastHigh': 'High {value}',
  'ui.forecastLow': 'Low {value}',
  'ui.forecastRange': '{high}, {low}',

  // M-31, M-32, M-33 (U4): one line when both sections share a fetch time, else one labelled line per section.
  'ui.lastUpdated': 'Updated {time}',
  'ui.currentUpdated': 'Current weather updated {time}',
  'ui.forecastUpdated': 'Forecast updated {time}',
  // M-30
  'ui.forecast.today': 'Today',
  // M-25, M-26 (one weather section unreadable while the other is fine) and M-27 (a refresh failed, earlier data kept).
  'ui.current.loadFailed': 'Current weather could not be loaded. Please try again.',
  'ui.forecast.loadFailed': 'The forecast could not be loaded. Please try again.',
  'ui.refreshFailedStale': 'Could not refresh. The weather shown may be out of date.',

  'ui.favoriteDuplicate': 'This city is already in your favorites.',
  'ui.favoriteLimitReached': 'Your favorites list is full. Remove one to add another.',
  // M-19
  'ui.favoriteNeedsName':
    'Your current location cannot be saved. Search for the city by name to add it to your favorites.',
  'ui.favoriteNothingSelected': 'Choose a city before adding it to favorites.',
  'ui.settingsNotSaved': 'Your temperature unit will not be remembered on this device.',
  // Not an approved message: used by the controller when an intent throws unexpectedly (not the error boundary, M-21).
  'ui.unexpectedError': 'Something went wrong. Please try again.',
  // M-21
  'ui.errorBoundary': 'Something went wrong and this page could not be shown. Please reload the page and try again.',

  // ---- UI layer (TASK-026 to TASK-034) ----
  'ui.app.title': 'Weather',
  'ui.notConfigured.heading': 'Weather is not set up yet',
  'ui.notConfigured.body':
    'No weather data source is configured for this build, so no weather can be shown.',
  'ui.nav.label': 'Sections',
  'ui.nav.search': 'Search',
  'ui.nav.current': 'Current weather',
  'ui.nav.forecast': 'Forecast',
  'ui.nav.favorites': 'Favorites',

  'ui.place.name': '{name}',
  'ui.place.nameCountry': '{name}, {country}',
  'ui.place.nameRegion': '{name}, {region}',
  'ui.place.nameRegionCountry': '{name}, {region}, {country}',

  'ui.search.heading': 'Search for a city',
  'ui.search.label': 'City name',
  'ui.search.submit': 'Search',
  'ui.search.chooseHeading': 'Several places match. Choose one:',

  'ui.location.button': 'Use my location',
  // M-13 (requesting), M-14 (DR-20 cue, shown whenever M-13 is) and M-08 (hint under M-07), message-wording.md.
  'ui.location.locating': 'Detecting your location...',
  'ui.location.searchInstead': 'Taking a while? You can search for a city instead.',
  'ui.location.deniedHint':
    'To use your location, allow location access for this site in your browser settings, then choose Use my location.',

  'ui.current.heading': 'Current weather',
  'ui.current.empty': 'Search for a city or use your location to see the weather.',
  'ui.current.updating': 'Updating...',
  'ui.current.notLoaded': 'Current weather has not loaded yet. Use {refresh} to try again.',

  'ui.forecast.heading': 'Forecast',
  'ui.forecast.empty': 'The forecast appears here once a city is chosen.',
  'ui.forecast.notLoaded': 'The forecast has not loaded yet. Use {refresh} to try again.',

  'ui.loading': 'Loading...',
  'ui.status.searching': 'Searching...',
  'ui.status.loadingWeather': 'Loading weather...',
  'ui.status.refreshing': 'Refreshing weather...',
  'ui.status.label': 'Status',
  'ui.dismiss': 'Dismiss',
  'ui.retry': 'Retry',
  'ui.tryAgain': 'Try again',
  'ui.refresh': 'Refresh',

  'ui.favorites.heading': 'Favorites',
  'ui.favorites.add': 'Add to favorites',
  'ui.favorites.alreadyAdded': 'This city is in your favorites.',
  // M-16
  'ui.favorites.corrupted': 'Your saved favorites could not be read and were cleared. You can add cities again.',
  'ui.favorites.empty': 'No favorites yet. Search for a city and choose Add to favorites.', // M-18
  'ui.favorites.select': 'Show weather for {place}',
  'ui.favorites.remove': 'Remove {place} from favorites',
  'ui.favorites.removeShort': 'Remove',
  'ui.favorites.showingMarker': 'Showing',

  'ui.unit.legend': 'Temperature unit',
  'ui.unit.celsius': '°C',
  'ui.unit.fahrenheit': '°F',

  // ---- Footer: data-source credit (TASK-025) and notices ----
  // The Open-Meteo wording is the sample on https://open-meteo.com/en/licence ("Weather data by Open-Meteo.com");
  // the GeoNames wording is the credit on https://open-meteo.com/en/docs/geocoding-api ("Location data based on GeoNames").
  'ui.attribution.weather': 'Weather data by Open-Meteo.com',
  'ui.attribution.geonames': 'GeoNames',
  // M-23 beside the pick list (M-41); {geonames} is the linked word.
  'ui.attribution.geonamesLine': 'Location data based on {geonames}',
  'ui.attribution.text': '{weather}. Location data based on {geonames}.',
  'ui.attribution.licenceName': 'CC BY 4.0',
  'ui.attribution.licenceLine':
    'Data licence: {licence}. Changes: values are rounded and conditions are simplified.',
  'ui.footer.notices': 'Third-party notices',
  // M-24, footer Option A, exactly as approved (message-wording.md, 2026-10-30). Always visible text in the footer.
  'ui.footer.privacy':
    'The city you search for and your device location (rounded to two decimal places) are sent to Open-Meteo to get the weather, along with your IP address. Open-Meteo keeps server logs that may contain coordinates for 90 days. This app does not save your device location and collects no other data: there are no analytics, cookies or tracking. Favorites and your unit choice stay on this device.',
  'ui.link.newTab': '(opens in a new tab)',

  // M-44: Sunny for clear by day and for every forecast day; Clear at night or when the day/night flag is absent.
  'condition.sunny': 'Sunny',
  'condition.clear': 'Clear',
  'condition.partlyCloudy': 'Partly cloudy',
  'condition.cloudy': 'Cloudy',
  'condition.drizzle': 'Drizzle',
  'condition.rain': 'Rain',
  'condition.snow': 'Snow',
  'condition.thunderstorm': 'Thunderstorm',
  'condition.fog': 'Fog',
  'condition.unknown': 'Unknown conditions',
} as const;

export const MESSAGES = { ...ERROR_MESSAGES, ...UI_MESSAGES } as const;

export type MessageId = keyof typeof MESSAGES;
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Resolve a message ID, filling {placeholders} from `params`. A placeholder
 * with no supplied value renders as the "Unavailable" text, never as blank,
 * "undefined" or a raw "{name}".
 */
export function message(id: MessageId, params: MessageParams = {}): string {
  return MESSAGES[id].replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    return value === undefined ? MESSAGES['ui.unavailable'] : String(value);
  });
}

/** Total over MessageKey: every AppError key has text. */
export function messageForKey(key: MessageKey): string {
  return message(key);
}

/**
 * User-safe text for an AppError, or `undefined` for the internal `aborted` outcome, which is never shown to the user
 * (DR-09). A caller that renders the result renders nothing for `aborted`.
 */
export function messageForError(error: AppError): string | undefined {
  return error.kind === 'aborted' ? undefined : message(error.messageKey);
}
