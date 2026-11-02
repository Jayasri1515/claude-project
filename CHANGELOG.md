# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

No version number has been assigned and nothing has been released or published. Everything below is in the working tree on branch `feature/weather-app`, on top of commit `50bf7d8`, and is uncommitted. Evidence for the entries: `git diff --stat HEAD` (125 tracked files changed, 19 untracked paths), `verification.md` (2026-11-02) and the files named in each entry.

## [Unreleased]

### Breaking changes

- **Saved favorites use a new storage shape, and favorites saved by the earlier version are discarded.** The stored record changes from `{ "version": 1, "favorites": [...] }` (latitude/longitude on each entry) to `{ "v": 1, "items": [...] }` (each entry has `key`, optional `providerId`, `name`, optional `admin1` and `country`, `centroid: { lat, lon }` and optional `timeZoneHint`). The new reader does not migrate the old shape. Anyone who already has saved favorites will find the list empty and will see the notice "Your saved favorites could not be read and were cleared. You can add cities again." (M-16). The next save overwrites the old record. Source: `src/core/favorites/favoritesService.ts` (header comment and `parseItem`), `src/core/messages.ts`, and the "unreadable saved favorites" browser tests in `e2e/browserApis.spec.ts`.

### Added

- **Device location is requested when the app opens.** The app asks the browser for the position at launch (this is what shows the browser permission prompt) instead of waiting for a click. "Use my location" asks again. If permission is denied, unavailable, unsupported or slow, the app shows a message and city search still works. Source: `src/core/locationFlow.ts`, `src/core/appController.ts`, `src/adapters/web/geolocation.ts`; tests in `test/core/locationFlow.test.ts`, `test/ui/location.test.tsx`.
- **Location waiting and timeout messages.** An unanswered prompt shows a waiting state with a "search for a city instead" cue. After an app-owned 10 second watchdog the app shows one of two timeout texts (M-10 with a prompt-wait hint, M-11 without). The browser's own `timeout` option is no longer passed to the Geolocation API. A change of the permission to "granted" while waiting is picked up through the Permissions API.
- **Privacy disclosure in the footer (always visible).** The footer states what is sent to Open-Meteo (the searched city and the device location rounded to two decimal places, plus the IP address), that Open-Meteo keeps server logs that may contain coordinates for 90 days, that the app does not save the device location, and that it collects no other data (M-24, footer Option A). The "Use my location" button no longer repeats it through `aria-describedby`. Source: `src/ui/Footer.tsx`, `src/core/messages.ts`; tests in `test/ui/footer.test.tsx`.
- **New error messages for specific provider failures.** Rate limit (M-05, HTTP 429 is treated as the rate-limit signal), unreadable response (M-06) and no connection (M-04) are now distinct from the generic "service unavailable" text (M-03). A request that the app itself cancels is an internal outcome and is never shown. Source: `src/adapters/openMeteo/http.ts`, `src/core/errors.ts`, `src/core/messages.ts`.
- **Retry for a failed search.** After a service, network, rate-limit, timeout or unreadable-response failure, the search panel offers Retry (M-34), which re-submits the last search text (not whatever is currently typed in the field). No Retry is offered for not-found, empty or over-long input. Source: `src/ui/SearchPanel.tsx`; tests in `test/ui/search.test.tsx` and `e2e/release.spec.ts`.
- **Search qualifiers.** Typing "City, Country" or "City, State" sends only the part before the first comma to the geocoder and filters the candidates by country or region. The comparison is case-insensitive and on the whole value ("Tex" does not match "Texas"). A qualifier that matches nothing shows the not-found message. Up to 20 candidates (`qualifiedSearchFetchLimit`) are requested for a qualified search; at most 5 are shown. Source: `src/core/search.ts`, `src/core/config.ts`; tests in `test/core/search.test.ts`.
- **Drizzle and day/night weather icons.** A drizzle condition has its own icon, and clear and partly-cloudy conditions have night variants in the current-weather card, driven by the provider's day/night flag. Clear reads "Sunny" by day and "Clear" at night, and "Clear" when the provider gives no day/night value. Forecast days always use the day form. The release bundle now includes 11 icons (`cloud-drizzle`, `cloud-moon` and `moon` are new). Source: `src/core/conditions.ts`, `scripts/scanDistLib.mjs`.
- **Build gate checks in `npm run scan:dist` (part of `npm run build:release`).** The build now fails if a service worker file or registration is present, if all JavaScript summed after gzip exceeds 200,000 bytes (`bundleBudgetGzipBytes`), or if `dist/index.html` lacks the expected Content-Security-Policy. Source: `scripts/scanDistLib.mjs`, `scripts/scanDist.mjs`, `scripts/csp.mjs`; tests in `test/security/scanDist.test.ts`, `test/security/scanDistRules.test.ts`.
- **Config values.** New validated settings: `qualifiedSearchFetchLimit`, `minViewportWidthPx` (320), `coordinateDecimals` (2), `bundleBudgetGzipBytes`, with upper limits tied to the provider's documented maximums. Source: `src/core/config.ts`.
- **Browser tests across five engines.** Playwright now runs release-build specs (`release`, `accessibility`, `layout`, `browserApis`) on Chromium, Firefox, WebKit, an emulated Pixel 7 and an emulated iPhone 14, with Open-Meteo intercepted. Shared helpers are in `e2e/support.ts`. Source: `playwright.config.ts`, `e2e/`.
- **Other new unit and contract tests.** New files include `test/core/domainModel.test.ts`, `test/core/favoritesApi.test.ts`, `test/core/messages.test.ts`, `test/security/scanDistRules.test.ts`, `test/ui/unconfigured.test.tsx` and `test/contract/` (not reviewed for this entry).
- **Supporting files.** `.env.example` (variable names only: `VITE_BASE`), `src/core/favorites/api.ts` (the approved favorites API; nothing implements it yet, see PULL_REQUEST.md), `src/ui/PickListCredit.tsx`, `src/ui/sectionFailure.ts`. Documents added to the working tree: `message-wording.md`, `provider-verification.md`, `conformance-review.md`, `test-triage.md`.

