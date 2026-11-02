# Test-suite triage (impl-plan T-15)

Written by the Implementer, 2026-10-30, at the end of Phase 1 (T-10..T-15). It lists every file under `test/` plus the files retired from `test/` and `e2e/` during Phase 1.

## How to read this

- **keep**: stays as it is; it does not depend on the legacy domain or error types, or it is the reused security/fixture asset named in the plan.
- **rewrite**: still passes today only because the legacy staging types (`Location`, `WeatherSnapshot`, `Legacy*` ports and fakes) are kept in `src/` until Phase 2. It must be rewritten against the approved model (Place / SelectedLocation / WeatherResult / AppError / Config) by the named task, then the legacy type it uses is removed.
- **retire**: deleted, or to be deleted, because what it tests no longer exists or is replaced.
- Task references are the plan's: T-20 Weather Service, T-21 Search Service, T-22 Favorites Service, T-23 Settings, T-24 presentation mapping, T-25 message catalogue, T-26 Location Flow, T-27 App Controller, T-30/T-31 provider adapters, T-32 platform adapters, T-40..T-48 UI, T-50 build/secret gate, T-60..T-64 integration/E2E.

## Count check

The plan (T-15 and section 3) says **51 files**. That does not match the tree:

| State | Files under `test/` |
|-------|---------------------|
| Committed at HEAD (50bf7d8) | 73 (`git ls-tree -r HEAD --name-only test`) |
| Now (after Phase 1 edits) | 76 (`find test -type f`) |

Of the 76: 52 are `*.test.ts(x)` files, 10 are JSON fixtures (9 recordings plus `manifest.json`), and 14 are other support files (fakes, helpers, contract definitions, a live smoke script). I could not find a way to reach 51 (the 52 test files is the nearest count). All 76 are listed below, so the list is complete for the real tree. The plan's number should be corrected by whoever owns `impl-plan.md`; I did not edit it.

Phase 1 changes to the count: 3 test files deleted (`releaseGuard.test.ts`, `demoMode.test.tsx`, `composition.test.tsx`), 6 files added (`contract/fakes.contract.test.ts`, `contract/portContracts.ts`, `core/domainModel.test.ts`, `core/favoritesApi.test.ts`, `fakes/legacyFakes.ts`, `ui/unconfigured.test.tsx`). 73 - 3 + 6 = 76.

## Files currently in `test/` (76)

### test/adapters (5)

| File | Disposition | Reason |
|------|-------------|--------|
| test/adapters/geolocation.test.ts | rewrite (T-32) | Tests the browser Geolocation adapter; the adapter now returns `Coordinates` through the approved `getPosition(signal)` port, and it must be re-tested for no-timeout-option and cancellation-by-discard. |
| test/adapters/localStorageStore.test.ts | keep | Tests the `KeyValueStore` adapter (get/set/remove, throwing storage); independent of the legacy types. Re-check in T-32 only. |
| test/adapters/openMeteo/conditionCodes.test.ts | rewrite (T-24/T-30) | Maps provider weather codes; the code table must be re-derived from `provider-verification.md` item 5 (WMO table) and the 8 approved categories, not from the old table. |
| test/adapters/openMeteo/geocoding.test.ts | rewrite (T-31) | Uses the recorded fixtures but still asserts the legacy `Location` result and legacy error mapping; rewrite for `Place`, `count` from Config (PV 6) and `cache: 'no-store'`. |
| test/adapters/openMeteo/weather.test.ts | rewrite (T-30) | Asserts the legacy split current/forecast calls; the approved adapter returns one `WeatherResult` from one request with `is_day` and `forecast_days=3` (PV 4, PV 5). |

### test/contract (2, new in Phase 1)

| File | Disposition | Reason |
|------|-------------|--------|
| test/contract/portContracts.ts | keep | New shared contract definitions for the weather, geocoding, location, key-value and clock ports (T-13). Real adapters in T-30..T-32 must run the same contracts. |
| test/contract/fakes.contract.test.ts | keep | New; runs the shared contracts against the fakes (T-13). Add the real adapters to it in T-30..T-32. |

### test/core (17)

