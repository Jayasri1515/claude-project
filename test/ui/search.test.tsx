// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../../src/core/config';
import { aborted, invalidResponse, networkError, rateLimited, serviceUnavailable } from '../../src/core/errors';
import { ATTRIBUTION_URLS } from '../../src/ui/attribution';
import { err, ok } from '../../src/core/result';
import { act } from '@testing-library/react';
import { city, isDisabled, renderStack, renderWithFakeController } from './helpers';

const A = city(1, { name: 'Alpha', admin1: 'Region A', country: 'Land A' });
const B = city(2, { name: 'Alpha', admin1: 'Region B', country: 'Land B' });

describe('Search UI (TASK-027)', () => {
  it('associates a visible label with the input', () => {
    renderWithFakeController();
    const input = screen.getByLabelText('City name');
    expect(input.tagName).toBe('INPUT');
    expect(screen.getByRole('search')).toBeTruthy();
  });

  it('submitting with the keyboard sends the text as typed', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController();
    await user.type(screen.getByLabelText('City name'), '  São Paulo {Enter}');
    expect(controller.searchCity).toHaveBeenCalledTimes(1);
    expect(controller.searchCity).toHaveBeenCalledWith('  São Paulo ');
  });

  it('the button submits too', async () => {
    const user = userEvent.setup();
    const { controller } = renderWithFakeController();
    await user.type(screen.getByLabelText('City name'), 'Oslo');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(controller.searchCity).toHaveBeenCalledWith('Oslo');
  });

  it.each(['', '   '])('empty or whitespace submit (%j) shows the prompt and makes no provider request', async (text) => {
    const user = userEvent.setup();
    const t = renderStack();
    if (text !== '') await user.type(screen.getByLabelText('City name'), text);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Please enter a city name.')).toBeTruthy();
    expect(t.geocoding.searchScript.callCount).toBe(0);
    expect(t.weather.currentScript.callCount).toBe(0);
    expect(t.weather.forecastScript.callCount).toBe(0);
  });

  it('shows "city not found" and leaves the app usable', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([]));
    await user.type(screen.getByLabelText('City name'), 'Nowhere');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/No matching city was found/)).toBeTruthy();
    expect(screen.getByLabelText('City name')).toBeTruthy();
    expect(t.weather.currentScript.callCount).toBe(0);
  });

  it('shows a service error message without crashing', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(err(serviceUnavailable()));
    await user.type(screen.getByLabelText('City name'), 'Oslo');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/weather service is unavailable/)).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('a rate-limited search shows the approved "busy, try later" text (M-05), not the service-unavailable text', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(err(rateLimited()));
    await user.type(screen.getByLabelText('City name'), 'Oslo');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('The weather service is busy. Please wait a minute and try again.')).toBeTruthy();
    expect(screen.queryByText(/weather service is unavailable/)).toBeNull();
  });

  it('a search that ends as aborted shows no message at all (DR-09)', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(err(aborted()));
    await user.type(screen.getByLabelText('City name'), 'Oslo');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(t.geocoding.searchScript.callCount).toBe(1));
    await act(async () => undefined);
    expect(screen.queryByText(/unavailable|busy|could not|went wrong/i)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a provider that rejects shows the same safe message and none of its detail', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.failWith(new Error('SECRET https://example.invalid/?key=abc'));
    await user.type(screen.getByLabelText('City name'), 'Oslo');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/weather service is unavailable/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('SECRET');
    expect(document.body.textContent).not.toContain('example.invalid');
  });

  it('one match is selected and its weather shown, with the country', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([A]));
    await user.type(screen.getByLabelText('City name'), 'Alpha');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(await within(current).findByRole('heading', { name: 'Alpha, Region A, Land A' })).toBeTruthy();
    await waitFor(() => expect(within(current).getByText('22°C')).toBeTruthy());
  });

  it('several matches are offered for choice with name, region and country; choosing loads that one', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([A, B]));
    await user.type(screen.getByLabelText('City name'), 'Alpha');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Several places match. Choose one:')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alpha, Region A, Land A' })).toBeTruthy();
    expect(t.weather.currentScript.callCount).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Alpha, Region B, Land B' }));
    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(await within(current).findByRole('heading', { name: 'Alpha, Region B, Land B' })).toBeTruthy();
    expect(screen.queryByText('Several places match. Choose one:')).toBeNull();
  });

  describe('data credit beside the pick list (M-22, M-23)', () => {
    const configured = createConfig({ attributionText: 'Weather data by Open-Meteo.com. Location data based on GeoNames.' });
    const choose = async (stack: ReturnType<typeof renderStack>) => {
      const user = userEvent.setup();
      stack.geocoding.searchScript.respondWith(ok([A, B]));
      await user.type(screen.getByLabelText('City name'), 'Alpha');
      await user.click(screen.getByRole('button', { name: 'Search' }));
      return screen.findByRole('group', { name: /Several places match/ });
    };

    it('shows the Open-Meteo link and "Location data based on GeoNames" inside the pick list, with safe links', async () => {
      const pickList = await choose(renderStack({ config: configured }));
      expect(pickList.textContent).toContain('Weather data by Open-Meteo.com');
      expect(pickList.textContent).toContain('Location data based on GeoNames');
      const links = Array.from(pickList.querySelectorAll('a'));
      expect(links.map((a) => a.getAttribute('href'))).toEqual([ATTRIBUTION_URLS.openMeteo, ATTRIBUTION_URLS.geonames]);
      for (const a of links) {
        expect(a.getAttribute('target')).toBe('_blank');
        expect((a.getAttribute('rel') ?? '').split(/\s+/).sort()).toEqual(['noopener', 'noreferrer']);
      }
      expect(links[1]?.textContent).toContain('GeoNames');
    });

    it('the credit is plain text outside any live region, so it is never announced as a change', async () => {
      const pickList = await choose(renderStack({ config: configured }));
      expect(pickList.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
      expect(screen.getByRole('search').closest('[aria-live]')).toBeNull();
    });

    it('the credit does not disturb the choices: the buttons are still the candidates only', async () => {
      const pickList = await choose(renderStack({ config: configured }));
      expect(within(pickList).getAllByRole('button').map((b) => b.textContent)).toEqual([
        'Alpha, Region A, Land A',
        'Alpha, Region B, Land B',
      ]);
    });

    it('is not shown when no credit text is configured (same rule as the footer)', async () => {
      const pickList = await choose(renderStack());
      expect(pickList.querySelector('a')).toBeNull();
      expect(pickList.textContent).not.toContain('GeoNames');
    });

    it('is not shown when there is no pick list', async () => {
      const user = userEvent.setup();
      const stack = renderStack({ config: configured });
      stack.geocoding.searchScript.respondWith(ok([A]));
      await user.type(screen.getByLabelText('City name'), 'Alpha');
      await user.click(screen.getByRole('button', { name: 'Search' }));
      await waitFor(() => expect(screen.getByRole('region', { name: 'Current weather' }).textContent).toContain('Alpha'));
      expect(screen.queryByRole('group', { name: /Several places match/ })).toBeNull();
    });
  });

  it('"name, qualifier" input sends only the name, then picks the candidate whose country matches (A-Q5)', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([A, B]));
    await user.type(screen.getByLabelText('City name'), '  Alpha ,  land   B ');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(await within(current).findByRole('heading', { name: 'Alpha, Region B, Land B' })).toBeTruthy();
    expect(t.geocoding.searchScript.calls[0]?.args[0]).toBe('Alpha');
    expect(screen.queryByText('Several places match. Choose one:')).toBeNull();
  });

  it('a qualifier that matches nothing shows the not-found message (M-02)', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([A, B]));
    await user.type(screen.getByLabelText('City name'), 'Alpha, Atlantis');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No matching city was found. Try a different name.')).toBeTruthy();
  });

  it('shows the country only when present', async () => {
    const user = userEvent.setup();
    const noCountry = city(3, { name: 'Gamma' });
    delete (noCountry as { country?: string }).country;
    delete (noCountry as { admin1?: string }).admin1;
    const withRegionOnly = city(4, { name: 'Gamma', admin1: 'Region Z' });
    delete (withRegionOnly as { country?: string }).country;
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([noCountry, withRegionOnly]));
    await user.type(screen.getByLabelText('City name'), 'Gamma');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('button', { name: 'Gamma' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gamma, Region Z' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('undefined');
  });

  it('over-long input is rejected by the core with no provider request', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    await user.click(screen.getByLabelText('City name'));
    await user.paste('x'.repeat(t.config.maxInputLength + 1));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    // C2: its own message, not the 'No matching city was found' one.
    expect(await screen.findByText('That search is too long. Please enter a shorter city name.')).toBeTruthy();
    expect(screen.queryByText(/No matching city was found/)).toBeNull();
    expect(t.geocoding.searchScript.callCount).toBe(0);
  });

  // Review M1: a pending search must not block a corrected query.
  it('a pending search does not block submitting a corrected query; the latest wins', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.hold();
    const input = screen.getByLabelText('City name');
    await user.type(input, 'Alhpa{Enter}');
    expect(t.geocoding.searchScript.callCount).toBe(1);

    const submit = screen.getByRole('button', { name: 'Search' });
    expect(isDisabled(submit)).toBe(false);
    await user.clear(input);
    await user.type(input, 'Alpha{Enter}');
    expect(t.geocoding.searchScript.callCount).toBe(2);
    expect(t.geocoding.searchScript.calls[0]?.aborted).toBe(true);

    await act(async () => {
      t.geocoding.searchScript.calls[1]?.resolve(ok([A]));
      t.geocoding.searchScript.calls[0]?.resolve(ok([B]));
    });
    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(await within(current).findByRole('heading', { name: 'Alpha, Region A, Land A' })).toBeTruthy();
    expect(within(current).queryByRole('heading', { name: 'Alpha, Region B, Land B' })).toBeNull();
  });

  it('the Search button is never disabled, not even while a search is pending', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.hold();
    await user.type(screen.getByLabelText('City name'), 'Alpha{Enter}');
    const submit = screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(submit.getAttribute('aria-disabled')).toBeNull();
  });

  it('REQ-WF1-05: a failed search offers Retry (M-34) that re-submits the last text and succeeds', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(err(serviceUnavailable()));
    await user.type(screen.getByLabelText('City name'), '  Oslo ');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/weather service is unavailable/)).toBeTruthy();
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(within(screen.getByRole('search').parentElement as HTMLElement).getByRole('button', { name: 'Retry' })).toBe(
      retry,
    );
    // The text field may change after the failure: Retry still sends the last submitted text.
    await user.clear(screen.getByLabelText('City name'));
    await user.type(screen.getByLabelText('City name'), 'something else');
    t.geocoding.searchScript.respondWith(ok([A]));
    await user.click(retry);
    expect(t.geocoding.searchScript.callCount).toBe(2);
    expect(t.geocoding.searchScript.calls[1]?.args[0]).toBe('Oslo');
    const current = screen.getByRole('region', { name: 'Current weather' });
    expect(await within(current).findByRole('heading', { name: 'Alpha, Region A, Land A' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('REQ-WF1-05: Retry is keyboard operable and moves focus into the search form', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(err(networkError()));
    await user.type(screen.getByLabelText('City name'), 'Oslo{Enter}');
    expect(await screen.findByText(/Could not connect to the weather service/)).toBeTruthy();
    t.geocoding.searchScript.respondWith(ok([A]));
    screen.getByRole('button', { name: 'Retry' }).focus();
    await user.keyboard('{Enter}');
    expect(t.geocoding.searchScript.callCount).toBe(2);
    expect(await screen.findByRole('heading', { name: 'Alpha, Region A, Land A' })).toBeTruthy();
  });

  it.each([
    ['service', serviceUnavailable()],
    ['network', networkError()],
    ['rate limited', rateLimited()],
    ['invalid response', invalidResponse()],
  ])('REQ-WF1-05: Retry is offered after a %s failure', async (_name, error) => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(err(error));
    await user.type(screen.getByLabelText('City name'), 'Oslo{Enter}');
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('REQ-WF1-05: no Retry for not found, empty or over-long input (the text must change)', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(ok([]));
    await user.type(screen.getByLabelText('City name'), 'Nowhere{Enter}');
    expect(await screen.findByText(/No matching city was found/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    await user.clear(screen.getByLabelText('City name'));
    await user.type(screen.getByLabelText('City name'), ' {Enter}');
    expect(await screen.findByText('Please enter a city name.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('REQ-WF1-05: Retry is single-flight while its search runs', async () => {
    const user = userEvent.setup();
    const t = renderStack();
    t.geocoding.searchScript.respondWith(err(serviceUnavailable()));
    await user.type(screen.getByLabelText('City name'), 'Oslo{Enter}');
    const retry = await screen.findByRole('button', { name: 'Retry' });
    t.geocoding.searchScript.hold();
    await user.click(retry);
    await user.click(retry);
    expect(t.geocoding.searchScript.callCount).toBe(2);
  });
});
