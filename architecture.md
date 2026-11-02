# Architecture: Weather Forecasting Application

| Field | Value |
|---|---|
| Status | **APPROVED BY USER (2026-10-30) with conditions.** Reviewed by the Design Reviewer (`design-review.md`). See Section 11 and `design-review.md` Section 10 for the quoted decision, scope and conditions. |
| Prepared by | Architect (SDLC Stage 2) |
| Date | 2026-10-30 (revision 1, addressing `design-review.md` DR-01..DR-16; see the Revision log at the end) |
| Input | `requirements.md`, approved by the user on 2026-10-30 (header rows 5-6, Sections 11.5 and 12). Open items were DEFERRED to the Architect: the values in Section 7 are proposals, not approved values (earlier state, superseded; reconciled 2026-11-02: accepted by the user on 2026-10-30, see Section 11). Section 8 lists sub-questions that were not covered by the deferral and are flagged as assumptions. |
| Sources | Jira WF-1..WF-7 (https://jayasriap.atlassian.net/browse/WF-<n>), treated as one combined input. |
| Supersedes | An earlier `architecture.md` was deleted from the working tree. It is NOT treated as approved and was not used as input. `archive/pre-jira-restart/` was not used. |
| Existing code | `src/`, tests, e2e and `scripts/` are a prior implementation. They were inspected only to identify existing technology (React, TypeScript, Vite, Vitest, Playwright, Lucide, an Open-Meteo adapter, a layered `core/ports/adapters/ui` structure). They are **not assumed approved or conforming**. Their use is NOT a reason for any choice in this document (DR-08). The decision to keep, adapt or discard them is put to the user (U6, Section 9). |
| Verification limits | **PROVIDER FACTS ARE UNVERIFIED.** No network access was used. Every statement about a provider (terms, licence, rate limits, API parameters, response fields, CORS, attribution, geocoding features, time-zone fields) in Sections 4, 5, 7 and 10 comes from general knowledge and is marked "unverified". A verification checklist is in Section 7 item 5. The user must not decide U2 or the provider choice until the checklist is completed. **Reconciled 2026-11-02:** the checklist has since been run and recorded in `provider-verification.md` (2026-10-30). Its items carry the labels DOC (stated on an official Open-Meteo page), OBSERVED (a live request on 2026-10-30, not documentation) and NOT CONFIRMED (not found on any official page read); for example HTTP status when the rate limit is exceeded, CORS in documentation and reverse geocoding are NOT CONFIRMED, and CORS was only OBSERVED in response headers, with no real-browser run. Those labels are not "verified" and stay as written there. `impl-plan.md` T-04 records the user's decision on 2026-10-30 (U2: "Non-commercial") and T-05 records the user's decision on 2026-10-30 (Open-Meteo confirmed, "Confirm, test CORS in browser", a real-browser test of the CORS calls and the rate-limit response kept as a verification task, T-75). The statements in Sections 4, 5, 7 and 10 below are the Architect's original text and were not rewritten. |
| Decisions needing user approval | The technology stack (Section 4), the provider (Section 7 item 5), every Section 7 proposal, every Section 8 assumption, and every Section 9 decision. Earlier state (superseded): "None is approved." Reconciled 2026-11-02: Section 11 and `design-review.md` Section 10 record APPROVED WITH CONDITIONS by the user on 2026-10-30. The user chose "Accept all proposals" for the 19 decisions in `design-review.md` Section 9.2, and Section 11 states that the architecture and every proposed value in Sections 4, 7, 8 and 9 are accepted as the approved baseline. Not decided (no proposal existed): U6 (existing `src/`; `impl-plan.md` later records it as cleared by T-03, "U6 = ADAPT"), U5 (hosting) and U7 (message wording; see `message-wording.md`). Section 11 also lists the conditions (provider checklist before implementation, DR-18..DR-22 as Planner conditions). |

## 1. Overview, Scope and Drivers

### 1.1 Overview
A client-side, single-page responsive web application. The user finds a location by city search, device geolocation, or a saved favorite. The app shows current weather (temperature, humidity, condition) and a 3-day forecast for that "selected location" (REQ-X-01). There is no backend of our own in the baseline design. The browser calls third-party weather and geocoding HTTP APIs directly. A thin server-side proxy is introduced **only** if a provider that requires a secret key is chosen (Section 5.1).

### 1.2 Scope
In scope: WF-1..WF-7 as in requirements Section 2.1. Out of scope per accepted defaults: accounts and sync (Q22), native apps (Q1), autocomplete and search history (Q30), offline mode and persisted weather cache (Q21), fields beyond temperature, humidity and condition (Q15). Out-of-scope items P-OUT-2, P-OUT-3 and the beyond-3-days/hourly part of P-OUT-4 are unconfirmed (Section 7, items 9-11); the design neither builds nor blocks them.

### 1.3 Architectural drivers (from approved requirements)
| # | Driver | Source |
|---|---|---|
| D1 | Responsive web app, desktop and mobile | Q1, REQ-WF7-04 |
| D2 | No accounts. Favorites and unit choice are local to the browser | Q22, Q4 |
| D3 | No persisted weather cache. Prior data is kept in memory for the session only. This includes the browser HTTP cache: weather calls bypass it and no service worker is used (3.9, DR-05) | Q21, REQ-WF5-04 |
| D4 | Device coordinates are used only to fetch weather (and optionally a place name). They are not stored and not logged by the app. Whether a *place's* coordinates in favorites also falls under Q28 is an open user ruling (U3) | Q28 |
| D5 | No API key committed to the repository | Q3 (process part) |
| D6 | One selected location drives current weather, forecast, refresh and favoriting | REQ-X-01, REQ-X-02 |
| D7 | Never crash, never show misleading data. Failures are partial and per section. Manual retry on every failed load | REQ-WF1-05, WF3-05, WF4-05, WF7-05, Q18 |
| D8 | One in-flight refresh. Stale responses never overwrite newer state | REQ-WF5-03, Q19, E3 |
| D9 | Permission-based geolocation only, requested at app open. No IP lookup | Q9 |

## 2. Components and Responsibilities

Layering: **UI -> App Controller -> Services -> Ports <- Adapters**. Core logic does not import browser or provider code, so it is testable with fakes.

| ID | Component | Responsibility |
|---|---|---|
| C1 | UI shell (single page) | Renders the search panel, location control, current-weather card, forecast list, refresh bar, unit toggle, favorites panel, status/live region, footer attribution. Persistent search and a favorites access control (Q25). Shows loading, unavailable and error states. Contains an error boundary so a render fault shows a fallback instead of a blank page. No business logic. |
| C2 | App Controller / state | Single owner of the selected location and per-section state (see 3.7). Receives UI intents (search, pick, use-my-location, select favorite, refresh, retry, unit change). Implements the single-flight guard, request generation tokens and abort of superseded requests. |
| C3 | Weather Service | Given the query coordinates of the selected location, fetches current weather and forecast and returns two **independent** section results plus the location's IANA time zone taken from the weather response (3.1, DR-03). Normalizes to the domain model: temperature (one canonical unit), humidity %, condition **category** and `isDay` flag, daily high/low, date as a location-local calendar date. Marks missing fields as unavailable. It does not produce user-visible text; C11 owns all condition text (DR-12). |
| C4 | Search Service | Validates and normalizes input (trim, empty check, length cap). Calls the geocoding port. Returns none / one / many candidates. Many leads to a pick list. |
| C5 | Location Flow | Runs the geolocation state machine (3.3): app-owned timeout, waiting state, late-result handling. Maps outcomes to denied, unavailable, timeout or unsupported. Optionally resolves a `Place` via reverse geocoding. Keeps device coordinates in memory only, in the device selected-location object. |
| C6 | Favorites Service | Add, list (insertion order), remove, duplicate check by one deterministic identity key (3.4), persist a versioned record via the key-value port. Its API accepts only a `Place`, never device coordinates (DR-03). Validates stored data on read. Falls back to a session-only list and raises a notice when storage is unavailable. |
| C7 | Settings | Temperature unit (C/F, default C), persisted via the key-value port. Unit conversion and display only. No re-fetch on toggle. |
| C8 | Provider adapters | Weather adapter, geocoding adapter and optional reverse-geocoding adapter, behind ports. Own provider URLs, parameters, response validation (the response is untrusted input), timeouts, error mapping and the provider's condition-code mapping. The only code that knows a provider. |
| C9 | Platform adapters | Browser Geolocation, `localStorage` key-value store, Clock. Swappable for tests. |
| C10 | Config | One typed, validated object for tunables: timeouts, forecast days, include-today flag, breakpoints, input length cap, search result limit, coordinate rounding precision (U8). No literals elsewhere. (There is no loading-indicator delay; see 3.6, DR-14.) |
| C11 | Presentation mapping | Condition category to icon and text, with a generic fallback (Q16). The single "unavailable" label (Q17). Date, time, location-label and unit formatting. All user-facing message text (English only, Q27). |
| C12 | Build and secret hygiene | Environment-based configuration. `.env*` ignored (the repo's `.gitignore` already lists `.env` and `.env.*`). A built-output scan for secrets and demo code (the existing `scripts/scanDist.mjs` is a candidate, not assumed conforming). |
| C13 | Edge proxy (**conditional**) | Needed only if a keyed provider is approved. Serverless function that holds the key in a server-side environment variable and forwards allow-listed requests. Not part of the baseline. |

Not present by design: user database, session or auth, scheduler for background refresh, analytics.

## 3. Interfaces and Data Flows

### 3.1 Ports (contracts)
**Location contract (revised, DR-03).** Device location and resolved place are separate types.

- `Coordinates = { lat, lon }`.
- `Place = { key, providerId?, name, admin1?, country?, centroid: Coordinates, timeZoneHint? }`. A place is a named location returned by a geocoder (forward search, or reverse geocoding if approved). It is the **only** thing that can be saved as a favorite. `key` is the identity rule in 3.4.
- `SelectedLocation` is one of:
  - `{ kind: 'place', place: Place, origin: 'search' | 'favorite' }`
  - `{ kind: 'device', deviceCoords: Coordinates, place?: Place }`. `deviceCoords` live in memory only and are never passed to C6 or storage. `place` exists only if a reverse geocoder resolved one (U1). The label is `place` name and country, or the fixed label "Current location".
- Query coordinates for a weather request: `place.centroid` for kind `place`; `deviceCoords` for kind `device`, rounded to the Config precision before sending if the user approves U8. If a device location has a resolved `place`, the weather request still uses the (rounded) device coordinates, not the place centroid.
- **Time-zone source (single source of truth):** the `timeZone` (IANA name) returned in the **weather response** for the queried coordinates. This works the same for place and device locations. `Place.timeZoneHint` (from a geocoder, if it supplies one) is only a fallback for formatting before the first weather response. Whether the recommended provider returns a time zone in the weather response is **unverified** (Section 7 item 5 checklist). If the weather response carries no time zone, the forecast uses the location-local calendar dates the provider returns, the "Today" label is omitted, and the update time still uses device local time.

Ports:

- `WeatherProvider.get(coords, signal) -> Result<WeatherResult, AppError>`, where `WeatherResult = { timeZone?, current: Result<Current, AppError>, forecast: Result<Day[], AppError> }`. A transport, timeout or rate-limit failure fails the whole `get` (both sections show the error). A response that arrives but lacks or invalidates one section gives a per-section error for that section only. See 3.6 for how the adapter may use one or two provider requests (DR-04).
- `Current = { tempCanonical, humidityPct, conditionCategory, isDay }`. Any field may be absent and renders as the "unavailable" label. `Day = { localDate, highCanonical, lowCanonical, conditionCategory }`.
- `GeocodingProvider.search(text, limit, signal) -> Result<Place[], AppError>`. `reverse?(coords, signal) -> Result<Place, AppError>` is optional (U1).
- `LocationService.getPosition(signal) -> Result<Coordinates, AppError>`. The timeout is owned by C5, not by this port (3.3, DR-06).
- `KeyValueStore.get/set/remove`, which may throw or be unavailable.
- `Clock.now()`.
- `AppError.kind` is one of: `not_found`, `empty_input`, `network`, `timeout`, `rate_limited`, `service`, `invalid_response`, `permission_denied`, `position_unavailable`, `unsupported`, `storage_unavailable`, plus the internal outcome `aborted`. `aborted` means the app itself cancelled or superseded a request. It is **never** shown to the user and never mapped to `network` (DR-09). Adapter error objects never contain the request URL or coordinates (DR-10).

### 3.2 Search (WF-1, REQ-X-01)
1. UI submits text to the controller. C4 trims it. If it is empty or whitespace-only, it shows the inline prompt and makes **no request** (REQ-WF1-04).
2. C4 calls geocoding (generation token N, previous search aborted).
3. Result handling: zero candidates gives a "city not found" message (REQ-WF1-03). One candidate becomes the selected location. Several candidates show a pick list, and the user's pick becomes the selected location (Q5).
4. The selected location triggers a load (3.7). The label shows city and country, omitting the country if absent (REQ-WF1-02). Provider failure shows a message plus a retry control (REQ-WF1-05).

### 3.3 Device location (WF-2)
The browser `getCurrentPosition` call cannot be aborted, and browsers may or may not count the time the user spends on the permission prompt towards its own `timeout` option (both **unverified**). The design therefore does not rely on the browser timeout. C5 owns one watchdog timer and treats cancellation as "discard the result", not "abort the call" (DR-06).

**State machine** (UI states in brackets):

1. `idle`: on app open, if geolocation is unsupported go to `unsupported`. Otherwise go to `requesting`.
2. `requesting` [message "Detecting your location..." in the location area; city search stays enabled; no weather shown]. C5 calls `getCurrentPosition` **without** a browser timeout option (the default is no limit). The browser shows its permission prompt if the state is "prompt" (REQ-WF2-02). The watchdog is started as follows:
   - **Permissions API available:** query the state first. `denied` goes straight to `denied` with no call. `granted` starts the watchdog (Config `locationTimeoutMs`, proposed 10 s) at the call. `prompt` does **not** start the watchdog; it starts when the permission status changes to `granted`. A prompt left unanswered therefore stays in `requesting` with the waiting message and is not reported as a timeout.
   - **Permissions API missing** (unverified for some browsers): the prompt wait cannot be distinguished from a slow fix, so the watchdog starts at the call. If it expires, the app shows the timeout message (REQ-WF2-04), and the message text says that location may still be waiting for the browser prompt.
3. Position received before the watchdog fires: go to `located`. Build a `{kind:'device'}` selected location, optionally resolve a `Place` via reverse geocoding (REQ-WF2-05, subject to U1), then load weather (3.5). Coordinates stay in memory only (D4).
4. Watchdog fires first: go to `timed_out` [helpful message plus city search, REQ-WF2-04, with a "Use my location" control to retry]. The pending call is **not** cancelled (it cannot be). If the position later arrives and **no location has been selected meanwhile** (generation unchanged), it is applied as in step 3 and the timeout message is cleared. Otherwise it is discarded (rule below).
5. Permission denied: `denied` [message with city search available and no weather, REQ-WF2-03, Q11]. Position unavailable (OS location off, hardware error) goes to `unavailable` with a helpful message plus city search (REQ-WF2-04).
6. **Late or stale results.** Any user action that selects a location (search, pick, favorite) increments the generation counter (3.7). A device position or reverse-geocoding result that completes under an older generation is discarded silently. This is deliberate: the user's explicit choice wins over a background detection. The discard is logged nowhere and shown nowhere; the waiting message is replaced by whatever the user chose, so it does not look as if the permission were ignored.
7. The "Use my location" control (a design addition, DR-13) starts a new attempt (a new generation) from `idle`. Re-prompt and re-enable wording is in Section 8 (Q11).
8. Geolocation needs a secure context (HTTPS or localhost). This is a deployment constraint (Section 10).

### 3.4 Select favorite (WF-6)
Open favorites (a panel or section on the single page). Selecting an entry sets the selected location (`{kind:'place', origin:'favorite'}`) from the stored `Place` record and triggers a load (REQ-WF6-03). Add: C6 accepts only a `Place`. For a device location the add control is enabled only when the location has a resolved `place` (Section 7 item 6, which depends on U1). Duplicate: rejected by identity key with a short message. Remove: immediate. Empty list: empty-state message.

**Stored record (versioned, DR-15).** The key-value entry is `{ v: 1, items: [ { key, providerId?, name, admin1?, country?, centroid } ] }`, in insertion order. A read with an unknown or missing version, or with invalid items, discards the data and shows the corruption notice (REQ-WF6-06). A future change of record shape or provider adds a migration step; until then the provider-independent `key` below keeps favorites valid across a provider change.

**Identity rule (one deterministic rule).** `key` = lower-cased, trimmed, whitespace-collapsed `name | admin1 | country`, with missing parts as empty strings. The provider ID is stored for information only and is not used for duplicate checks. This is a refinement of Q23 ("name plus country, or the provider ID"): `admin1` is added to separate same-named cities, and the rule does not depend on which provider supplied the ID. Known limit: two distinct places with the same name, region and country would be treated as duplicates (rare; flagged for the user in U3's decision).

**Coordinates in favorites (DR-02).** The record holds the place `centroid` (the geocoder's city-level coordinates), never `deviceCoords`. Storing it is an **explicit Architect assumption that requires a user ruling (U3)**: it is consistent with Q28 only if "coordinates" in Q28 means the user's own coordinates. If the user rules that no coordinates may be stored, the alternative design is: store `{v, items:[{key, name, admin1?, country?}]}` only, and on selecting a favorite re-run forward geocoding with `name, country` to obtain the centroid. That costs one extra request per selection and can return a different or ambiguous place (the pick list would then be shown for ambiguity). Changes needed in that case: `Place.centroid` is not persisted, the 3.4 select flow gains a geocoding step, and REQ-WF6-03 testing gains an ambiguity case.

### 3.5 Refresh (WF-5)
1. The refresh control is visible whenever a location is selected. On activation, the controller checks the **controller-wide** single-flight flag **synchronously** (not only the disabled attribute, so a double click before re-render cannot start two requests).
2. It starts a load for the selected location. The control is disabled and a loading indication is shown immediately, until the request settles (REQ-WF5-03). Previously loaded content stays on screen during a refresh (no blanking).
3. The outcome is applied per section using the matrix below. Nothing is persisted. No automatic or scheduled refresh exists.

**Fetch shape (DR-04).** `WeatherProvider.get` is one logical operation. With the recommended provider the adapter is expected to make **one** HTTP request returning current and daily data (unverified; Section 7 item 5 checklist). If the chosen provider needs two requests, the adapter makes two in parallel under the same `AbortSignal` and the same generation, and still returns one `WeatherResult`. The port, the controller and the UI do not change.

**Refresh outcome matrix** (applies to refresh and retry alike; "keep" means the previous in-memory data and its own `fetchedAt` stay):

| `get` outcome | Current section | Forecast section | Messages |
|---|---|---|---|
| Both sections OK | replace, `fetchedAt` = now | replace, `fetchedAt` = now | none |
| Current OK, forecast missing or invalid | replace, `fetchedAt` = now | keep previous data if any, else error; keep old `fetchedAt` | forecast section: message plus retry |
| Forecast OK, current missing or invalid | keep previous data if any, else error; keep old `fetchedAt` | replace, `fetchedAt` = now | current section: message plus retry |
| Whole request fails (network, timeout, rate limit, service, invalid response) | keep previous data if any, else error | keep previous data if any, else error | both sections show the message; **one** retry control for the whole weather block (REQ-WF5-04) |

Where no previous data exists (first load), "keep previous data if any, else error" resolves to the error state with a retry control (REQ-WF3-05, WF4-05; requirements X5).

**Retry scope.** A retry control re-runs the same operation as refresh: one `get` for the selected location, whole result applied by the matrix, subject to the same single-flight rule. It is not section-scoped. A section that was already fine is simply updated with newer data and its `fetchedAt` advances, which is not misleading. A failed search retry re-submits the last search text.

**Update time (resolves U4 as a proposal, REQ-WF5-05, Q20).** Each section carries its own `fetchedAt`, set only on its own success. If both sections have the same `fetchedAt` (the normal case), one line "Updated HH:MM" is shown. If they differ (after a partial refresh), the single line is replaced by two labelled lines, "Current weather updated HH:MM" and "Forecast updated HH:MM", so no stale section is presented under a newer time. A section with no successful load has no time line. The time is the **device clock when the response was received**, not the provider's observation time (Q20 default); it states when the app fetched, not how old the provider's data is.

### 3.6 Failure, retry and partial failure (Q18)
- Initial-load failure has nothing to retain. The section shows an error message and a retry control (REQ-WF3-05, WF4-05).
- Each section (current, forecast) has independent state. If one fails, the other still renders and the failed one shows its own message and retry (Q18). Retry semantics and the full outcome matrix are in 3.5. With a single-request provider, a whole-request failure fails both sections together, and per-section failure arises only from a missing or invalid section in a successful response.
- Missing fields inside a successful response render the single "unavailable" label (REQ-WF3-04). Fewer than 3 forecast days render the available days plus unavailable placeholders (REQ-WF4-04).
- **Loading (DR-14).** The loading indicator is shown immediately when a load, refresh or retry starts; there is no deliberate delay. On first load a neutral placeholder with "Loading..." replaces the section content, so no blank or stale-looking values are shown. On refresh the previous content stays and the indicator is shown on the refresh control and section (REQ-WF7-05, REQ-WF5-03). The 200 ms figure in Section 7 item 4 is a render budget, not a delay.

### 3.7 Selected-location state and out-of-order responses
- State: `selected: Location | none`, and per section `{ status: idle | loading | refreshing | loaded | error, data?, error?, fetchedAt? }`.
- Every user action that changes the selected location, or starts a load, increments a **generation counter** and aborts the previous request through `AbortController`. A response is applied only if its generation equals the current one and its location equals the current selection. Otherwise it is discarded silently. This covers search, geolocation and weather responses arriving late (E3).
- **The single-flight flag is controller-wide: at most one weather load is active at any time** (matches the Q19 default "only one request is active", DR-09). When the selected location changes during a pending load, the controller aborts the old request, marks it `aborted`, releases the flag, and only then starts the new load, all synchronously in one step, so two loads never overlap. An `aborted` outcome is dropped silently and never produces a user message.
- Assumption on a location change during a pending request: Section 8, item Q19.

### 3.8 Unit change
Toggling the unit re-renders from canonical values and persists the choice. It makes no network request and applies to current and forecast together (REQ-X-03).

### 3.9 HTTP cache policy (DR-05, Q21, WF-5, Q28)
- All weather, forecast and reverse-geocoding requests use `fetch` with `cache: 'no-store'`, so the browser neither serves them from nor writes them to its HTTP cache. Forward geocoding uses the same policy for simplicity. This is a request-side setting and does not depend on provider response headers (which are unverified).
- No service worker, no Cache API, no web app manifest with offline support, and no `localStorage` weather data are used. A build check fails if a service worker file or registration is present.
- Consequence for REQ-WF5-05: "Updated HH:MM" is only shown for a response actually received from the network on that action. Test: a fake fetch that returns different payloads on two calls shows the second payload after refresh, and the test asserts the `cache` option on every provider call.
- Limits: the app cannot control provider-side or intermediary caches (CDN) or the browser's developer-tools network log. The statement is "the app does not persist weather data and bypasses the browser HTTP cache".

## 4. Technology Choices

**The whole stack below is a PROPOSAL that requires the user's explicit approval (decision T1).** "Existing" only records that the technology appears in the repository (`package.json`, `src/`); it is evidence of a prior, unapproved implementation, is non-binding, and is **not** a reason to choose it. Each rationale below stands on its technical merit alone. If the user prefers another stack, only this section, C10 and C12 change; components, ports and flows in Sections 2-3 are technology-neutral. Provider-related statements are unverified (Section 7 item 5).

| Area | Choice | Status | Rationale | Alternatives considered |
|---|---|---|---|---|
| Application type | Static SPA, no own backend | Proposed (follows Q1, D2, D3) | No accounts, no persisted server data, so nothing to host server-side. Smallest attack surface and cost. | Server-rendered app or BFF: adds hosting and ops with no stated need, unless a keyed provider forces a proxy. |
| Language / UI | TypeScript + React 19 | Proposed (also present in repo) | Typed ports and domain model. Component model suits the state-driven UI. | Vanilla TS (more manual DOM code), Vue or Svelte (comparable; no technical reason to prefer them here). |
| Build / dev | Vite | Proposed (also present in repo) | Fast static builds, environment-mode support. | Webpack: heavier. |
| Test | Vitest + Testing Library, axe-core, Playwright | Proposed (also present in repo) | Unit and component tests with fakes through the ports. Automated accessibility checks with axe. Browser tests on Chromium, Firefox and WebKit engines. See the verification limits in Section 7.0. | Jest or Cypress: comparable. |
| Icons | Lucide (`lucide-react`) | Proposed (also present in repo); icon set unconfirmed (Section 7, item 8) | ISC license, tree-shakable, consistent style, has sun, cloud, rain, snow, moon and similar glyphs. | Provider-supplied icons (ties UI to one provider, remote loading), Weather Icons font (OFL, larger, font-based). |
| Weather and geocoding | Open-Meteo (recommended, pending verification and approval) | Proposed; provider unapproved, facts unverified (earlier state, superseded. Reconciled 2026-11-02: accepted by the user 2026-10-30, `design-review.md` Section 10 and Section 11 above; confirmed in `impl-plan.md` T-05; checklist results with DOC / OBSERVED / NOT CONFIRMED labels in `provider-verification.md`) | See Section 7, item 5. | OpenWeatherMap, WeatherAPI.com. |
| Persistence | Browser `localStorage` behind `KeyValueStore` | Proposed | Satisfies Q22 and WF-6 AC6. Synchronous and small. Failure is detectable. | IndexedDB (overkill for a short list), cookies (sent with requests, no benefit), server storage (conflicts with Q22). |
| Geolocation | Browser Geolocation API | Platform | Satisfies Q9 (permission-based only). | IP lookup (rejected by Q9). |
| Date and time formatting | `Intl.DateTimeFormat` with explicit `timeZone` | Platform | Correct location-local days (Q13) and local update time (Q20) with no extra dependency. | date-fns/luxon: extra dependency, not needed. |
| Hosting | Any static HTTPS host | Unresolved (Section 9) | Geolocation requires a secure context. | n/a |

## 5. Security, Privacy, Reliability and Other NFRs

### 5.1 API key handling (D5)
- **No key, token or secret is committed to the repository.** Not in source, tests, fixtures, docs, `.env` files or build config. `.env` and `.env.*` are already git-ignored. Only a key-less `.env.example` (variable names, no values) may be committed.
- If the approved provider needs no key (Open-Meteo free non-commercial tier), there is no secret to manage. Keep all provider configuration in C10/C8 as non-secret values.
- If a keyed provider is approved: a key placed in a browser bundle is public by definition, so the key must live only in the C13 proxy's server-side environment, the proxy exposes an allow-list of routes and parameters, applies origin checking and rate limiting, and never returns the key. The client calls the proxy URL.
- Build gate: a scan of the built output (and the working tree) for key-shaped strings and demo/fixture code. A failing scan blocks release. Usage limits are in Section 7, item 5.

### 5.2 Privacy of location (D4, Q28)
- Device coordinates exist only in memory in the `device` selected-location object. They are sent only to the weather provider and the optional reverse-geocoding provider. The app never writes them to its own storage, its own page URL (address bar, history), logs, or error text, and it does not log them to the console. Error reporting and analytics are absent.
- **What is not covered (corrected, DR-10).** Provider calls are direct browser requests whose query strings normally carry latitude and longitude (unverified per provider). Those URLs are visible in the browser's developer tools and network log. To limit exposure: adapter error objects never include the request URL or coordinates; weather calls bypass the HTTP cache (3.9); and, as a data-minimisation **proposal for the user (U8)**, coordinates are rounded to 2 decimal places (about 1 km) before being sent to the weather provider. Rounding does not apply to a reverse-geocoding request if that would break the lookup.
- Favorites store a `Place` only (3.4): the geocoder's name, region, country, provider ID and city `centroid`, never `deviceCoords`. The type of the C6 API makes passing device coordinates impossible. Whether storing a place `centroid` is consistent with Q28 is an open user ruling (U3, 3.4).
- **Limit of the guarantee:** third-party providers receive the coordinates and the user's IP and may log them under their own terms. The app cannot control that. Disclosed in Section 8 (Q28) and Risk R3.

### 5.3 Application security
- Provider responses are untrusted. Adapters validate shape and types and map to the domain model. Failure gives `invalid_response`. Persisted favorites are validated on read, and corrupt data is discarded with a notice.
- UI renders all text through React escaping. No `dangerouslySetInnerHTML`. Search input length is capped (Config).
- HTTPS only for providers. A restrictive Content-Security-Policy (`default-src 'self'`, `connect-src` limited to the approved provider origins, no third-party scripts) is an Architect **proposal for the deployment** (not an approved requirement; it needs a host that can set headers, U5). External links use `rel="noopener noreferrer"`.
- Any demo or fake providers (the existing `src/dev` is a candidate) must be unreachable in release builds and verified by the build gate.

### 5.4 Reliability and resilience
- Every external call has a timeout (Config) and an AbortSignal. Errors are mapped to the `AppError` taxonomy, never thrown into the UI.
- Controller-wide single-flight refresh and request generation tokens (3.5, 3.7) give duplicate-refresh safety and out-of-order safety. App-initiated aborts are an internal `aborted` outcome and never shown (DR-09). Provider rate limits are respected by design: no keystroke-driven requests (autocomplete is out of scope), no polling, no automatic retries. Retry is manual (Q18).
- Partial failure is per section (3.6). A rate-limited response (`rate_limited`) gets a specific "try again later" message.
- Storage failures degrade to a session-only list plus a notice (REQ-WF6-06).

### 5.5 Usability, accessibility, responsiveness
**These accessibility behaviours are Architect proposals tied to the unapproved Q26 proposal (Section 7 item 3). The approved requirements add no accessibility requirement until the user specifies a standard (DR-13).**
- Single-page layout, a labelled landmark per area, headings in order, each icon paired with condition text (REQ-WF7-02). Text-alternative rules: decorative icons hidden from assistive tech because the text is always present.
- Status and error messages in an `aria-live` region. Focus is restored after pick list, favorites and error interactions. All controls are keyboard operable.
- Mobile-first CSS using the breakpoints proposed in Section 7, item 1.
- Accessibility standard and assessment method are **proposals** (Section 7, item 3).

### 5.6 Performance and operability
- Static assets only, so there is no server-side latency of our own. Performance targets are proposals (Section 7, item 4).
- No server logs of our own in the baseline. No telemetry. Operational concerns reduce to hosting configuration and provider availability.

### 5.7 Maintainability
- Ports and adapters isolate the provider. Replacing it touches C8 and C10 only. All tunables live in C10. Fakes through ports make every requirement testable without the network.

## 6. Requirement Traceability Matrix

All 40 requirement IDs (37 Jira ACs + 3 derived). "Open" in the notes below marks the main dependency on an unapproved item. The complete, consistent list of dependent decision IDs for every requirement is the **Dependency index** after this table (DR-11); use the index, not the "Open" notes, to count dependencies.

| REQ ID | Components | Design reference / note |
|---|---|---|
| REQ-WF1-01 | C1, C2, C4, C3, C8 | 3.2. Pick list when multiple matches (Q5). Loads current plus forecast (Q6). |
| REQ-WF1-02 | C11, C1 | 3.2. City + country label, country omitted if absent (Q7). |
| REQ-WF1-03 | C4, C8, C11, C1 | 3.2. Zero candidates gives a not-found message. |
| REQ-WF1-04 | C4, C1 | 3.2. Trim/whitespace-only gives an inline prompt and no request (Q8). |
| REQ-WF1-05 | C8, C2, C11, C1 | 3.2, 3.6, 5.4. Error message plus retry, no crash, error boundary. |
| REQ-WF2-01 | C5, C9, C2, C3 | 3.3. Geolocation at app open, permission-based only (Q9). |
| REQ-WF2-02 | C5, C9 | 3.3. The browser prompt is triggered by the geolocation request. |
| REQ-WF2-03 | C5, C1, C11 | 3.3. Message, search available, no weather (Q11). Re-prompt behaviour in Section 8. |
| REQ-WF2-04 | C5, C10, C1, C11 | 3.3. App-owned watchdog, waiting state, late-result rule. Open: timeout value (Section 7, item 2). |
| REQ-WF2-05 | C5, C8, C3, C11 | 3.1, 3.3. Place name via optional reverse geocoder, else "Current location" label. Open: U1 decides whether the Q12 place-name default is exercised at all (Section 7 item 5). |
| REQ-WF3-01 | C3, C1, C11 | Temperature, humidity %, condition text only (Q15). |
| REQ-WF3-02 | C11, C1 | Category-to-icon mapping plus generic fallback. Open: icon set (Section 7, item 8). |
| REQ-WF3-03 | C7, C11, C9 | 3.8. Toggle, default C, persisted. |
| REQ-WF3-04 | C3, C11, C1 | 3.6. Single "unavailable" label (Q17). |
| REQ-WF3-05 | C3, C2, C1, C11 | 3.6. Message plus manual retry, forecast still shown. |
| REQ-WF4-01 | C3, C8, C10, C11 | Location-local day boundaries. Open: includes today? (Section 7, item 7.) |
| REQ-WF4-02 | C3, C7, C11 | Date, daily high/low in configured unit (Q14). Open: date format (Section 7, item 7). |
| REQ-WF4-03 | C11, C1 | Same mapping and fallback as REQ-WF3-02. Open: icon set. |
| REQ-WF4-04 | C3, C11, C1 | 3.6. Available days plus unavailable placeholders. |
| REQ-WF4-05 | C3, C2, C1, C11 | 3.6. Message plus retry, current weather still shown. |
| REQ-WF5-01 | C1, C2 | 3.5. Visible refresh for the selected location. |
| REQ-WF5-02 | C2, C3 | 3.5. Both sections replaced on success. |
| REQ-WF5-03 | C2, C1 | 3.5, 3.7. Synchronous single-flight guard, disabled control and loading indication. Pending-change behaviour in Section 8 (Q19). |
| REQ-WF5-04 | C2, C3, C11 | 3.5 outcome matrix, 3.9. Old in-memory data kept, message plus retry, no persisted cache and HTTP cache bypassed (Q21). |
| REQ-WF5-05 | C2, C9 (Clock), C11 | 3.5. Last successful fetch time per section, device local time. Open: format and per-section display (Section 8 Q20, U4). |
| REQ-WF6-01 | C6, C2, C1 | 3.4. Open: device-detected location (Section 7, item 6, U1). |
| REQ-WF6-02 | C6, C1 | 3.4. Names only, insertion order, empty-state message. |
| REQ-WF6-03 | C6, C2, C3 | 3.4. Select sets the selected location and loads. |
| REQ-WF6-04 | C6 | 3.4. One deterministic key: normalized name+admin1+country. No cap. |
| REQ-WF6-05 | C6, C1 | 3.4. Immediate removal. |
| REQ-WF6-06 | C6, C9 | 3.4, 5.4. localStorage, versioned record validated on read, session-only fallback with notice. Open: U3 (centroid storage). |
| REQ-WF7-01 | C1, C11, C10 | 5.5. Open: assessment method (Section 7, item 3). |
| REQ-WF7-02 | C11, C1 | Icon plus text always shown, including the fallback. |
| REQ-WF7-03 | C11, C7, C1 | Labelled temperature (configured unit), humidity %, forecast labels. English only. |
| REQ-WF7-04 | C1, C10 | 5.5. Open: browsers and breakpoints (Section 7, item 1). |
| REQ-WF7-05 | C1, C2, C11, C10 | 3.6. Loading indicator, helpful message, error state. Open: threshold (Section 7, item 4). |
| REQ-WF7-06 | C1 | Single page, persistent search, favorites access control (Q25). Subjective wording remains. |
| REQ-X-01 | C2 (selected location), C3, C5, C6 | 3.7. One selected-location model for all three sources. |
| REQ-X-02 | C2 | 3.5. Refresh always targets the selected location. |
| REQ-X-03 | C7, C11 | 3.8. One unit for current and forecast. |

### Dependency index (DR-11)

Decision IDs: S7-1..S7-11 are Section 7 items 1-11; A-Q5, A-Q11, A-Q19, A-Q20, A-Q28 are the Section 8 assumptions; U1..U8 and T1 are in Sections 9 and 4. A requirement not listed depends only on accepted defaults. T1 (stack approval) applies to every requirement and is listed on every row. U7 (message wording) is listed on every row whose requirement shows a user-facing message (T-08, DR-22; documentation-only, no decision changed).

| REQ ID | Depends on unapproved decisions |
|---|---|
| REQ-WF1-01 | A-Q5, S7-5 (provider), T1 |
| REQ-WF1-03 | A-Q5, S7-5 (provider), T1, U7 (not-found message) |
| REQ-WF1-02 | S7-5, T1 |
| REQ-WF1-04 | A-Q5 (trim, 100-character cap), S7-5, T1, U7 (inline prompt) |
| REQ-WF1-05 | S7-4 (timeout), S7-5, T1, U7 |
| REQ-WF2-01 | S7-1, S7-2, S7-5, A-Q11, U5 (secure context, 3.3 step 8), U8, T1 |
| REQ-WF2-02 | S7-1, A-Q11, T1 |
| REQ-WF2-03 | S7-1, A-Q11, T1, U7 |
| REQ-WF2-04 | S7-2, T1, U7 |
| REQ-WF2-05 | S7-5, U1, U8, T1 |
| REQ-WF3-01, WF3-04 | S7-5, T1 |
| REQ-WF3-05 | S7-5, T1, U7 |
| REQ-WF3-02, WF4-03, WF7-02 | S7-8 (icon set, day/night, condition text), T1 |
| REQ-WF3-03, REQ-X-03, WF7-03 | T1 only |
| REQ-WF4-01, WF4-02 | S7-7 (includes today, date format), S7-5 (time-zone field), T1 |
| REQ-WF4-04 | S7-5, T1 |
| REQ-WF4-05 | S7-5, T1, U7 |
| REQ-WF5-01, WF5-02, REQ-X-02 | S7-5, T1 |
| REQ-WF5-03 | S7-4, A-Q19, T1 |
| REQ-WF5-04 | S7-4, S7-5, T1, U7 |
| REQ-WF5-05 | A-Q20, U4, T1 |
| REQ-WF6-01 | S7-6, U1, U3, T1 |
| REQ-WF6-02 | U3, T1, U7 (empty-state message) |
| REQ-WF6-03, WF6-05 | U3 (WF6-03 only if the re-geocode alternative is chosen), T1 |
| REQ-WF6-04 | U3 (identity rule refinement), T1, U7 (duplicate message) |
| REQ-WF6-06 | U3, A-Q28, U7 (notice text), T1 |
| REQ-WF7-01 | S7-3, S7-1, T1 |
| REQ-WF7-04 | S7-1, T1 |
| REQ-WF7-05 | S7-4, T1, U7 |
| REQ-WF7-06 | S7-3, T1 |
| REQ-X-01 | U1, U3, S7-5, T1 |

## 7. Proposed values for deferred items (PENDING USER APPROVAL)

> Reconciled 2026-11-02: the heading is the state when this section was written (superseded). Section 11 and `design-review.md` Section 10 record that the user accepted all proposals on 2026-10-30 ("Accept all proposals"), with the conditions listed in Section 11. The proposals below are unchanged.

**Every entry below is a PROPOSAL by the Architect. None is an approved value. Each requires the user's explicit confirmation at the design review gate.** They cover all items in requirements.md Sections 11.1 to 11.3. In the Dependency index these items are written S7-1..S7-11.

### 7.0 Verification limits of the proposed checks (DR-16)
- **Browsers (item 1).** Playwright automation covers the Chromium, Firefox and WebKit engines on desktop and emulated mobile viewports. It does not cover real iOS Safari, real Android Chrome devices, or Edge specifically (general knowledge, unverified). Those targets are verified by a documented manual smoke test on real devices, or the user narrows the support list.
- **Accessibility (item 3).** Automated axe-core checks cover only part of WCAG 2.1 AA. Conformance claims need the manual review listed in item 3(f) of the checklist: a keyboard-only walk-through, a 200% zoom check and a screen-reader pass. The automated result is a necessary check, not proof of AA.
- **Performance (item 4).** The "3 s for 95% of requests" figure depends on a third-party provider and the network, so it cannot be a repeatable gate. It is a non-gating observation from smoke tests. Gating checks are the 200 ms render budget, the 10 s timeout behaviour (with fakes) and the bundle budget.
- **CSP and HTTPS (section 5.3).** Verifiable only once the host is known (U5).

### 1. Q2: Supported browsers, operating systems, breakpoints  (PROPOSAL, pending user approval)
- **Proposed:** latest two stable versions of Chrome, Edge, Firefox and Safari on current desktop OS (Windows 11, macOS current and previous major), plus Safari on iOS and Chrome on Android (current and previous major OS release). Internet Explorer and legacy browsers are unsupported. Minimum supported viewport width 320 px. Breakpoints: narrow below 768 px (single column), wide 768-1023 px, extra-wide 1024 px and above. No horizontal scrolling at 320 px.
- **Rationale:** matches evergreen browsers' support for Geolocation, `localStorage`, `Intl` and CSS layout without polyfills. The 768/1024 values are conventional. They are proposed on that merit alone; no precedent from the prior code is relied on (DR-21).
- **Affects:** REQ-WF7-04, REQ-WF7-01, REQ-WF2-01.

### 2. Q10: Location timeout  (PROPOSAL, pending user approval)
- **Proposed:** 10 seconds (`locationTimeoutMs`, Config) measured by an **app-owned watchdog** that starts once permission is granted (or at the call where the Permissions API is missing); the exact state machine, the waiting state shown to the user and the late-result rule are in 3.3 (DR-06). A permission prompt left unanswered is shown as "Detecting your location..." with city search available, and is not reported as a timeout, except where the Permissions API is missing (3.3 step 2).
- **Rationale:** long enough for a cold GPS/Wi-Fi fix, short enough to offer city search quickly. A weather/geocoding request timeout of 10 seconds is proposed alongside it for consistency.
- **Affects:** REQ-WF2-04.

### 3. Q26: Accessibility standard and how "clear, organized, easy-to-read" is assessed  (PROPOSAL, pending user approval)
- **Proposed standard:** WCAG 2.1 Level AA (the example named in the requirements), including keyboard operability, visible focus, screen-reader names and live regions, and 4.5:1 text contrast.
- **Proposed assessment of REQ-WF7-01:** a checklist-based review plus automated checks, namely (a) automated axe-core run with zero serious/critical violations; (b) one clear heading structure and labelled landmark per area (search, current, forecast, favorites); (c) body text at least 16 px, at least 4.5:1 contrast, usable at 200% zoom; (d) every value has a label and unit (REQ-WF7-03); (e) no horizontal scroll at 320 px; (f) a manual reviewer walk-through of the five checks (a)-(e), recorded in the verification report, which includes a keyboard-only walk-through, a 200% zoom check and a screen-reader pass (the manual review referred to in 7.0).
- **Rationale:** converts a subjective AC into verifiable checks without inventing user-research requirements. Note that the requirements state no accessibility requirement is added until the user specifies a standard, so this applies only if approved.
- **Affects:** REQ-WF7-01, REQ-WF7-06, REQ-WF7-02, REQ-WF7-03.

### 4. Q29: Performance targets and loading-indicator threshold  (PROPOSAL, pending user approval)
- **Proposed:** the loading indicator is rendered **immediately** on search submit, refresh or retry, with no deliberate delay. The test condition is that it is present in the DOM within 200 ms of the action (a render budget). Previous content is kept during refresh and a neutral "Loading..." placeholder is used on first load (3.6, DR-14). Request timeout 10 s, after which the error state with retry appears. Observation target (non-gating, depends on the provider): weather displayed within 3 s of submit for 95% of requests on a typical broadband connection. Initial JavaScript budget at most 200 KB gzipped (tracked in the build).
- **Rationale:** an indicator shown at once avoids any blank interval; 200 ms is the upper bound for it to appear. The 3 s target is dominated by the third-party provider, so it is measured in smoke tests, not an SLA (7.0).
- **Affects:** REQ-WF7-05, REQ-WF5-03.

### 5. Q3: Weather provider candidates, recommendation, API key and usage limits  (PROPOSAL, pending user approval)
**All provider facts below are UNVERIFIED general knowledge. The user should not approve a provider, or decide U2, until the checklist at the end of this item is completed and recorded.** The prior code's Open-Meteo adapter is not evidence of any provider fact.

| Aspect | Open-Meteo | OpenWeatherMap | WeatherAPI.com |
|---|---|---|---|
| API key | Not needed for the free non-commercial tier | Required (query parameter) | Required (query parameter) |
| Free tier | Free for non-commercial use. Commercial use needs a paid plan | Free plan with current weather and a 5-day/3-hour forecast. Daily forecast and One Call tiers have separate subscription conditions | Free plan with a short forecast (about 3 days including today) |
| Rate limits (to verify) | Fair-use limits per minute, hour and day (documented in the low thousands per day) | Per-minute and per-day call caps on the free plan | Monthly call quota on the free plan |
| Needed data | Current temperature, humidity, weather code, daily high/low, time zone, day/night flag | Current temperature, humidity, condition. Daily high/low must be aggregated from 3-hour slots | Current, daily high/low, condition text and icon |
| Geocoding | Separate forward geocoding API (multiple results with region, country, ID, time zone). **No reverse geocoding** | Forward and reverse geocoding | Search endpoint, accepts a text or a "lat,lon" query, so a reverse-like lookup is possible |
| Browser (CORS) use | Designed for direct browser calls | Possible, but the key would be exposed | Possible, but the key would be exposed |
| Attribution | Required (CC BY 4.0 link; geocoding credit GeoNames) | Required | Required on the free plan (to verify) |
| Fit to requirements | Fits all fields, a static client with no secret, a pick list from multiple matches. Gap: reverse geocoding | Fits, but needs a proxy to hold the key and client-side aggregation | Fits, plus reverse-like lookup, but needs a proxy to hold the key |

- **Recommended (subject to verification):** **Open-Meteo** for weather and forward geocoding. Rationale: if the no-key claim is verified, no secret exists, so D5 is satisfied by construction and the baseline stays a static SPA with no proxy. It is expected to supply every required field and multiple geocoding matches. The existence of a prior adapter in the repository is not part of this rationale.
- **Reverse geocoding (gap) and its consequence for Q12 (DR-01).** Open-Meteo is believed to have no reverse geocoding (unverified). The accepted Q12 default is "show a place name if resolvable". The user must rule on U1 knowing these consequences:

| Option | Device location label | Q12 place-name default | Favoriting a device location (WF-6 AC1 / Q23 open part) | Privacy cost (Q28, R3) |
|---|---|---|---|---|
| (a) No reverse geocoder (Architect's proposed baseline) | "Current location" always | Not exercised. It holds only in the literal sense that a name is "not resolvable". In practice the default is **dropped** for the baseline, and the user must knowingly accept that | **Not possible.** The add control is disabled with an explanation; the user searches for the city and favorites it from the search result | None added |
| (b) Second keyless reverse geocoder (candidate unverified, e.g. BigDataCloud client-side) | Place name when resolved, else "Current location" | Exercised | Possible when a `Place` is resolved (3.4) | A second third party receives device coordinates (rounded if U8 approved) |
| (c) A keyed provider with an edge proxy, for the reverse lookup only (scope note below; e.g. WeatherAPI.com search by "lat,lon", unverified) | Place name when resolved | Exercised | Possible | The proxy and provider receive coordinates; adds the C13 proxy, hosting and key handling (5.1) |

  **Scope of option (c) (clarification, DR-22):** (c) concerns the optional reverse-geocoding port (`GeocodingProvider.reverse`) for U1 only. The key and the C13 proxy would serve the reverse lookup. It does not replace the weather and forward-geocoding provider proposed in this item; choosing a keyed provider for weather would be a separate provider decision (this item, U2), not part of U1. Option (c) is not exercised under baseline (a).

  **Proposal: (a) as the baseline, with the optional reverse port kept so (b) can be added without redesign.** The Architect proposes (a) only because it adds no second recipient of coordinates and no secret; it is not the option that best satisfies Q12 and WF-6 for device locations. If the user wants Q12 honoured in practice, (b) is the smallest change. This is an explicit user decision (U1) and is shown as such in the approval request.
- **API key handling and usage limits (proposal):** with Open-Meteo no key is used, so nothing is committed. Usage limits are kept in the free fair-use range by design: one request per user action, single-flight refresh, no polling, no autocomplete, no automatic retry. A 429/`rate_limited` response shows a "try again later" message. If a keyed provider is chosen instead, 5.1 applies (proxy, server-side environment variable, rate limiting, build-gate scan).
- **Non-commercial constraint (unverified):** if the product is commercial, Open-Meteo's free tier is believed not to apply (U2).
- **Provider verification checklist (DR-08; to be completed from current official documentation before the user decides; record source and date for each):**
  1. Licence and terms: is non-commercial use required, what counts as commercial, and what attribution text and link are required (weather and geocoding separately).
  2. Rate and quota limits per minute, hour and day; behaviour and status code when exceeded.
  3. Is any API key needed for the intended use; are browser (CORS) calls permitted.
  4. Is the number of forecast days selectable, and is today included (affects item 7).
  5. Does one weather request return current (temperature, humidity, condition code, day/night flag) and daily (high, low, condition code) data, and does it return the location's IANA time zone (affects 3.1 and 3.5).
  6. Forward geocoding: multiple results with region, country, stable ID and time zone; reverse geocoding availability and terms.
  7. Response caching headers (informational; the app bypasses the HTTP cache regardless, 3.9).
  8. Do request URLs carry coordinates (informational; see 5.2).
- **Affects:** REQ-WF1-*, WF2-05, WF3-*, WF4-*, WF5-*, REQ-X-01..03, E12.

### 6. Q12 / Q23: Can a device-detected location be favorited?  (PROPOSAL, pending user approval)
- **Proposed:** Yes, but only when the device location has been resolved to a `Place` (name, region, country, so the favorite has an identity key for duplicate detection, 3.4). The stored record is the `Place` (including its city `centroid`, see U3), never `deviceCoords`. If no `Place` is resolved (baseline option (a) in item 5), the add-to-favorites control is disabled for that location with a short explanation, and the user can search for their city and favorite it.
- **Consequence stated plainly (DR-01):** with the proposed baseline (a), a user who opens the app via device location **cannot favorite that location directly**. WF-6 AC1 ("has searched for a valid city") is still met via search.
- **Rationale:** consistent with REQ-WF6-04 (identity-based duplicate rule), Q28 for device coordinates, and Q23.
- **Affects:** REQ-WF6-01, REQ-WF6-04, REQ-WF2-05. Depends on item 5 (U1) and U3.

### 7. Q13: Does "next 3 days" include today; date format; resolve assumption A8  (PROPOSAL, pending user approval)
- **Proposed:** the forecast shows **today plus the next two days** (3 calendar days, option a), using the location's local time zone for day boundaries (accepted Q13). The first card is labelled "Today" with its date. Date format: English, short weekday, day and month, for example "Thu, 30 Oct", produced by `Intl.DateTimeFormat('en', ...)` with the location's `timeZone`. This resolves assumption A8 as "exactly three calendar days including the current local day".
- **Rationale (corrected, DR-07):** today's forecast is useful for planning, and "today plus two" gives exactly three cards with no special handling. **No claim is made that three days is a provider-native window.** The comparison in item 5 shows providers differ (the free OpenWeatherMap plan is believed to offer a 5-day/3-hour forecast needing aggregation; the free WeatherAPI.com plan about 3 days including today; whether Open-Meteo lets the caller select the number of days is unverified, checklist item 4). The adapter requests as many days as it needs and the domain model keeps exactly the configured count. The choice between (a), (b) and (c) is the user's; options (b) and (c), which start tomorrow, are a Config change (`forecastIncludesToday`, `forecastDays`).
- **Affects:** REQ-WF4-01, REQ-WF4-02, REQ-WF4-04, assumption A8.

### 8. Q16: Icon set and day/night variants  (PROPOSAL, pending user approval)
- **Proposed set:** Lucide icons (ISC license; its presence in the repository is non-binding and not a reason for the choice, as in Section 4) for these categories: clear, partly cloudy, cloudy, fog, drizzle, rain, snow, thunderstorm, plus a generic fallback icon. Condition text is always shown (accepted Q16). Day/night variants: for clear and partly cloudy only, in the **current-weather** card, using the `isDay` field of the domain model (C3, 3.1; sourced from the provider's day/night flag, unverified). **Condition text is owned by C11 alone** (C3 supplies only a category and `isDay`; provider description text is not displayed). Text by category: clear is "Sunny" by day and "Clear" at night; partly cloudy is "Partly cloudy" in both; the other categories have one text each. If the provider supplies no `isDay` for the current weather, the neutral text "Clear" is used for the clear category (never "Sunny"); the icon remains the day variant. Forecast days always use day variants and "Sunny".
- **Rationale:** a sun icon labelled "Sunny" at night would be misleading (WF-7 AC5). Variants beyond these two categories add little value. The set is small enough to test exhaustively.
- **Affects:** REQ-WF3-02, REQ-WF4-03, REQ-WF7-02.

### 9. P-OUT-2: Alerts or notifications, maps, radar, historical data  (PROPOSAL, pending user approval)
- **Proposed:** confirm as out of scope. Rationale: no story asks for them, and the ports do not preclude adding them later.

### 10. P-OUT-3: Automatic or scheduled background refresh  (PROPOSAL, pending user approval)
- **Proposed:** confirm as out of scope. WF-5 describes manual refresh only, and automatic polling would weaken the usage-limit and duplicate-request safety described in 5.4.

### 11. P-OUT-4 (remaining part): Forecasts beyond 3 days and hourly forecasts  (PROPOSAL, pending user approval)
- **Proposed:** confirm as out of scope. `forecastDays` is a Config value (whether the provider lets the caller choose it is unverified, item 5 checklist 4), but the UI and acceptance criteria are defined for exactly 3 days. The weather-fields part is already accepted via Q15.

## 8. Assumptions for 11.4 sub-questions (each needs user confirmation)

**None of these was covered by the user's deferral or defaults. Each is an ARCHITECT ASSUMPTION and needs explicit user confirmation at the design review gate.**

| Item | Assumption (needs user confirmation) | Affects |
|---|---|---|
| Q5: input handling | Input is trimmed and internal whitespace collapsed. The app does no case or diacritic matching of its own for the city name: text is passed through as typed and the provider's matching decides (including case, diacritics and any spelling tolerance). The app does no case matching of its own for search text. Lower-casing is applied only (i) to the optional qualifier, which is compared case-insensitively, and (ii) to build the favorites identity key (3.4) from a `Place`'s name, region and country, which is not search text. For "City, Country" or "City, State" input, the app sends the part before the first comma to the provider and uses the qualifier, compared case-insensitively, to filter or rank candidates by region or country. If nothing matches, the app shows the not-found message. Input is capped at 100 characters (Config). | REQ-WF1-01, WF1-03, E1 |
| Q11: re-prompt and re-enable | The app requests location on every open. The browser decides whether a prompt is shown again, since a denied state typically blocks the prompt. The app stores no "denied" flag. After denial the message offers a "Use my location" control that retries and explains that location can be re-enabled in the browser's site settings. Where the Permissions API shows a denied state, the control explains this rather than silently failing. | REQ-WF2-03, E5, E6 |
| Q19: selected location changes during a pending request | The in-flight request is aborted or its response discarded (generation token, 3.7). The control becomes available again and a new load starts for the new location. Previously loaded data for the old location is not shown under the new location. | REQ-WF5-03, E3 |
| Q20: time format and "supported" | The time is shown with `Intl.DateTimeFormat` using the device's locale conventions in 12- or 24-hour form, short time style, for example "Updated 14:05", in device local time. "Supported" means: shown after any successful load in the session when the device clock is available (in practice always in supported browsers). With partial failure, each section keeps its own last-success time; one line is shown when both are equal, and two labelled lines when they differ (3.5, proposal for U4). | REQ-WF5-05 |
| Q28: privacy notice, analytics | No separate consent text beyond the browser/OS permission prompt. A one-line footer note states that the location and searched city are sent to the weather data provider. No analytics, telemetry, cookies or third-party scripts. | REQ-WF2-*, D4, R3 |

### 8.1 Design additions not in the approved requirements (DR-13)

These are Architect additions. They do not contradict the approved requirements, but they are not required by them. Each needs the user's confirmation or removal.

| Addition | Where | Note |
|---|---|---|
| "Use my location" retry control after denial, timeout or unavailable | 3.3 | Q11 default only says a message and city search; this control is added |
| "Detecting your location..." waiting message | 3.3 | Needed to make the prompt-wait state visible (DR-06) |
| Footer: provider attribution link and one-line note that location and searched city are sent to the provider | C1, A-Q28 | Attribution may be a provider licence condition (unverified) |
| Error boundary fallback page | C1 | Supports "never crash" (REQ-WF1-05) |
| Two labelled update-time lines when sections differ | 3.5 | Proposal for U4 |
| Accessibility behaviours (aria-live, focus restore, keyboard operability) | 5.5 | Tied to the unapproved Q26 proposal |
| CSP and HTTPS-only deployment | 5.3 | A proposal for deployment (U5) |
| Coordinate rounding before sending | 5.2 | U8 |
| Build check that no service worker exists | 3.9 | Supports Q21 |

## 9. Unresolved Design Decisions

| ID | Decision | Needed from |
|---|---|---|
| U1 | Reverse geocoding (DR-01). Choose (a) none, (b) second keyless reverse geocoder, or (c) keyed provider with proxy, using the consequence table in Section 7 item 5. Choosing (a) means the accepted Q12 place-name default is dropped in practice and a device location cannot be favorited. Choosing (b) or (c) costs an extra coordinate recipient or a proxy. | User |
| U2 | Whether the product is commercial. This decides whether the Open-Meteo free tier is permitted (unverified). Do not decide before the Section 7 item 5 checklist is complete. | User |
| U3 | Ruling needed (DR-02): does Q28 ("coordinates ... not stored") cover a **place's** city centroid in favorites? Design as drafted stores it (3.4) and is an explicit assumption. If the answer is yes, the alternative in 3.4 applies (store identity only, re-geocode on selection; extra request, possible ambiguity). Also confirm the identity rule (normalized name+admin1+country) as a refinement of Q23. | User |
| U4 | Update-time display when sections differ. Proposed in 3.5 (one line if equal, two labelled lines if not). Confirm or change. | User |
| U5 | Hosting target and deployment origin (needed for CSP, HTTPS, and for any proxy). | User |
| U6 | Disposition of the existing implementation: keep, adapt or discard. Not assessed here and not assumed conforming. The Architect's view: the design in this document is independent of it, so the choice does not alter Sections 2-3; a conformance review of `src/` against this architecture must precede any reuse. Asked of the user now rather than left to the Planner. | User (with Design Reviewer input) |
| U7 | Exact wording of all user-facing messages (not set by requirements). | User / Planner |
| U8 | Round coordinates to 2 decimals before sending to providers (data minimisation, 5.2). Proposed: yes for the weather request. | User |
| T1 | Approval of the technology stack in Section 4 (TypeScript, React, Vite, Vitest, Playwright, axe-core, Lucide, localStorage). | User |

## 10. Risks, Dependencies and Constraints

| ID | Item | Mitigation |
|---|---|---|
| R1 | Provider availability, rate limits or terms change; a provider change could also invalidate stored favorites | Provider isolated behind ports. Timeouts and `rate_limited` handling. Verify terms before approval. Favorite identity key is provider-independent and the record is versioned (3.4). |
| R2 | Free tier may not be allowed for commercial use (U2) | Decide before implementation. Alternative providers compared in item 5. |
| R3 | Providers see coordinates and IP and may log them, so "not logged" holds only for the app itself | Footer disclosure (Q28 assumption). No second provider unless approved (U1). |
| R4 | Geolocation needs HTTPS/localhost. Browsers may suppress repeat prompts after denial | Host over HTTPS. Clear fallback messaging (Q11 assumption). |
| R5 | Browsers differ on whether the geolocation timeout includes prompt time (unverified); the Permissions API may be missing | App-owned watchdog and state machine (3.3). Without the Permissions API a slow prompt may be reported as a timeout, with explanatory text. |
| R6 | A secret leaking into the repository if a keyed provider is adopted later | Proxy-only key (5.1), `.env*` ignored, build-gate scan. |
| R7 | Prior code may contain demo/fixture providers or behaviour that conflicts with this design | Build gate. Conformance review and user decision (U6). |
| R8 | Subjective requirements (REQ-WF7-01, WF7-06) | Proposed checklist (item 3), only effective if approved. |
| R9 | Provider facts in Section 7 are unverified | Complete the item 5 checklist before the user decides the provider or U2. |
| R10 | Stale data presented as fresh through the browser HTTP cache | `cache: 'no-store'`, no service worker, test of changed payloads (3.9). |
| R11 | Late device position discarded after the user searched may look like an ignored permission | Documented, deliberate rule (3.3 step 6); user action wins. |

Dependencies: the chosen weather and geocoding providers (D1 in requirements); browser Geolocation and `localStorage` (D3); a static HTTPS host (U5).

## 11. Status

**APPROVED BY USER (2026-10-30) with conditions.** The Design Reviewer's review is complete (`design-review.md`). On 2026-10-30 the user chose "Accept all proposals" for the 19 decisions in `design-review.md` Section 9.2. Recorded by the top-level Claude Code session, which received the user's choice directly.

Scope: the architecture and every proposed value in Sections 4, 7, 8 and 9 are accepted as the approved baseline, including the baseline option (a) for U1 (no reverse geocoder), the U3 centroid-in-favorites assumption, U8 coordinate rounding, the five Section 8 assumptions, and the nine Section 8.1 Architect additions.

Conditions and items still open:
- The provider (Open-Meteo) is accepted as proposed, subject to this document's own precondition: the Section 7 item 5 verification checklist is completed and recorded before implementation starts (DR-08). U2, commercial use, remains open until then.
- U6, what to do with the existing `src/`, tests, e2e and `scripts/`: no proposal existed and none was decided. The Planner must put a conformance review of `src/` before any reuse, and the user decides keep, adapt or discard.
- U5 (hosting target) and U7 (message wording): no proposal existed; left to the Planner to raise with the user.
- DR-18..DR-22 (Low): accepted as conditions for the Planner, not fixed in this document.

## 12. Revision log (round 1, responding to `design-review.md` DR-01..DR-16)

This log records what the Architect changed. It does not record any approval, and DR-17 (informational) needed no change. "Needs user" means the finding is answered by a design change plus a decision the user must still make.

| Finding | What changed | Where | Residual |
|---|---|---|---|
| DR-01 | Reverse-geocoding choice restated as a consequence table (a/b/c). Baseline (a) now says plainly that the Q12 place-name default is dropped in practice and device locations cannot be favorited | Section 7 items 5-6, U1, REQ-WF2-05 and WF6-01 rows | Needs user (U1) |
| DR-02 | Favorites centroid storage labelled an explicit assumption; a full alternative design (identity only, re-geocode) described; ruling requested | 3.4, 5.2, U3 | Needs user (U3) |
| DR-03 | `Location` split into `Place`, `SelectedLocation` (place or device) and `Coordinates`; C6 accepts only `Place`; time zone taken from the weather response, with a defined fallback | 3.1, 3.4, C3, C5, C6 | Depends on unverified provider field (checklist 5) |
| DR-04 | One logical `get`, one or two HTTP calls; outcome matrix for refresh and retry; retry scope defined; update time per section with a defined display | 3.1, 3.5, 3.6, Section 8 Q20 | U4 proposal needs confirmation |
| DR-05 | `cache: 'no-store'` on provider calls, no service worker or Cache API, tests and stated limits | 3.9, D3, R10 | Provider/CDN caches out of app control |
| DR-06 | App-owned watchdog, explicit state machine, waiting state, no-Permissions-API fallback, late-result rule | 3.3, Section 7 item 2, R5, R11 | Browser behaviours unverified |
| DR-07 | Removed the "provider-native 3 days" claim; rationale restated; dependency on a provider fact flagged | Section 7 item 7 and 11 | Choice a/b/c is the user's |
| DR-08 | Unverified banner, verification checklist, stack presented as decision T1 with prior-code rationale removed from Section 4, U6 put to the user. Two residual prior-code phrases in Section 7 items 1 and 8 were not removed in round 1; they were removed or labelled non-binding in T-08 (DR-21, documentation-only) | Header, Section 4, Section 7 item 5, U2, U6, T1 | **Provider facts not verified: no network access. Open.** |
| DR-09 | Controller-wide single-flight; internal `aborted` outcome never shown | 3.1, 3.7, 5.4 | None |
| DR-10 | Privacy statement corrected (provider URLs carry coordinates); no URL in errors; coordinate rounding proposed | 5.2, U8 | Needs user (U8) |
| DR-11 | Dependency index covering every requirement; "Open" notes updated | Section 6 | None |
| DR-12 | `isDay` added; condition text owned by C11 with day/night wording; Q5 wording fixed | 3.1, C3, Section 7 item 8, Section 8 | None |
| DR-13 | Additions listed as such; CSP and accessibility labelled proposals | 5.3, 5.5, 8.1 | Needs user to confirm each |
| DR-14 | Indicator shown immediately; 200 ms is a render budget; `loading-indicator delay` removed from Config | 3.6, C10, Section 7 item 4 | None |
| DR-15 | Versioned favorites record and one deterministic provider-independent identity rule | 3.4, R1 | Rule refines Q23; confirm in U3 |
| DR-16 | Verification limits of browser, accessibility, performance and CSP checks stated; 3 s target made non-gating | Section 7.0 | None |
| T-08 (DR-21, DR-22) | **Documentation-only corrections; no decision, proposed value or approval record changed.** Removed the prior-code phrases in Section 7 items 1 and 8 and corrected the DR-08 row above; Q5 wording separated from the lower-cased identity key; item 3(f) now names the keyboard, 200% zoom and screen-reader review that 7.0 refers to; Dependency index adds U7, U5 (WF2-01), A-Q5 (WF1-04) and T1 on every row; item 8 uses neutral "Clear" when `isDay` is absent; scope of option (c) stated. This entry does not record any approval of these edits | Section 7 items 1, 3, 5, 8; Section 7.0; Section 8 Q5; Dependency index; this log | Edits are not themselves approved; the existing Section 11 status is unchanged |
