# Rework weather app to the approved design (partial, not complete)

> **Status.** Source branch `feature/weather-app`, target `main`. This pull request replaces the earlier initial description: the branch was reworked onto the approved requirements and architecture (commit `10fca0b`: 144 files). Nothing is merged, tagged, deployed or published.
>
> **This branch is not complete against `impl-plan.md`.** See "Known limitations and not done". It is not release-ready.

## Summary

- Reworks the existing React/TypeScript/Vite weather app (search by city or device location, current weather, a forecast, refresh, saved favorites, Open-Meteo, no API key) towards the approved requirements and architecture (`requirements.md` approved 2026-10-30; `architecture.md` approved with conditions).
- User-visible behaviour: the app asks for the device location when it opens, shows the forecast as today plus two days ("Today" label), adds distinct messages for rate limit, unreadable response and no connection, a Retry for a failed search, "City, Country" / "City, State" search qualifiers, and drizzle and day/night icons.
- Privacy and security: an always-visible footer disclosure (searched city and rounded device location go to Open-Meteo, which may log coordinates for 90 days), `cache: 'no-store'` on provider requests, a Content-Security-Policy meta tag, and new release-build gate checks (no service worker, 200,000 byte gzipped JS budget, CSP present).
- **Breaking for anyone with saved favorites:** the stored favorites shape changed and old favorites are discarded, not migrated.
- Removes the invented-data ("demo") mode and its scripts, source, tests and harness.
- Replaces the Edge/Chrome browser tests with 270 Playwright tests across five engines (Chromium, Firefox, WebKit, emulated Pixel 7 and iPhone 14).
- Several important items are NOT done or NOT verified: no manual device checks, the `no-store` CORS preflight on Firefox/WebKit and the real rate-limit response are unobserved, and the approved port migration is unfinished.

## Changes made

### Location and privacy
- Position requested at launch; "Use my location" asks again (`src/core/locationFlow.ts`, `src/core/appController.ts`).
- App-owned 10 s location watchdog; the browser `timeout` option is no longer passed; the Permissions API "change" event is used while waiting (`src/adapters/web/geolocation.ts`). Two timeout texts, M-10 and M-11.
- Footer privacy disclosure (M-24, option A) always shown; `aria-describedby` on the location button removed (`src/ui/Footer.tsx`).

### Search
- Qualifier rules: text is split at the first comma; only the first part goes to the geocoder; the rest filters by region or country, case-insensitive, whole value (`src/core/search.ts`). Up to 20 candidates are fetched for a qualified search, 5 are shown.
- Retry (M-34) for a failed search, re-submitting the last submitted text (`src/ui/SearchPanel.tsx`).
- Refresh is ignored while a search is pending; late results for an old selection are discarded.

### Weather display
- `forecastIncludesToday` is now `true`; the first forecast row reads "Today" (M-30) (`src/core/config.ts`, `src/ui/ForecastList.tsx`).
- New drizzle icon and night variants for clear and partly cloudy; "Sunny" by day, "Clear" at night or when day/night is unknown (`src/core/conditions.ts`, `src/ui/weatherIcons.ts`).
- Section-level failure messages (M-25, M-26) with Retry, and an out-of-date notice for kept values (M-27) (`src/ui/sectionFailure.ts`).

### Provider adapters
- `cache: 'no-store'` on every request; HTTP 429 maps to rate-limited (M-05); an unreadable body maps to invalid response (M-06); a cancelled request is an internal "aborted" outcome (`src/adapters/openMeteo/http.ts`).

### Favorites storage (breaking)
- Stored record changes from `{version, favorites}` to `{v, items}` with `centroid`, `providerId` and `timeZoneHint`. The old shape is discarded with the notice M-16 and no migration (`src/core/favorites/favoritesService.ts`).