| File | Disposition | Reason |
|------|-------------|--------|
| test/core/appController.test.ts | rewrite (T-27) | Drives the legacy controller over `Legacy*` fakes and `Location`; the approved controller owns `SelectedLocation` and per-section state. |
| test/core/conditions.test.ts | keep | Pure condition-category logic; not tied to the legacy model. Check against the 8 approved categories in T-24. |
| test/core/config.test.ts | keep | Written in T-11 against the approved typed Config (including the PV 6 cap of 100). |
| test/core/domain.test.ts | retire (T-20) | Tests the legacy `Location`/`WeatherSnapshot` shapes; superseded by `domainModel.test.ts`. Delete when the legacy types are removed. |
| test/core/domainModel.test.ts | keep | New in T-12; covers `Place`, `SelectedLocation`, `Coordinates` and `WeatherResult`. |
| test/core/errors.test.ts | keep | Rewritten in T-12 for the 12-kind `AppError` taxonomy; `INPUT_TOO_LONG` maps to `empty_input` with `messageKey 'error.inputTooLong'` (open question, see below). |
| test/core/favoritesApi.test.ts | keep | New in T-13; compile-time guards (`@ts-expect-error`) that device coordinates cannot be passed to the favorites API. Type-level only; behaviour is tested in T-22. |
| test/core/favoritesService.test.ts | rewrite (T-22) | Uses legacy `Location`; the approved service accepts only `Place` with the versioned `{v:1, items}` record and the normalised identity key. |
| test/core/forecast.test.ts | rewrite (T-20) | Legacy forecast shaping; approved model has independent current/forecast results and a 3-day forecast that includes today (PV 4). |
| test/core/format.test.ts | keep | Pure formatting helpers (rounding, units, dates); independent of the legacy model. Re-check in T-23/T-43. |
| test/core/identity.test.ts | keep | Pure favorite-identity key logic (trim, collapse, lower-case); matches the T-22 key rule. Re-check in T-22. |
| test/core/locationFlow.test.ts | rewrite (T-26) | Legacy location flow; the approved flow has the app-owned 10 s watchdog and the states idle/requesting/located/timed_out/denied/unavailable/unsupported. |
| test/core/ports.test.ts | rewrite (T-13 follow-up, T-20) | Still asserts the `Legacy*` port shapes (24 legacy references); superseded by `test/contract`. Delete with the legacy ports. |
| test/core/search.test.ts | rewrite (T-21) | Legacy search service; approved rules: trim/collapse, empty gives `empty_input` with no provider call, 100-character cap, text before first comma. |
| test/core/settings.test.ts | keep | Pure unit-setting logic, no legacy types; re-check against T-23 (default C, storage failure behaviour). |
| test/core/store.test.ts | rewrite (T-27) | 26 legacy references (`WeatherSnapshot`); the store holds the approved selection and section states. |
| test/core/weatherService.test.ts | rewrite (T-20) | 43 legacy references; the approved service takes coordinates, returns two independent section results plus the IANA time zone. |

### test/fakes (9)

| File | Disposition | Reason |
|------|-------------|--------|
| test/fakes/fakeClock.ts | keep | Fake `Clock`; used by the clock contract. |
| test/fakes/fakeGeocodingProvider.ts | keep | Rewritten in T-13 against the approved `GeocodingProvider` (`searchScript`, optional `reverseScript`, abort). |
| test/fakes/fakeLocationService.ts | keep | Rewritten in T-13 (`getPosition(signal)`, `positionScript`). |
| test/fakes/fakeWeatherProvider.ts | keep | Rewritten in T-13 (`get(coords, signal)`, `getScript`). |
| test/fakes/fakes.test.ts | keep | Rewritten in T-13: fakes, latency, abort, throwing storage, and the legacy fakes. Drop the legacy sections when the legacy fakes go. |
| test/fakes/inMemoryKeyValueStore.ts | keep | Extended in T-13 with `throwAll` for storage-failure tests. |
| test/fakes/index.ts | keep | Barrel; exports approved and legacy fakes. |
| test/fakes/legacyFakes.ts | retire (with the legacy ports, Phase 2) | New in T-13; only keeps the pre-Phase-2 services, controller and UI tests compiling. Delete when the last test importing `Legacy*` is rewritten. |
| test/fakes/scripted.ts | keep | Scripted-answer helper; added `setLatency` in T-13. |

### test/fixtures (11)

Fixture annotations name the `provider-verification.md` (PV) item each recording must match. All recordings are dated **2026-10-27**, i.e. before the T-02 verification of 2026-10-30, so they are not T-02 evidence. They are kept as response-shape samples and must be re-recorded or extended where marked.

