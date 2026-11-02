# Weather application

A responsive web single-page app (TypeScript, React, Vite) that shows current weather and a 3-day forecast for a searched city or the device location, with refresh and saved favorites. Requirements: `requirements.md`. Design: `architecture.md`. Task list and status: `impl-plan.md`.

**Current state (read this first).** A normal build (`npm run dev`, `npm run build`) talks to the real **Open-Meteo** APIs (no API key; search and forecast over HTTPS) since 2026-10-27. Device-location weather is shown as "Current location" and cannot be saved as a favorite, because Open-Meteo has no reverse-geocoding endpoint. The footer shows the data-source credit that Open-Meteo's licence (CC BY 4.0) asks for, plus a GeoNames credit and a link to the third-party notices, and a short linked credit line "Weather data by Open-Meteo.com" also sits **inside the Current weather and Forecast panels**, next to the data (implemented 2026-10-27, not yet reviewed). `Config.attributionText` gates all of them: they appear only when it is non-empty (a normal build sets it), and the in-panel lines only while that panel has real data. Whether Open-Meteo itself accepts this reading of "next to" is not confirmed with them. Weather icons are Lucide (ISC licence; 11 icons are bundled; the licence text and the notices for React, React DOM and Scheduler ship as `THIRD_PARTY_NOTICES.txt` in the built site). The footer always shows the approved privacy disclosure (message M-24, footer Option A, `ui.footer.privacy`; the "Use my location" button is described by it): the searched city and the device location (rounded to two decimal places) are sent to Open-Meteo along with the IP address, Open-Meteo keeps server logs that may contain coordinates for 90 days (from its terms, https://open-meteo.com/en/terms, read 2026-10-27), this app does not save the device location, and it collects no other data. Requests are made with `referrerPolicy: 'no-referrer'`, so the page address is not sent as a Referer. The former invented-data ("demo") mode and its code were removed in impl-plan T-14: the app has two modes, live (the real Open-Meteo adapters) and not-configured (no providers; the page says so and offers no data). **This branch is not release-ready and is not complete against `impl-plan.md`.** Latest recorded results (`verification.md`, 2026-11-02): 1439 unit tests in 54 files pass; typecheck and lint are clean; `npm run build:release` passes and `scan:dist` reports no findings; 270 Playwright tests pass (54 tests on each of 5 engine projects); `npm run smoke:live` passes 3 of 3 against the real Open-Meteo API. Still open: the manual checks T-70..T-75 have not been run (no real location prompt, screen reader, Firefox/Safari or real-device check); the Phase 2 port migration (T-20..T-32) is unfinished, and the legacy `Legacy*` ports are still in use; the browser suites for T-61..T-64 are only partly covered (for example no browser test of Refresh, the unit toggle, section Retry or the cache mode); CORS from a deployed https origin is unchecked; no hosting provider is chosen and nothing is authorized to be published.