### Build, security and tooling
- CSP as a `<meta>` tag added on `vite build` (`scripts/csp.mjs`, `vite.config.ts`).
- `scan:dist` also fails on a service worker, an over-budget bundle, or a missing/loose CSP (`scripts/scanDistLib.mjs`).
- `package.json`: scripts `dev:demo`, `build:demo`, `scan:dist:demo` removed; `test:browser:release` now selects the five `release-*` projects.
- `playwright.config.ts`: five bundled-engine projects; e2e served under `/weather-e2e/`.

### Removed
- `src/dev/` demo layer, `scripts/releaseGuard.*`, `e2e/harness.*`, and their tests (`test/security/releaseGuard.test.ts`, `test/ui/demoMode.test.tsx`, `test/ui/composition.test.tsx`).

### Documents
- Updated: `README.md`, `docs/deployment.md`, `requirements.md`, `architecture.md`, `design-review.md`, `impl-plan.md`, `verification.md`, `.claude/agents/sdlc-orchestrator.md`.
- New: `message-wording.md`, `provider-verification.md`, `conformance-review.md`, `test-triage.md`, `.env.example`, `test/contract/`.
- `documentation.md` (new), `CHANGELOG.md` and this description are added as documents.

## Verification

All figures are from `verification.md` (runs on 2026-11-02, 15:16 to 15:24 IST, on the working tree later committed as `10fca0b`). The commands were not re-run after the commit.

| Command | Result | Evidence |
|---|---|---|
| `npm test` | Passed | 54 files, 1439 tests, 0 failed |
| `npm run typecheck` | Passed | `tsc --noEmit`, exit 0, no output |
| `npm run lint` | Passed | `eslint .`, exit 0, no output |
| `npm run build:release` | Passed | exit 0; `scan:dist`: "no findings"; JS 285.15 kB (87.38 kB gzip by Vite; the scan counts 86,350 bytes gzipped against a 200,000 budget); 11 icons bundled |
| `npm run test:browser` | Passed | 270 passed (54 tests x 5 engine projects), 0 failed, 0 skipped, 0 flaky, `retries: 0`, 5.6 min. Open-Meteo is intercepted. |
| `npm run smoke:live` | **Passed** (3 of 3), after an earlier failure | Two earlier runs failed (exit 1, geocoding `{"kind":"network"}`) while DNS on the machine was failing intermittently. Re-run once the network resolved: exit 0, 3 of 3 passed against the real Open-Meteo API, before and after changing the forecast test to the app's real request (`DEFAULT_CONFIG`: today plus two days). Result: Berlin geocoded, current conditions parsed (including `is_day`), forecast dates 2026-11-02, 03, 04 (today first). It asserts shapes and ranges only, runs in Node (not a browser), and was not looped. `verification.md` Section 11. |

What this does not show (from `verification.md`):
- Behaviour against the real Open-Meteo API, including whether `cache: 'no-store'` is accepted without a CORS preflight on Firefox and WebKit.
- Any real device or real Edge, Chrome or Safari. Playwright's Firefox and WebKit are not Safari.
- `smoke:live` runs in Node, not a browser, so it does not show whether `cache: 'no-store'` triggers a CORS preflight on Firefox and WebKit (T-75), and it does not observe the real rate-limit response, so the 429 = rate limited assumption is unconfirmed.
- All 40 requirement IDs are marked "Passed (scope-limited)" in `verification.md`; none is fully verified because none has a real-provider, real-device or manual result. Assertions were read for 31 IDs, in part for 3, and 3 are judged from the previous run or titles alone.
- Code coverage and performance were not measured.

