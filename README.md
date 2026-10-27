# Weather application

A responsive web single-page app (TypeScript, React, Vite) that shows current weather and a 3-day forecast for a searched city or the device location, with refresh and saved favorites. Requirements: `requirements.md`. Design: `architecture.md`. Task list and status: `impl-plan.md`.

**Current state (read this first).** A normal build (`npm run dev`, `npm run build`) talks to the real **Open-Meteo** APIs (no API key; search and forecast over HTTPS) since TASK-037 (2026-10-27). Device-location weather is shown as "Current location" and cannot be saved as a favorite, because Open-Meteo has no reverse-geocoding endpoint. The footer shows the data-source credit that Open-Meteo's licence (CC BY 4.0) asks for, plus a GeoNames credit and a link to the third-party notices, and a short linked credit line "Weather data by Open-Meteo.com" also sits **inside the Current weather and Forecast panels**, next to the data (TASK-025 and its follow-up, implemented 2026-10-27, not yet reviewed). `Config.attributionText` gates all of them: they appear only when it is non-empty (a normal build sets it; demo mode never shows them), and the in-panel lines only while that panel has real data. Whether Open-Meteo itself accepts this reading of "next to" is not confirmed with them. Weather icons are Lucide (ISC licence, TASK-035; the licence text and the notices for React, React DOM and Scheduler ship as `THIRD_PARTY_NOTICES.txt` in the built site). The page tells the visitor, next to "Use my location", what the weather service receives: "The weather service receives the text you search for, the location used for the weather (rounded to two decimal places) and your IP address, and may log requests. This app does not save your device location." The UI says "the weather service" (message table), not the provider's name. Open-Meteo's terms (https://open-meteo.com/en/terms, read 2026-10-27) say it may collect IP addresses and keeps web server logs that may contain geographical coordinates, deleted after 90 days; the page does not repeat that figure, because it is the provider's to change. Requests are made with `referrerPolicy: 'no-referrer'`, so the page address is not sent as a Referer. In demo mode no such sentence is shown; the page says instead that nothing you type is sent to a weather service and the device location is not used. To try the app with no network, run it in **demo mode**, which uses invented, clearly labelled sample data (places such as "Testville"). The demo code is **not** part of a release build (`npm run build:release`); only `build:demo` and `dev:demo` include it. Nothing is release-ready (TASK-046 is blocked).

