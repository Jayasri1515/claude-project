# Conformance Review of the Existing Implementation (Task T-01)

> Saved by the SDLC Orchestrator from the Code Reviewer's returned report (the Code Reviewer has no write tool). Findings are unaltered. Only HTML escape artifacts were decoded, and an orchestrator note was appended at the end (clearly marked). This is a read-only review: it is not a U6 decision and not an approval.

## 1. Scope, method and limits

- **Review status:** Complete for static reading, with the limitations in section 8.
- **Reference documents:**
  - `architecture.md`, approved 2026-10-30 with conditions (header row 5).
  - `requirements.md`, approved 2026-10-30 with open items deferred to the Architect (sections 11.5 and 12).
  - The architecture header (rows 10-11) says the existing code is not assumed approved, conforming or reusable, and that keep/adapt/discard is the user's decision U6.
- **Approval evidence:** Present for both documents. The architecture's Section 7 proposals, Section 8 assumptions and Section 9 decisions U1-U8 are still marked as needing user approval, so I treated them as proposals. Where a verdict depends on one, I say so.
- **Method:**
  - I read all of `src/core`, `src/adapters`, `src/composition.ts`, `src/main.tsx`, `src/dev`, `scripts/` and the config files.
  - From `src/ui` I read App, ErrorBoundary, LiveMessage, Footer, ExternalLink, LocationControl, RefreshBar, StatusArea, SearchPanel, useGuardedAction, attribution, weatherIcons and the top of FavoritesPanel.
  - I used Grep and read-only Bash for inventory, counts, gzip size (stdout only) and secret-pattern checks.
- **What I did not do:** I did not run tests, builds or scans, and I changed no file.
- **Basis of the existing code:** It was built under a different, earlier architecture. Its comments cite "architecture 4.12", `TASK-0nn`, `OQ-0nn`, `ODD-n`, `FR-nnn`, `F-00n` and "user-approved amendment 2026-10-26/27". This is evidence of a prior-session basis, not of the approved architecture. Nothing below is a reuse decision.

## 2. Component verdicts (C1 to C13)