Approvals and review found in the repository:
- `requirements.md`: approved by the user 2026-10-30, open items deferred to the Architect (header). `architecture.md`: approved by the user 2026-10-30 with conditions (header). `design-review.md` Section 10 records approval with conditions per `verification.md`; I did not re-read it in full. `impl-plan.md` records plan approval 2026-10-30; `message-wording.md` line 5 records approval 2026-10-30, footer Option A.
- Authorization: `impl-plan.md` still says no implementation is authorized (stale text, see below). The authorization was given in the working session, not in a file: the user directed the work in steps (the two review blockers; then the major review findings, in four batches; then the re-review findings: refresh race, search Retry, remaining approved wording). It covers only that work, not the rest of the plan (Phase 2 port migration and later tasks).
- Code review: `conformance-review.md` is a static review (task T-01) of the earlier implementation. Two Code Reviewer passes over the working tree before it was committed were also run in the session: a first review (2 blockers, 11 majors) and a re-review after those fixes (2 new majors plus the incomplete wording). Their reports were returned in the session and are not saved as files. The fixes after the re-review (refresh race, search Retry, M-04/M-06/M-25..M-27, small minors) were verified by the tests in `verification.md` but have not had a further code review.

## Known limitations and not done

Not complete against `impl-plan.md`:
- **Phase 2/3 port migration (T-20..T-32) is unfinished.** `src/composition.ts` and the core services still use `LegacyGeocodingProvider`, `LegacyWeatherProvider` and `LegacyLocationService`. No class implements the approved `WeatherProvider`, `GeocodingProvider`, `LocationService` or `FavoritesApi` ports (`verification.md` O-3). The weather adapter still makes two requests (current and daily) instead of the approved single `get`. `FavoritesService` still works with the legacy `Location` shape and maps it at the storage boundary. `src/core/favorites/api.ts` and `test/contract/` are not wired to a real implementation (I did not read `test/contract/`).
- **Manual checks T-70..T-75 are all Not run:** real iOS/Android/Edge/Safari smoke, screen reader, keyboard walk-through, 200 % zoom and contrast, real Permissions API behaviour, live timing, and a real-browser CORS check that records the actual rate-limit response. The deployed-origin CSP check needs a host that is not decided (HOST).
- **Live-API evidence is limited** to the three `smoke:live` requests (geocoding, current conditions, forecast with today); see Verification. The browser CORS check and the rate-limit response are still open (T-75).
- **Browser coverage is partial (T-61..T-64).** No browser test for Refresh, the unit toggle, a firing 10 s watchdog, the cache mode, section Retry, favorite remove or duplicate, or the error boundary. Axe does not run with the new Retry button showing. Two Retry unit-test titles promise more than they assert (over-long input; focus moving into the search form), and the `timeout` search error has no Retry test.
- **Stale document text:** `impl-plan.md` still says "NO IMPLEMENTATION HAS BEEN DONE" and lists blocked/unblocked statuses and a test count of 51 (actual 54 files); `design-review.md` header, `architecture.md` lines 13 and 166, `requirements.md` header row 9 and `message-wording.md` line 8 still say "not approved" while other sections record approval. `README.md` also still calls TASK-046 blocked and says "not yet reviewed" for earlier work. T-10..T-15 and T-20..T-27 are not marked Done.
- **Minor cleanup items:** the legacy test labels (`TASK-025`, `AC-00n-m`, `EC-0nn`, `FR-007`) do not match current IDs; only some tests carry `REQ-` IDs; 15 of 45 catalogue messages are not cited by any test, and only 12 were compared character by character with `message-wording.md`; `test-triage.md` lists 52 test files, the repository has 54; the device location label is always "Current location" (no reverse geocoding); the jsdom `getContext()` "Not implemented" warning appears during `npm test` (no test fails).
- **CSP limits:** delivered as a meta tag, so `frame-ancestors`, `report-uri` and `sandbox` are ignored. A real response header would need a host that allows it.
- **Nothing is deployed.** The host is undecided; the expected GitHub Pages URL in the docs is unverified.
- **Not included:** the untracked `archive/` directory (old material, not used as input) is not part of this branch.

## Assumptions needing reviewer or user confirmation

These are recorded in `verification.md`, `architecture.md`, `provider-verification.md` or the source comments. None is a user-approved value unless the document says so.

