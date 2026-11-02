# Documentation: Weather Forecasting Application

| Field | Value |
|---|---|
| Written | 2026-11-02, by the Documentation Agent, from the repository files only (no network, no GitHub, no test or build run by this agent) |
| Repository / branch | `claude-project` / `feature/weather-app`; HEAD `50bf7d8`; local tracking info shows `origin/feature/weather-app` at the same commit |
| Working tree | **Uncommitted.** `git status --short` lists 144 paths (about 125 tracked files modified or deleted, about 25 untracked). Nothing was committed or pushed by this work. |
| Overall status | **NOT COMPLETE against `impl-plan.md`. Partially Complete.** A large part of Phases 1, 2, 4 to 6 is in the working tree and passes the automated checks recorded in `verification.md`, but the approved-port migration (T-20..T-32) is not done, manual checks T-70..T-75 are not run, and there is no live-API evidence. See Sections 3, 5 and 7. |
| Earlier `documentation.md` | Deleted from the working tree before this file was written. It was not used. `archive/` was not used. |

## Contents

1. [Overview and SDLC stage record](#1-overview-and-sdlc-stage-record)
2. [What is implemented in this working tree](#2-what-is-implemented-in-this-working-tree)
3. [What is NOT done](#3-what-is-not-done)
4. [Review history](#4-review-history)
5. [Verification summary](#5-verification-summary)
6. [Assumptions awaiting user confirmation](#6-assumptions-awaiting-user-confirmation)
7. [Release status](#7-release-status)
8. [Source files read for this document](#8-source-files-read-for-this-document)

Status words used: **Completed** (supported by evidence in a file), **Pending**, **Blocked**, **Unverified**, **Not confirmed** (could not be established from the files).

---

## 1. Overview and SDLC stage record

### 1.1 Overview

A client-side, single-page responsive web app (TypeScript, React 19, Vite) that shows current weather and a 3-day forecast (today plus two days) for a searched city, the device location, or a saved favorite. It has refresh, a Celsius/Fahrenheit toggle, and favorites kept in `localStorage`. There is no backend of its own; the browser calls the Open-Meteo weather and geocoding APIs directly (no API key). Sources: `architecture.md` Section 1, `README.md`.

### 1.2 User story and Jira stories

| Source | Content |
|---|---|
| `.claude/input/userstory.md` | US-001 Search by city (5 AC); US-002 Device location (5); US-003 Current weather details (5); US-004 3-day forecast (5); US-005 Refresh (5); US-006 Favorites (6); US-007 Simple interface (6). 37 acceptance criteria. |
| `requirements.md` Section 0 | Jira project WF, WF-1..WF-7 (https://jayasriap.atlassian.net/browse/WF-1 .. WF-7), read-only retrieval on 2026-10-30, all type Story, status To Do. Titles match US-001..US-007 one to one. This agent did not re-read Jira; the mapping is from the titles recorded in `requirements.md`. |
| `requirements.md` Section 6 | 37 Jira ACs traced to 37 requirements (REQ-WF1-01..REQ-WF7-06) plus 3 derived (REQ-X-01..03) = 40 requirements. |

### 1.3 SDLC stage record

Approval evidence and dates are quoted as stated in each artifact. This agent did not verify them against any session log.

| Stage | Artifact | Status stated in that artifact | Approval evidence and date in that artifact |
|---|---|---|---|
| 1 Requirements | `requirements.md` | APPROVED BY USER, open items deferred to the Architect (Section 12) | The user typed "approve the requirements"; 2026-10-30 (Section 12). Earlier the same day the user typed "accept all defaults" for the clarification questions (not an approval of the document). Still open per Section 11: Q2 browsers/breakpoints, Q10 timeout value, Q26 accessibility standard, Q29 performance, Q3 provider choice, Q12/Q23 favoriting a device location, Q13 includes-today and date format, Q16 icon set, P-OUT-2/3/4. |
| 2 Architecture | `architecture.md` | APPROVED BY USER (2026-10-30) with conditions (header row 5, Section 11) | The user chose "Accept all proposals" for the 19 decisions in `design-review.md` Section 9.2; 2026-10-30. Conditions: provider checklist (DR-08) before implementation; U6, U5, U7 not decided at that time; DR-18..DR-22 for the Planner. |
| 3 Design review | `design-review.md` | Section 10 "Approval Record": APPROVED WITH CONDITIONS | Same "Accept all proposals" choice; 2026-10-30. Review: round 0 plus re-review round 1 of 1; 13 of 16 findings resolved, 3 partial (DR-01, DR-02, DR-08), 5 new Low findings (DR-18..DR-22). |
| 4 Planning | `impl-plan.md` | PLAN APPROVED BY USER (2026-10-30) (header rows 5-6); 50 tasks in phases 0 to 8 | "Approve plan, start T-01/T-02/T-08", 2026-10-30. Authorization to implement (gate AUTH, row at line 65): Phase 1 (T-10..T-15) on 2026-10-30 ("Phase 1 only"); Phase 2 (T-20..T-27) on 2026-10-31 ("authorize phase 2"). **No authorization for Phase 3 or later is recorded in `impl-plan.md`.** |
| 4a Decisions (Phase 0) | `impl-plan.md` T-00..T-08 | T-00, T-01, T-02, T-03, T-04, T-05, T-06, T-08 Done; T-07 "UPDATE 2026-10-30: DONE" in its cell | T-03 ADAPT (`src/core`, `src/adapters`, `src/ui`, `scripts/`, `e2e/`), DISCARD `src/dev`; T-04 NON-COMMERCIAL; T-05 Open-Meteo confirmed with a real-browser CORS/rate-limit check (T-75) as a condition; T-06 any static HTTPS host, origin configurable, deployment out of scope. All 2026-10-30. |
| 4b Provider check | `provider-verification.md` | 8 items, findings only | Web-enabled agent, user-directed, 2026-10-30. NOT CONFIRMED: HTTP status for an exceeded limit; CORS in the documentation; stability of geocoding `id`; presence of `admin1`/`timezone` on every result; reverse geocoding (not documented, `/v1/reverse` observed 404). |
| 4c Conformance review (T-01) | `conformance-review.md` | Static review, findings F-01..F-13, no decision | Saved by the Orchestrator from the Code Reviewer's report. No tests, builds or scans were run. Its tallies do not match its own tables; the Orchestrator note records the recomputed counts. |
| 4d Wording (U7/T-07) | `message-wording.md` | Line 5: APPROVED BY USER (2026-10-30), footer Option A | Approval record (end of file): "Approve, footer Option A", no edits, 2026-10-30. 45 messages M-01..M-45. |
| 5 Implementation | working tree | Not recorded as Done in `impl-plan.md` (no task is marked Done or In Progress beyond Phase 0) | `test-triage.md` (T-15, 2026-10-30) is the only implementer-written record. See Section 2. |
| 6 Code review | no review report file | Not confirmed from files | See Section 4. |
| 7 Verification | `verification.md` | Second re-verification, 2026-11-02 | See Section 5. |
| 8 Release | `CHANGELOG.md`, `PULL_REQUEST.md` | Absent when this file was drafted; being written by another agent | Not read or reviewed here. Nothing committed, pushed or published. See Section 7. |
| 9 Documentation | this file | Written 2026-11-02 | n/a |

### 1.4 Stale-header discrepancies (listed, NOT fixed)

The files below contradict themselves or each other. They were not edited by this agent. Where a file's own later section explains the conflict, that is noted.

| # | Location | What it says | What the same or another file says |
|---|---|---|---|
| D1 | `impl-plan.md` header, line 5 | "NO IMPLEMENTATION IS AUTHORIZED ... T-07 partly decided (wording draft ... NOT approved)" | Line 65 (AUTH row) records Phase 1 (2026-10-30) and Phase 2 (2026-10-31) authorization; line 103 (T-07) says "UPDATE 2026-10-30: DONE" |
| D2 | `impl-plan.md` line 11 | "NO IMPLEMENTATION HAS BEEN DONE under this plan. No implementation task is In Progress or Complete" | Working tree contains implementation (Section 2); `verification.md` Section 8 item 1 records the same conflict |
| D3 | `impl-plan.md` lines 20, 64, 204, 279 and many Status cells | U7 "the only remaining decision blocker", `message-wording.md` "NOT approved"; tasks shown "Unblocked - awaiting user authorization" | `message-wording.md` approval record and line 103 of the plan itself |
| D4 | `impl-plan.md` lines 31, 117, 368 | `test/` has 51 files | 54 `*.test.ts(x)` files and 78 files in `test/` now (counted by this agent); `test-triage.md` reports 52 and 76 at the end of Phase 1; it also says HEAD had 73 |
| D5 | `design-review.md` header rows 9-10, Section 9.1, lines 316 and 341 | "NOT APPROVED", human decision "PENDING" | Section 10 (line 376): APPROVED WITH CONDITIONS, 2026-10-30. The file's own note at line 383 says Sections 1-9 describe the earlier state. |
| D6 | `architecture.md` line 13 | "Decisions needing user approval ... None is approved" | Header row 5 and Section 11 (line 454): approved with conditions, 2026-10-30 |
| D7 | `architecture.md` lines 12 and 166 | "PROVIDER FACTS ARE UNVERIFIED"; Open-Meteo "Proposed; provider unapproved, facts unverified" | `provider-verification.md` (2026-10-30) and `impl-plan.md` T-05 (provider confirmed). Not asked for by the task but found while reading. |
| D8 | `requirements.md` header row 9 (and Sections 4.8, 9) | "This is NOT approval of this document, which is still unapproved" | Section 12 and header rows 5-6: approved 2026-10-30 |
| D9 | `message-wording.md` line 8 | "Nothing in this file is approved. No text below may be treated as final" | Line 5 and the approval record: approved 2026-10-30, footer Option A |
| D10 | `test-triage.md` ("Files retired or deleted in Phase 1") | `e2e/accessibility.spec.ts`, `browserApis.spec.ts`, `layout.spec.ts` "retire (deleted, T-14)" | These three files exist in the working tree as modified files (209, 211, 114 lines) and run in `verification.md`; the triage reflects the end of Phase 1 only |
| D11 | `README.md` | Scan row says the pinned icon set is 8; "Current state" uses TASK-0nn ids and says "Nothing is release-ready (TASK-046 is blocked)"; says open questions OQ-001..OQ-014 are unanswered; says the feature specs are "being rebuilt in T-60/T-61" | `verification.md`: `scan:dist` reports 11 icons bundled and the pinned set is 11 (`docs/deployment.md` line 21); the OQ numbering belongs to the earlier requirements, not the current `requirements.md`; three feature specs now exist |
| D12 | `docs/deployment.md` | Line 7 build sizes and "last release build 2026-10-27, base `/claude-project/`"; line 21 "8 icons" in the last-run sentence | Latest build in `verification.md`: JS 285.15 kB (87.38 kB gzip), 11 icons, 2026-11-02 |
| D13 | `architecture.md` Section 7 item 7 vs implementation | Date example "Thu, 30 Oct" | `test/core/format.test.ts` asserts "Thu, Mar 5" (locale `en`); `verification.md` calls the date format an open item (Q13). Whether the user accepted this difference: not confirmed. |
| D14 | `impl-plan.md` T-27/T-45 etc. vs `src/` | Plan paths and names (e.g. `UnitToggle`, `FavoritesPanel` "intended") | Source comments still cite `TASK-nnn`, `FR-nnn`, `ODD-n`, `F-00n` ids from the earlier implementation (71 occurrences in 42 `src/` files by grep) |

---

## 2. What is implemented in this working tree

Evidence is the working tree (`git status`, `git diff --stat`: `src` 47 files, `test` 49, `scripts` 8, `e2e` 6 modified or deleted, plus untracked additions) and the cited tests. "Implemented" here means code exists and the named tests passed on 2026-11-02 (`verification.md`); it is not a statement that the approved architecture is fully met (Section 3). No `impl-plan.md` task from Phase 1 onward is marked Done in the plan.

### 2.1 Phase 1 (T-10..T-15)

| Task | What the files show |
|---|---|
| T-10 Toolchain | `package.json`, `playwright.config.ts`, `vite.config.ts`, `vitest.live.config.ts` modified; `.env.example` added (names only, `VITE_BASE=`); base path from `VITE_BASE` via `scripts/baseUrl.mjs`; Playwright projects release-chromium, -firefox, -webkit, -mobile-chromium, -mobile-webkit (`verification.md` Section 4, command 6). `typecheck`, `lint`, `test`, `build:release` exit 0 (`verification.md`). |
| T-11 Config | `src/core/config.ts`: typed, validated `createConfig`; watchdog 10 s, request timeout 10 s, `forecastDays` 3, `forecastIncludesToday` true, breakpoints 768/1024, min width 320, input cap 100, `searchResultLimit` 5 (max 100), `qualifiedSearchFetchLimit` 20, `coordinateDecimals` 2, `bundleBudgetGzipBytes` 200000. `test/core/config.test.ts`. |
| T-12 Domain and errors | `src/core/domain.ts` defines the approved `Coordinates`, `Place`, `SelectedLocation`, `Current`, `Day`, `WeatherResult`; `src/core/errors.ts` has the 11 approved kinds plus internal `aborted`. `test/core/domainModel.test.ts`, `errors.test.ts`. |
| T-13 Ports and fakes | `src/core/ports/*` define `WeatherProvider.get`, `GeocodingProvider`, `LocationService.getPosition(signal)`, `KeyValueStore`, `Clock`; `src/core/favorites/api.ts` (Place-only `FavoritesApi`); fakes in `test/fakes/`; shared contracts in `test/contract/`; compile-time guard `test/core/favoritesApi.test.ts`. The legacy ports sit beside them (Section 3). |
| T-14 Remove `src/dev` | `src/dev/*`, `scripts/releaseGuard.*`, `e2e/harness.*`, `test/security/releaseGuard.test.ts`, `test/ui/demoMode.test.tsx`, `test/ui/composition.test.tsx` deleted; `src/main.tsx` always calls `composeLive()`; `scripts/demoMarkers.mjs` kept as a regression guard. The plan's grep criterion was not re-run by this agent. |
| T-15 Test triage | `test-triage.md` (stale in places, D4 and D10). |

### 2.2 The two blockers

| Item | Evidence |
|---|---|
| `cache: 'no-store'` on provider calls | `src/adapters/openMeteo/http.ts` line 86 (shared fetch init); asserted in `test/adapters/openMeteo/weather.test.ts`, `geocoding.test.ts` and `test/ui/liveComposition.test.tsx` (`verification.md` REQ-WF5-02). No browser-level assertion exists. |
| Device location requested at app open, with the app-owned watchdog | `src/core/locationFlow.ts`: the call is made at open; no browser timeout is passed; watchdog (10 s) starts at the call when permission is `granted` or the Permissions API is unusable, and only on a `granted` change when the state is `prompt`; denied makes no call; late result applied only if the selection is unchanged. `src/adapters/web/geolocation.ts` changed accordingly. Tests: `test/core/locationFlow.test.ts`, `test/ui/location.test.tsx`, `test/scenarios/acceptance.test.tsx`, `e2e/browserApis.spec.ts`. The watchdog is proved with fake timers only (no browser test lets it fire). |

### 2.3 Review fixes

| Fix | Evidence in files |
|---|---|
| Footer M-24 privacy disclosure (Option A) | `src/core/messages.ts` `ui.footer.privacy`; `test/ui/footer.test.tsx` compares it with the catalogue text, requires it once and visible, and pins `coordinateDecimals = 2`. |
| Rate-limit and abort handling | `errors.ts` kinds `rate_limited` and `aborted`; HTTP 429 mapped to `rate_limited` and a caller abort not mapped to `network` (`weather.test.ts`, per `verification.md` REQ-WF1-05 item 7). The 429 mapping is an assumption (Section 6). |
| Approved wording | `src/core/messages.ts` follows `message-wording.md`; `test/core/messages.test.ts` added. Tests cite 30 of 45 IDs; the Verifier compared 12 character for character (M-02, 04, 05, 06, 10, 11, 16, 24, 25, 26, 27, 34); the rest are Unverified. |
| Search A-Q5 rules | `src/core/search.ts`: trim and collapse whitespace; split at the first comma; qualifier terms must equal region or country, case-insensitively, whole value; request `qualifiedSearchFetchLimit` candidates when a qualifier exists; zero matches gives not-found (M-02); 100-character cap; empty input makes no provider call. |
| Presentation fixes | `src/core/conditions.ts`, `src/adapters/openMeteo/conditionCodes.ts`, `src/ui/ConditionView.tsx`, `WeatherIcon.tsx`, `weatherIcons.ts` (drizzle category, `isDay` aware Sunny/Clear text, 11 Lucide icons bundled), "Today" label on the first forecast day, forecast dates in English via `Intl` with the location time zone (`src/core/format.ts`). |
| Favorites identity and storage, M-16 notice | `src/core/favorites/identity.ts`: key = NFC, trimmed, whitespace-collapsed, lower-cased `name\|admin1\|country`, provider ID not in the key. `favoritesService.ts`: record `{v:1, items}`; unknown version, bad item or duplicate key discards the whole record and raises `dataDiscarded`; `FavoritesPanel.tsx` shows M-16. Device locations are refused. |
| Controller-wide single-flight and the refresh race fix | `src/core/appController.ts`: one `activeLoad` flag; a new selection aborts and releases before the new load; a refresh while a search is pending is ignored (N1); a refresh result applies only while the selection is unchanged (DR-18). Tests in `test/core/appController.test.ts`, `test/ui/refresh.test.tsx`, `acceptance.test.tsx`. |
| Opaque device key | `locationFlow.ts`: `UNRESOLVED_DEVICE_LOCATION_KEY` plus a counter; never derived from the coordinates (conformance F-09). Test "M1: ... never written to storage". |
| `scan:dist` service-worker and gzip checks | `scripts/scanDistLib.mjs`, `scanDist.mjs`: fails on a service-worker file or `serviceWorker` reference, and on summed gzip JavaScript above 200000 bytes (latest: 86350). `test/security/scanDistRules.test.ts` ties the budget and the CSP origins to Config. |
| Meta-tag CSP | `scripts/csp.mjs`; `vite.config.ts` adds the `<meta http-equiv="Content-Security-Policy">` on `vite build` only; `checkCsp` in the scan. Policy: `default-src 'self'`, `connect-src` the two Open-Meteo origins, `object-src 'none'`. A meta tag cannot carry `frame-ancestors` or reporting (`docs/deployment.md`). |
| Retry button M-34 | `src/ui/SearchPanel.tsx`, `sectionFailure.ts`: Retry re-submits the last trimmed search text for service, network, rate_limited, timeout and invalid_response; not for not-found or empty/over-long input. Unit and e2e tests (`verification.md` REQ-WF1-05 detail). |
| M-04, M-06, M-25, M-26, M-27 | Messages and section failure handling (`sectionFailure.ts`, `CurrentWeatherCard.tsx`, `ForecastList.tsx`); asserted with exact text in `currentWeather.test.tsx`, `forecast.test.tsx`, `release.spec.ts`. M-25/M-26 cover only a single unreadable section (Section 6). |

### 2.4 New browser specs

`e2e/` now holds `accessibility.spec.ts`, `browserApis.spec.ts`, `layout.spec.ts`, `release.spec.ts` and `support.ts`. Playwright ran 270 tests (54 per project x 5 projects), all passed (`verification.md`). Coverage: axe in 7 states at 320 and 1280 px; breakpoints 320/767/768/1023/1024/1280 px and a resize test; geolocation grant, refuse, unavailable, unsupported and unanswered prompt; `localStorage` persistence across reload, five corrupt-record variants, missing and failing storage; the release build with the two Open-Meteo hosts intercepted (HTTPS GET only, CSP, no console output, no Referer); failed-search Retry and the M-04/M-06 messages.

---

## 3. What is NOT done

**The project is not complete against `impl-plan.md`.** No Phase 1 or later task is marked Done in the plan (D1 to D3), and the items below are open on the evidence of the files and `verification.md`.

### 3.1 Impl-plan tasks not started or not finished

| Tasks | State from the code and plan |
|---|---|
| T-20..T-27 (core logic on the approved ports) | **Not done as specified.** The services still consume `LegacyGeocodingProvider`, `LegacyWeatherProvider` and `LegacyLocationService` (`src/composition.ts` lines 28, 41-43, 63, 69, 86-88; 39 `Legacy*` references in 12 `src/` files). `WeatherService` still makes two provider calls (current, forecast) and returns the legacy snapshot. Parts done on the legacy path: T-21 search rules, T-24 condition/format parts, T-25 wording, T-26 watchdog, T-27 single-flight, T-22 storage record and key. **T-23 Settings untouched**: `src/core/settings.ts` still stores `{version:1, temperatureUnit}`, not `{v:1}`. `src/core/forecast.ts` unchanged. |
| T-30, T-31 (approved adapters) | **Not done.** The Open-Meteo adapters still implement the legacy two-method weather port (`getCurrent`, `getForecast`) and a legacy search port. No class implements `WeatherProvider.get`, `GeocodingProvider`, `LocationService` or `FavoritesApi` (`verification.md` O-3, grep). The single-request call (`current` + `daily`, `forecast_days=3`, `timezone=auto`, `is_day`) has no implementation behind the approved port. |
| T-32 (platform adapters) | **Not done** for the approved `getPosition(signal)` port; `BrowserLocationService` still exposes the legacy permission/position pair. The Clock is still inline in `composition.ts` (conformance F-13). |
| T-40..T-48 (UI) | **Partly done on the legacy types** (UI reads `Location`/`Section`, not `Place`/`SelectedLocation`). Components exist for search, location, current card, forecast, refresh, favorites, unit toggle, footer, status, error boundary. No remaining UI task is marked Done. T-48 (WCAG 2.1 AA) rests on axe and unit tests only. |
| T-50, T-51 | T-50 gates exist (service worker, gzip budget, secrets, markers). T-51 meta CSP exists and is checked in the release build; **the deployed-origin check is Blocked (HOST)**. |
| T-52 | Not started (conditional on a keyed provider; none used). |
| T-60..T-64 | **Partial.** Per `verification.md` Section 7 item 4: no browser test of Refresh, the unit toggle, a firing watchdog, the cache mode, section Retry, favorite remove or duplicate, or the error boundary. No axe run with a Retry button showing. T-64 (changed-payload refresh, cache option in a browser) not built. |
| T-70..T-75 (manual) | **Not run**: real devices, screen reader, keyboard/200% zoom/contrast, Permissions API on real browsers, live timing, real-browser CORS and rate-limit response. T-70 and the mobile part of T-73 also wait on HOST. |
| T-80 (hand-off) | Not produced. |
| Authorization | `impl-plan.md` records AUTH only for Phases 1 and 2. The working tree also contains Phase 4 to 6 style work. The user authorized the post-review fixes in the working session (blockers, majors in four batches, re-review fixes; see the session record in Section 4), but that authorization is not recorded in `impl-plan.md` and covers only those fixes. `verification.md` Section 9 item 3 says Phase 3 needs user AUTH; none has been given for the rest of the plan. |

### 3.2 Other open items

| Item | Detail |
|---|---|
| Unused approved types and config values | `Place`, `SelectedLocation`, `WeatherResult`, `FavoritesApi` and the approved port interfaces are referenced only in their own definitions (grep: 17 occurrences in 5 files, none in production wiring). `Config.minViewportWidthPx` and `staleAfterMs` are read nowhere outside `config.ts` and its test; `bundleBudgetGzipBytes` is read only by a test (the script keeps a copy). `maxFavorites` is read by the favorites service but is undefined by default. |
| "Unconfigured" demo-era mode | `AppMode = 'live' \| 'unconfigured'` remains in `src/composition.ts`; a "Weather is not set up yet" page (`ui.notConfigured.*`) is shown if no providers are injected. `composeLive` always injects them; the mode exists for tests. `test/ui/unconfigured.test.tsx` covers it. |
| Two abort representations | The legacy result variant `ABORTED` (`{ok:false, aborted:true}`, `src/core/aborted.ts`, `ports/locationService.ts`) coexists with the approved `AppError` kind `aborted` (`errors.ts`). Both are in use. |
| Stale comments | Source comments cite `TASK-nnn`, `FR-nnn`, `ODD-n`, `OQ-nnn`, `F-00n` ids from the earlier implementation (D14); `README.md` and `docs/deployment.md` carry older status text (D11, D12). |
| `docs/provider-checklist.md` | Records user answers of **2026-10-27** from the earlier implementation (TASK-001/002) and uses the old OQ/TASK numbering. It predates, and is not a substitute for, `provider-verification.md` (2026-10-30). Its A4 ("no reverse geocoding") agrees with `provider-verification.md` item 6. Not reconciled. |
| `test/live/openMeteo.live.ts` | Still calls `getForecast(place, 3, false, ...)` ("3-day forecast after today"); does not use `forecastIncludesToday: true`, `is_day`, the cache mode or the rate-limit path. Changing it needs the user's confirmation (`impl-plan.md` Section 6 item 7). |
| Fixtures | `test/fixtures/openmeteo/*` were recorded 2026-10-27; `forecast-current.json` lacks `is_day` and `forecast-daily.json` used `forecast_days=4` (`test-triage.md`). Re-recording needs a live request: not done. |
| Reverse geocoding | Not built (baseline option (a)); a device location is always "Current location" and cannot be favorited. |
| Open requirement items | Q2, Q10, Q13, Q16, Q26, Q29 remain without user-chosen values (Section 1.3). Tests check the architecture's proposals for these. |

---

## 4. Review history

**Source limitation.** No code-review report is stored in the repository: a search of all `*.md` files found no review report beyond `design-review.md` (design) and `conformance-review.md` (T-01, static). The two Code Reviewer passes below were run in the working session and their reports were returned there, not saved as files. The review history below is as reported to this agent by the Orchestrator in the task description; the right-hand column states what the files confirm.

**Session record (added by the top-level session after the Documentation Agent finished).** The user directed the post-review work in steps in the working session, outside any file: first the two blockers only; then the major findings of the first review, in four batches; then the open findings of the re-review (refresh race N1, search Retry for REQ-WF1-05, and the incomplete approved wording N3: M-04, M-06, M-25..M-27) plus three small minors (the `csp.mjs` test citation, a test pinning `coordinateDecimals` to 2, removal of `aria-describedby` from the location button). Authorization covers only that work, not the rest of `impl-plan.md`. The first review found 2 blockers and 11 majors (including the device-location, `no-store`, footer disclosure, rate-limit, abort, favorites, wording, search, presentation, single-flight, device-key, build-gate and browser-coverage findings); the re-review found that 11 of the 13 earlier findings were fixed and added N1, REQ-WF1-05 and N3. Items marked "not confirmed" in the table come from reports that exist only in that session.

| Step | As reported | What the files confirm |
|---|---|---|
| First code review | 2 blockers and 11 majors | The two blockers match Section 2.2 (`no-store`; location at open with the watchdog), and these correspond to `conformance-review.md` F-01 and F-02 (both rated High). The count of majors and their individual wording: **not confirmed** (no report file). |
| Fix batches for the first review | Footer M-24, rate-limit and abort handling, approved wording, search A-Q5, presentation fixes, favorites identity/storage with M-16, single-flight and refresh race fix, opaque device key, `scan:dist` checks, meta-tag CSP, Retry M-34, M-04/M-06/M-25/M-26/M-27 | Code and tests exist for each (Section 2.3). Which batch contained which fix: not confirmed. |
| Re-review | Findings N1, REQ-WF1-05, N3 | N1 is named in tests ("a refresh while a search is pending is ignored (N1, A-Q19)", `refresh.test.tsx` "(N1)"). REQ-WF1-05 (no Retry control for a failed search) is `verification.md` finding O-4 of the previous run, now closed by observation (Retry exists and is tested). N3: **not confirmed** (no occurrence in any file). |
| Fixes after the re-review | N1 and REQ-WF1-05 fixed; N3 fix reported | `verification.md` Section 1A confirms the N1 behaviour change and the Retry button by test evidence. |
| Remaining minor items | Reported as outstanding | Not confirmed from files. Items visible in `verification.md`: O-6 (two Retry test titles promise more than they assert: the over-long case, and focus moving into the search form); the `timeout`-kind Retry has no test; axe does not run with a Retry button showing; 3 requirements judged from test titles only (WF7-01, WF7-04, WF7-06). |
| Second review of the last fixes | **Did not happen** as far as the files show. The last two fix batches (the N1 refresh fix and the Retry/M-04/M-06 batch) were checked only by tests and by the Verifier reading assertions; they have not had a second code review. |

Other review records that do exist: `design-review.md` (19 decisions, DR-01..DR-22) and `conformance-review.md` (F-01..F-13, static, tests not run). Findings DR-18..DR-22 were accepted as Planner conditions (`design-review.md` Section 10).

---

## 5. Verification summary

Full detail: `verification.md` (Verifier, runs 2026-11-02 15:16 to 15:24 IST, HEAD `50bf7d8` plus the dirty tree). This agent did not re-run any command.

| Check | Result (from `verification.md`) |
|---|---|
| `npm test` | Passed: 54 files, **1439 tests**, 0 failed (previous run 1419) |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0 |
| `npm run build:release` | Passed, exit 0; `scan:dist` no findings; JS 285.15 kB (87.38 kB gzip; 86350 bytes gzipped against a 200000 budget); 11 icons bundled |
| `npm run test:browser` | Passed: **270** (54 tests x 5 projects), 0 failed, 0 skipped, 0 flaky, `retries: 0` |
| `npm run smoke:live` | **Failed**, run twice, exit 1, 3 of 3 tests each time. The geocoding request returned `{"kind":"network"}` after about 7.1 s while DNS on the machine was intermittently failing (`EAI_AGAIN` for one host; curl exit 6 for others). The weather requests were never sent. **There is no live-API evidence for the current adapter code.** |

Requirement coverage: all 40 IDs are rated "Passed (scope-limited)" (none "Verified"); 31 were assessed by reading assertions this session, 3 in part, 3 from the previous run, 3 from test titles only. Every pass is against fakes, recorded fixtures or an intercepted network.

Limitations (all from `verification.md`):

- smoke:live was not run successfully; even on a working network it would not exercise "today plus two days", `is_day`, the cache mode or the rate-limit path (O-1).
- `cache: 'no-store'` and its CORS preflight on Firefox and WebKit against the real provider are **unconfirmed** (O-2); Playwright intercepts the provider, and `release.spec.ts` lines 525-527 note that those engines add `Cache-Control` and `Pragma` themselves.
- Coverage is scope-limited: the legacy path is what is tested (O-3); browser suites T-61..T-64 are partial (Section 3.1); no coverage measurement tool exists; performance targets are not measured.
- Not run: manual checks T-70..T-75; real iOS, Android, Edge and Safari (Playwright WebKit/Firefox are not the real browsers).
- Messages: 12 of 45 compared with the catalogue character by character; the rest Unverified.
- Verification does not show release readiness (`verification.md` Section 9 item 7).

---

## 6. Assumptions awaiting user confirmation

"Bulk accepted" means the item is within the 19 decisions the user accepted with "Accept all proposals" on 2026-10-30 (`design-review.md` Section 10); that is not an individual confirmation of the specific behaviour as implemented.

| # | Assumption in effect | Where recorded | Status |
|---|---|---|---|
| 1 | 10 s location watchdog (architecture Q10 proposal) and no ceiling on an unanswered browser prompt (the waiting message plus "search instead" cue stay indefinitely) | `architecture.md` Section 7 item 2 and 3.3; `design-review.md` DR-20; `impl-plan.md` T-26 and Section 6 ("if the user wants a hard ceiling ... must supply that value") | Bulk accepted. `requirements.md` Q10 has no user-chosen value. No-ceiling is Open (DR-20 manual test T-73 Not run). |
| 2 | M-12 ("Location detection is not available in this browser") is shown for every `unsupported` outcome | `message-wording.md` M-12; `geolocation.ts` returns `unsupported` when the Geolocation API is missing | Within approved wording; use for other causes not confirmed. |
| 3 | M-08 settings hint appears only when the Permissions API itself reports `denied` | `locationFlow.ts` lines 127-151; `message-wording.md` M-08 | Within approved wording. |
| 4 | Search qualifiers ("City, Region/Country") must equal the region or country whole value, case-insensitively; `qualifiedSearchFetchLimit` is 20; first comma splits; no diacritic or spelling tolerance | `search.ts`; `config.ts`; `architecture.md` Section 8 (Q5) | Q5 assumption bulk accepted. The "exact whole value" rule and the value 20 are implementation choices: not individually confirmed. Spelling/diacritics: no approved rule (`requirements.md` 11.4). |
| 5 | Old-shape favorites (`{version, favorites}`) are discarded, not migrated; one bad or duplicate item discards the whole record, with the M-16 notice | `favoritesService.ts` header; `architecture.md` 3.4 (discard on invalid items); `message-wording.md` M-16 ("were cleared") | M-16 approved. The "one bad item discards all" and "no migration" rules: not individually confirmed. |
| 6 | The discarded-data notice (M-16) stays visible until the page is reloaded | `FavoritesPanel.tsx` line 61 shows it while `favoritesDataDiscarded` is true; the flag is never cleared in `favoritesService.ts` | Implementation behaviour; not confirmed with the user. |
| 7 | `maxFavorites` uncapped by default | `config.ts`; `requirements.md` Q23 ("no maximum") | Accepted via default Q23. |
| 8 | CSP delivered as a `<meta>` tag (cannot set `frame-ancestors` or reporting); the provider origins are duplicated in `scripts/csp.mjs`, and the budget in `scripts/scanDistLib.mjs` (tests guard drift) | `docs/deployment.md`; `impl-plan.md` Section 6 item 2 | "Whether that fallback is acceptable is the user's call": not confirmed. |
| 9 | HTTP 429 means "rate limited" (M-05) | `provider-verification.md` item 2 (status NOT CONFIRMED); `message-wording.md` M-05; plan T-30/T-75 | Unconfirmed provider assumption; T-75 Not run. |
| 10 | M-25/M-26 are used only when a single weather section is unreadable while the other is fine | `sectionFailure.ts`; `message-wording.md` M-25/M-26 | Within approved wording; whole-response failure uses the kind messages. |
| 11 | Refresh is unavailable (disabled) while a search is pending | `appController.ts`; `refresh.test.tsx` (N1); `architecture.md` Section 8 (Q19: old request aborted, new load starts) | Behaviour added by the N1 fix; whether the user accepts it for Q19: not confirmed. |
| 12 | `aria-describedby` was removed from the "Use my location" button; the privacy disclosure is only in the footer | `verification.md` Section 1A; `location.test.tsx`, `footer.test.tsx` | Not individually confirmed. The Verifier notes the tests do not show when the user sees the disclosure relative to the launch-time prompt. |
| 13 | Texts in use that are **not** in the approved catalogue: `error.inputTooLong`, `ui.unexpectedError`, `ui.status.*` (searching, loading weather, refreshing, label), `ui.dismiss`, `ui.tryAgain`, `ui.favoriteLimitReached`, `ui.favoriteNothingSelected`, `ui.settingsNotSaved`, `ui.current.updating/notLoaded/empty`, `ui.forecast.empty/notLoaded`, `ui.attribution.licenceLine`, `ui.link.newTab`, `ui.notConfigured.heading/body` | `src/core/messages.ts` compared with `message-wording.md` by this agent (not exhaustive); `messages.ts` itself marks `ui.unexpectedError` "Not an approved message" | Unapproved. Over-long input: a dedicated message was requested on 2026-10-27 (`docs/provider-checklist.md` C2), mapped to `empty_input` in the new taxonomy (`impl-plan.md` Section 6 item 6 asks the user or Architect to decide). |
| 14 | Forecast date format "Thu, Mar 5" (locale `en`, month before day) | `test/core/format.test.ts`; `architecture.md` example "Thu, 30 Oct" (D13) | Q13 date format is an open requirement item. |
| 15 | Forecast covers today plus two days; first card "Today" | `architecture.md` Section 7 item 7 | Bulk accepted; `provider-verification.md` item 4 confirms `forecast_days=3` starts today (observed). |
| 16 | Device coordinates are rounded to 2 decimals for every weather request; the code also rounds place centroids | `weather.ts` (`baseUrl`), `config.ts`; conformance row "Coordinate rounding" notes the architecture says device coordinates only | U8 bulk accepted for device coordinates; rounding of place centroids: not confirmed. |
| 17 | Condition icon set: 11 Lucide icons bundled including day/night and drizzle variants; the approved set was clear, partly cloudy, cloudy, fog, drizzle, rain, snow, thunderstorm plus a fallback with day/night only for clear/partly cloudy in the current card | `verification.md` REQ-WF3-02 note; `architecture.md` item 8 | Q16 open part; the exact pinned set is a build/test choice, not confirmed with the user. |
| 18 | Attribution placement (Open-Meteo link beside the location label, GeoNames credit beside the pick list and in the footer) | `impl-plan.md` Section 6 item 3; `provider-verification.md` item 1 | Open-Meteo's own view of "next to" is unconfirmed (`README.md`, `docs/deployment.md`). |
| 19 | Non-commercial use only; no ads, subscriptions | `impl-plan.md` T-04 | Decided 2026-10-30; any commercial use needs a fresh terms check. |
| 20 | Hosting: any static HTTPS host; the base path default is undecided (`/` by default; earlier docs assume `/claude-project/`) | `impl-plan.md` T-06, T-10 note, Section 6 item 8; `docs/deployment.md` | Base path default Open; HOST (test host) Open. |
| 21 | `smoke:live` kept as a manual, non-gating script | `impl-plan.md` Section 6 item 7 | Confirmation requested; not recorded. |
| 22 | Literal-string assertions on T-43/T-46 may wait for U7 | `impl-plan.md` Section 6 item 9 | Moot if U7 is cleared (D3), not recorded. |

---

## 7. Release status

| Item | Status |
|---|---|
| Commits | **None made by this work.** HEAD is `50bf7d8` ("Update pull request description for the pushed branch"); the working tree is uncommitted. |
| Push | **Not pushed** by this work. Local tracking shows `origin/feature/weather-app` at `50bf7d8`; the uncommitted changes are not on the remote. |
| Pull request | **None created** by this work. Whether a remote pull request exists for the branch: **not confirmed** (no remote lookup was made; the earlier `PULL_REQUEST.md` was a local draft). |
| `CHANGELOG.md`, `PULL_REQUEST.md` | Both were absent from the working tree (deleted versus HEAD) when this file was drafted. Another agent was writing them at the same time and they appear as modified files afterwards. They were not read or reviewed by this agent; this file does not describe their contents or confirm that they are complete. |
| Deployment / publishing | Nothing deployed or published. Hosting is undecided beyond "any static HTTPS host"; no CI workflow exists (`docs/deployment.md`). |
| Release readiness | **Not release-ready.** smoke:live failed (environment), manual checks T-70..T-75 not run, the approved-port migration (T-20..T-32) is incomplete, the deployed-origin CSP and CORS checks are Blocked (HOST), and several assumptions in Section 6 are unconfirmed. |

**Overall SDLC status: Partially Complete.** Requirements, architecture, design review, plan and wording are approved (with the stale headers in 1.4). Implementation is substantial but, by `impl-plan.md`, incomplete; code review is not documented in the repository; verification of the automated suites passed with the stated limits; release preparation and publication have not happened.

Next steps (from `verification.md` Section 9 and `impl-plan.md`, nothing new): re-run `smoke:live` on a reliable network; decide on authorization for Phase 3 onward and implement the adapters and services for the approved ports (T-20..T-32); close the browser-test gaps (T-61..T-64); decide HOST and run T-70..T-75; reconcile the stale headers (D1 to D14); get a second code review of the latest fix batches; re-verify after any change.

---

## 8. Source files read for this document

`.claude/input/userstory.md`, `requirements.md`, `architecture.md`, `design-review.md`, `impl-plan.md`, `message-wording.md`, `provider-verification.md`, `conformance-review.md`, `test-triage.md`, `verification.md`, `README.md`, `docs/deployment.md`, `docs/provider-checklist.md`; source spot-reads: `src/core/config.ts`, `errors.ts`, `messages.ts`, `aborted.ts`, `locationFlow.ts` (first 120 lines), `appController.ts` (lines 20-60), `favorites/favoritesService.ts`, `favorites/identity.ts`, `search.ts` (grep), `ports/index.ts`, `ports/locationService.ts`, `src/composition.ts`, `src/main.tsx`, `scripts/csp.mjs`, `scripts/scanDistLib.mjs` (grep), `.env.example`; plus `git status`, `git diff --stat`, `git log`, `git branch -vv` and file counts. Test bodies and the remaining `src/ui` files were not read by this agent; statements about them rely on `verification.md`.
