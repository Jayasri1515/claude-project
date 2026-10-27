# Weather Application - Verification Record

> **Supersession note added 2026-10-27 by the Implementer at the user's request (L3); no result, count or finding below was changed.** Statements below that say the weather icons are placeholders, that TASK-035 (icons) or TASK-025 (attribution) is "Blocked" or "Not built", that `IconSlot` is a placeholder, or that no real provider, attribution or CORS evidence exists were true when each run was recorded and are SUPERSEDED by the current state: TASK-035 is implemented (Lucide icons, ISC licence; the notice file `THIRD_PARTY_NOTICES.txt` ships in the build; how the icons look to a person is not human-verified); TASK-025 is implemented (credit in the footer AND inside the Current weather and Forecast panels, gated by `Config.attributionText`; Open-Meteo's own view of "next to" is unconfirmed); TASK-022, 023 and 037 are implemented (the provider is Open-Meteo; TASK-037 still needs a manual end-to-end check); TASK-024, 042 and 046 remain not approved or blocked. Affected passages (by their text): the AC-003-2 and AC-004-3 rows and the "placeholder icons" remarks (TASK-028, 029), the TASK-001/022 to 025/035/037/042/046 rows ("Not built / Blocked"), "`IconSlot` is a placeholder", and the Part B/C statements about placeholder `main.tsx`. Correction (2026-10-27): the changes made before Run 4 (disclosure text, `referrerPolicy`, stricter `scan:dist`, the `/claude-project/` base) ARE covered by Run 4 below (R4.1 commands 5-10, R4.4, and mutation checks M3, M4 and M13); the earlier sentence saying they were unverified predated Run 4. Only the following came after Run 4 and are NOT Verifier-run: the Implementer's icon-mapping pin in `test/ui/weatherIcon.test.tsx` (Implementer-reported) and later documentation/status edits. The test counts are distinct: 1199 is the Verifier's Run 4 count; 1209 is the Implementer-reported count after the icon pin. Also, TASK-037's manual end-to-end check was not done; the user accepted the automated real-API evidence instead (2026-10-27). The Implementer's own results are in `impl-plan.md` (TASK-022, 032, 035, 043). Further correction (2026-10-27): `impl-plan.md` Section 10 was corrected after these runs and now lists the approved tasks (TASK-024 and TASK-046 are not approved); statements below that Section 10 says no task is approved reflect the file at the time of each run.

# RUN 4 (CURRENT, 2026-10-27): all implemented tasks, including the provider adapters, attribution, icons, C2, C3 and TASK-042

> Historical record: statements about impl-plan.md Section 10 reflect the file at the time of this run; it was corrected afterwards (see top note).

Author: Verifier. Run 4 started 2026-10-27 02:19 local (IST, UTC+05:30). Commands were run from `<project root>` (not a git repository; no deployment, publishing, commit or push). **Run 4 supersedes Run 3 (Part A), Run 2 (Part B) and Run 1 (Part C) as the current evidence.** The sentence below that calls Part A "the current run", and every Part A statement about placeholder icons, "no real provider", "Blocked/Not built" tasks, test counts (813) and the 3-file release build, was true of that earlier run only.

**Scope:** TASK-003..021, 022, 023, 025, 026..034, 035, 036, 037, 038..041, 043..045; change requests C2 (INPUT_TOO_LONG) and C3 (wide-tier visual order = tab order); every review fix recorded in `impl-plan.md`; and TASK-042 (provider latency check), which the user approved. Not in scope: TASK-024 (not approved, no reverse geocoding), TASK-046.

**What was modified:** only this file. No source, test, configuration or `impl-plan.md` content was changed. I made 19 distinct *temporary* mutations of `src/` for spot-checks (R4.6; the first one was run twice because my helper script could not read its result file the first time); each was restored from a backup copy immediately, and a SHA-256 comparison of 163 files (`src`, `scripts`, `test`, `e2e`, `public`, `docs`, `package*.json`, configs, `index.html`, `README.md`, `.gitignore`) taken before and after was identical. Throwaway latency scripts were written to the user temp directory (outside the repository) and deleted. Side effects: `npm run build*` and `npm run test:browser` rewrite `dist/`; **`dist/` now holds the release build** (hashes identical after `build:release`, the negative build, `test:browser`, and my later local preview; the demo build in between replaced it, and `test:browser` rebuilt it).

## R4.1 Commands executed and results