**CORS status (important for deployment).** Open-Meteo's documentation does not mention CORS. It has been observed working only (a) from the built app in real Edge and Chrome served from `http://localhost`, and (b) with `curl`, by reading response headers: a GET with `Origin: https://example.github.io` returns `access-control-allow-origin: *` on both API hosts (checked 2026-10-27). It has **not** been checked from the real deployed origin (for example the GitHub Pages address); do that after deployment. **Do not add any custom request header** (an API key header, `Content-Type: application/json`, and so on) to the Open-Meteo requests: a header like that makes the browser send a preflight (OPTIONS) request, and the geocoding host rejects it (`OPTIONS` returned HTTP 404 by `curl` on 2026-10-27), which would break city search in browsers. The adapters send plain GETs with no custom headers (`referrerPolicy: 'no-referrer'` is a request option, not a header the page adds, and does not cause a preflight); `test/adapters/openMeteo/geocoding.test.ts` and `weather.test.ts` assert that no headers are set and the policy is `no-referrer`. On 2026-10-27 a one-off check in real Chrome, with a page served from `http://localhost` and the adapters' exact options (`GET`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`), got HTTP 200 JSON from both live hosts with no Referer and only the browser's default headers; `npm run smoke:live` (Node) also passed with the option.

**Hosting path (GitHub Pages project site).** The repository is expected to be `Jayasri1515/claude-project`, so a GitHub Pages project site would be served under a sub-path. The expected URL is `https://jayasri1515.github.io/claude-project/` (**expected, unverified, and NOT deployed**: nothing has been published and no remote was touched). Release builds therefore use the Vite `base` `/claude-project/` (`npm run build`, `build:release`, and `vite preview`); the dev server and demo mode (`dev`, `dev:demo`, `build:demo`) use `/`. Set the environment variable `VITE_BASE` to override it (for example `VITE_BASE=/ npm run build:release` for a host at the root of a domain). Publishing requires the user's explicit authorization; see `docs/deployment.md`.

## Set up and run

Requirements: Node.js and npm (developed with Node v24 and npm 11; other versions untested).

```
npm install
npm run dev:demo      # dev server in demo mode (invented data); prints a local URL
npm run dev           # dev server, normal mode: the real app over the live Open-Meteo APIs
```

Try in demo mode: search `Testville` (one match), `Sampleton` (two matches, a chooser), `Partialia` (missing values), `Glitchton` (forecast fails), or `error` (search service fails). In demo mode saved data is kept under a `demo:` key prefix and the real device position is never read.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` / `npm run dev:demo` | Vite dev server (normal / demo mode) |
| `npm run build` | Type check, then the plain production build into `dist/` (base `/claude-project/`, see above; `VITE_BASE` overrides). The demo providers, demo storage prefix and invented places are left out. **Fails** if `VITE_USE_DEMO=true` is set |
| `npm run build:release` | **The release path.** `npm run build`, then `npm run scan:dist`; fails on any finding, demo markers included. Use this, not `build`, for anything that may be deployed |
| `npm run build:demo` | Type check, then a demo build into `dist/` (includes the demo code in a separate chunk). Never deploy it as a release |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit, component (jsdom) and scenario tests. No browser and no network; the Open-Meteo adapters run on recorded responses in `test/fixtures/openmeteo` |
| `npm run smoke:live` | **Manual only, makes 3 real requests to Open-Meteo** (one search, current weather, a 3-day forecast) through the real adapters and checks that the real responses parse. Not part of `npm test`; do not run it in a loop or in CI (the free API is for non-commercial use with request limits) |
| `npm run lint` | ESLint |
| `npm run test:browser` | Playwright checks in real **Microsoft Edge and Google Chrome** installed on the machine (nothing is downloaded). Starts a demo-mode dev server on port 4173 for the feature specs, and runs `npm run build:release` then `vite preview` on port 4174 (served under `/claude-project/`, like a Pages project site) for the release specs (`e2e/release.spec.ts`: the real app, with the two Open-Meteo hosts intercepted and answered from recorded responses, never the live API; no demo content, no console errors). It overwrites `dist/` with the release build. See `e2e/` |
| `npm run test:browser:release` | Only the release projects of `test:browser` (the demo server still starts but is not used) |
| `npm run scan:dist` | Scan of `dist/` as a **release** bundle: credential-like text, non-HTTPS URLs, and demo markers (the demo chunk file name, demo symbols such as `composeDemo`, the `demo:` storage prefix, the demo place names), all of which fail it, as does a file it cannot read. It also fails if the bundled Lucide icons are not exactly the pinned set of 8 (`EXPECTED_ICONS` in `scripts/scanDistLib.mjs`, tied to `src/ui/weatherIcons.ts` by a test), if more than 16 are found, or if Lucide code is present but the detection finds no icon (a stale pattern is a failure, not a pass); and if `THIRD_PARTY_NOTICES.txt` lacks a notice (name, installed version, licence text) for any runtime package: `lucide-react` (ISC, with the Feather MIT notice), `react`, `react-dom`, `scheduler`. It prints the icons it found. `build:release` runs it for you. It is a pattern scan, not proof: see `docs/deployment.md` for what it cannot catch |
| `npm run scan:dist:demo` | Same scan for a `build:demo` bundle: demo markers are allowed, the credential and URL checks still apply |

`npm install` of `@playwright/test` does not download browsers; `test:browser` needs Edge and Chrome to be installed. Firefox and Safari are not covered.

## Layout of the code

- `src/core/` platform-neutral logic: services, controller, store, config, message table. No browser or provider code.
- `src/adapters/web/` browser adapters (localStorage, Geolocation).
- `src/ui/` React components. They render store state and send intents; they never call adapters.
- `src/dev/` demo providers, demo-prefixed store and `composeDemo` (invented data), used only in demo mode. `src/main.tsx` loads it with a dynamic import behind a build-time check, so release builds drop it.
- `src/adapters/openMeteo/` the Open-Meteo search and weather adapters and the weather-code table (HTTPS only, no key, input percent-encoded).
- `src/composition.ts` wires everything and never imports `src/dev/`; `composeLive` (used by a normal build) wires the Open-Meteo adapters; mode is `live` (providers injected), `demo` (built by `composeDemo`) or `unconfigured` (only `compose()` called with no providers, e.g. in tests).
- `public/` files copied unchanged into the built site: `THIRD_PARTY_NOTICES.txt` (Lucide ISC licence text, Open-Meteo and GeoNames credit). After changing the `lucide-react` version, refresh it (`test/security/notices.test.ts` fails until you do).
- `test/` tests and the port fakes (`test/fakes/`); `e2e/` real-browser specs (`harness.*` is test support); `scripts/` the bundle scan, secret scanner, demo markers, the release-build guard and the `base` resolver (`baseUrl.mjs`).

## Configuration keys (`src/core/config.ts`)

All values are in one typed object; defaults are the architecture's recommendations or the Planner's proposals, **not** user decisions.

| Key | Default | Meaning |
|-----|---------|---------|
| `weatherTimeoutMs` | 10000 | Weather request timeout |
| `locationTimeoutMs` | 10000 | Device-location timeout |
| `forecastDays` | 3 | Forecast days shown |
| `forecastIncludesToday` | false | Whether today counts as day 1 |
| `maxFavorites` | none (unbounded) | Favorites cap |
| `defaultTemperatureUnit` | `C` | Initial unit (user can toggle; choice is saved) |
| `staleAfterMs` | none (disabled) | Age after which data is flagged stale |
| `searchResultLimit` | 5 | Max candidates offered |
| `breakpoints` | wide 768, extraWide 1024 (px) | Layout tiers (proposal) |
| `maxInputLength` | 100 | Search text cap in characters (proposal) |
| `attributionText` | empty | Data-source credit shown in the footer (exactly, with the two names linked). Empty shows no credit. `composeLive` (a normal build) sets it to "Weather data by Open-Meteo.com. Location data based on GeoNames." from the message table; demo mode never shows it |
| `loadingIndicatorMaxDelayMs` | 200 | Latest time the loading state must show |

Build-time variables: `VITE_USE_DEMO=true` (or Vite mode `demo`) selects demo mode, which makes the build a demo build (never for a release). A plain `build` / `build:release` refuses to run while `VITE_USE_DEMO=true` is set, and `npm run scan:dist` fails on any demo build. `VITE_BASE` sets the path the site is served under (default `/claude-project/` for builds and `vite preview`, `/` for dev and demo; it must be `/` or a plain path such as `/name/`, anything else fails the build). Nothing else is read from the environment. Never put credentials in a `VITE_*` variable.

## Platform and assumptions in effect

Web app, current evergreen browsers, served over HTTPS (needed for Geolocation); WCAG 2.1 AA as the accessibility target; English only; favorites and unit stored in the browser's `localStorage` per device; no accounts, no analytics, no background refresh. These are defaults (ASM-1, ODD-9, ODD-13 and others in `architecture.md`); the answers to OQ-001 to OQ-014 in `requirements.md` are still open.

## Open checklist for the project owner

1. **TASK-001** was answered by the user on 2026-10-27 (`docs/provider-checklist.md`); the Implementer then checked the Open-Meteo documentation (see `impl-plan.md` TASK-022/023). Attribution (TASK-025) is built in the footer and inside the data panels; Open-Meteo's own view of "next to" is unconfirmed. Any commercial use needs a fresh check of Open-Meteo's terms (the answers cover a non-commercial student/demo use).
2. **TASK-002** The icon set was chosen on 2026-10-27 (Lucide, ISC) and is built (TASK-035). The deferred values (breakpoints, viewport range, `maxInputLength`) were decided by the user on 2026-10-27 as recorded in `docs/provider-checklist.md` (keep the proposed values).
3. The open questions OQ-001 to OQ-014 are still unanswered in `requirements.md`; their recommended defaults are in use provisionally (launch behavior, unit, favorites rules, timeouts, and so on).
4. Choose a hosting provider (`docs/deployment.md`) and, separately, authorize publishing; neither has been done. Demo code is already excluded from release builds and `npm run build:release` checks it. Also open: CORS from a deployed https origin is unverified, and Open-Meteo has not confirmed the credit placement.
5. **NFR-004** was accepted by the user on 2026-10-27 after the measurements taken in TASK-042 (one machine and network; not a guarantee).
6. The favorite button's accessible name (WCAG 2.5.3) is fixed and covered by tests. Remaining review notes are in `impl-plan.md` (TASK-039/040).
7. Run the manual browser checklist in `impl-plan.md` (TASK-039/040) and record the results. Manual checks (real location prompt, screen reader, Firefox/Safari, real devices, human look at layout and icons) are not done.
8. Not authorized and not done: TASK-046 (release readiness) and any publishing. TASK-024 (reverse geocoding) is not built (Open-Meteo has no such endpoint).

## Release check

Run all of these before treating a build as a release candidate. None of them calls the live Open-Meteo API (use `npm run smoke:live` by hand for that), so this is a check of the build, not of release readiness (TASK-046 is blocked):

```
npm run typecheck
npm test
npm run lint
npm run build:release      # production build + scan:dist (fails on any finding)
npm run test:browser       # includes the release-build specs against vite preview
```

## Testing notes

`npm test` proves behavior in jsdom against fakes; `npm run test:browser` adds real Edge and Chrome results for layout, focus, contrast, target size, `localStorage` and the Geolocation adapter, using demo data (or recorded Open-Meteo responses for the release build). Neither run calls the live provider or involves a human answering a location prompt, a screen reader, or Firefox/Safari.