| ID | Component | Verdict | Key evidence |
|---|---|---|---|
| C1 | UI shell | Partially | Banner, nav, main and footer landmarks, `lang="en"` and a top-level `ErrorBoundary` exist (`App.tsx:57-114,154-165`, `ErrorBoundary.tsx:24-57`). The UI reads its own `Location`/`Section` types, not `Place`. It has a demo-notice branch and no CSP meta (`index.html`). The "Detecting your location..." state has no "search instead" cue (`StatusArea.tsx:36-43`). |
| C2 | App Controller | Partially | Generation `token` plus `AbortController` exist (`appController.ts`, `beginSelection` 216-229). Launch location runs only when permission is `granted` (`appController.ts:33`), which contradicts D9 (request at app open). Single-flight is `refresh()` skipping when `loadToken === token` (`:148`) and a per-key Map in the service, not one controller-wide synchronous flag. |
| C3 | Weather Service | Partially | Single-flight Map per `operation\|location.key` (`weatherService.ts:69,103-110`). Two parallel provider calls. The result has no `timeZone` or `isDay`. The older-time rule for last updated is at `:166-178`. A thrown error maps to `serviceUnavailable`. |
| C4 | Search Service | Partially | Trim, empty, and length checks are present (`search.ts`). The file states it does no "City, Country" parsing, so the A-Q5 handling (send the part before the first comma, qualifier filtering, whitespace collapse) is absent. All provider failures become `SERVICE_UNAVAILABLE`. |
| C5 | Location Flow | Partially | Permission table in `locationFlow.ts`. The 10 s timeout is passed to the browser (`:117`, `geolocation.ts:101`), not owned by the app. No app-owned watchdog. The late-result rule is generation-based only. The Permissions-API-aware paths (granted starts the watchdog; prompt waits; API missing falls back to the watchdog) are not implemented as specified. |
| C6 | Favorites Service | Does not conform | Takes a `Location` and checks "device" at runtime (`favoritesService.ts:105`), so it is not a Place-only API. Record is `{version:1, favorites}` (`:154`), not `{v:1, items}`. The identity key is provider-dependent (`identity.ts`). Corrupt data is discarded silently (`:133-137`). |
| C7 | Settings | Partially | Unit toggle with `weather-app.settings` `{version:1, temperatureUnit}`. Default and persistence match REQ-WF3-03. The record shape differs from `{v:1}`. |
| C8 | Provider adapters | Partially | Open-Meteo adapters exist behind ports. There is no `cache:'no-store'` (`http.ts:77-82`). A caller abort maps to `SERVICE_UNAVAILABLE` (`:101-102`). HTTP 429 maps to `SERVICE_UNAVAILABLE`, not `rate_limited`. The response time zone is not read. |
| C9 | Platform adapters | Partially | `geolocation.ts` wraps the Permissions API (absent becomes `prompt`). `localStorageStore.ts` catches errors and maps to `STORAGE_UNAVAILABLE`. The Clock is an inline system clock in `composition.ts`. The `LocationService` port differs from the approved one (below). |
| C10 | Config | Partially | A single `config.ts` with validation exists. It is missing coordinate-rounding precision, a minimum width and a bundle budget. `forecastIncludesToday` is false (approved: true, today plus two days). `loadingIndicatorMaxDelayMs: 200` conflicts with DR-14 (no delay). `maxFavorites` is undefined. The 2-decimal rounding constant sits in `weather.ts`, outside Config. |
| C11 | Presentation mapping and messages | Partially | A central message table exists, with `messageForError`. Wording is pre-decided, but U7 (message wording) is not yet approved. The date format uses the device locale, not `Intl` `'en'` with the location time zone. The condition table has no drizzle category and no day/night text. |
| C12 | Build and secret hygiene | Partially | `scanDist.mjs` and `secretScan.mjs` check secrets, non-HTTPS URLs, demo markers and the Lucide icon set. There is no service-worker or Cache API check, no bundle-size budget and no working-tree scan. The scan runs only through `build:release`. |
| C13 | Edge proxy (conditional) | Absent (not required) | Conditional on a keyed provider; none is used. |

**Counts (as stated by the Code Reviewer):** Conforms 0, Partially 10 (C1-C5, C7-C12), Does not conform 1 (C6), Absent 2 (C13, plus one not-applicable). More precisely: C13 is absent and not required; no component fully conforms.