| # | Command | Exit | Result (observed) |
|---|---------|------|-------------------|
| 1 | `npm run typecheck` | 0 | No diagnostics |
| 2 | `npm test` | 0 | 51 files, **1199 passed**, 0 failed, 0 skipped (12.8 s). Same counts in a second run with the JSON reporter (236 suites, 1199 passed, 0 pending, 0 todo). Output includes the jsdom message `Not implemented: HTMLCanvasElement's getContext()` (axe in jsdom; not a failure) |
| 3 | `npm run lint` | 0 | No output beyond the banner |
| 4 | `npm run build` | 0 | 1983 modules; `index.html` 0.58 kB, CSS 3.31 kB, `index-DRvIBnBb.js` 276.11 kB (85.13 kB gzip) |
| 5 | `npm run build:release` | 0 | Build as above, then scan: "scanned 4 file(s), not scanned 0, unreadable 0, icons bundled 8 (circle-question-mark, cloud, cloud-fog, cloud-lightning, cloud-rain, cloud-snow, cloud-sun, sun) ... release build ...; no findings" |
| 6 | `npm run scan:dist` (release build) | 0 | Same line, no findings |
| 7 | **Negative:** `VITE_USE_DEMO=true npm run build:release` | **1 (expected)** | "Refusing to build: VITE_USE_DEMO=true is set ... use "npm run build:demo""; `dist/` hashes unchanged (4 files OK) |
| 8 | `npm run build:demo` | 0 | 1986 modules; 5 files incl. `demoComposition-GlYW8hDQ.js` 2.72 kB; main JS 271.49 kB |
| 9 | `npm run scan:dist:demo` (demo build) | 0 | "scanned 5 file(s) ... demo build: demo markers allowed); no findings" |
| 10 | **Negative:** `npm run scan:dist` on that demo build | **1 (expected)** | 10 findings printed (demo chunk and module file names, `composeDemo` in 2 files, `demo:` prefix, `Testville`, `Sampleton`, `Partialia`, `Glitchton`, demo-module reference); "FINDINGS (see above)" |
| 11 | `npm run test:browser` (after #10; rebuilt `dist/` as the release build) | 0 | **126 passed (3.0 m)**, 0 failed, 0 skipped, no retries. edge 49 (accessibility 13, browserApis 11, layout 25), chrome 49, release-edge 14, release-chrome 14. The release projects intercept both Open-Meteo hosts with recorded fixtures: **this suite makes no live API call** |
| 12 | `npm audit` | 0 | "found 0 vulnerabilities" (single run; registry reachable) |
| 13 | `npm run smoke:live` (once) | 0 | 3 real requests, 3 passed (3.2 s): geocoding "Berlin" -> Berlin, State of Berlin, Germany (Europe/Berlin), 1744 ms; current 7.9 C, 80 %, PARTLY_CLOUDY, observed 2026-10-26T20:45Z, 968 ms; forecast dates 2026-10-27, 28, 29, 254 ms |
| 14 | `sha256sum -c` on the 4 release `dist/` files | 0 | OK after #7, after #11 and after the latency runs |
| 15 | TASK-042 probes (R4.3) and 19 mutation runs (R4.6) | n/a | Described below. Mutation runs used `npx vitest run --reporter=json --outputFile=<temp>` (full suite each time) |

Inventory (per-file counts from the JSON reporter, all 0 failed): adapters: geolocation 19, localStorageStore 6, **openMeteo conditionCodes 50, geocoding 59, weather 99**; core 15 files (errors 19, format 24, others as Run 3) ; scenarios acceptance 37; security: baseUrl 33, demoMarkers 62, notices 12, privacy 7, releaseGuard 16, scanDist 72, secretScan 135, sourceScan 34; ui 20 files incl. **footer 38, liveComposition 10, weatherIcon 25, styles 17, status 35, location 14**; fakes 14; smoke 1. Net +386 since Run 3 (813 -> 1199).

## R4.2 Per-command and per-claim summary

Every command expected to pass passed and both commands expected to fail failed. This is evidence about code, logic, UI behaviour, demo/release separation and bundle scans in jsdom and in automated Edge 156 / Chrome 156, against **recorded** provider responses. Separately, #13 and the TASK-042 runs (R4.3) show the release build works against the **real** Open-Meteo APIs from this machine.

## R4.3 TASK-042: latency measurement and NFR-004

**Target (accepted by the user, `docs/provider-checklist.md` B3; `architecture.md` section 7):** loading state within 200 ms of search submit or refresh; current weather and forecast both displayed within 3 s for at least 90 % of requests under defined conditions; 10 s timeout (`weatherTimeoutMs`).

**Conditions (one machine, one network, one short window; not a guarantee):** Windows 11 laptop (AMD Ryzen 5 PRO 230, 12 threads, 33 GB), Wi-Fi 7 link (866.7 Mbps link speed; VPN or proxy status not checked); time zone Asia/Calcutta (India). Public IP and region were not looked up (no extra requests); the region is inferred only from the OS time zone. Node v24.21.0; Edge 156.0.4314.42 and Chrome 156.0.8078.48 driven by Playwright; release build served by `vite preview` on `http://localhost:4175/claude-project/` (origin `http://localhost`, not https). Times: smoke 02:24, Node probe about 02:25:35 to 02:26:51, browser runs 02:27:55 to 02:28:52, one value check 02:29 (all IST, 2026-10-27, night in India, late afternoon/evening in Europe). Cold = first request on a new connection (new browser process or first request in the Node process); warm = connection reused.

**Request volume:** 96 real Open-Meteo requests in total (smoke 3, API probe 60, browser timing 30, value check 3), with 3-4 s pauses; far under the stated limits. No HTTP error, timeout or non-200 occurred.

**A. API calls from Node (sequential, 20 cities, then a 3 s pause; not the app):** per city: 1 geocoding search (`count=5`), then the current and daily forecast calls in parallel, as the app does; response body read to the end. Milliseconds, nearest-rank percentiles, n = 20:

| Call | min | p50 | p90 | max |
|------|-----|-----|-----|-----|
| geocoding search | 272 | 345 | 1294 | 1309 |
| current weather | 199 | 273 | 1047 | 1108 |
| daily forecast | 199 | 273 | 1046 | 1104 |
| both weather calls in parallel | 199 | 273 | 1048 | 1108 |
| search + both (sequential, no human pause) | 475 | 587 | 2347 | 2415 |

The first four cities (Berlin, Paris, Mumbai, Tokyo, the first 15 s) were all slow (geocoding 1176-1309 ms, weather 969-1108 ms); the other 16 were fast (geocoding 272-404, weather 199-311). I do not know why (new connections, DNS, network warm-up, or server-side variation); the p90 is driven by those four.

**B. End to end in the built release app, real APIs, Edge (3 runs) and Chrome (3 runs), measured inside the page from the click event time:** each run was a new browser context; run 1 of each browser is a new browser process. Per run: search (1 geocoding call), choose the first match (2 weather calls), refresh (2 weather calls). 6 runs, 18 activations:

| Measure | Observations (ms) | p50 | p90 | max |
|---------|-------------------|-----|-----|-----|
| loading text visible after search click / choose click / refresh click | 3 to 10 (all 18) | 5 | 7 | 10 |
| search click to chooser shown | 1117, 1146, 1259, 1424, 1437, 1462 | 1259 | 1462 | 1462 |
| **choose click to BOTH sections rendered** | 864, 929, 962, 983, 1036, 1062 | 962 | 1062 | 1062 |
| search click to both sections (machine time, excluding the user's choosing pause) | 2046, 2108, 2295, 2301, 2407, 2524 | 2295 | 2524 | 2524 |
| refresh click to both sections refreshed | 213, 216, 232, 264, 273, 278 | 232 | 278 | 278 |

Cold vs warm: the first request to a host on a new connection costs roughly 0.7 to 1.0 s more (choose after a fresh context: 0.86-1.06 s; refresh on the now-warm connection: 0.21-0.28 s). Every run made exactly 5 Open-Meteo requests and produced no console output or page error. Responses carried `access-control-allow-origin: *` (checked in the value run, from origin `http://localhost`).

**C. Value check (Chrome, 1280 px, "Paris", 3 requests):** rendered 14°C, 93 %, Cloudy, forecast Tue Oct 27 Rain 19/11, Wed Oct 28 Cloudy 16/8, Thu Oct 29 Fog 16/6. API: current 13.8 C, 93 %, WMO 3; daily (first day, today in Paris, dropped) codes 61, 3, 45, max 18.7/15.6/15.6, min 10.7/7.7/5.9 for the shown days. All match the app's rounding and condition table. Dates are Paris calendar dates (the API's first day 2026-10-26 was dropped).

**Verdict vs NFR-004 (this machine/network/time only):**
- Loading state within 200 ms: **met in all 18 observed activations (max 10 ms)**.
- Both sections within 3 s: **met in 26 of 26 observations** (6 browser runs, from search click at most 2.52 s and from choice click at most 1.06 s; 20 Node sequences at most 2.42 s); refreshes at most 0.28 s. No request approached the 10 s timeout.
- The sample is too small to *demonstrate* a 90th percentile (n = 6 and n = 20, one region, one network, one window of about 5 minutes, not a peak period); the p90 figures above are descriptive. No other region, mobile network, poor Wi-Fi, other times of day, Firefox/Safari, a deployed https origin or rate-limit behaviour was measured. The margin to 3 s is about 0.5 s on the slowest end-to-end sequence if the user's choice is counted as part of it, so a network with a higher first-connection cost could miss the target. Result: **consistent with the accepted target here; not proof that 90 % of all users meet it.**

**Can TASK-042 be Complete?** The Verifier part (method and results recorded, in this section) is done. The plan's completion criterion also says the user decides the final NFR-004 value; the user accepted 200 ms / 3 s / 90 % before measurement. My recommendation: mark TASK-042 Complete (measurement recorded) once the user has seen these numbers and kept or changed the target; NFR-004 itself should read "accepted; consistent with one measurement on one machine/network", not "verified in general". I did not edit `impl-plan.md`.

## R4.4 AC and requirement mapping (Run 4 changes; unchanged rows keep their Run 3 status in A.4)

Basis: **Read** = I read the test bodies this run (`weather.test.ts` lines 1-330, `geocoding.test.ts` lines 1-200, `weatherIcon.test.tsx`, `liveComposition.test.tsx`, `release.spec.ts` lines 60-175, 340-395 and 476-559; Run 3 readings carry over); **Title** = titles and mutation-failure messages only (`footer.test`, `styles.test`, `errors.test`, `search.test*`, `location.test`, `e2e/layout.spec`, `e2e/accessibility.spec`, `e2e/browserApis.spec`, other parts of `release.spec`); **Mut** = broke `src/` and a test failed (R4.6); **Live** = ran against the real API (R4.3).

| Item | Evidence | Status |
|------|----------|--------|
| AC-001-1 (search, show weather) | acceptance, `liveComposition` "search -> choose -> weather", `release.spec` (recorded), **Live**: about 28 real searches (20 Node, 6 browser, 1 value check, 1 smoke) | **Verified (fakes, recorded responses, and real API from this machine)** |
| AC-001-3 (no match), AC-001-5 (service error) | `liveComposition` ("no results key" -> "City not found"; 400 -> generic message, no provider text), `release.spec` 503 and network failure, geocoding/weather adapter failure tests (Read) | Verified (recorded). A real provider outage was not observed |
| C2 over-long input (INPUT_TOO_LONG; user-approved change request with an architecture amendment note) | `errors.test`, `search.test`, `search.test.tsx`, `liveComposition` (own message, zero requests), `release.spec` (Edge, Chrome); Mut M5, M15 (3 and 4 tests failed) | **Verified** (message text is a user-accepted wording; code-point length counting is the default) |
| AC-002 (device location) | unchanged from Run 3; plus `liveComposition` and `release.spec` granted-permission test (only forecast host called, 2-decimal rounded coordinates, nothing stored, no "Add to favorites") | Verified (fakes; Edge+Chrome with test-granted permission). **Real permission prompt not verified. Reverse geocoding intentionally absent (A4 = No): a device location shows "Current location" and cannot be favorited** |
| AC-003-1/-3/-4, AC-004-1/-2/-4 (values, units, dates) | adapter tests: unit rejection (Mut M12), missing fields stay undefined, 0 is kept, offsets +5:30/+5:45/-3:30/+14/-12, `observedAt` (Mut M10), forecast `dropFirst` (Mut M9); **Live** value check | **Verified** for what the provider returns today (dates are the location's calendar dates; FR-025 default behaviour was seen in the real API for Paris and Berlin only) |
| AC-003-2 / AC-004-3 / AC-007-2 (icons; FR-015, FR-022, FR-041) | `weatherIcon.test` (Read: table complete, distinct, decorative `aria-hidden`, text always beside, labelled-when-alone), `currentWeather`, `acceptance` (keys), `release.spec` icons test (Edge, Chrome), `scanDist` (exact 8-icon set, notice file); Mut M7c (code to condition mapping, caught) | **Partial.** Presence, decorative semantics and "never icon-only" verified. **Weak:** only PARTLY_CLOUDY -> cloud-sun and UNKNOWN -> question-mark pin the drawing; swapping RAIN/SNOW or THUNDERSTORM/FOG icons passed all 1199 tests (Mut M7, M7b survived). How the icons look to a person: not human-verified (I viewed one 1280 px screenshot; that is not a design review) |
| Attribution (TASK-025; Open-Meteo licence "link next to data", GeoNames, CC BY 4.0) | `footer.test` 38 (titles and mutation failures; body not read) incl. in-panel credit in live mode only, outside live regions, absent before data/while loading/with no `attributionText`/in demo; `release.spec` footer and layout tests (Edge, Chrome); Mut M1 (7 failed), M2 (1), M11 (1); screenshot showed the credit in both panels and the footer | **Verified for presence, wording, links, gating.** Open-Meteo's own acceptance of the placement: **not verifiable here** |
| NFR-005 (privacy) and the disclosure text (M1) | `location.test` disclosure test (Mut M13 caught), `release.spec` (no Referer; control request does carry it), adapter tests, 2-decimal rounding (Mut M3, M3b: 11 failed each), `credentials: 'omit'` (Mut M16), `referrerPolicy` (Mut M4: 3 failed) | Verified for what the app sends and stores. The disclosure matches the observed requests (search text, rounded coordinates, IP are visible to the provider). Open-Meteo's own privacy terms were not read |
| NFR-006 (HTTPS, encoding, no key, no provider text) | adapter and `liveComposition` request tests, hostile-query tests (Mut M8: 2 failed), `release.spec` (every request HTTPS GET to the two hosts, no key), `sourceScan` host pin, `scan:dist` | **Verified** (the Run 3 "not verifiable" gap is closed) |
| NFR-004 | R4.3 | **Consistent with the accepted target on one machine/network; not verified in general** |
| C3 / FR-043 / AC-007-1, -4 (wide-tier order = tab order) | `styles.test` (no `grid-column`, `grid-row`, `order`, dense flow, tier-scoped panel rules; Mut M6: 3 failed), `e2e/layout.spec` (25 per browser; the plan says it checks the arrangement and DOM order == visual order; body not read this run), screenshot at 1280 px matches the specified extra-wide arrangement | Verified (geometry in Edge+Chrome, CSS text). **Human visual judgement ("clear, organized") not done** |
| Base path `/claude-project/`, release guard, scans (TASK-043) | `baseUrl.test` 33, `releaseGuard`, `scanDist`, `notices`, `release.spec` base-path test; commands 5-10 | Verified locally. **Nothing is deployed; the Pages URL is unverified** |
| AC-005, AC-006, AC-007-5/-6, FR-044, NFR-001 | unchanged from Run 3 plus all re-run (1199 pass); loading indicator now also measured on the real app (R4.3) | As A.4 |
| AC-P-06 and every TBD (OQ-001..014) | none beyond defaults | Defaults only; AC-P-06 not verifiable |

## R4.5 What is NOT verified

- Manual-only: screen readers (NVDA, VoiceOver, TalkBack); Firefox and Safari; any real phone or tablet (touch, on-screen keyboard); the real browser location prompt (allow, deny, ignore); a human visual review at 320/768/1280/1920 px; browser zoom 200/400 % and text-spacing overrides; forced-colours/high-contrast mode; whether the icons look right; closing and reopening a whole browser with favorites; private-mode storage.
- CORS and behaviour from the real deployed https origin (nothing is deployed). I saw `access-control-allow-origin: *` only from `http://localhost`.
- Open-Meteo's acceptance of the attribution placement, its terms/rate limits for this use, and its privacy policy.
- Coverage tooling: no coverage report was produced (none is configured); "all tests pass" is not line or branch coverage.
- Requirements whose answers are TBD (OQ-001..014) are checked only against the default values.
- Not run: `npm run dev`, `npm run dev:demo`, `npm install` from a clean checkout, `npm run test:browser:release` separately (its two projects are inside #11), a fresh-reader validation of the README (script names in README/docs were compared with `package.json`: all exist). Real-API checks were manual one-offs; the suite never calls the live API.

## R4.6 Mutation spot-checks (temporary changes to `src/`, restored each time)

Restoration: backup copy `cp` after every run, `cmp` per file, and a before/after SHA-256 comparison of 163 files: **identical**. "Killed" = at least one test failed.

| # | Mutation | Result |
|---|----------|--------|
| M1 | Remove the in-panel credit from the Current weather card | Killed (7 failed, all `footer.test`) |
| M2 | Show the credit in demo mode (remove `demo` check) | Killed (1) |
| M3, M3b | Drop latitude / longitude rounding | Killed (11 each, `weather.test`) |
| M4 | Drop `referrerPolicy: 'no-referrer'` | Killed (3: liveComposition, geocoding, weather) |
| M5 | Over-long input returns `emptyInput()` instead of `inputTooLong()` | Killed (3: core search, UI search, liveComposition) |
| M6 | C3 revert: place Favorites with `grid-column`/`grid-row` in the wide tier | Killed (3, `styles.test`) |
| M7 | Swap the RAIN and SNOW icons | **SURVIVED (0 failed of 1199)** |
| M7b | Swap the THUNDERSTORM and FOG icons | **SURVIVED (0 failed)** |
| M7c | Map WMO code 61 to SNOW | Killed (4) |
| M8 | Search text appended to the URL without encoding | Killed (2) |
| M9 | Forecast drops day index 1 instead of 0 | Killed (7) |
| M10 | Wrong sign for the UTC offset in `observedAt` | Killed (10) |
| M11 | Credit shown even when `attributionText` is empty | Killed (1) |
| M12 | Accept a non-Celsius current temperature | Killed (1) |
| M13 | Disclosure text drops "your IP address" | Killed (1, `location.test`) |
| M14 | Geocoding adapter not given the Config timeout | Killed (1) |
| M15 | `INPUT_TOO_LONG` mapped to another message key | Killed (4) |
| M16 | `credentials: 'omit'` -> `'include'` | Killed (3) |

19 distinct mutations: 17 killed, 2 survived (M7, M7b). Mutations are single-line edits chosen by me, not a systematic mutation-testing run; they say nothing about the many other lines I did not break.

## R4.7 Failures, weak tests and observations

- **No test, command or browser check failed.**
- **Weak test (survived mutation):** no test pins which Lucide icon belongs to RAIN, SNOW, THUNDERSTORM, FOG, CLEAR or CLOUDY. `weatherIcon.test` checks completeness, distinctness and the `data-icon-key` that comes from the conditions table, not from the icon table; `release.spec` checks the icon set is exactly the eight icons but not their mapping. Suggested follow-up for the Implementer: assert the Lucide class (as `currentWeather.test` does for cloud-sun) for each code. Not fixed by me.
- Self-reference: forecast date and temperature text in several tests is produced by the same formatter the app uses; my live value check (R4.3 C) compared rendered text with the raw API numbers once, by hand.
- The four slow first iterations in the Node probe and the roughly 0.7-1.0 s first-connection cost in the browser are unexplained beyond "new connection"; they are the main risk to the 3 s target.
- Remaining documentation conflicts (not edited): `impl-plan.md` Section 1 intro (line 5: "No application code exists ... Nothing is Complete") and Section 10 ("Tasks approved for implementation: none") still contradict line 3 and Section 4. `impl-plan.md` line 52 still says "No task is Unverified".

## R4.8 Per-task verdicts (Verifier; plan statuses not edited)

Vocabulary: **Verified** = automated evidence passes in the stated scope; **Partially verified** = automated evidence passes but a listed part is unverified or weakly tested; **Not verifiable here** = needs a person, a device, a deployment or a decision.

| Task | Verdict | Note |
|------|---------|------|
| 003 scaffold | Verified | typecheck, lint, build, test, scripts run |
| 004 result/errors (incl. C2 code) | Verified | M15 |
| 005 domain, 006 ports, 007 config | Verified | thin domain/ports tests; config only against defaults |
| 008 identity, 009 format, 011 forecast, 012 fakes | Verified | single locale for format |
| 010 conditions table | Partially verified | WMO mapping killed (M7c); icon-key table only |
| 013 search (incl. C2), 014 weather service, 015 location flow, 016 favorites, 017 settings, 018 store, 019 controller | Verified (fakes) | all re-run; bodies not re-read this run beyond search/errors |
| 020 localStorage, 021 geolocation | Verified (jsdom/stubs, Edge+Chrome) | real prompt, other browsers not verified |
| 022 geocoding adapter | Verified (recorded + real API from this machine) | deployed-origin CORS, rate limits not verified |
| 023 weather adapter | Verified (recorded + real API from this machine) | same |
| 024 reverse geocoding | Not built, not approved | absence confirmed: no reverse call anywhere |
| 025 attribution | Partially verified | Open-Meteo's view of "next to" not verifiable here |
| 026 shell (incl. C3), 027 search UI, 028 current card, 029 forecast, 030 refresh, 031 favorites, 032 location control and disclosure, 033 unit toggle, 034 status/error boundary | Verified (jsdom, Edge+Chrome) | human visual/usability, screen reader, other browsers/devices not verified |
| 035 icons | Partially verified | decorative/text/bundle verified; mapping weakly tested (2 mutants survived); look not human-checked |
| 036 composition | Verified | live, demo and unconfigured modes tested |
| 037 real providers | Partially verified | see below |
| 038 scenario tests | Verified | 37/37, mapping updated; icon and TBD items as above |
| 039 accessibility, 040 responsive/browser, 041 security/privacy | Partially verified | automation passes (Edge, Chrome); manual lists in the plan remain. 041's HTTPS/encoding gap is now closed |
| 042 latency | Measured (R4.3) | Verifier part done; user decision on final NFR-004 pending |
| 043 HTTPS build/scans | Verified locally | hosting/deploy not done |
| 044 code review | Not verifiable here | automated conformance tests pass; independent review is not my role |
| 045 documentation | Partially verified | script names and defaults checked; not validated by a fresh reader |
| C2 | Verified | |
| C3 | Verified (geometry, CSS, DOM order) | human visual judgement pending |

**TASK-037 "pending manual end-to-end verification":** what I did: automated Playwright runs of the built release app against the real Open-Meteo APIs in real Edge and Chrome (6 full search -> choose -> weather -> refresh flows, then one Chrome run whose rendered values I compared with the raw API responses), plus `smoke:live` once. All worked, with no console output or page errors. What I did not do: a human using the app by eye and hand, or a run from a deployed https origin. I do **not** treat the criterion ("a manual check by the user or Verifier") as fully satisfied. Remaining: the user (or the orchestrator, with the user's agreement) either runs `npm run dev` / `npm run build:release && npx vite preview` and tries a few cities, or explicitly accepts these automated real-API runs as the Verifier's check.

## R4.9 Required follow-up

1. Implementer: add per-condition icon assertions (M7 and M7b survived). Re-verification of that change is needed.
2. User: confirm or change the NFR-004 target after reading R4.3; do the manual checks in R4.5 and the TASK-037 hands-on check.
3. Any change to `src/`, tests or configuration since 02:19 IST on 2026-10-27 needs re-verification; Run 4 evidence applies only to the state hashed above.
4. Before any deployment (not authorized): check CORS and behaviour from the real https origin.

---

This file has three parts. **Part A is the run before Run 4 (Run 3, 2026-10-27, now SUPERSEDED by Run 4 above)** and covers every implemented, approved task: TASK-003..021, 026..034, 036, 038..041, 043..045. **Part B (Run 2, 2026-10-26) and Part C (Run 1, 2026-10-26) are older runs, kept unchanged as recorded and SUPERSEDED by Part A.** Anything in Part B or C that differs from Part A (test counts 495 and 304, "demo providers ship in the production bundle", "no UI exists", "no coverage of TASK-038..045", "npm audit/browser checks not run") was true of that earlier run only; do not use it as current evidence.

# PART A - RUN 3 (SUPERSEDED by Run 4 above; recorded 2026-10-27 00:05, text unchanged below this line): TASK-003..021, 026..034, 036, 038..041, 043..045

> Historical record: statements about impl-plan.md Section 10 reflect the file at the time of this run; it was corrected afterwards (see top note).

Author: Verifier. Run started 2026-10-27 00:05 local (IST). All commands were run from `<project root>` (not a git repository).

**What was modified:** only this file. No source, test, configuration or `impl-plan.md` content was changed. The Verifier did make 18 *temporary* mutations of `src/` and `scripts/` for spot-checks (A.9); every file was restored, and restoration is proved by a before/after SHA-256 comparison of 128 files (A.9). Helper files (backup copy, JSON reports, logs) were written to the user temp directory, outside the repository. Side effect: `npm run build`, `build:release`, `build:demo` and `test:browser` regenerate `dist/`; **`dist/` now holds the release build** (left by `test:browser`; its hashes match the earlier `build:release`, A.2).

## A.1 Verification Summary

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `npm run typecheck` | 0 | Passed, no diagnostics |
| 2 | `npm test` | 0 | Passed: 43 files, 813 tests passed, 0 failed, 0 skipped (10.0 s) |
| 2b | `npx vitest run --reporter=json --outputFile=<temp>` (second full run, per-file counts) | 0 | 813 total / 813 passed / 0 failed / 0 pending / 0 todo, 43 files |
| 3 | `npm run lint` | 0 | Passed, no output beyond the banner |
| 4 | `npm run build` | 0 | Passed: 56 modules; `index-DV-ZUVLj.js` 259.82 kB (79.86 kB gzip), CSS 3.30 kB, `index.html` 0.55 kB |
| 5 | `npm run build:release` | 0 | Passed: build as above, then `scan:dist`: "scanned 3 file(s), not scanned 0, unreadable 0 ... release build: demo markers are findings); no findings" |
| 6 | `npm run scan:dist` (on the release build) | 0 | "scanned 3 file(s) ... no findings" |
| 7 | **Negative:** `VITE_USE_DEMO=true npm run build:release` | **1 (expected failure observed)** | `tsc` passed, then Vite: "Refusing to build: VITE_USE_DEMO=true is set ... use npm run build:demo". `dist/` hashes unchanged (sha256 check OK for all 3 files) |
| 8 | `npm run build:demo` | 0 | Passed: 60 modules; 4 files incl. `demoComposition-Cr6nNFPP.js` 2.72 kB; main JS `index-DVlLHq9N.js` 261.52 kB |
| 9 | `npm run scan:dist:demo` (on the demo build) | 0 | "scanned 4 file(s) ... demo build: demo markers allowed); no findings" |
| 10 | **Negative:** `npm run scan:dist` on that demo build | **1 (expected failure observed)** | 10 findings printed: demo chunk file name, demo module file name, `composeDemo`, storage prefix `demo:`, `Testville`, `Sampleton`, `Partialia`, `Glitchton`, reference to demo module; "FINDINGS (see above)" |
| 11 | `npm run test:browser` (run after #10, so it rebuilt `dist/` as the release build) | 0 | **78 passed (1.7 m), 0 failed, 0 skipped.** Edge 36, Chrome 36, release-edge 3, release-chrome 3 |
| 12 | `npm audit` | 0 | "found 0 vulnerabilities" (registry reachable; single run, state at that time) |

**Plain statement of what this shows.** Every command that is supposed to pass passed, and both commands that are supposed to fail failed. This is evidence that the logic, the UI, the demo/release separation and the bundle scans behave as the tests specify, in jsdom against fakes and in automated Microsoft Edge and Google Chrome against the demo build and the release build. It is **not** evidence that the application works against a real weather provider (none is built), in Firefox or Safari, on a real device, with a screen reader, or that it "looks clear and organized". **The release build as it stands is the "Weather is not set up yet" page; it contains no working weather feature** (by design until TASK-037; confirmed by `e2e/release.spec.ts`). All weather behaviour was verified only in demo mode or against fakes.

## A.2 Scope and Environment

- Windows 11 Enterprise, Git Bash, Node v24.21.0, npm 11.19.0, Vitest v5.0.5, Vite v8.3.5. Playwright drives the system Microsoft Edge and Google Chrome (`channel` option; no browser download). Versions of the two browsers were not recorded. Nothing was installed or reconfigured.
- Scope: the approved tasks named above, including all post-review fixes recorded in `impl-plan.md` (batch 1 on core tasks, batch 2 on UI tasks, the TASK-031/032 WCAG 2.5.3 fix, the TASK-036 "exclude demo from release builds" follow-up, the TASK-043 release guard/scan hardening, the TASK-038/039/040/041 Code Reviewer follow-ups).
- Test environments: Vitest default `node`; the `.tsx` UI/scenario/privacy tests opt in to jsdom (`// @vitest-environment jsdom`); jsdom has no layout engine. `test/security/releaseGuard.test.ts` runs real `vite build` processes into temp folders, and `test/security/scanDist.test.ts` also scans the real `dist/` when present (it ran, not skipped, in both full runs; `dist/` was a release build at that time).
- Approval basis: `impl-plan.md` line 3 and Section 4 record user approval for exactly the task list above. I cannot independently confirm the original chat messages. **Conflict not reconciled (and not edited):** `impl-plan.md` Section 1 intro line 5 still says "No application code exists ... Nothing is Complete", and Section 10 (line 580) still says "Tasks approved for implementation: none", contradicting line 3 and Section 4. `requirements.md` is Approved with OQ-001..OQ-014 still TBD.
- `dist/` integrity: sha256 of the three release files recorded after `build:release` and re-checked after the negative build and again after `test:browser`: identical (`index-DV-ZUVLj.js`, `index-SepI_PU-.css`, `index.html`).
- Release vs demo bundle facts (this run): release JS contains 0 occurrences of `Testville`, `Sampleton`, `Partialia`, `Glitchton`, `composeDemo`, `PrefixedKeyValueStore`; the demo build contains them. The substring `demo:` still appears in the release JS only as minified object property names (the `demo` prop of `App`) and the two generic message-table sentences (`ui.demoNotice`, `ui.location.demoNote`) remain in the release JS, as `impl-plan.md` TASK-036 states. This **resolves the Run 2 observation** (Part B, A3 item 7) that demo providers shipped in the production bundle.
- Test inventory, Run 3 (43 files / 813 tests; per-file counts from the JSON reporter, all 0 failed): core and adapter files are unchanged from Run 2 (smoke 1, errors 18, domain 3, ports 9, config 36, identity 13, format 20, conditions 7, forecast 12, fakes 14, search 18, weatherService 19, locationFlow 22, favoritesService 23, settings 10, store 13, appController 41, localStorageStore 6, geolocation 19 = 304). UI: app 12, search 14, currentWeather 13, forecast 10, refresh 9, favorites 9, location 12, unitToggle 6, status 32, composition 5, demoMode 12, focus 17, liveRegions 9, robustness 8, accessibility 5, styles 10, noLiterals 6 = 189. **New since Run 2:** `test/scenarios/acceptance.test.tsx` 37 (TASK-038); `test/security/` demoMarkers 62, privacy 7, releaseGuard 16, scanDist 35, secretScan 135, sourceScan 28 = 283. Net +318 (495 to 813: +37 +283, demoMode -5, favorites +1, location +3, status -1). Browser: `e2e/` accessibility 24, browserApis 22, layout 26, release 6 test executions (78 = each of 3 specs x 2 browsers + release x 2 browsers).

## A.3 Commands Executed (exact commands, this run)

1. `npm run typecheck` : exit 0 (`tsc --noEmit`; `tsconfig.json` includes `src`, `test`, `e2e`, one `scripts` declaration file, `vite.config.ts`, `playwright.config.ts`).
2. `npm test` : exit 0; `Test Files 43 passed (43)`, `Tests 813 passed (813)`, 10.02 s. Output also contained a jsdom message `Not implemented: HTMLCanvasElement's getContext() method` (apparently from axe-core in jsdom; not a failure) and a Vitest advisory about worker isolation.
3. `npx vitest run --reporter=json --outputFile=<temp>/vr3.json`, then a Node script to read it : exit 0; 813/813. (My first two helper-script attempts had shell-quoting errors and were rewritten; not project failures.)
4. `npm run lint` : exit 0. `eslint.config.js` ignores `dist`, `node_modules`, `coverage`, `test-results`, `playwright-report`; `src`, `test`, `e2e`, `scripts` are linted.
5. `npm run build` : exit 0.
6. `npm run build:release` : exit 0 (runs `npm run build` then `npm run scan:dist`).
7. `npm run scan:dist` : exit 0.
8. `VITE_USE_DEMO=true npm run build:release` : exit 1, as required.
9. `npm run build:demo` : exit 0.
10. `npm run scan:dist:demo` : exit 0.
11. `npm run scan:dist` (on the demo build) : exit 1, as required.
12. `npm run test:browser` : exit 0, 78 passed. Playwright starts the demo dev server (port 4173) and runs `npm run build:release && npx vite preview` (port 4174) itself; the release projects passing implies that `build:release` (including `scan:dist`) succeeded, but its own output was not printed by the runner, so that is an inference.
13. `npm audit` : exit 0, 0 vulnerabilities.
14. Mutation spot-checks (A.9): `npx vitest run <files> --reporter=json --outputFile=<temp>`, plus one `npx vite build --outDir <temp>` and `node scripts/scanDist.mjs <temp>`.
15. Read-only checks: `grep`/`sha256sum`/`diff` as shown in A.9; README script names compared with `package.json` (all 12 scripts named in README/`docs/deployment.md` exist; `npm install`, `npm run dev` and `npm run dev:demo` were **Not run**); 6 README config defaults compared with `src/core/config.ts` (matched).

**Not run:** `npm run dev`, `npm run dev:demo` (a long-running server; Playwright starts the demo server itself), `npm install` from a clean checkout, `npm run test:browser:release` on its own (its two projects are included in #12).

## A.4 Requirements and Acceptance Criteria Coverage (Run 3)

"Basis": **Read** = I read the test body this run (acceptance, privacy, releaseGuard, scanDist, demoMode, `appController` lines 255-520, status loading tests, location first-paint tests, `e2e/release.spec.ts`; plus Run 2 readings of others, which I did not re-read although several files changed, so treat those as Run 2 evidence); **Title** = mapping from titles only (the e2e specs `accessibility`, `browserApis`, `layout` were run but their bodies were not read this run). **Mut** = I broke `src/` and the test failed (A.9). Statuses: **Verified (fakes/jsdom)**, **Verified (Edge+Chrome automation)**, **Partial**, **Not verified**. Nothing here is real-provider evidence.

### A.4.1 Acceptance criteria

| AC | Tests | Basis | Status and gap |
|----|-------|-------|----------------|
| AC-001-1 | acceptance "AC-001-1" (heading, values, 3 rows, search arg `Oslo`, weather call key); `search.test`; `appController` | Read | Verified (fakes). Real provider not available |
| AC-001-2 | acceptance "AC-001-2" (with and without country; exact heading text) | Read | Verified (fakes) |
| AC-001-3 | acceptance "AC-001-3" (message text; zero weather calls) | Read | Verified (fakes) |
| AC-001-4, AC-P-01 | acceptance `it.each` x3 (empty, 3 spaces, tab+space; field value asserted; prompt shown; zero geocoding and weather calls); `search.test`; core `search.test` | Read | Verified (fakes). Implementer's trim mutation reported, not repeated by me |
| AC-001-5 | acceptance "AC-001-5 / EC-005" (error result, then a throwing port with a secret string that must not be shown; recovery) | Read | Verified (fakes) |
| AC-002-1, AC-002-5 | acceptance (granted, `start()` calls position once, heading, values); `appController` launch tests; e2e "granted at launch" (Edge, Chrome, real adapter with test-granted permission) | Read / Title | Verified (fakes) and (Edge+Chrome, test-granted permission). **Real permission prompt not verified** |
| AC-002-2 | acceptance (0 position calls at launch; 1 after click); `location.test` first-paint (prompt, denied, unsupported) and separate granted test; `appController` it.each; e2e "not granted: nothing asks at launch" | Read | Verified. Real prompt not verified |
| AC-002-3, AC-002-4 | acceptance (denied, timeout, unavailable; city search still enabled and works); `geolocation.test`; e2e refused request | Read / Title | Verified (fakes, stubs, Edge+Chrome refusal). **Real user ignoring the prompt (known limitation: timeout starts only after the prompt is answered) not verified** |
| AC-003-1 | acceptance (labels Temperature/Humidity/Condition; values) | Read | Verified (fakes) |
| AC-003-2 | acceptance (decorative `.icon-slot`, `data-icon-key`, text beside it); `conditions.test` | Read | **Partial**: icon is a placeholder (TASK-035 blocked); real icons not verifiable |
| AC-003-3 | acceptance (F toggle `71°F`, forecast in F, persists across a re-created app over the same fake store); `unitToggle.test`; e2e real reload keeps unit | Read / Title | Verified (fakes; Edge+Chrome real `localStorage`) |
| AC-003-4 | acceptance (**humidity missing only**: `0°C`, `Unavailable`, `Clear`); `currentWeather.test` (each field missing, Mut E); `format.test` | Read / Mut | Verified. **Gap:** the scenario test covers only a missing humidity; missing temperature/condition are covered at component level only (mutation E did not fail the scenario test) |
| AC-003-5 | acceptance (error in current section, forecast unaffected, Retry recovers) | Read | Verified (fakes) |
| AC-004-1, AC-004-2 | acceptance (3 rows; date, "High 20°C, Low 10°C", condition) | Read | Verified (fakes). The expected date text is produced by the same `formatForecastDate` the app uses (self-referential for formatting); time-zone basis (FR-025) depends on the provider: Unverified |
| AC-004-3 | acceptance (icon slot per row) | Read | **Partial** (placeholder icons) |
| AC-004-4 | acceptance (1 day supplied: 3 rows, 2 "unavailable") | Read | Verified (fakes) |
| AC-004-5 | acceptance (forecast error with Retry; current stays; Retry recovers) | Read | Verified (fakes) |
| AC-005-1, AC-005-2, AC-005-5 | acceptance (no button before weather; refresh calls both sections for the same key; values and last-updated change with the fake clock) | Read | Verified (fakes). Last-updated rule is "older section time" (a design default) |
| AC-005-3, AC-P-03 | acceptance (5 clicks: 2 calls per section total, 1 pending, button `aria-disabled`); `appController` "rapid refreshes"; "M3"; `refresh.test`; `robustness.test` | Read / Mut | Verified (fakes). Layers are redundant: removing the M3 guard failed exactly one test (Mut A); removing one UI layer failed none (Mut J). That is defence in depth, not a gap, but it means this AC does not pin any single layer |
| AC-005-4, AC-P-02 | acceptance (both fail: values, rows and time unchanged); partial-failure test; `weatherService` tests | Read / Mut | Verified (Mut B: 5 tests failed) |
| AC-006-1, AC-006-2 | acceptance (Add; list shows `<place> Showing`) | Read | Verified (fakes) |
| AC-006-3 | acceptance (select favorite loads by stored key; geocoding calls = 0) | Read | Verified (fakes) |
| AC-006-4 | acceptance (add twice: 1 stored record, 1 list item, no Add button) | Read | Verified (fakes) |
| AC-006-5 | acceptance (remove; empty message; weather stays; Add returns) | Read | Verified (fakes) |
| AC-006-6, AC-P-05 | acceptance (new app over the same in-memory store); e2e real page reload with real `localStorage` (Edge, Chrome) | Read / Title | Verified (fakes) and (Edge+Chrome). Firefox/Safari, closing and reopening the whole browser, private mode: Not verified |
| AC-007-1 | acceptance (landmarks, one section order, nav links reach headings: **structure only**); e2e layout (320/768/1280/1920: tiers, no horizontal scroll, panels inside viewport, arrangement matches CSS) | Read / Title | **Partial**: geometry only. "Clear, organized, easy to read" is a visual judgement: **Not verified** |
| AC-007-2 | see AC-003-2, AC-004-3 | | **Partial** |
| AC-007-3, AC-P-04 | acceptance AC-003-1 test (`dt` labels; `°C`, `%`); `format.test`; `currentWeather`, `forecast` tests | Read / Title | Verified (fakes) |
| AC-007-4 | e2e layout (4 viewports x 2 browsers, resize); `styles.test` (CSS text; Mut M) | Title / Mut | **Partial**: geometry in Edge/Chrome only. Appearance, other browsers, real phone: Not verified. Wide-tier visual vs tab order: open user decision, not tested for acceptability |
| AC-007-5 | acceptance (Loading weather.../Loading... then error state, no `dl`); `status.test` (immediate indicator; locating/searching) | Read | Verified (state-derived rendering on a fake clock). Real latency Unverified (NFR-004 TBD) |
| AC-007-6 | acceptance (structure); `app.test`; `focus.test`; e2e keyboard-only flow | Read / Title | Partial: consistency of controls is checked structurally and by an automated Tab flow; no human usability judgement |
| AC-P-06 | none | | TBD thresholds: Not verifiable |

### A.4.2 Functional and non-functional requirements

| Requirement | Evidence | Status |
|-------------|----------|--------|
| FR-001..006 | AC-001-1..5 rows | Verified (fakes) |
| FR-007 (TBD) | acceptance chooser test; core `search.test` (Unicode, trim, limit, length) | Defaults only; real provider ambiguity Unverified |
| FR-008..011 | AC-002 rows; `locationFlow.test`; `geolocation.test`; e2e | Verified (fakes/stubs/Edge+Chrome automation); real prompt Not verified |
| FR-012, FR-031 (TBD) | `config.test`, `locationFlow`/`weatherService` fake-timer timeout tests | Defaults only; real timing Unverified |
| FR-013, FR-039 (TBD) | `appController` launch policy; device-favorite tests; `privacy.test`; `favorites.test` | Verified (fakes); real reverse geocoding not built |
| FR-014..FR-019, FR-042 | AC-003 rows | Verified (fakes) except icons (FR-015, FR-041 Partial) |
| FR-020..FR-024 | AC-004 rows | Verified (fakes); FR-022 icons Partial |
| FR-025 (TBD) | `config.test`; `weatherService` passes defaults | Defaults only; time-zone basis Unverified |
| FR-026..FR-030 | AC-005 rows | Verified (fakes) |
| FR-032..FR-037 | AC-006 rows | Verified (fakes; Edge+Chrome for persistence) |
| FR-038 (TBD) | `favoritesService`, `identity`, `config` tests (Mut D, H) | Defaults only |
| FR-040, FR-043 | AC-007-1, AC-007-4 rows | Partial (geometry only) |
| FR-041 | AC-007-2 row | Partial |
| FR-044 | AC-007-5 row; `status.test`; `liveRegions.test` | Verified in jsdom; no assistive-technology check |
| FR-045 | AC-007-6 row | Partial |
| NFR-001 | `appController` "every intent resolves when every port throws"; `status.test` leak tests; ErrorBoundary tests; e2e: no page errors or console output | Verified (fakes; Edge+Chrome demo session) |
| NFR-002, NFR-007 | e2e layout in Edge and Chrome only | **Partial**: Firefox, Safari, real devices Not verified; target browsers/viewports are TBD (OQ-001/005/011) |
| NFR-003 | `accessibility.test` (axe in jsdom, contrast off); e2e axe WCAG 2.1 A/AA with colour contrast evaluated at 320 and 1280 px in 5 states (Edge, Chrome), visible focus ring on every Tab stop, targets at least 44x44 px, keyboard-only flow, 2.5.3 regression test | **Partial**: screen readers, zoom 200/400%, text spacing, forced colours, real phone Not verified; icons Not verifiable |
| NFR-004 (TBD) | `status.test` (indicator at 0 ms on a fake clock); fake-timer 10 s timeout | **Not verified** (no latency measurement; provider absent) |
| NFR-005 | `privacy.test` (search text and device coordinates not in storage, cookies, URL, console; control cases), `locationFlow` source scan, e2e real storage keys and origin-only requests (Edge, Chrome) | Verified for what the app does today (demo, fakes). Real provider traffic and a human's browser inspection: Not verified |
| NFR-006 | `privacy.test` hostile text renders as text (Mut L); `sourceScan` (no HTML sinks, no non-HTTPS URL, env reads only in `main.tsx`); `secretScan`; `scan:dist` | Partial: HTTPS-only provider URLs and URL encoding **not verifiable** until TASK-022/023; secret scan is a pattern scan, not proof |
| NFR-008 | `format.test` | Single locale only |

## A.5 Post-review fixes (Run 3 status)

| Fix | Evidence | Status |
|-----|----------|--------|
| Batch 1: M1 unresolved device key, M2 failed locate, M3 refresh during load, L1 listener isolation, L4 config/favorites cap, L6 error clearing/settings notice, L7 key escaping | `appController` M1/M2/M3/L6 tests (Read); Mut A (M3), Mut D (L7); others by Run 2 reading | Passed |
| Batch 2: M1 search never disabled (Mut K), M2 focus (`focus.test`), M3 one announcer (`liveRegions`), M4 grid (Mut M), M5 idle state, M6 demo opt-in (`demoMode` Read), L1..L4 | as stated | Passed (jsdom only for focus/announcer; CSS text only for M4/L3) |
| TASK-031/032 WCAG 2.5.3 shown-favorite name | `favorites.test` "Label in Name"; e2e "displayed favorite button name contains its visible text" (Edge, Chrome); Mut I broke `aria-current` and 2 tests failed | Passed |
| TASK-036 follow-up: demo excluded from release | A.1 rows 5-11; `releaseGuard`/`scanDist`/`demoMarkers` tests; `release.spec` (Edge, Chrome); Mut O, P, Q and the `main.tsx` mutation | Passed |
| TASK-043 follow-up: `build:release`, guard, structural markers, unreadable-file failure | same | Passed |
| TASK-038 weak-test tightening (demoMode wiring, M1 storage, refresh-cancel, first-paint, loading delay) | I read the rewritten tests; they now discriminate (A.8) | Passed |

## A.6 Failures and Defects Observed

**No command failed unexpectedly, no test failed, none was skipped.** Observations (not failures):
- jsdom prints `Not implemented: HTMLCanvasElement's getContext()` during `npm test`.
- `impl-plan.md` approval-status text is internally inconsistent (A.2). Not edited.
- The release build shows only the "not set up" page (expected).
- The two generic demo UI sentences remain in release JavaScript (known, inert, documented by the Implementer; not a scan marker).
- Wide-tier visual order differs from tab order (open user decision).
- Playwright's `test:browser` overwrites `dist/` with the release build (documented).

## A.7 Blocked, Not Run, and Unverified (Run 3)

| Item | Classification |
|------|----------------|
| TASK-001 provider facts (terms, attribution, rate limits, reverse geocoding, CORS, forecast time zone) | **Unverified / Blocked (user action).** Nothing assumed about any provider |
| TASK-002 icon set, deferred values | Blocked (user action) |
| TASK-022, 023, 024, 025 (provider adapters, reverse geocoding, attribution), TASK-035 (icons), TASK-037 (live wiring), TASK-042 (latency), TASK-046 (release) | **Not built / not approved / Blocked.** No real provider call, payload, unit, time zone, CORS, rate limit or latency evidence exists |
| Screen readers (NVDA, VoiceOver) and "announced once" behaviour | **Not run** (manual) |
| Firefox, Safari, real phone/tablet, other OS | **Not run** (manual; none installed or available to automate) |
| Real location permission prompt (allow, deny, ignore the prompt) | **Not run** (manual). Automation uses test-granted/refused permission and stubs |
| Visual review at 320, 768, 1280, 1920 px; "clear and organized" | **Not run** (manual). Only geometry assertions ran |
| Browser zoom 200/400%, text-spacing overrides, forced-colours/high-contrast | **Not run** (manual) |
| Wide-tier visual order (Search, Favorites, Current, Forecast) vs DOM/tab order acceptability | **Not run**; user decision pending |
| Closing and reopening a whole browser; private-mode storage behaviour; storage inspection in the user's own browser | **Not run** (only a page reload in Edge/Chrome was automated) |
| Code coverage | **Not run**: no coverage provider in `node_modules` (only `@vitest/mocker`, `@vitest/spy`); installing one was not authorized. No coverage figure exists |
| Mutation testing as a tool | **Not run** as a tool. Only 18 hand-made mutations (A.9); everything else relies on the Implementer's reported mutation checks |
| Requirements with TBD answers (FR-007, 012, 013, 017, 025, 031, 038, 039; NFR-002, 003, 004, 007, 008; EC-003, 004, 015, 016, 018, 019) | Checked only against the implementation's defaults; user values unconfirmed |
| `npm install` from a clean checkout; `npm run dev`; `npm run dev:demo`; hosting/HTTPS deployment; README followed by a fresh reader | **Not run** |
| Independent Code Reviewer re-review of the TASK-038/039/040/041/043 follow-ups; TASK-044 human review | **Not done** (not a Verifier activity) |

## A.8 Test bodies read, weak tests, tests that cannot fail

**Read this run:** `test/scenarios/acceptance.test.tsx` (all 37), `test/security/privacy.test.tsx`, `releaseGuard.test.ts`, `scanDist.test.ts`, `test/ui/demoMode.test.tsx`, `test/core/appController.test.ts` lines 255-520 (favorites, refresh, M1/M2/M3/L6), `status.test.tsx` lines 20-110, the first-paint part of `location.test.tsx`, `e2e/release.spec.ts`; plus the relevant `src/` files. **Not re-read this run (mapping rests on titles or on Run 2 reading, though several files changed):** `search`, `currentWeather`, `forecast`, `unitToggle`, `app`, `composition`, `focus`, `liveRegions`, `robustness`, `refresh`, `favorites`, `styles`, `accessibility`, `noLiterals`, `sourceScan`, `secretScan`, `demoMarkers` (bodies), all core/adapter tests not named above, and the three e2e specs `accessibility`, `browserApis`, `layout`.

**Run 2 weak tests, re-checked:** (1) demoMode wiring: now discriminating (platform stubs assert `getCurrentPosition`/`query` never called; a control proves live mode does call them) - fixed. (2) storage isolation: `chooseCandidate` awaited, real stored content seeded - fixed. (3) M1 storage test now seeds storage, asserts zero writes and equal map - fixed. (4) favoritesService "resolved named place": fails under Mut H, so it can fail - ok. (5) first-paint title/body now match, granted case separate - fixed. (6) loading-delay `it.each` replaced by an "on screen before any fake time passes" test - fixed. (7) refresh-cancel test now asserts 99 absent - fixed. (8) `focus.test` "an error leaves focus in the search form": **unchanged, not re-examined, still weak** (fails only if code steals focus). (9) `styles.test`: Mut M (Favorites moved to row 3) failed it, so the CSS-text check can fail for plain selectors; it still pins text, not rendered layout. (10)/(11) jsdom axe (contrast off) and `aria-live` structure tests: unchanged limits; the real-browser axe spec (contrast evaluated) is the stronger evidence. (12)/(13) not re-read.

**Weak or limited tests found this run:**
1. `scanDist.test.ts` "the scan command exists" only asserts the file exists (trivially true; the exit-code tests above it are the real checks).
2. `privacy.test.tsx` "the persisted-text scan can fail" tests the helper itself (a control, not a product check).
3. `scanDist.test.ts` "the actual dist/ folder" uses `allowDemo: true`, so it does not distinguish a release from a demo build; the release-vs-demo check is `scan:dist` itself and `release.spec`. It is also `skipIf` no `dist/` (visible as skipped; it ran here).
4. `acceptance.test.tsx` AC-003-4 covers a missing humidity only (Mut E did not fail it).
5. `acceptance.test.tsx` AC-004-2 builds its expected date text with the app's own `formatForecastDate`; the date test cannot catch a wrong format function, only a wrong date value.
6. `acceptance.test.tsx` AC-002-1 calls `controller.start()` directly; the real boot path in `src/main.tsx` (dynamic import, then `start()`) is covered only by the e2e specs and `release.spec`, not by a unit test.
7. AC-005-3 / AC-P-03 pass if any one of the four guard layers works (Mut A, J), so no single layer is pinned by the scenario test (the unit tests for M3 do pin the controller layer).
8. AC-007-1, AC-007-4, AC-007-6: structure and geometry only.
9. All "announced" tests check DOM attributes, not what assistive technology says.

**Tests that cannot fail:** I found **none wholly incapable of failing** in the files I read; items 1 and 2 above are the closest (trivial or control-only). I did not mutation-check the other ~780 tests; "can fail" for those is by reading or by the Implementer's report, not by my own proof.

## A.9 Mutation spot-checks (temporary; `src/` and `scripts/` restored)

Method: copy file to a backup outside the repo (done once, before any change); apply one text replacement; run the named test files; restore from the backup; compare. Each row is one mutation, one run.

| ID | Mutation | Tests run | Result |
|----|----------|-----------|--------|
| A | controller: remove the "refresh ignored during initial load" guard | `appController`, `acceptance` | 1 of 78 failed ("M3: a refresh during the initial load ...") |
| B | weatherService: failed section drops previous `updatedAt` | `weatherService`, `acceptance` | 5 of 56 failed (3 weatherService, AC-005-4/P-02, partial-refresh scenario) |
| C | weatherService: shared time uses the newer, not the older, section time | same | 1 of 56 failed ("both get the older time") |
| D | identity: stop escaping `|` and `\` | `identity` | 1 of 13 failed (L7) |
| E | format: missing temperature becomes 0 | `format`, `acceptance`, `currentWeather` | 4 of 70 failed (3 format, 1 currentWeather); **no acceptance test failed** (gap, A.8 item 4) |
| F | localStorageStore.get rethrows | `localStorageStore`, `acceptance` | 3 of 43 failed |
| G | geolocation: absent Permissions API gives `granted` | `geolocation`, `demoMode` | 1 of 31 failed |
| H | favoritesService: remove its device-source rejection (one layer) | `favoritesService`, `appController`, `privacy` | 3 of 71 failed, all in `favoritesService` (the controller layer independently still refuses) |
| I | FavoritesPanel: remove `aria-current` | `favorites`, `acceptance`, `focus` | 2 of 63 failed |
| J | RefreshBar: onClick ignores busy | `refresh`, `robustness`, `acceptance` | **0 failed (survived)**: redundant layers (A.8 item 7) |
| K | SearchPanel: block submit while a search is pending | `search`, `acceptance` | 1 of 51 failed |
| L | CurrentWeatherCard: place name via `dangerouslySetInnerHTML` | `privacy`, `sourceScan`, `currentWeather` | 3 of 48 failed |
| M | styles.css: wide Favorites in row 3 | `styles` | 1 of 10 failed |
| N | RefreshBar: hard-coded visible text | `noLiterals` | 1 of 6 failed |
| O | demoMarkers: `Testville` pattern disabled | `demoMarkers`, `scanDist` | 4 of 97 failed |
| P | releaseGuard: guard turned into a no-op | `releaseGuard` | 6 of 16 failed (incl. the two real-build tests) |
| Q | scanDistLib: unreadable files no longer fail | `scanDist` | 1 of 35 failed |
| R | `src/main.tsx`: demo import made unconditional | build into a temp folder, `scan:dist` on it, `sourceScan` | build exit 0; **`scan:dist` exit 1** with 2 findings (`composeDemo`, demo module reference); `sourceScan`: 2 tests failed |

17 of 18 mutations were detected; 1 (J) survived as a redundant-layer case. **Restoration proof:** SHA-256 of every file under `src/`, `test/`, `e2e/`, `scripts/` plus `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `eslint.config.js`, `index.html`, `package-lock.json`, `impl-plan.md`, `requirements.md` (128 files) was taken before the first mutation and again after the last: `diff` of the two lists printed no differences; `diff -r` of `src`, `test`, `scripts` against the pre-mutation backup was clean; each mutated file was also re-hashed against its backup inside the runner (`restored: true` for all 17 runner mutations; `cmp` for `main.tsx`). `dist/` was not touched by the mutations (the mutation build went to a temp folder; the dist hashes still match).

## A.10 Per-task verdicts

Verdicts: **Verified** = the task's own completion criteria are met by evidence from this run, within the stated limits; **Partially verified** = part of the task's criteria is met, part needs manual or unavailable evidence; **Not verifiable here** = the remaining criteria cannot be checked with the local tools. "Verified" always means against fakes/stubs/demo data and (where stated) Edge and Chrome automation, never a real provider.

| Task | Verdict | Basis and what is missing |
|------|---------|---------------------------|
| 003 scaffold | Verified | typecheck, test, lint, build run; "clean checkout" not run |
| 004 Result/AppError | Verified | `errors.test`; message-key and no-leak tests |
| 005 domain types | Verified | typecheck + `domain.test` |
| 006 ports | Verified | `ports.test`, typecheck |
| 007 config | Verified (defaults) | `config.test`; TBD values unconfirmed |
| 008 identity | Verified | Mut D |
| 009 formatting | Verified | Mut E; single locale |
| 010 conditions | Verified (mapping) | `conditions.test`; assets are TASK-035 |
| 011 forecast helpers | Verified | `forecast.test` (body not re-read this run) |
| 012 fakes | Verified | `fakes.test` |
| 013 search service | Verified (fakes) | tests pass; two Implementer decisions await the user |
| 014 weather service | Verified (fakes) | Mut B, C; real timing Unverified |
| 015 location flow | Verified (fakes) | `locationFlow.test`; real prompt/timeout limit not verifiable |
| 016 favorites service | Verified | Mut H |
| 017 settings | Verified | `settings.test`; real reload in e2e |
| 018 store | Verified | `store.test` |
| 019 app controller | Verified (fakes) | Mut A; race tests read |
| 020 localStorage adapter | Verified (Edge, Chrome) | Mut F; other browsers not run |
| 021 geolocation adapter | Partially verified | stubs + Edge/Chrome with test permission (Mut G); real prompt, ignoring the prompt, Permissions API outside Chromium: Not verifiable here |
| 026 shell/layout | Partially verified | structure + Edge/Chrome geometry; visual quality, other browsers, tab-order decision not verified |
| 027 search UI | Verified (fakes) | Mut K |
| 028 current weather card | Partially verified | placeholder icons (TASK-035); visual not checked |
| 029 forecast list | Partially verified | placeholder icons; time-zone basis (FR-025) Unverified |
| 030 refresh/last updated | Verified (fakes) | Mut J survived only because of redundant layers |
| 031 favorites UI | Verified (fakes; Edge+Chrome reload) | Mut I; screen reader not run |
| 032 location control | Partially verified | real prompt not run |
| 033 unit toggle | Verified | `unitToggle.test`, scenario and e2e flow |
| 034 status/errors | Partially verified | leak and loading tests pass; real latency and screen-reader announcement not verified |
| 036 composition (demo) | Verified | build/scan/negative checks, `demoMode`, `release.spec`; live wiring is TASK-037 (not built) |
| **038 scenario tests** | **Verified, with stated exceptions - see A.11** | 37/37 pass; mapping A.4; sample mutations caught |
| 039 accessibility | Partially verified | Edge/Chrome automation passed; manual list in A.7 outstanding; icons not verifiable |
| 040 responsive/browser | Partially verified | Edge/Chrome only; manual list in A.7 outstanding |
| 041 security/privacy | Partially verified | automated checks pass (Mut L, O, P, Q, R); HTTPS-only URLs and URL encoding **not verifiable here** (no adapter); user's own storage/network inspection not done |
| 043 HTTPS static build/deploy notes | Verified (build, scan, guard) | hosting not chosen; HTTPS hosting not tested; `docs/deployment.md` not independently reviewed |
| 044 code review | Partially verified | `sourceScan` conformance tests pass; the independent code review itself is **Not verifiable here** (not a Verifier activity) |
| 045 documentation | Partially verified | README script names and 6 config defaults match the repo; not validated by a fresh reader; `npm install`/`dev`/`dev:demo` not run |

## A.11 TASK-038: can it move from "In Progress - pending Verifier" to Complete?

**On Verifier evidence: yes, to Complete scoped as "scenario tests for AC-001..007 and AC-P-01..05 against fakes (jsdom) plus Edge/Chrome automation", with these stated exceptions that must stay visible:** (1) AC-003-2, AC-004-3 and AC-007-2 are Partial (placeholder icons, TASK-035); (2) AC-007-1 and AC-007-4 are only geometry in the scenario/e2e tests, and AC-007-6 is structural, so "clear, organized, easy to read" is not verified; (3) AC-P-06 and every TBD threshold are open; (4) nothing here involves a real provider. The task's own completion criterion (an AC-to-test mapping with results, and failures reported) is met by A.4 and A.1: 37/37 scenario tests passed in two full runs, and 17 of 18 hand mutations were caught (the survivor is an explained redundancy). **Not covered by me, and still open per `impl-plan.md` item (2):** the Code Reviewer has not re-reviewed the follow-up edits; I did not perform a code review. I also did not mutation-check every scenario test and found one scenario-level gap (AC-003-4 covers only a missing humidity). Changing the status is the Orchestrator's decision; I did not edit `impl-plan.md`.

## A.12 Coverage Gaps and Required Follow-up

1. User actions TASK-001 and TASK-002 (provider facts, icons, deferred values) remain the blockers for any real-provider or icon verification.
2. Manual checks listed in A.7 (screen reader, Firefox/Safari/phone, real prompt, visual review at 320/768/1280/1920, zoom, forced colours, wide-tier order decision) are required before TASK-039 and TASK-040 can be closed; record results in `impl-plan.md`/this file.
3. Add a scenario assertion for a missing temperature and a missing condition (AC-003-4), a test of the real `main.tsx` boot path, and strengthen `focus.test` "error leaves focus in the search form" if wanted. These are suggestions; the Verifier changed no tests.
4. Decide on adding a coverage tool (needs authorization to install).
5. Resolve the `impl-plan.md` approval-status inconsistency (A.2) and decide TASK-038's status (A.11).
6. Re-run all of A.1 after any change to `src/`, `test/`, `e2e/`, `scripts/` or configuration. These results apply only to the repository as it stood on 2026-10-27 between 00:05 and the end of this run. This is **not** a release-readiness statement: TASK-037, 042 and 046 remain blocked, and no real weather provider has been exercised.

---

# PART B - RUN 2 (earlier run, 2026-10-26; SUPERSEDED by Part A / Run 3, kept as recorded): TASK-003..021, TASK-026..034, TASK-036

> Historical record: statements about impl-plan.md Section 10 reflect the file at the time of this run; it was corrected afterwards (see top note).

> **Superseded.** Its "(current)" wording below referred to the time it was written. Counts (495 tests), the "demo providers ship in the production bundle" observation, the weak-test list and the "TASK-038..046 Not run" statements are out of date; see Part A.

Date: 2026-10-26 (test run started 21:01:32 local). Author: Verifier. No source, test or configuration file was modified. This file is the only artifact written. Side effects: `npm run build` and `npm run build:demo` regenerate `dist/`; `npm run build` was run once more at the end so `dist/` holds the production (non-demo) build. Two temporary helper files were written to the user temp directory, outside the repository.

## A1. Verification Summary

| Command | Exit | Result |
|---------|------|--------|
| `npm run typecheck` | 0 | Passed, no diagnostics |
| `npm test` | 0 | Passed: 36 files, 495 tests, 0 failed, 0 skipped (7.20 s) |
| `npm run lint` | 0 | Passed, no output beyond the npm banner |
| `npm run build` | 0 | Passed: 58 modules, `index-Dk8snRJx.js` 262.35 kB (80.81 kB gzip), CSS 3.30 kB |
| `npm run build:demo` | 0 | Passed: 58 modules, `index-C3h83vvL.js` 262.35 kB (80.80 kB gzip) |
| `npm audit` | 0 | "found 0 vulnerabilities" (network was available; single run, registry state at that time) |

All automated checks passed. This shows that the core logic, two browser adapters and the React UI behave as the tests specify **in jsdom, against fakes and stubs**. It does **not** show that the app works in a real browser or against a real weather provider. Nothing was opened in a browser. Requirement-level verification remains partial (A3, A6, A7).

## A2. Scope and Environment

- Repository: `<project root>` (not a git repository; no diff available; scope taken from `impl-plan.md` and the files present). Windows 11, Git Bash, Node v24.21.0, npm 11.19.0, Vitest v5.0.5, Vite v8.3.5. Nothing was installed.
- Scope: TASK-003..021 and TASK-026..034, TASK-036 as implemented, including the post-review fixes recorded in `impl-plan.md`: batch 1 (M1, M2, M3, L1, L4, L6, L7 on core tasks) and batch 2 (Code Reviewer findings M1-M6 and L1-L4 on UI tasks 026-034 and 036).
- Approval basis: the task instruction names these tasks as approved, and the batch-2 review-fix notes say "user-approved". I cannot independently confirm the original approvals. **Conflict not reconciled:** `impl-plan.md` line 3 and Section 10 still say "NO task is approved for implementation / Tasks approved: none". `requirements.md` is Approved with OQ-001 to OQ-014 still TBD; TBD requirements were checked only against the implementation's defaults.
- Test environments: `vite.config.ts` sets `environment: 'node'`. The 15 `.tsx` UI test files opt in to jsdom with `// @vitest-environment jsdom` (I confirmed the docblock in the files I read; I did not open the headers of `app`, `search`, `currentWeather`, `forecast`, `unitToggle` and `composition`). `noLiterals.test.ts` and `styles.test.ts` run in node and read source/CSS as text. jsdom has no layout, so no layout-dependent claim can be made from these tests.
- Out of scope / not built: TASK-001, 002 (user actions), TASK-022 to 025 (provider adapters, attribution), TASK-035 (icons; `IconSlot` is a placeholder), TASK-037 (live provider wiring), TASK-038 to 046.

## A3. Commands Executed and Results (Run 2)

All run from the repository root.

1. `npm run typecheck` (`tsc --noEmit`). Exit 0. Passed.
2. `npm test` (`vitest run`). Exit 0. `Test Files 36 passed (36)`, `Tests 495 passed (495)`, duration 7.20 s. Output also printed `Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package` (a jsdom message, apparently triggered while axe-core runs; not a failure) and an advisory about worker isolation. Passed.
3. `npx vitest run --reporter=json --outputFile=<temp>/vr2.json` plus a Node script to read it. Exit 0. 495 total, 495 passed, 0 failed, 0 pending, 0 todo. (A second full run of the suite; consistent with run 1.) Per-file counts are in A3.1. My first helper script had a shell-quoting error and was rewritten; this was not a project failure.
4. `npm run lint` (`eslint .`). Exit 0. Passed. Whether `dist/` and `node_modules` are excluded by `eslint.config.js` was not examined.
5. `npm run build` (`tsc --noEmit && vite build`). Exit 0. Passed. Output: `58 modules transformed`; `dist/index.html` 0.39 kB; CSS 3.30 kB; JS 262.35 kB. Run again at the end after `build:demo`; exit 0, same hashes.
6. `npm run build:demo` (`tsc --noEmit && vite build --mode demo`). Exit 0. Passed. JS hash differs from the production build (`C3h83vvL` vs `Dk8snRJx`).
7. `grep -c Testville dist/assets/*.js` on each bundle. Result: 1 matching line in both the demo and the production bundle. **Observation:** the demo providers and their invented place names are shipped in the production bundle; the app uses them only when demo mode is requested at runtime (`isDemoRequested`). Not a test failure, but a fact for TASK-041/043 review.
8. `npm audit`. Exit 0, "found 0 vulnerabilities". Passed for the dependency tree as of the run.

`npm run dev`, `npm run dev:demo`: **Not run** (no specific need; a dev server would not give evidence without a browser).

### A3.1 Test file inventory (JSON reporter)

Unchanged from Run 1, 19 files / 304 tests (smoke 1, errors 18, domain 3, ports 9, config 36, identity 13, format 20, conditions 7, forecast 12, fakes 14, search 18, weatherService 19, locationFlow 22, favoritesService 23, settings 10, store 13, appController 41, localStorageStore 6, geolocation 19). New in Run 2, 17 files / 191 tests:

| File | Tests | Task(s) |
|------|-------|---------|
| `test/ui/app.test.tsx` | 12 | 026 |
| `test/ui/search.test.tsx` | 14 | 027 |
| `test/ui/currentWeather.test.tsx` | 13 | 028 |
| `test/ui/forecast.test.tsx` | 10 | 029 |
| `test/ui/refresh.test.tsx` | 9 | 030 |
| `test/ui/favorites.test.tsx` | 8 | 031 |
| `test/ui/location.test.tsx` | 9 | 032 |
| `test/ui/unitToggle.test.tsx` | 6 | 033 |
| `test/ui/status.test.tsx` | 33 | 034 |
| `test/ui/composition.test.tsx` | 5 | 036 |
| `test/ui/demoMode.test.tsx` | 17 | 036 (review M6) |
| `test/ui/focus.test.tsx` | 17 | review M2 |
| `test/ui/liveRegions.test.tsx` | 9 | review M3, M5 |
| `test/ui/robustness.test.tsx` | 8 | review L1, L2 |
| `test/ui/accessibility.test.tsx` | 5 | review L4 (axe-core) |
| `test/ui/styles.test.ts` | 10 | review M4, L3 (CSS read as text) |
| `test/ui/noLiterals.test.ts` | 6 | 034 (AST scan) |
| **Total** | **191** (304 + 191 = 495) | |

## A4. Post-review fixes (both batches)

Basis column: **Body** = I read the test bodies in this run; **Title** = mapping rests on test titles and Implementer notes only.

| Fix | Evidence | Basis | Status |
|-----|----------|-------|--------|
| B1 M1 unresolved device key per coordinates | `appController.test.ts` "M1: a second Use my location..." (asserts error state has no data and no `updatedAt`); "M1: unresolved device key never written to storage" (weak, see A8) | Body | Passed |
| B1 M2 failed locate keeps selection and in-flight load | `appController.test.ts` four "M2:" tests | Body | Passed |
| B1 M3 refresh ignored during initial load | `appController.test.ts` "M3:" (call counts 1 then 2) | Body | Passed |
| B1 L1 listener isolation | `appController.test.ts` subscriber test (body); `store.test.ts` | Body / Title | Passed |
| B1 L4 config validation; favorites kept above cap | `favoritesService.test.ts` L4 test (body); `config.test.ts` | Body / Title | Passed |
| B1 L6 clears earlier errors; settings-not-saved | `appController.test.ts` four "L6:" tests | Body | Passed |
| B1 L7 escape `\|` and `\` in keys | `identity.test.ts` | Title | Passed (not individually inspected) |
| B2 M1 Search never disabled; latest wins | `search.test.tsx` "a pending search does not block...", "never disabled" | Title | Passed |
| B2 M2 focus management | `focus.test.tsx` (17) | Body | Passed in jsdom only |
| B2 M3 single announced source | `liveRegions.test.tsx` | Body | Passed (DOM structure, not real announcement) |
| B2 M4 wide-tier grid placement | `styles.test.ts` | Body | Passed on CSS text only; layout not seen |
| B2 M5 idle section state | `liveRegions.test.tsx` M5 tests | Body | Passed |
| B2 M6 demo mode opt-in, isolation | `demoMode.test.tsx`, `composition.test.tsx` | Body / Title | Passed, one weak test (A8) |
| B2 L1 shared refresh guard | `robustness.test.tsx`, `refresh.test.tsx` | Body | Passed |
| B2 L2 StrictMode, stable subscription, useLayout fallback | `robustness.test.tsx` | Body | Passed |
| B2 L3 wrapping, `aria-current` non-colour cue | `styles.test.ts` (CSS text), `favorites.test.tsx` (`aria-current`) | Body | Passed on CSS text only |
| B2 L4 loading-delay and leak tests rewritten; literal scan broadened | `status.test.tsx` (body), `noLiterals.test.ts` | Body / Title | Passed |

## A5. Requirements and Acceptance Criteria Coverage (Run 2)

Statuses: **Tested (jsdom/fakes)** = covered by passing tests against fakes in jsdom or node; this is never real-browser or real-provider evidence. Test files are under `test/`. "Title" marks mapping from titles only.

| Requirement / AC | Covering tests | Basis | Status and gap |
|------------------|----------------|-------|----------------|
| FR-001/002, AC-001-1 | `ui/search.test` (one match shown); `core/search.test`; `ui/composition.test` flows | Title (ui/search), Body (appController) | Tested vs fakes. Real provider Unverified |
| FR-003, AC-001-2 | `ui/search.test` "country only when present"; `ui/currentWeather.test` | Title | Tested vs fakes |
| FR-004, AC-001-3 | `ui/search.test` "city not found"; `appController.test` | Title / Body | Tested vs fakes |
| FR-005, AC-001-4, AC-P-01 | `ui/search.test` empty/whitespace/over-long with zero provider calls; `appController.test` empty search | Title / Body | Tested |
| FR-006, NFR-001, AC-001-5 | `ui/search.test` service error and rejecting provider; `status.test` leak tests; `appController.test` every-port-throws | Body (status, appController) | Tested |
| FR-007 (TBD) | `core/search.test`, `ui/search.test` chooser | Title | Defaults only |
| FR-008..011, AC-002-1..4 | `appController.test` launch policy and locate; `ui/location.test`; `core/locationFlow.test`; `adapters/geolocation.test` | Body (appController), Title (rest) | Tested vs fakes/stubs. Real Geolocation prompt/permission/timeout **Unverified** |
| FR-009 / AC-002-2 (no prompt at first paint) | `ui/location.test` first paint (partly mismatched title, A8); `appController.test` it.each | Body | Tested |
| FR-012 (TBD) | `config.test`, `locationFlow.test` | Title | Default only |
| FR-013, FR-039 (TBD) | `appController.test` device favorite tests; `ui/favorites.test` device hint | Body | Tested with fakes; real reverse geocoding not built |
| FR-014, FR-018, FR-019, AC-003-1/4/5 | `ui/currentWeather.test`; `weatherService.test` | Title (ui), Body (service) | Tested |
| FR-015/022/041, AC-003-2, AC-004-3, AC-007-2 (icons) | `core/conditions.test`; `currentWeather.test` "decorative icon beside text" | Title | Partial: TASK-035 not built; icons **Unverified** |
| FR-016/017, AC-003-3 | `ui/unitToggle.test`; `settings.test`; `format.test`; `appController.test` | Title / Body | Tested; FR-017 default only |
| FR-020..025, AC-004-1/2/4/5 | `ui/forecast.test`; `weatherService.test`; `core/forecast.test` | Title (ui), Body (service) | Tested; FR-025 time-zone basis depends on provider (Unverified) |
| FR-026..030, AC-005-1..5, AC-P-02, AC-P-03 | `ui/refresh.test` (incl. real-controller five clicks and failed refresh); `ui/robustness.test`; `weatherService.test`; `appController.test` | Body | Tested. Per-section `updatedAt` tests in `weatherService.test` can fail as written |
| FR-031 (TBD), NFR-004 (TBD) | `weatherService.test` timeout (fake timers); `status.test` loading delay (fake timers) | Body | Defaults only; real latency **Unverified** |
| FR-032..038, AC-006-1..6, AC-P-05 | `ui/favorites.test`; `favoritesService.test`; `appController.test`; `adapters/localStorageStore.test` | Body (favorites, service, controller), Title (adapter) | Tested vs in-memory fake and stub. Real `localStorage` persistence across reload **Unverified** |
| FR-040, FR-043, AC-007-1, AC-007-4 (layout, responsive) | `ui/app.test` (landmarks, tiers via stub `matchMedia`); `styles.test` (CSS text) | Title / Body | **Not verified**: no layout engine; 320/768/1280 not checked |
| FR-042, AC-007-3, AC-P-04 (labels, units) | `currentWeather.test`, `forecast.test`, `format.test` | Title | Tested |
| FR-044, AC-007-5 (status, loading, errors) | `status.test`, `liveRegions.test` | Body | Tested in jsdom |
| FR-045, AC-007-6 (navigation, one model) | `app.test`, `focus.test` nav anchors | Title / Body | Tested for DOM only |
| NFR-002, NFR-007 | none in a browser | | **Not verified** |
| NFR-003 | `accessibility.test` (axe, contrast disabled), `focus.test`, `liveRegions.test`, `unitToggle.test` keyboard | Body | Structural only. Visible focus ring, contrast, target size, screen reader **Not verified** |
| NFR-005 | `favoritesService.test`, `appController.test` (named place stored without device coordinates), `locationFlow.test` source scan, `ui/location.test` disclosure | Body | Partial. No test that search text is never persisted; real storage not inspected; no network inspection |
| NFR-006 | `status.test` (hostile fields and thrown messages never rendered), `currentWeather.test` "text not markup" (Title), `noLiterals.test` | Body / Title | Partial. No bundle secret scan was run; HTTPS/URL-encoding unverifiable (no adapter) |
| NFR-008 | `format.test` | Title | Single locale only |

## A6. Failures and Defects Observed

No command failed. No test failed or was skipped. Observations (not failures):
- jsdom printed `Not implemented: HTMLCanvasElement's getContext()` during the test run.
- The production bundle contains the demo providers and their invented place name (command 7).
- Documentation conflict: `impl-plan.md` header and Section 10 still say no task is approved.
- Known limitation from the Implementer: wide-tier visual order (Search, Favorites, Current, Forecast) differs from DOM/tab order; this is an open user decision, not tested for acceptability.

## A7. Blocked, Not Run, and Unverified (Run 2)

| Item | Classification |
|------|----------------|
| TASK-001 provider facts (F-005) | **Unverified / Blocked (user action)**; nothing assumed about any provider |
| TASK-002 icons and licence | **Blocked (user action)** |
| TASK-022..025 provider adapters, attribution; TASK-035 icons; TASK-037 live wiring | **Not built / Blocked**. No real provider call, CORS, rate limit or reverse geocoding evidence |
| Real-browser testing of any kind | **Not run**: layout at 320/768/1280 (and 1920), visible focus rings, colour contrast, target size, real Geolocation prompt/denial/timeout, Permissions API, `localStorage` persistence across a real reload and blocked storage |
| Dev servers (`dev`, `dev:demo`), manual flows A to D | **Not run** |
| Code coverage | **Not run**: no coverage tool installed (no install authorized); no coverage figure exists |
| Mutation testing | **Not run**: "can fail" judgments in A8 come from reading test bodies, not from breaking the code |
| Bundle secret scan, privacy inspection of stored data in a browser | **Not run** (TASK-041 pending) |
| Latency and NFR-004 targets, real timeout | **Not run / Unverified** |
| TASK-038..046 | **Not run / Pending** |
| Requirements with TBD answers (FR-007, 012, 013, 017, 025, 031, 038, 039; NFR-002, 003, 004, 007, 008 and related edge cases) | Checked only against implementation defaults; user values unconfirmed |

## A8. Test bodies read for high-risk areas, and weak tests

Bodies read in full this run: `appController.test.ts` (controller races), `favoritesService.test.ts`, `weatherService.test.ts` (per-section `updatedAt`), `focus.test.tsx`, `liveRegions.test.tsx`, `demoMode.test.tsx`, `favorites.test.tsx`, `accessibility.test.tsx`, `styles.test.ts`, `robustness.test.tsx`, `refresh.test.tsx`, `status.test.tsx`, `ui/helpers.tsx`, first 50 lines of `location.test.tsx`, and the privacy parts of `locationFlow.test.ts`. **Mapping still rests on titles** for: `search.test.tsx`, `currentWeather.test.tsx`, `forecast.test.tsx`, `unitToggle.test.tsx`, `app.test.tsx`, `composition.test.tsx`, `noLiterals.test.ts` (detector tests), and the core `config`, `identity`, `format`, `store`, `settings`, `search`, `forecast`, `conditions`, adapter tests.

Strong tests (read, can fail as written): the stale-result race tests (slow device result after search, slow weather A after B, empty search does not cancel, superseded load not left loading); per-section time tests ("older time", partial failure keeps data and old time, both-fail AC-P-02); the live-region identity check in `liveRegions.test.tsx`; the focus hand-off tests for Retry, Add, Remove, Dismiss.

I found **no test that is wholly incapable of failing**, but these are weak or fragile:
1. `demoMode.test.tsx` "demo: the device position is never read": the UI click assertion (`/could not be determined/`) would also appear if `compose` wrongly used `BrowserLocationService`, because jsdom has no `navigator.geolocation` and the real adapter reports unsupported with the same message. Only the direct `DemoLocationService` assertions discriminate; the composition wiring of that service is effectively **unverified**.
2. `demoMode.test.tsx` storage isolation: `void demo.controller.chooseCandidate(...)` is not awaited before `addFavorite`; it works only because selection is set synchronously (fragile). Isolation is tested with an in-memory store, not real `localStorage`.
3. `appController.test.ts` "M1: the unresolved device key is never written to storage": storage holds nothing in that flow, so `not.toContain('device:')` is nearly vacuous. The sibling test "device location without reverse cannot be favorited and nothing is stored" is the real check.
4. `favoritesService.test.ts` "resolved named place... never the device ones": the service never receives device coordinates, so the `not.toContain` checks cannot fail at that level. The controller-level test (device 33.3/44.4, stored must not contain them) is the meaningful one.
5. `location.test.tsx` "first paint triggers no location request, even with permission already granted or prompt": the loop covers prompt, denied and unsupported, not granted. Title and body differ. Granted auto-detect is covered in `appController.test.ts`.
6. `status.test.tsx` loading-delay `it.each([0, 50, 200])`: the indicator renders synchronously, so all three measure 0 ms; 50 and 200 add nothing over 0. It checks an upper bound on a fake clock, not real latency.
7. `appController.test.ts` "a refresh is cancelled when the selection changes" asserts only the final location key, not that A's late data stayed out of B's data (the sibling "slow weather for A after B" does).
8. `focus.test.tsx` "an error leaves focus in the search form": focus is already in the input from typing; it fails only if code steals focus.
9. `styles.test.ts` reads CSS as text with a hand-written parser, takes the last declaration regardless of cascade, and by my reading of the parser, rules nested in `@media` blocks would be skipped. It pins text, not rendered layout (M4, L3 not seen).
10. `accessibility.test.tsx`: contrast rule disabled, jsdom, canvas not implemented; there is no assertion that axe actually evaluated a meaningful number of rules.
11. All `aria-live`/`role="status"` tests check DOM structure and attributes, not that assistive technology announces anything.
12. `robustness.test.tsx` second test uses `if (retryForecast.isConnected)` so one click is conditional; the exact call-count assertions still apply.
13. `locationFlow.test.ts` privacy test is a regex over the `locationFlow` source file only; other modules are not scanned.

## A9. Coverage Gaps and Required Follow-up

- No composed scenario suite for AC-001..007 (TASK-038 pending); `composition.test.tsx` smoke flows A to D in jsdom are the closest.
- No test that search text is never persisted or logged (NFR-005); no bundle secret scan; production bundle includes demo code.
- AC-007-1, AC-007-4, FR-040, FR-043, NFR-002, NFR-003 (visual), NFR-007: need a real browser (TASK-039, TASK-040).
- Fake-based tests cannot validate real provider payloads, units, time zones or condition codes.
- Known Geolocation limitation (timeout starts after the prompt is answered) is unmitigated and unverified.
- Decisions awaiting the user: TASK-001/002; NFR-004; `NETWORK` mapped to `SERVICE_UNAVAILABLE`; over-length input returning `NOT_FOUND`; wide-tier visual vs tab order.
- Resolve the `impl-plan.md` approval-status conflict.
- Re-run all six commands after any change to `src/` or `test/`. These results apply only to the code as it stood at 2026-10-26 21:01 and later in this run. This is **not** a release-readiness statement; TASK-046 remains blocked.

---

# PART C - RUN 1 (earliest run, 2026-10-26; SUPERSEDED by Part A / Run 3, retained as recorded): TASK-003 to TASK-021 only

> Historical record: statements about impl-plan.md Section 10 reflect the file at the time of this run; it was corrected afterwards (see top note).

> **Superseded.** "No UI exists", "304 tests", "placeholder main.tsx", "npm audit not run" and similar statements below were true of Run 1 only.

Date: 2026-10-26. Author: Verifier. Scope: TASK-003 to TASK-021 (including post-review fixes M1, M2, M3, L1, L4, L6, L7 recorded in `impl-plan.md`). No source code, test, or configuration file was modified by the Verifier. This file is the only artifact written.

## 1. Verification Summary

| Check | Result |
|-------|--------|
| `npm run typecheck` | Passed (exit 0) |
| `npm test` | Passed (exit 0): 19 files, 304 tests, 0 failed, 0 skipped |
| `npm run lint` | Passed (exit 0), no warnings or errors printed |
| `npm run build` | Passed (exit 0): `tsc --noEmit` then `vite build`, 15 modules, bundle emitted |

All four automated checks passed. They show that the **core logic and two browser adapters behave as specified by unit tests against fakes and stubs**. They do **not** show that the application works: no UI exists (TASK-026 onward not implemented), no provider adapter exists, and nothing was run in a real browser. The produced bundle renders an empty `<main />` (`src/main.tsx`, a placeholder). Requirement-level verification is therefore partial; see Sections 3, 6 and 7.

## 2. Scope and Environment

- Repository: `<project root>` (not a git repository, so no change set could be diffed; scope is taken from `impl-plan.md` and the files present).
- Platform: Windows 11 Enterprise 10.0.26200, Git Bash. Node v24.21.0, npm 11.19.0.
- Tool versions as reported by the runs: Vitest v5.0.5, Vite v8.3.5. Dependencies were already installed in `node_modules`; nothing was installed or changed.
- Vitest config (`vite.config.ts`): `environment: 'node'`. There is no DOM environment; adapters are tested with hand-written stubs of `localStorage`, `navigator.geolocation` and `navigator.permissions`.
- Approval basis: `requirements.md` is Approved (OQ-001 to OQ-014 remain TBD). TASK-003 to TASK-021 are recorded in `impl-plan.md` as approved by the user (recorded by the main session; the Verifier cannot independently confirm the original messages). Requirements marked TBD were verified only against the recommended defaults the implementation used, not against user-confirmed values.
- Source files inspected: file lists of `src/` and `test/`, `package.json`, `vite.config.ts`, `src/main.tsx`, `impl-plan.md`, `requirements.md`. Test bodies were not all read; the mapping in Section 3 is based on test file names, test titles (read for `appController`, `weatherService`, `favoritesService`) and the Implementer's notes in `impl-plan.md`.
- Side effect: `npm run build` regenerates `dist/` (a pre-existing build output directory). This is the normal effect of the script.

## 3. Requirements and Acceptance Criteria Coverage

Legend: **Unit-tested** = covered by passing unit tests against fakes or stubs only. **Not verifiable** = depends on unbuilt tasks or real environments. "Partial" means the core logic is tested but the user-visible behavior (UI, real provider, real browser) is not.

### 3.1 Test file inventory (from the JSON reporter, run 2 below)

| File | Tests | Task(s) |
|------|-------|---------|
| `test/smoke.test.ts` | 1 | 003 |
| `test/core/errors.test.ts` | 18 | 004 (and 009 message lookup) |
| `test/core/domain.test.ts` | 3 | 005 |
| `test/core/ports.test.ts` | 9 | 006 |
| `test/core/config.test.ts` | 36 | 007 (incl. L4) |
| `test/core/identity.test.ts` | 13 | 008 (incl. L7) |
| `test/core/format.test.ts` | 20 | 009 |
| `test/core/conditions.test.ts` | 7 | 010 |
| `test/core/forecast.test.ts` | 12 | 011 |
| `test/fakes/fakes.test.ts` | 14 | 012 |
| `test/core/search.test.ts` | 18 | 013 |
| `test/core/weatherService.test.ts` | 19 | 014 |
| `test/core/locationFlow.test.ts` | 22 | 015 (incl. M1) |
| `test/core/favoritesService.test.ts` | 23 | 016 (incl. L4) |
| `test/core/settings.test.ts` | 10 | 017 |
| `test/core/store.test.ts` | 13 | 018 (incl. L1) |
| `test/core/appController.test.ts` | 41 | 019 (incl. M1, M2, M3, L1, L6) |
| `test/adapters/localStorageStore.test.ts` | 6 | 020 |
| `test/adapters/geolocation.test.ts` | 19 | 021 |
| **Total** | **304** | |

### 3.2 Post-review fixes

| Fix | Evidence (test title or file) | Status |
|-----|-------------------------------|--------|
| M1 (unresolved device location keyed with coordinates) | `appController.test.ts`: "M1: a second 'Use my location' from another place never shows the first place's data"; "M1: the unresolved device key is never written to storage"; `locationFlow.test.ts` | Unit-tested, passed |
| M2 (failed locate does not start a selection) | `appController.test.ts`: four "M2:" tests | Unit-tested, passed |
| M3 (refresh ignored during initial load) | `appController.test.ts`: "M3: a refresh during the initial load makes no second request" | Unit-tested, passed |
| L1 (listener exception isolation) | `store.test.ts` (title not individually inspected); `appController.test.ts`: "an exception thrown by a subscriber is isolated..." | Unit-tested, passed |
| L4 (config validation; favorites kept above cap) | `config.test.ts`; `favoritesService.test.ts`: "keeps every valid stored favorite when the cap is lower, and still blocks additions" | Unit-tested, passed |
| L6 (clear earlier errors; settings-not-saved message) | `appController.test.ts`: four "L6:" tests | Unit-tested, passed |
| L7 (escape `|` and `\` in name keys) | `identity.test.ts` (title not individually inspected) | Unit-tested, passed (not individually confirmed by title) |

### 3.3 Functional requirements

| Requirement / AC | Evidence | Status |
|------------------|----------|--------|
| FR-001, FR-002, AC-001-1 (search, show weather) | `search.test.ts`; `appController.test.ts` "one match is selected and its weather loaded". No input control or display exists. | Partial: logic only. UI Not verifiable (TASK-027). Real provider Not verifiable (TASK-022 blocked). |
| FR-003, AC-001-2 (name and country) | Domain/search logic only; display not built. | Unverified (TASK-027, 028) |
| FR-004, AC-001-3 (city not found) | `search.test.ts` (not found); `appController.test.ts` "not found and service errors are shown as search errors". | Partial: error state in store; message display not built |
| FR-005, AC-001-4, AC-P-01 (empty input, zero calls) | `search.test.ts` (empty and whitespace make zero port calls, per Implementer note); `appController.test.ts` "an empty search does not cancel work in progress". | Partial: zero provider calls unit-tested; visible prompt not built |
| FR-006, NFR-001, AC-001-5 (service down, no crash) | `search.test.ts`; `appController.test.ts` "every intent resolves when every port throws". | Partial: no crash at controller level; user-visible message not built |
| FR-007 (TBD, OQ-007) | `search.test.ts` (Unicode, trim, ambiguity up to `searchResultLimit`, `maxInputLength`), `appController.test.ts` "several matches wait for a choice". Implemented at defaults only. | Partial; behavior TBD by user |
| FR-008, AC-002-1, AC-002-5 (granted: detect and show) | `appController.test.ts` "permission granted: auto-detects and shows weather"; `locationFlow.test.ts`. | Partial: logic with fakes. Real Geolocation untested |
| FR-009, AC-002-2 (ask before access) | `appController.test.ts` it.each prompt/denied/unsupported (no `getCurrentPosition` on launch) and "prompt state: the user action is what calls getCurrentPosition". | Partial: controller and flow logic. Prompt UI and real browser prompt not verified |
| FR-010, AC-002-3 (denied) | `locationFlow.test.ts`; `geolocation.test.ts` error-code mapping; `appController.test.ts` "a failure keeps city search usable...". | Partial: city search availability in UI not verifiable |
| FR-011, AC-002-4 (fail or timeout) | `locationFlow.test.ts`, `geolocation.test.ts` (timeout, unavailable, unsupported). | Partial (stubs only) |
| FR-012 (TBD) | `config.test.ts` default 10000 ms; `locationFlow.test.ts` timeout. Real-browser timeout behavior has a known limitation (see Section 7). | Partial |
| FR-013, FR-039 (TBD, OQ-009) | `appController.test.ts` launch policy tests; device-location favorite tests ("device location without reverse cannot be favorited...", "...resolved to a named place saves that place..."); `favoritesService.test.ts` device-location rejection. Real reverse geocoding does not exist (TASK-024 blocked). | Partial; reverse path tested with fakes only |
| FR-014, AC-003-1 (current weather) | `weatherService.test.ts` ("both sections succeed"). Display not built. | Partial (TASK-028) |
| FR-015, FR-022, FR-041, AC-003-2, AC-004-3, AC-007-2 (icons) | `conditions.test.ts` (icon key and label for every `ConditionCode`, UNKNOWN fallback). No icon assets or component. | Partial: mapping only. Icons Not verifiable (TASK-035 blocked) |
| FR-016, AC-003-3 (unit) | `format.test.ts` (conversion, symbols); `settings.test.ts`; `appController.test.ts` "the temperature unit is stored and persisted". Toggle UI not built. | Partial (TASK-033) |
| FR-017 (TBD) | `settings.test.ts`, `config.test.ts` defaults. | Partial; default only |
| FR-018, AC-003-4 (incomplete data) | `weatherService.test.ts` "missing provider fields stay undefined"; `format.test.ts` ("Unavailable" token). Rendering not built. | Partial |
| FR-019, AC-003-5 (current failure) | `weatherService.test.ts` "current fails...", "first load failing leaves an error section...". Retry control not built. | Partial |
| FR-020, FR-021, AC-004-1, AC-004-2 (3-day forecast) | `weatherService.test.ts` ("requests configured days and includeToday..."), `forecast.test.ts`, `format.test.ts`. Display not built. | Partial (TASK-029) |
| FR-023, AC-004-4 (fewer than 3 days) | `forecast.test.ts` (0, 1, 2, 3, more than 3); `weatherService.test.ts` "exposes forecast slots padded...". | Partial (rendering not built) |
| FR-024, AC-004-5 (forecast failure, retry) | `weatherService.test.ts` "forecast fails...". Retry option not built. | Partial |
| FR-025 (TBD) | `config.test.ts` defaults (`forecastDays` 3, `forecastIncludesToday` false); `weatherService.test.ts` passes them. Time-zone basis depends on provider (TASK-001). | Partial; defaults only |
| FR-026, AC-005-1 (refresh control) | `appController.test.ts` refresh tests ("refresh with nothing displayed does nothing"). Control not built. | Partial |
| FR-027, AC-005-2 (refresh updates both) | `weatherService.test.ts` "both sections succeed", "when the sections finish at different times, both get the older time". | Partial |
| FR-028, AC-005-3, AC-P-03 (no duplicate requests) | `weatherService.test.ts` "five rapid refreshes produce exactly one provider call per section (AC-P-03)"; `appController.test.ts` "rapid refreshes produce one provider call per section" and M3. Control-disabled behavior in a UI not built. | Partial: service/controller level passed |
| FR-029, AC-005-4, AC-P-02 (failed refresh keeps data) | `weatherService.test.ts` "both fail: previous data and times are kept (AC-P-02)"; `appController.test.ts` "a failed refresh keeps the displayed values"; `store.test.ts`. | Partial: state level passed; visible message not built |
| FR-030, AC-005-5 (last updated) | `forecast.test.ts` (older of two section times, undefined if one never succeeded); `weatherService.test.ts`. Display not built. | Partial |
| FR-031 (TBD) | `weatherService.test.ts` "times out at weatherTimeoutMs (10 s)..." with fake timers; no automatic retry. Wall-clock timeout not exercised. | Partial |
| FR-032, AC-006-1 (add favorite) | `favoritesService.test.ts`; `appController.test.ts` "add, duplicate and remove...". Control not built. | Partial (TASK-031) |
| FR-033, AC-006-2 (list) | `favoritesService.test.ts` (insertion order); store holds favorites. List not rendered. | Partial |
| FR-034, AC-006-3 (select favorite) | `appController.test.ts` "selecting a favorite loads by stored coordinates without calling search". | Partial |
| FR-035, AC-006-4 (no duplicates) | `favoritesService.test.ts` "rejects duplicates by key..."; `identity.test.ts`. Duplicate identity rule is the TBD default (FR-038). | Partial |
| FR-036, AC-006-5 (remove) | `favoritesService.test.ts` "removes by key..."; `appController.test.ts` (removing the displayed favorite keeps weather). | Partial |
| FR-037, AC-006-6, AC-P-05 (persistence) | `favoritesService.test.ts` "a fresh service over the same store restores the list" against an in-memory fake; `localStorageStore.test.ts` against a stub. **No real browser localStorage reload was tested.** | Partial; real persistence Unverified |
| FR-038 (TBD) | `config.test.ts`, `favoritesService.test.ts` (cap, ordering), `identity.test.ts`. | Partial; defaults only |
| FR-040, FR-043, FR-044, FR-045, AC-007-1, 4, 5, 6 (layout, responsive, loading states, navigation) | No UI exists. `store.test.ts` covers state only. | **Not verifiable** (TASK-026 to 034) |
| FR-042, AC-007-3, AC-P-04 (labels and units) | `format.test.ts` covers formatting functions (units, "%", degree symbol). Labels in a rendered UI do not exist. | Partial: formatting only |

### 3.4 Non-functional requirements

| NFR | Evidence | Status |
|-----|----------|--------|
| NFR-001 Reliability | `appController.test.ts` "every intent resolves when every port throws"; `errors.test.ts`; adapters tested to return typed errors, not throw. No UI behavior. | Partial (core only) |
| NFR-002 Responsive, NFR-007 Browser support | None | **Not verified** (TASK-026, 040) |
| NFR-003 Accessibility | None | **Not verified** (TASK-039) |
| NFR-004 Performance (TBD) | 10 s timeout tested with fake timers only. No latency or loading-indicator timing. | **Not verified** (TASK-034, 042) |
| NFR-005 Privacy | `locationFlow.test.ts` (no storage dependency, source-scan test), `favoritesService.test.ts` (no raw device coordinates stored), `appController.test.ts` M1 (unresolved device key never stored). Real browser storage not inspected; no network inspection. | Partial |
| NFR-006 Security | `errors.test.ts` (messages contain no interpolated raw input). No bundle secret scan, no rendering-as-text check, no HTTPS URL check (no provider adapter). | Partial; mostly Unverified (TASK-041) |
| NFR-008 Localization | `format.test.ts` (device-locale date formatting, message table). Single locale only. | Partial |

## 4. Commands Executed and Results

All commands run from `<project root>`.

1. `npm run typecheck` (runs `tsc --noEmit`). Purpose: strict-mode type check of `src/` and `test/` (as configured in `tsconfig.json`). Exit code 0. Output: only the npm banner; no diagnostics. **Passed.**
2. `npm test` (runs `vitest run`). Purpose: execute the unit tests. Exit code 0. Output summary: `Test Files 19 passed (19)`, `Tests 304 passed (304)`, duration about 687 ms. **Passed.**
3. `npx vitest run --reporter=json --outputFile=<temp>/vitest-report.json`, then a short Node script reading that report. Purpose: obtain per-file test counts. Exit code 0 for the test run. Report: 304 total, 304 passed, 0 failed, 0 pending, 0 todo. Per-file counts are in Section 3.1. (This was a second full run of the same suite; it matched run 1. The report and script were written to the user temp directory, outside the repository.) **Passed.**
4. `npm run lint` (runs `eslint .`). Purpose: static analysis with the project's ESLint flat config (typescript-eslint, react-hooks). Exit code 0, no output beyond the banner. **Passed.** Whether `dist/` and `node_modules` are excluded by `eslint.config.js` was not examined.
5. `npm run build` (runs `tsc --noEmit && vite build`). Purpose: type check and production bundle. Exit code 0. Output: `15 modules transformed`; `dist/index.html` 0.39 kB, `dist/assets/index-CdyfEuBg.css` 0.05 kB, `dist/assets/index-CLXUI2KP.js` 219.45 kB (68.56 kB gzip); `built in 126ms`. **Passed.** The bundle contains the React runtime and an empty `<main />`; no application UI.

Two earlier attempts to summarize the JSON report failed with a shell-quoting syntax error in my own helper script (not a project failure); the test run itself had exited 0 and the helper was rewritten.

Other `package.json` scripts: `dev` (`vite`) was **Not run**: it starts a long-running dev server and, with only a placeholder `main.tsx`, would show an empty page. No `preview`, coverage, or e2e script exists, and no coverage provider (such as `@vitest/coverage-v8`) is installed, so **no code coverage figure was measured**.

## 5. Failures and Defects Observed

No command failed. No test failed or was skipped. No warnings were printed by any command.

Observations (not failures):
- `src/main.tsx` is a placeholder; the built app displays nothing.
- Vitest runs in the `node` environment; the adapters are tested only against stubs written by the Implementer, so stub fidelity to real browsers is unverified.

## 6. Blocked, Not Run, and Unverified Checks

| Item | Classification | Reason |
|------|----------------|--------|
| TASK-001 (user verification of provider facts, F-005) | **Unverified / Blocked (user action)** | No user answers recorded; nothing assumed about Open-Meteo or any provider |
| TASK-002 (icon set, deferred values) | **Blocked (user action)** | |
| TASK-022 to 025 (provider adapters, attribution) | **Not implemented / Blocked** | Depend on TASK-001; no live provider behavior tested |
| TASK-026 to 034 (all UI) | **Not implemented** | No component, layout, search UI, card, forecast list, refresh control, favorites UI, location control, unit toggle, status area exist |
| TASK-035 (icon assets) | **Blocked** | |
| TASK-036 to 046 (composition root, scenario tests, accessibility, responsive, security, latency, deploy, review, docs, release) | **Not run** | Not implemented or not approved |
| `npm run dev` | **Not run** | See Section 4 |
| Real-browser checks: Geolocation prompt/permission/timeout, Permissions API support, `localStorage` persistence across reload, blocked storage | **Not run / Unverified** | No browser testing was performed |
| Real provider calls, CORS, rate limits, time zone, reverse geocoding | **Not run / Unverified** | No adapter, no network access used |
| Accessibility, contrast, keyboard, screen reader | **Not run / Unverified** | |
| Responsive layout at 320/768/1280/1920 px | **Not run / Unverified** | |
| Performance and NFR-004 targets (200 ms indicator, 3 s for 90%) | **Not run / Unverified** | |
| Security scan of bundle for secrets, XSS rendering check | **Not run** | Only a placeholder bundle exists |
| Code coverage measurement | **Not run** | No coverage tooling installed (installation not authorized) |
| `npm audit` / dependency vulnerabilities | **Not run** | Requires network access |

## 7. Coverage Gaps

- Every user-visible acceptance criterion (AC-001-1 to AC-007-6) lacks end-to-end verification because no UI exists. Only the core logic beneath them is tested. AC-007-1, 4, 5 and 6 have no evidence at all.
- No scenario tests against the composed app (TASK-038) exist. Tests are per-module; interaction through the real controller was covered only by `appController.test.ts` with fakes.
- Fake-based tests do not validate the real provider payload shapes, units, or condition codes (no adapters exist).
- Adapter tests use stubs. Known limitation recorded by the Implementer: the Geolocation API cannot cancel a request and starts its timeout only after the permission prompt is answered, so a user who leaves the prompt open is not timed out. This is not verified or mitigated.
- The "no UI string literals outside the message table" rule is enforced only by a source-scan test of `format.ts`; no lint rule exists, and future UI code is not covered.
- Several tests use fake timers; no real-time timeout or latency behavior was observed.
- Requirements marked TBD (FR-007, 012, 013, 017, 025, 031, 038, 039; NFR-002, 003, 004, 007, 008; EC-003, 004, 015, 016, 018, 019) were verified only against the implementation's default assumptions, which the user has not confirmed.
- The mapping in Section 3 relies on test titles and Implementer notes; not every test body was read, so a test may cover less than its title or the plan suggests.
- Error mapping `NETWORK` treated as `SERVICE_UNAVAILABLE`, and over-length input returning `NOT_FOUND`, are Implementer decisions awaiting user confirmation (`impl-plan.md` TASK-013); the tests verify the current behavior, not its acceptability.

## 8. Limitations and Dependencies

- Not a git repository: no diff of changes was available; completeness of the change set relies on `impl-plan.md`.
- The plan's approval statements could not be independently verified.
- Results are from a single environment (Node v24.21.0 on Windows) and a single run each (the test suite was run twice with identical results).
- Nothing about provider terms, attribution, rate limits, CORS or time zones has been verified (F-005 open).
- Revision 2 of the architecture was not re-reviewed by the Design Reviewer (recorded in `impl-plan.md`).

## 9. Required Follow-up

1. The user resolves TASK-001 and TASK-002 so provider adapters and icons can be implemented and verified.
2. UI tasks (TASK-026 to 036) must be implemented and approved; then re-verify with component tests, a DOM test environment, and the scenario tests of TASK-038.
3. Perform real-browser checks (TASK-040): Geolocation, Permissions API, `localStorage` persistence, responsive layouts, accessibility (TASK-039), security/privacy (TASK-041).
4. Decide on adding a coverage tool and on a lint rule for UI string literals if wanted (needs user authorization for installing packages).
5. Re-run all four commands after any change to `src/` or `test/`; this record applies only to the code as it stood at the time of the runs above.
6. Do not treat these results as release readiness. TASK-046 remains blocked.