| File | Disposition | Reason / PV item |
|------|-------------|------------------|
| test/fixtures/domain.ts | rewrite (Phase 2) | Holds both the approved fixtures (`samplePlace`, `sampleCoords`, `sampleWeatherResult`) and the legacy ones (`sampleLocation`, `sampleSnapshot`, ...); drop the legacy half with the legacy types. Invented data, not provider facts. |
| test/fixtures/openmeteo/manifest.json | keep | Records how each recording was made; update with every re-recording. |
| test/fixtures/openmeteo/geocoding-berlin.json | keep | PV 6: forward-geocoding fields (`id`, `name`, `latitude`, `longitude`, `admin1`, `country`, `timezone`). Check that the fields the adapter validates are present. |
| test/fixtures/openmeteo/geocoding-springfield.json | keep | PV 6: several places with the same name (pick list); the identity key must separate them. |
| test/fixtures/openmeteo/geocoding-munich-unicode.json | keep | PV 6: non-ASCII query input. |
| test/fixtures/openmeteo/geocoding-no-results.json | keep | PV 6: no `results` key at all means not found (an observed behaviour; confirm against the PV 6 text in T-31). |
| test/fixtures/openmeteo/geocoding-error-400.json | keep | PV 6 and the error taxonomy: `{error: true, reason}` body on HTTP 400. |
| test/fixtures/openmeteo/forecast-current.json | rewrite (T-30) | PV 5: must also carry `is_day` (day/night); this recording has only `temperature_2m`, `relative_humidity_2m`, `weather_code`. Re-record with `is_day` and a combined current+daily request. |
| test/fixtures/openmeteo/forecast-daily.json | rewrite (T-30) | PV 4: recorded with `forecast_days=4`; the approved value is 3 including today. Re-record with `forecast_days=3` (three entries, today first). |
| test/fixtures/openmeteo/forecast-error-400.json | keep | PV 5 and the error taxonomy: bad-parameter 400 body shape `{error: true, reason}`. |
| test/fixtures/openmeteo/forecast-error-bad-coords.json | keep | Error taxonomy: invalid latitude gives HTTP 400 with `{error: true, reason}`. |

### test/live (1)

| File | Disposition | Reason |
|------|-------------|--------|
| test/live/openMeteo.live.ts | keep (rewrite with T-30/T-31) | Manual `npm run smoke:live`, three real requests; not part of `npm test`. Update it to the combined request when the adapters change. |

### test/scenarios (1)

| File | Disposition | Reason |
|------|-------------|--------|
| test/scenarios/acceptance.test.tsx | rewrite (T-60) | End-to-end scenarios over the legacy composition and fakes; rebuild as integration tests on the new composition root, one per requirement group. |

### test/security (7)

| File | Disposition | Reason |
|------|-------------|--------|
| test/security/baseUrl.test.ts | keep | Updated in T-10/T-14; covers `VITE_BASE` resolution and real builds. |
| test/security/demoMarkers.test.ts | keep | Regression guard for `scripts/demoMarkers.mjs`; now checks the markers against a frozen list of the retired `src/dev` names. Contains the word "demo" by design (T-14 negative test). Fold into the T-50 gate. |
| test/security/notices.test.ts | keep | Third-party notices must match installed versions; unrelated to the model. |
| test/security/privacy.test.tsx | rewrite (T-64) | Updated in T-14 (demo parts removed) but still runs over the legacy composition; T-64 adds the full cache/privacy assertions. |
| test/security/scanDist.test.ts | keep | Dist-scan rules; `allowDemo` removed in T-14, the injected-marker negative tests are kept. Reused by T-50. |
| test/security/secretScan.test.ts | keep | Named in the plan as a reused asset (secret scanner). |
| test/security/sourceScan.test.ts | keep | Named in the plan as a reused asset (source scan); T-14 added no-`src/dev`, no `import.meta.env` and `main.tsx` checks. |

### test (top level, 1)

| File | Disposition | Reason |
|------|-------------|--------|
| test/smoke.test.ts | retire | A `1 + 1` toolchain check with no product value now that real tests exist. |

### test/support (2)

| File | Disposition | Reason |
|------|-------------|--------|
| test/support/openMeteo.ts | keep | Loads recorded fixtures for adapter tests; follows the fixtures above. |
| test/support/sourceFiles.ts | keep | Source-tree walker used by the scans. |

### test/ui (20)

