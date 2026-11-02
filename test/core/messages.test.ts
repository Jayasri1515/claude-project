import { describe, expect, it } from 'vitest';
import { appError, PRESENTABLE_ERROR_KINDS } from '../../src/core/errors';
import { message, messageForError, MESSAGES } from '../../src/core/messages';

/**
 * The texts below are copied from message-wording.md (approved 2026-10-30, footer Option A), keyed by M-number. They
 * are deliberately NOT read from the message table, so a drift in the table fails here.
 */
describe('approved wording (message-wording.md), matched by M-number', () => {
  it.each([
    ['M-01 empty_input', 'empty_input', 'Please enter a city name.'],
    ['M-02 not_found', 'not_found', 'No matching city was found. Try a different name.'],
    ['M-03 service', 'service', 'The weather service is unavailable right now. Please try again.'],
    ['M-03 provider timeout', 'timeout', 'The weather service is unavailable right now. Please try again.'],
    ['M-04 network', 'network', 'Could not connect to the weather service. Check your internet connection and try again.'],
    ['M-05 rate_limited', 'rate_limited', 'The weather service is busy. Please wait a minute and try again.'],
    ['M-07 permission_denied', 'permission_denied', 'Location access is turned off for this site. You can search for a city instead.'],
    ['M-09 position_unavailable', 'position_unavailable', 'Your location could not be determined. You can search for a city instead.'],
    ['M-12 unsupported', 'unsupported', 'Location detection is not available in this browser. You can search for a city instead.'],
    [
      'M-15 storage_unavailable',
      'storage_unavailable',
      'Favorites cannot be saved on this device. They will be kept only until you close this page.',
    ],
  ] as const)('%s', (_id, kind, text) => {
    expect(messageForError(appError(kind))).toBe(text);
  });

  it('rate_limited has a text of its own, distinct from every other presentable kind', () => {
    const rate = messageForError(appError('rate_limited'));
    for (const kind of PRESENTABLE_ERROR_KINDS.filter((k) => k !== 'rate_limited')) {
      expect(messageForError(appError(kind)), kind).not.toBe(rate);
    }
  });

  it('other messages in use', () => {
    expect(message('ui.unavailable')).toBe('Unavailable'); // M-20, also the label for a missing forecast day
    expect(message('ui.errorBoundary')).toBe(
      'Something went wrong and this page could not be shown. Please reload the page and try again.', // M-21
    );
    expect(message('ui.favorites.empty')).toBe('No favorites yet. Search for a city and choose Add to favorites.'); // M-18
    expect(message('ui.favorites.corrupted')).toBe(
      'Your saved favorites could not be read and were cleared. You can add cities again.', // M-16
    );
    expect(message('ui.favoriteNeedsName')).toBe(
      'Your current location cannot be saved. Search for the city by name to add it to your favorites.', // M-19
    );
    expect(message('ui.footer.privacy')).toBe(
      'The city you search for and your device location (rounded to two decimal places) are sent to Open-Meteo to get the weather, along with your IP address. Open-Meteo keeps server logs that may contain coordinates for 90 days. This app does not save your device location and collects no other data: there are no analytics, cookies or tracking. Favorites and your unit choice stay on this device.', // M-24 Option A
    );
  });

  it('the old per-day forecast text and the old location disclosure are gone', () => {
    const keys = Object.keys(MESSAGES);
    expect(keys).not.toContain('ui.forecast.dayUnavailable');
    expect(keys).not.toContain('ui.location.disclosure');
    expect(keys).not.toContain('error.timeout');
  });
});
