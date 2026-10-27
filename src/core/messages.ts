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
  'error.notFound': 'City not found. Check the spelling and try again.',
  'error.serviceUnavailable': 'The weather service is unavailable right now. Please try again.',
  'error.network': 'The weather service could not be reached. Check your connection and try again.',
  'error.timeout': 'The request took too long. Please try again.',
  'error.locationDenied': 'Location access was denied. You can search for a city instead.',
  'error.locationUnavailable':
    'Your location could not be determined. You can search for a city instead.',
  'error.storageUnavailable': 'Favorites may not be saved on this device.',
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

  'ui.lastUpdated': 'Last updated {time}',
  'ui.dataFrom': 'Showing data from {time}',

  'ui.favoriteDuplicate': 'This city is already in your favorites.',
  'ui.favoriteLimitReached': 'Your favorites list is full. Remove one to add another.',
  'ui.favoriteNeedsName': 'Search for the city by name to save it as a favorite.',
  'ui.favoriteNothingSelected': 'Choose a city before adding it to favorites.',
  'ui.settingsNotSaved': 'Your temperature unit will not be remembered on this device.',
  'ui.unexpectedError': 'Something went wrong. Please try again.',

  // ---- UI layer (TASK-026 to TASK-034) ----
  'ui.app.title': 'Weather',
  'ui.demoNotice':
    'Demo mode: the weather and places shown are made-up sample data, not real weather. Favorites saved here are kept separate from real use.',
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
  // Open-Meteo's terms (https://open-meteo.com/en/terms, read 2026-10-27) say it may collect IP addresses and keeps
  // web server logs that may contain coordinates, deleted after 90 days. Kept short and neutral on purpose.
  'ui.location.disclosure':
    'The weather service receives the text you search for, the location used for the weather (rounded to two decimal places) and your IP address, and may log requests. This app does not save your device location.',
  'ui.location.locating': 'Finding your location...',
  // Shown INSTEAD of the disclosure in demo mode, where nothing is sent to any weather service.
  'ui.location.demoNote':
    'Demo mode: nothing you type is sent to a weather service, and your device location is not used.',

  'ui.current.heading': 'Current weather',
  'ui.current.empty': 'Search for a city or use your location to see the weather.',
  'ui.current.updating': 'Updating...',
  'ui.current.notLoaded': 'Current weather has not loaded yet. Use {refresh} to try again.',

  'ui.forecast.heading': 'Forecast',
  'ui.forecast.empty': 'The forecast appears here once a city is chosen.',
  'ui.forecast.dayUnavailable': 'Forecast unavailable for this day',
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
  'ui.favorites.empty': 'No favorites yet.',
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
  'ui.attribution.text': '{weather}. Location data based on {geonames}.',
  'ui.attribution.licenceName': 'CC BY 4.0',
  'ui.attribution.licenceLine':
    'Data licence: {licence}. Changes: values are rounded and conditions are simplified.',
  'ui.attribution.demo':
    'Demo mode: the data shown is made-up sample data. It is not from Open-Meteo or GeoNames.',
  'ui.footer.notices': 'Third-party notices',
  'ui.link.newTab': '(opens in a new tab)',

  'condition.clear': 'Clear',
  'condition.partlyCloudy': 'Partly cloudy',
  'condition.cloudy': 'Cloudy',
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

/** User-safe text for an AppError. */
export function messageForError(error: AppError): string {
  return message(error.messageKey);
}