(See the orchestrator note at the end: the reviewer's own table gives 0 / 11 / 1 / 1.)

## 3. Rule verdicts (architecture Sections 3 and 5)

| Rule | Verdict | Evidence |
|---|---|---|
| AppError taxonomy (11 kinds plus internal `aborted`) | Does not conform | `errors.ts:10-20` has 9 codes with a different set. There is no `rate_limited`, `invalid_response`, `unsupported`, `position_unavailable`, `permission_denied` or `aborted`. It adds `INPUT_TOO_LONG`. |
| `aborted` is internal, never shown, never mapped to network | Partially | The location port has a separate `ABORTED` variant (`ports/locationService.ts`), so it never reaches the UI. In the HTTP layer a caller abort becomes `SERVICE_UNAVAILABLE` (`http.ts:101-102`). It is not network, but it is not a distinct internal kind either. |
| Generation tokens | Partially | `token`, `loadToken` and `searchToken` in `appController.ts`. Not applied uniformly to the late location result. |
| Single-flight | Partially | See C2 and C3. Not a controller-wide synchronous flag. The UI adds a ref-based guard (`useGuardedAction.ts`). |
| `AbortController` use | Conforms in principle | Per selection and per locate (`appController.ts:216-264`), plus an own controller per request in `http.ts:55`. |
| `cache:'no-store'` on every provider call | Does not conform | No `no-store` anywhere in `src/` or `scripts/`. Request init is `{method, signal, credentials:'omit', referrerPolicy:'no-referrer'}`. |
| No service worker | Partially | None in `src/`, and `test/security/sourceScan.test.ts:201` asserts it. No build-time check in `scripts/`. |
| Result type | Conforms | `core/result.ts`, with `ok`/`err`. |
| Ports (WeatherProvider, GeocodingProvider, LocationService, KeyValueStore, Clock) | Partially | Weather port is two methods (`getCurrent`, `getForecast`) taking a `Location`, not `get(coords, signal)`. Geocoding has an optional signal. `LocationService` has `getPermissionState` plus `getCurrentPosition(timeoutMs, signal)`, where the approved timeout is owned by C5. KeyValueStore and Clock exist. |
| Place-only favorites API | Does not conform | `add(location: Location)` with a runtime device check. |
| Versioned `{v:1, items}` record | Does not conform | Stored as `{version:1, favorites}`. |
| Identity key `name\|admin1\|country`, provider-independent | Does not conform | Uses `<providerId>:<placeId>` when a place ID exists, otherwise `name:`-prefixed (`identity.ts`). |
| Coordinates never persisted, logged, in URL or error text | Partially | No `console.*`, no `location.search` or history writes in `src/`. Errors carry no URL. However `unresolvedDeviceLocationKey` embeds the exact lat,lon (`locationFlow.ts:68-72`). It is an in-memory key, but it is a precision and leak risk (see F-09). |
| Coordinate rounding to 2 decimals | Partially | `COORDINATE_DECIMALS = 2` in `weather.ts` (~53-65), applied to every location in `baseUrl()`. The constant is outside Config. Architecture says device coordinates only; the code also rounds place centroids. |
| Config object, no scattered literals | Partially | See C10. Literals remain in `weather.ts` (rounding, `forecast_days` max 16) and `geocoding.ts` (count max 100). |
| Location state machine and Permissions-API-aware watchdog | Does not conform | See C5. |
| Secret and demo-code hygiene | Partially | No key-shaped strings found. Demo code is excluded by a build-time constant (question 3). Guards are partial. |
| Accessibility: live region | Conforms | `LiveMessage.tsx` (`role="status" aria-live="polite"`), always in the document. `StatusArea.tsx` announces loading text once. Used in search, location, favorites. |
| Accessibility: error boundary | Conforms | `ErrorBoundary.tsx`: fixed safe message, `role="alert"`, focus handling, no error text shown or logged. |
| Accessibility: other | Partially | Busy buttons use `aria-disabled` to keep focus. Whether this meets the unapproved Q26 proposal was not verified. |
| Footer attribution | Partially | `Footer.tsx` shows Open-Meteo and GeoNames credit, the CC BY 4.0 licence line and a notices link in live mode, and a different statement in demo mode. The credit comes from `Config.attributionText` injected by composition (`withLiveAttribution`), and defaults to empty. An empty value shows no credit. |

**Counts of rule verdicts (as stated by the Code Reviewer):** Conforms 3, Partially 11, Does not conform 7 (the 18 table rows split as listed; `a11y: other` is counted once as Partially).

(See the orchestrator note at the end: the table above has 21 rows, which give 4 / 11 / 6.)

## 4. Explicit questions

**Q1. Where do the unit tests live, which framework, and how many files?**
- They are in `test/` (core, adapters, ui, security, scenarios, fakes, smoke, fixtures, support, live), not colocated with the code. There are 51 test files matching `*.test.ts(x)` and 0 under `src/`.
- Framework: Vitest with jsdom and Testing Library, plus axe-core. `vite.config.ts` includes both `test/**` and `src/**`.
- The impl-plan assumed tests sit next to the code. That is wrong for this repo.
- Size: about 9,652 lines of tests against about 4,840 lines of `src/`.
- I did not run them, so I cannot say whether they pass.

**Q2. What do the dev:demo, build:demo and smoke:live modes do?**
- `dev:demo` runs `vite --mode demo`.
- `build:demo` runs `tsc --noEmit && vite build --mode demo`.
- In demo mode, `main.tsx:22` dynamically imports `src/dev/demoComposition`. That wires invented places (Testville, Sampleton, Partialia, Glitchton), scripted failures, 400 ms latency, a `demo:` storage prefix, and a location service that reports `unsupported`. The UI shows a demo notice and a demo footer.
- `smoke:live` runs `vitest.live.config.ts`. It includes only `test/live/**/*.live.ts` with a 30 s timeout. The one live file makes a few real requests to open-meteo.com and prints a short console summary.
- Playwright's edge and chrome projects use the demo server (`vite --mode demo`, port 4173). The release projects run `npm run build:release` then `vite preview` (port 4174, base `/claude-project/`), and that build overwrites `dist/`.

**Q3. Can key-shaped strings, hard-coded keys or demo code reach a release build, and would the guards catch it?**
- **Keys:** None found. A pattern search of `src/` returned no matches. "api key" wording appears only in docs, tests and the secret scanner. There is no `.env` file or `.env.example`.
- **Demo exclusion mechanism:** `main.tsx` branches on `import.meta.env.MODE === 'demo' || VITE_USE_DEMO === 'true'`, then a dynamic import. A release build relies on Vite replacing the constant and eliminating the dead branch.
- **Guards:**
  - `releaseGuard.mjs` throws only if `VITE_USE_DEMO==='true'` on a non-demo build.
  - `scanDist.mjs` looks for demo markers and file names, but only via `build:release`.
  - `npm run build` alone does not scan.
  - `vite build --mode demo` bypasses the guard by design.
- **Evidence from the existing `dist/`:** a grep for `Testville`, `Sampleton`, `demoComposition` and `VITE_USE_DEMO` in `dist/` found no matches. The bundle (`index-DRvIBnBb.js`, 276,111 bytes raw, 84,207 gzip) looks like a live build. It is stale (built Oct 27) and I did not scan it with the project's scanner.
- **Verdict:** Probably caught on the `build:release` path, but not on `build` or hand-run builds. The guard checks one flag, and there is no check that `src/dev` is absent from the bundle by import graph, only by marker strings.

**Q4. Provider-specific facts in code (all UNVERIFIED against T-02)**
- Forecast endpoint (`FORECAST_URL` in `weather.ts`). Parameters: `latitude`, `longitude`, `timezone=auto`, `temperature_unit=celsius`, `current=temperature_2m,relative_humidity_2m,weather_code`, `daily=weather_code,temperature_2m_max,temperature_2m_min`, `forecast_days` (max 16).
- Geocoding endpoint (`GEOCODING_SEARCH_URL` in `geocoding.ts`). Parameters: `name`, `count` (max 100), `language=en`, `format=json`. Provider ID `open-meteo`.
- WMO weather-code table in `conditionCodes.ts`: 0-3, 45, 48, 51-57, 61-67, 71-77, 80-82, 85-86, 95-99. Drizzle and freezing rain are mapped to RAIN.
- Code comments claim verification "on 2026-10-27" (`weather.ts`) and cite Open-Meteo terms "read 2026-10-27" with 90-day logs (`messages.ts`), and licence pages (`attribution.ts`). These dates predate the approved architecture and are not T-02 evidence.
- Attribution strings: "Weather data by Open-Meteo.com", "Location data based on GeoNames", CC BY 4.0.
- Not read by the code: the response `timezone` and `is_day`, so those approved facts are untested.

**Q5. Anything else notable**
- `dist/`, `test-results/.last-run.json` and `.vitest/json` exist but are git-ignored (`.gitignore`). `public/THIRD_PARTY_NOTICES.txt` is tracked.
- `docs/deployment.md` and `docs/provider-checklist.md` exist, and `README.md` is about 15 KB. I read only the README lines mentioning tests, composition and layout. It says `composeLive` is used by a normal build and that `src/composition.ts` never imports `src/dev/`.
- Release base path is `/claude-project/`, which assumes a GitHub Pages project site. U5 (hosting) is not decided.
- Browser coverage: Playwright uses system Edge and Chrome only (no Firefox or WebKit), one worker, no retries.
- `index.html` has an empty `data:,` favicon and no CSP meta tag. CSP is an Architect proposal tied to U5.
- The git working tree shows modified architecture, requirements, design-review and impl-plan files, deleted CHANGELOG, PULL_REQUEST, documentation and verification files, and an untracked `archive/`. I did not open `archive/`.

## 5. Findings

Confirmed unless marked "risk". Ordered by severity, then confidence.

| ID | Severity | Location | Finding and evidence | Impact | Recommended fix |
|---|---|---|---|---|---|
| F-01 | High | `adapters/openMeteo/http.ts:77-82` | No `cache:'no-store'`; no match anywhere in `src/`. Required by 3.9 and DR-05. | Browsers may serve stale provider responses, undermining refresh and last-updated correctness. | Add the option to the shared fetch init and a test asserting it. |
| F-02 | High | `core/appController.ts:33`, `core/locationFlow.ts:117`, `adapters/web/geolocation.ts:101` | Launch location only when permission is `granted`; timeout delegated to the browser; no app-owned 10 s watchdog or Permissions-API branches. Contradicts D9 and the C5 state machine. | The app may never ask for location at open (REQ-WF2-01/02) and may hang on a stalled prompt. | Rebuild C5 per the architecture, including the "search instead" cue. |
| F-03 | High | `core/favorites/identity.ts`, `favoritesService.ts:105,154` | Provider-dependent key, `Location`-typed `add` with runtime device check, `{version:1, favorites}` record. | Saved favorites would not survive a provider change; a device location can reach the service; the stored shape is not the approved `{v:1, items}`. | Place-only API, provider-independent key, approved record shape. |
| F-04 | High | `core/errors.ts:10-20`, `http.ts:101-102` | Taxonomy differs from the approved set; 429 and a caller abort map to `SERVICE_UNAVAILABLE`; no `aborted`. | Wrong messages for rate limits and no internal abort kind. | Adopt the approved taxonomy and mapping. |
| F-05 | Medium | `core/ports/weatherProvider.ts`, `core/domain.ts` | Weather port is two `Location`-based calls with no time zone or `isDay`; condition table has no drizzle or day/night. | The approved day boundaries, "Sunny"/"Clear" text and date formatting cannot be met. | Replace with the approved single `get(coords, signal)` port and types. |
| F-06 | Medium | `core/search.ts` | No A-Q5 handling (comma split, qualifier filtering, whitespace collapse). | Queries like "Paris, France" may return poor or no results. | Implement the approved behaviour. |
| F-07 | Medium | `core/config.ts` | `forecastIncludesToday` false, `loadingIndicatorMaxDelayMs` 200, `maxFavorites` undefined, no rounding, min-width or bundle-budget keys; some literals live in adapters. | Config rule and DR-14 not met. | Align Config with the approved keys. |
| F-08 | Medium | `scripts/` | No service-worker or Cache API check, no bundle-size budget, no working-tree secret scan; scan runs only via `build:release`. | Architecture C12 gates are not enforced. | Add the missing gates and run them on every build. |
| F-09 | Medium (risk) | `core/locationFlow.ts:68-72` | Exact lat,lon embedded in an in-memory key. | Not persisted or logged in code read, but violates the "coordinates never in keys/state beyond need" intent if the key reaches storage or messages; needs a trace. | Use an opaque key; add a test. |
| F-10 | Medium | `core/favorites/favoritesService.ts:133-137` | Corrupt or unknown-version favorites data is discarded silently. | A user loses favorites with no notice. | Surface a notice or keep the raw data per architecture. |
| F-11 | Low | `core/format.ts` | Dates use the device locale, not `Intl` `'en'` with the location time zone ("Thu, 30 Oct"). | Format varies by device. | Fix the locale and time zone. |
| F-12 | Low | `core/messages.ts` | Wording and attribution decided before U7. Prior-session wording. | Rework if U7 changes it. | Treat as provisional. |
| F-13 | Low | `composition.ts` | Clock defined inline, outside the platform adapters. | Minor structural deviation from C9. | Move to the platform adapter layer. |

## 6. Positive observations

- Layering is clear (`core`, `ports`, `adapters`, `ui`), and the UI does not import adapters.
- Error messages are mapped through a central table and the error type carries no raw text, URL or stack.
- No `console.*`, `dangerouslySetInnerHTML`, `location.search` or history writes were found in `src/`.
- The live region and the error boundary are well isolated and focus-aware.
- Demo code lives in `src/dev` and is only reached through a dynamic import.
- A secret scanner, a demo-marker scan and an icon-set pin exist in `scripts/`.

## 7. Facts for the U6 decision (keep, adapt or discard), by area

I do not make the decision. These are facts only.

- **src/core:** Domain types (`Location`), the error taxonomy, the weather port and the favorites model all differ from the approved architecture. The controller, location flow and search need behavioural changes. `result.ts`, `store.ts`, the message table and `config.ts` are structurally close. Comments reference a different architecture throughout.
- **src/adapters:** The HTTP helper is reasonable (timeouts, no URL in errors, simple CORS request). It lacks `no-store` and the new error mapping. Request and parameter facts are unverified. `localStorageStore.ts` is small and close to the KeyValueStore port.
- **src/ui:** Landmarks, live region, error boundary, focus handling and footer credit are implemented. It is coupled to `Location` and `Section` types, to the demo flag and to prior-session message ids.
- **src/dev:** Demo providers with invented data, scripted failures and latency. Not required by the architecture. They are excluded from release builds by a build-time constant plus the scan.
- **tests:** 51 files in `test/` (not colocated), many tied to the old types and TASK ids. Includes security scans (`secretScan`, `sourceScan`) and recorded Open-Meteo fixtures. Not run in this review.
- **e2e:** Four specs (accessibility 440 lines, browserApis 212, layout 194, release 559) plus a harness. Edge and Chrome channels only. Not run.
- **scripts:** Useful guards exist but with gaps (F-08). `baseUrl.mjs` assumes a GitHub Pages path.

## 8. Limitations and follow-up

- **Not read or only partly read:** `src/ui` files CurrentWeatherCard, ForecastList, ConditionView, WeatherCredit, WeatherIcon, UnitToggle, context, sections, useLayout, useRestoreFocus, formatPlace; `src/styles.css`; test and e2e file contents (counts only); `README.md` beyond targeted lines; `docs/*.md`; `eslint.config.js`; `tsconfig.json`; most of `requirements.md` beyond headings, sections 4.x and the approval section; `archive/`. C1 and the accessibility verdicts therefore rest on the files that were read.
- **Not executed:** No tests, builds or scans were run. Nothing here shows the tests pass or that the scanner accepts the current `dist/`.
- **Follow-up:**
  - F-01 to F-04 are the corrections to prioritise once U6 is decided.
  - Re-check the provider facts in section 4 Q4 against T-02 results.
  - Re-review C1/UI conformance and the unread UI files if any are kept.
  - Run the project's own scan and tests (Verifier task) before relying on any of this code.

---

## Orchestrator note (appended by the SDLC Orchestrator; not part of the Code Reviewer's findings)

1. **Recomputed tallies.** The reviewer's stated counts do not match its own tables. Counting the rows as written:
   - Components (13 rows): conforms 0, partially 11 (C1-C5, C7-C12), does not conform 1 (C6), absent 1 (C13, not required).
   - Rules (21 rows): conforms 4 (AbortController "in principle", Result type, live region, error boundary), partially 11, does not conform 6 (AppError taxonomy, `cache:'no-store'`, Place-only favorites API, `{v:1, items}` record, identity key, location state machine).
   The reviewer's text (components 0/10/1/2, rules 3/11/7 of 18) is kept above unaltered. The row-level verdicts are the evidence.
2. **Provenance.** The Code Reviewer ran read-only and did not execute tests, builds or scans. It did not read several `src/ui` files, `src/styles.css`, test and e2e contents, or `archive/` (section 8). The verdicts rest on what it read.
3. **Plan assumption corrected.** `impl-plan.md` Section 9 assumed unit tests sit next to the code. This review found them in `test/` (51 files, none under `src/`).
4. This file records no decision and no approval. U6 (keep / adapt / discard) remains with the user.