| File | Disposition | Reason |
|------|-------------|--------|
| test/ui/accessibility.test.tsx | rewrite (T-48/T-62) | axe-core checks in jsdom; the demo-mode case was removed in T-14. Rebuild per main state (loaded, loading, error, pick list, favorites, denied). |
| test/ui/app.test.tsx | rewrite (T-40) | Shell tests over the legacy composition. |
| test/ui/currentWeather.test.tsx | rewrite (T-43) | Uses the legacy snapshot; the card now renders `WeatherResult` with the "unavailable" label. |
| test/ui/favorites.test.tsx | rewrite (T-45) | Favorites panel over the legacy flow; only `Place` can be added. |
| test/ui/focus.test.tsx | rewrite (T-48) | Focus-management tests over legacy state; keep the scenarios, change the setup. |
| test/ui/footer.test.tsx | rewrite (T-47) | Footer/credit tests updated in T-14 (demo removed); the attribution text and wording move to the T-25 catalogue. |
| test/ui/forecast.test.tsx | rewrite (T-43) | Forecast list over the legacy model; 3 days including today. |
| test/ui/helpers.tsx | rewrite (T-60) | Render helpers built on `Legacy*` fakes; rebuild on the new fakes and composition root. |
| test/ui/liveComposition.test.tsx | rewrite (T-60) | Checks that the live composition wires the Open-Meteo adapters; updated in T-14 (demo removed), rewrite with the composition root. |
| test/ui/liveRegions.test.tsx | rewrite (T-47) | Live-region tests over the legacy flow. |
| test/ui/location.test.tsx | rewrite (T-42) | Device-location UI over the legacy flow; needs the new states and the waiting message. |
| test/ui/noLiterals.test.ts | keep | Guards against hard-coded user-facing literals in the UI; fits the T-25 catalogue (update its allow-list then). |
| test/ui/refresh.test.tsx | rewrite (T-44) | Refresh/retry/loading over the legacy controller. |
| test/ui/robustness.test.tsx | rewrite (T-47) | Error-boundary and odd-input robustness over legacy state. |
| test/ui/search.test.tsx | rewrite (T-41) | Search and pick list over the legacy search service. |
| test/ui/status.test.tsx | rewrite (T-47) | Status area/messages tied to the legacy message ids. |
| test/ui/styles.test.ts | keep | Static CSS rules (tap targets, breakpoints); independent of the model. Revisit with T-40/T-63. |
| test/ui/unconfigured.test.tsx | keep | New in T-14; the live and not-configured modes that remain (salvaged from the retired demo-mode suite). |
| test/ui/unitToggle.test.tsx | rewrite (T-46) | Unit toggle over legacy state; no re-fetch on toggle. |
| test/ui/weatherIcon.test.tsx | rewrite (T-24) | Icon mapping for the 8 approved categories plus fallback. |

## Files retired or deleted in Phase 1

Recoverable from git HEAD 50bf7d8 (nothing was committed by the Implementer).

Reconciled 2026-11-02: these three specs were rebuilt on the release harness on 2026-11-02 (e2e/accessibility.spec.ts, layout.spec.ts, browserApis.spec.ts exist and run in npm run test:browser; see verification.md). This file reflects the end of Phase 1 only; its file counts are not current.

| File | Disposition | Reason |
|------|-------------|--------|
| test/security/releaseGuard.test.ts | retire (deleted, T-14) | Tested `scripts/releaseGuard.mjs`, which refused a build while `VITE_USE_DEMO=true`; the demo switch no longer exists. |
| test/ui/demoMode.test.tsx | retire (deleted, T-14) | Demo-mode behaviour; the live/unconfigured cases were salvaged into `test/ui/unconfigured.test.tsx`. |
| test/ui/composition.test.tsx | retire (deleted, T-14) | Mixed demo and live composition cases; replaced by `unconfigured.test.tsx` and `liveComposition.test.tsx`. |
| e2e/accessibility.spec.ts | retire (deleted, T-14) | Ran against the invented-data dev server (port 4173), which is removed. Rebuild in T-62 on the new harness. |
| e2e/browserApis.spec.ts | retire (deleted, T-14) | Same dependency (demo server and harness). Rebuild in T-61/T-64. |
| e2e/layout.spec.ts | retire (deleted, T-14) | Same dependency. Rebuild in T-63. |
| e2e/harness.tsx, e2e/harness.html | retire (deleted, T-14) | Test-support page for the retired specs. |
| e2e/release.spec.ts | keep (edited, T-14) | Runs against the release build with the Open-Meteo hosts intercepted; demo wording removed, the injected-marker negative test is kept. The only remaining e2e spec. |

Source and script files deleted in T-14 (not tests, listed for completeness): `src/dev/demoComposition.ts`, `src/dev/demoProviders.ts`, `src/dev/prefixedStore.ts`, `scripts/releaseGuard.mjs`, `scripts/releaseGuard.d.mts`.

## Totals (the 76 current files)

| Disposition | Count | Note |
|-------------|-------|------|
| keep | 39 | includes `test/live/openMeteo.live.ts` (keep, update with T-30/T-31) |
| rewrite | 34 | each names the task that rewrites it; most are tied to the legacy types |
| retire | 3 | `core/domain.test.ts`, `fakes/legacyFakes.ts` (with the legacy ports), `smoke.test.ts` |

## Open points for the Orchestrator

1. The plan's file count (51) does not match the tree (73 at HEAD, 76 now); see the count check.
2. Recordings in `test/fixtures/openmeteo` predate T-02 and lack `is_day` and `forecast_days=3`; T-30 must re-record them (requires a live request, which I did not make).
3. The word "demo" remains in `test/security/demoMarkers.test.ts`, `scanDist.test.ts`, `sourceScan.test.ts` and `e2e/release.spec.ts` on purpose (negative tests for the T-14 removal).