1. **10 s location watchdog** (`locationTimeoutMs`) is an architecture proposal; requirements item Q10 is open. It is proved with fake timers only.
2. **Old-shape favorites are discarded**, not migrated, with the M-16 notice. This loses data for existing users and needs an explicit decision.
3. **CSP as a `<meta>` tag**, because the target static host (U5) usually cannot set headers (`docs/deployment.md`, T-51 leaves this to the user).
4. **Exact-match search qualifiers** (case-insensitive, whole value; the comma split is at the first comma). Diacritic and spelling tolerance has no approved rule (A-Q5, Q5 sub-question 11.4).
5. **HTTP 429 means "rate limited".** The provider's actual limit response is NOT CONFIRMED (`provider-verification.md` item 2; check T-75).
6. **Forecast includes today** (`forecastIncludesToday: true`). Q13 (includes-today and date format) is open; the format "Thu, Mar 5" is the implemented choice. The provider docs do not explicitly say whether `forecast_days` counts today (`provider-verification.md` item 4).
7. **Icon set and day/night variants** (Lucide, 11 icons including drizzle and night variants): Q16 is open and these are not user-approved.
8. **Device location is not favoritable** and is labelled "Current location" (Q12/Q23 open).
9. **`cache: 'no-store'`** on all provider requests: its CORS and preflight behaviour with the real provider on Firefox and WebKit is unverified.
10. **Open items deferred to the Architect and not user-approved values:** Q2 (browsers and breakpoints), Q26 (accessibility standard), Q29 (performance target).
11. **Bundle budget** "200 KB" is read as 200,000 bytes (the stricter reading).
12. **Playwright engines** (Chromium, Firefox, WebKit, emulated phones) stand in for the real browsers; real-browser checks are manual and not done.

## Reviewer checklist

- [ ] Confirm the scope: this branch is a partial rework and is not complete against `impl-plan.md`; decide whether it should be merged in this state.
- [ ] Confirm that discarding old-shape saved favorites (no migration) is acceptable.
- [ ] Review the assumptions list above and confirm or change each.
- [ ] Check that the removed demo layer leaves no references (`npm run build:release` reports "no findings"; `grep` for `demo` in `src`).
- [ ] Check the privacy footer text against `message-wording.md` (M-24, option A).
- [ ] Check `src/adapters/openMeteo/http.ts`: no custom request headers, `cache: 'no-store'`, 429 mapping.
- [ ] Check `src/core/favorites/favoritesService.ts`: validation, discard path and that device locations are never written.
- [ ] Check `scripts/csp.mjs` and `vite.config.ts`: policy contents and that it applies to `vite build` only.
- [ ] Decide which untracked files belong in the change (`archive/`, SDLC documents, `test/contract/`).
- [ ] Decide whether `test/live/openMeteo.live.ts` should be updated to include today.

## Test plan

Automated (results above, from `verification.md`):
- [x] `npm test` (54 files, 1439 tests)
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run build:release` (`scan:dist`: no findings)
- [x] `npm run test:browser` (270 tests, 5 engines)
- [x] `npm run smoke:live` on a network with working DNS (passed 3 of 3 on 2026-11-02 after two earlier DNS failures; run once, do not loop)

Manual, not run:
- [ ] T-70: real-device and real-browser smoke (iOS Safari, Android Chrome, desktop Edge and Safari) on an HTTPS test host
- [ ] T-71: screen-reader pass
- [ ] T-72: keyboard walk-through, 200 % zoom, contrast check
- [ ] T-73: Permissions API behaviour on real browsers (unanswered prompt, change event)
- [ ] T-74: live provider smoke with timing observations
- [ ] T-75: real-browser CORS check under the CSP, recording the real rate-limit response (also settles `no-store` preflight on Firefox and WebKit)
- [ ] Deployed-origin HTTPS and CSP check (needs HOST)
- [ ] Re-run `verification.md` after any further change in `src/`, `test/`, `e2e/`, `scripts/` or config

🤖 Generated with [Claude Code](https://claude.com/claude-code)