### Changed

- **The forecast now starts with today.** `forecastIncludesToday` defaults to `true` (was `false`): the three forecast days are today and the next two, and the first row is labelled "Today" (M-30). Dates are shown in the location's time zone. Previously the forecast was three days after today.
- **Weather requests are never served from the browser HTTP cache.** Every Open-Meteo request now sets `cache: 'no-store'`, so stale weather is not shown as fresh. Requests remain plain GETs with no custom headers, `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`. Source: `src/adapters/openMeteo/http.ts`.
- **Refresh behaviour.** A refresh is ignored while a search is pending, and a refresh result is applied only if the selection has not changed since it started. Source: `src/core/appController.ts`.
- **Section failures.** A failed current-weather or forecast section shows its own message with Retry (M-25, M-26); values kept from an earlier load are marked as possibly out of date (M-27). Source: `src/ui/sectionFailure.ts`, `src/core/messages.ts`.
- **Release verification runs on Playwright's bundled Chromium, Firefox and WebKit** instead of the machine's Microsoft Edge and Google Chrome. The e2e release build is served under the test-only base path `/weather-e2e/` (override with `E2E_BASE_PATH`), replacing `/claude-project/`. `npm run test:browser:release` now selects the five `release-*` projects.
- **Documentation updated** to match: `README.md`, `docs/deployment.md` (build gate, CSP, removal of the demo layer, privacy text), and the SDLC artifacts `requirements.md`, `architecture.md`, `design-review.md`, `impl-plan.md`, `verification.md`. `.gitignore` now un-ignores `.env.example`. The orchestrator agent definition `.claude/agents/sdlc-orchestrator.md` was also edited (82 insertions, 23 deletions) and is outside the app.
- **Internal naming.** The core ports and the browser and Open-Meteo adapters are now typed against `Legacy*` port names and `permissionDenied` / `positionUnavailable` error constructors. This is a staging step, not a behaviour change (see Known limitations in PULL_REQUEST.md).

### Fixed

- An old-city refresh that finishes after a new city has loaded no longer overwrites the newer selection (test: "an old-city refresh that resolves after the new city loaded never overwrites it (DR-18)" in `test/core/appController.test.ts`). I did not check whether this case already worked at HEAD.
- Unreadable provider responses are reported as "unreadable" (M-06) instead of "service unavailable".
- A cancelled request (for example superseded by a newer one) is no longer mapped to a service-unavailable error.

### Removed

- **The invented-data ("demo") mode and everything for it:** `src/dev/` (`demoComposition.ts`, `demoProviders.ts`, `prefixedStore.ts`), the scripts `dev:demo`, `build:demo` and `scan:dist:demo`, the `--allow-demo` option of the scan, `scripts/releaseGuard.mjs` and `.d.mts`, `test/security/releaseGuard.test.ts`, `test/ui/demoMode.test.tsx`, `test/ui/composition.test.tsx`, the demo notice and demo attribution texts, and the browser test harness `e2e/harness.html` and `e2e/harness.tsx`. The app now has two modes only: live, and "not set up" (no providers configured, nothing is sent). The scan keeps demo-layer markers as a regression guard, and the only build-time variable read is `VITE_BASE`.
- The Edge and Chrome (`channel`) Playwright projects and the dev-server-based feature specs that depended on demo data.
- The unapproved "data from" text (`ui.dataFrom`) and the `loadingIndicatorMaxDelayMs` setting.

### Security

- **Content-Security-Policy.** `vite build` adds a `<meta http-equiv="Content-Security-Policy">` to `dist/index.html` (not in dev): `default-src 'self'`, scripts and styles from the same origin only, and `connect-src` limited to `https://api.open-meteo.com` and `https://geocoding-api.open-meteo.com`. It is delivered as a meta tag because a static host usually cannot set headers; a meta CSP ignores `frame-ancestors`, `report-uri` and `sandbox`, so it gives no clickjacking protection. Source: `scripts/csp.mjs`, `vite.config.ts`, `docs/deployment.md`.
- **Build gate** now rejects a missing or loose CSP, a service worker and an over-budget bundle (see Added).
- **Device coordinates** are rounded to two decimals before being sent, are not written to storage, and a device location cannot be saved as a favorite (tests: `test/core/appController.test.ts`, `e2e/release.spec.ts`).
- **No cached responses.** `cache: 'no-store'` on all provider requests (see Changed).
- **Disclosure of provider logging** in the footer (see Added).

### Known limitations

- `npm run smoke:live` failed twice on 2026-11-02 for network reasons (see PULL_REQUEST.md). No evidence exists for the current adapter code against the real Open-Meteo API.
- The `Legacy*` ports are still the composed path. The approved port migration (impl-plan T-20..T-32) and the single-request weather call are not done.
- Manual checks T-70..T-75 (real devices, screen reader, zoom, Permissions API, CORS and the real rate-limit response) have not been run.
- Not released: no version, no date, nothing committed, pushed or published.