**CORS status (important for deployment).** Open-Meteo's documentation does not mention CORS. It has been observed working only (a) from the built app in real Edge and Chrome served from `http://localhost`, and (b) with `curl`, by reading response headers: a GET with `Origin: https://example.github.io` returns `access-control-allow-origin: *` on both API hosts (checked 2026-10-27). It has **not** been checked from the real deployed origin (for example the GitHub Pages address); do that after deployment. **Do not add any custom request header** (an API key header, `Content-Type: application/json`, and so on) to the Open-Meteo requests: a header like that makes the browser send a preflight (OPTIONS) request, and the geocoding host rejects it (`OPTIONS` returned HTTP 404 by `curl` on 2026-10-27), which would break city search in browsers. The adapters send plain GETs with no custom headers (`referrerPolicy: 'no-referrer'` is a request option, not a header the page adds, and does not cause a preflight); `test/adapters/openMeteo/geocoding.test.ts` and `weather.test.ts` assert that no headers are set and the policy is `no-referrer`. On 2026-10-27 a one-off check in real Chrome, with a page served from `http://localhost` and the adapters' exact options (`GET`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`), got HTTP 200 JSON from both live hosts with no Referer and only the browser's default headers; `npm run smoke:live` (Node) also passed with the option.

**Hosting path (GitHub Pages project site).** The repository is expected to be `Jayasri1515/claude-project`, so a GitHub Pages project site would be served under a sub-path. The expected URL is `https://jayasri1515.github.io/claude-project/` (**expected, unverified, and NOT deployed**: nothing has been published and no remote was touched). The Vite `base` comes from the environment variable `VITE_BASE` (default `/`, see `.env.example` and `scripts/baseUrl.mjs`); for a project site set it at build time, for example `VITE_BASE=/claude-project/ npm run build:release`. The default for a real deployment is still to be decided (impl-plan T-10 note). Publishing requires the user's explicit authorization; see `docs/deployment.md`.

## Set up and run

Requirements: Node.js and npm (developed with Node v24 and npm 11; other versions untested).

```
npm install
npm run dev           # dev server: the real app over the live Open-Meteo APIs; prints a local URL
```


## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Type check, then the plain production build into `dist/` (base `/` by default; `VITE_BASE` sets it, see above) |
| `npm run build:release` | **The release path.** `npm run build`, then `npm run scan:dist`; fails on any finding, including markers of the removed invented-data layer. Use this, not `build`, for anything that may be deployed |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit, component (jsdom) and scenario tests. No browser and no network; the Open-Meteo adapters run on recorded responses in `test/fixtures/openmeteo` |
| `npm run smoke:live` | **Manual only, makes 3 real requests to Open-Meteo** (one search, current weather, a 3-day forecast) through the real adapters and checks that the real responses parse. Not part of `npm test`; do not run it in a loop or in CI (the free API is for non-commercial use with request limits) |
| `npm run lint` | ESLint |
| `npm run test:browser` | Playwright checks in the browsers Playwright downloads itself (Chromium, Firefox, WebKit; desktop and two emulated phones; `npx playwright install chromium firefox webkit`). It runs `npm run build:release` then `vite preview` on port 4174 (served under `/weather-e2e/`, a test-only base) for `e2e/release.spec.ts`: the real app, with the two Open-Meteo hosts intercepted and answered from recorded responses, never the live API, and no console errors. It overwrites `dist/`. The feature specs that needed the removed invented-data server were retired in T-14 and are rebuilt in T-60/T-61 (`test-triage.md`) |
| `npm run test:browser:release` | Only the release projects of `test:browser` (currently the same set) |
| `npm run scan:dist` | Scan of `dist/` as a **release** bundle: credential-like text, non-HTTPS URLs, and markers of the removed invented-data layer (a `demo*` chunk file name, symbols such as `composeDemo`, the `demo:` storage prefix, the old invented place names; a regression guard), all of which fail it, as does a file it cannot read. It also fails if the bundled Lucide icons are not exactly the pinned set of 11 (`EXPECTED_ICONS` in `scripts/scanDistLib.mjs`, tied to `src/ui/weatherIcons.ts` by a test), if more than 16 are found, or if Lucide code is present but the detection finds no icon (a stale pattern is a failure, not a pass); and if `THIRD_PARTY_NOTICES.txt` lacks a notice (name, installed version, licence text) for any runtime package: `lucide-react` (ISC, with the Feather MIT notice), `react`, `react-dom`, `scheduler`. It prints the icons it found. `build:release` runs it for you. It is a pattern scan, not proof: see `docs/deployment.md` for what it cannot catch |

`npm install` of `@playwright/test` does not download browsers; run `npx playwright install chromium firefox webkit` once before `test:browser`. Real Edge, Chrome and Safari and real phones are manual checks.

## Layout of the code

- `src/core/` platform-neutral logic: services, controller, store, config, message table. No browser or provider code.
- `src/adapters/web/` browser adapters (localStorage, Geolocation).
- `src/ui/` React components. They render store state and send intents; they never call adapters.
- `src/adapters/openMeteo/` the Open-Meteo search and weather adapters and the weather-code table (HTTPS only, no key, input percent-encoded).
- `src/composition.ts` wires everything; `composeLive` (used by a normal build) wires the Open-Meteo adapters; mode is `live` (providers injected) or `unconfigured` (only `compose()` called with no providers, e.g. in tests).
- `public/` files copied unchanged into the built site: `THIRD_PARTY_NOTICES.txt` (Lucide ISC licence text, Open-Meteo and GeoNames credit). After changing the `lucide-react` version, refresh it (`test/security/notices.test.ts` fails until you do).
- `test/` tests and the port fakes (`test/fakes/`); `e2e/` real-browser specs; `scripts/` the bundle scan, secret scanner, the regression markers for the removed invented-data layer, and the `base` resolver (`baseUrl.mjs`).

## Configuration keys (`src/core/config.ts`)

All values are in one typed, validated object (`createConfig` rejects bad values). The defaults are the approved baseline (architecture Section 7, impl-plan T-11).

| Key | Default | Meaning |
|-----|---------|---------|
| `weatherTimeoutMs` | 10000 | Weather request timeout |
| `locationTimeoutMs` | 10000 | Device-location timeout |
| `forecastDays` | 3 | Forecast days shown |
| `forecastIncludesToday` | true | Whether today counts as day 1 (the provider's first day is today) |
| `maxFavorites` | none (unbounded) | Favorites cap |
| `defaultTemperatureUnit` | `C` | Initial unit (user can toggle; choice is saved) |
| `staleAfterMs` | none (disabled) | Age after which data is flagged stale |
| `searchResultLimit` | 5 | Max candidates requested and offered; at most 100 (the geocoding provider's documented maximum) |
| `breakpoints` | wide 768, extraWide 1024 (px) | Layout tiers |
| `minViewportWidthPx` | 320 | Narrowest supported viewport width |
| `maxInputLength` | 100 | Search text cap in characters |
| `coordinateDecimals` | 2 | Decimals kept when device coordinates are rounded for a weather request |
| `bundleBudgetGzipBytes` | 200000 | Initial JavaScript budget, gzipped ("200 KB" read as 200,000 bytes) |
| `attributionText` | empty | Data-source credit shown in the footer (exactly, with the two names linked). Empty shows no credit. `composeLive` (a normal build) sets it to "Weather data by Open-Meteo.com. Location data based on GeoNames." from the message table |

Build-time variables: `VITE_BASE` sets the path the site is served under (default `/`; it must be `/` or a plain path such as `/name/`, anything else fails the build; see `.env.example`). Nothing else is read from the environment. Never put credentials in a `VITE_*` variable.

## Platform and assumptions in effect

Web app, current evergreen browsers, served over HTTPS (needed for Geolocation); WCAG 2.1 AA as the accessibility target; English only; favorites and unit stored in the browser's `localStorage` per device; no accounts, no analytics, no background refresh. These are defaults (ASM-1, ODD-9, ODD-13 and others in `architecture.md`); the items still open are listed in Section 11 of `requirements.md` (the OQ-001 to OQ-014 numbering belonged to the earlier requirements and no longer exists).

## Open checklist for the project owner

1. **TASK-001** was answered by the user on 2026-10-27 (`docs/provider-checklist.md`); the Implementer then checked the Open-Meteo documentation (see `impl-plan.md` TASK-022/023). Attribution (TASK-025) is built in the footer and inside the data panels; Open-Meteo's own view of "next to" is unconfirmed. Any commercial use needs a fresh check of Open-Meteo's terms (the answers cover a non-commercial student use).
2. **TASK-002** The icon set was chosen on 2026-10-27 (Lucide, ISC) and is built (TASK-035). The deferred values (breakpoints, viewport range, `maxInputLength`) were decided by the user on 2026-10-27 as recorded in `docs/provider-checklist.md` (keep the proposed values).
3. The open items in Section 11 of `requirements.md` are still unanswered (the OQ-001 to OQ-014 ids belonged to the earlier requirements); the user accepted the proposed defaults on 2026-10-30, and they stay in use for the open parts.
4. Choose a hosting provider (`docs/deployment.md`) and, separately, authorize publishing; neither has been done. The invented-data code was removed (T-14) and `npm run build:release` fails if any of its markers reappear. Also open: CORS from a deployed https origin is unverified, and Open-Meteo has not confirmed the credit placement.
5. **NFR-004** was accepted by the user on 2026-10-27 after the measurements taken in TASK-042 (one machine and network; not a guarantee).
6. The favorite button's accessible name (WCAG 2.5.3) is fixed and covered by tests. Remaining review notes are in `impl-plan.md` (TASK-039/040).
7. Run the manual browser checklist in `impl-plan.md` (TASK-039/040) and record the results. Manual checks (real location prompt, screen reader, Firefox/Safari, real devices, human look at layout and icons) are not done.
8. Not authorized and not done: TASK-046 (release readiness) and any publishing. TASK-024 (reverse geocoding) is not built (Open-Meteo has no such endpoint).

## Release check

Run all of these before treating a build as a release candidate. None of them calls the live Open-Meteo API (use `npm run smoke:live` by hand for that), so this is a check of the build, not of release readiness (the manual checks T-70..T-75 are not run and the Phase 2 migration is unfinished):

```
npm run typecheck
npm test
npm run lint
npm run build:release      # production build + scan:dist (fails on any finding)
npm run test:browser       # includes the release-build specs against vite preview
```

## Testing notes

`npm test` proves behavior in jsdom against fakes; `npm run test:browser` adds real-browser results for the release build (the feature specs `accessibility.spec.ts`, `layout.spec.ts` and `browserApis.spec.ts` exist and run on 5 engines; T-61..T-64 are only partly covered, see `verification.md`), using recorded Open-Meteo responses for the release build. Neither run calls the live provider or involves a human answering a location prompt, a screen reader, or Firefox/Safari.
