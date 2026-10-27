# Weather Application - Architecture

**Status: Approved with Conditions (Revision 2, 2026-10-26).** Approved by the user; see Section 9 and design-review.md Section 9. Conditions: Revision 2 was not re-reviewed (user chose to skip), F-005 provider terms are unverified, and OQ-001 to OQ-014 remain TBD with the recommended defaults standing.

**Input:** `requirements.md` (approved by the user on 2026-10-26; recorded in its Section 10). Open questions OQ-001 to OQ-014 are unanswered.

**Revision 2 (2026-10-26):** Revised to address `design-review.md` findings F-001 to F-014. The invoking Orchestrator reports that the user replied "approve" to the reviewer's summary and interprets this as accepting the recommended defaults for ASM-1 to ASM-4 and ODD-1 to ODD-14. The Architect did not see that message and cannot verify it. It is **not** final design approval, it does not answer OQ-001 to OQ-014 in `requirements.md`, and it is not a Design Reviewer re-review. Where a revision below changes a default (F-001, F-002, F-003, F-004), the change is marked **[Revised]** and the user should confirm it. See Section 10 for the finding-by-finding revision log. **Historical note (2026-10-27):** the preceding statements describe the position when Revision 2 was drafted. Afterwards the user gave final approval with conditions on 2026-10-26 (own message "approve", recorded in Section 9 and `design-review.md` Section 9); the Design Reviewer re-review was skipped by the user's choice.

**Repository evidence:** The repository contains only `requirements.md`, `.claude/input/userstory.md` and agent definitions under `.claude/`. There is no application code, no build tooling and no existing technology to reuse. Every technology named below is therefore **proposed**, not existing. **Historical (as of the original design, 2026-10-26):** application code, build tooling and tests have since been implemented in this directory (see `impl-plan.md` and `verification.md`); the technologies named here were adopted or adjusted there.

## How to read this document

| Label | Meaning |
|-------|---------|
| **NEUTRAL** | The design is written so it holds whatever the OQ answer turns out to be. |
| **ASSUMPTION (ASM-n)** | A working assumption used so the design is concrete. It is not confirmed. Each has a recommended default the user can accept or reject. |
| **OPEN DESIGN DECISION (ODD-n)** | A decision that depends on an unanswered OQ. The design isolates it behind a seam, and a recommended default is given. |

Recommended defaults are suggestions only. None of them is a requirement.

---

## 1. Architecture Overview

The application is a single-user, self-contained client with no accounts or login (requirements A-001, A-002). It is built as a platform-neutral core wrapped by replaceable adapters (ports and adapters).

- **Core (platform-neutral):** domain model, weather orchestration, favorites rules, unit conversion, condition-to-icon mapping, and the view state model. The core contains no browser, mobile or provider-specific code.
- **Ports (interfaces):** `GeocodingProvider`, `WeatherProvider`, `LocationService`, `KeyValueStore`, `Clock`, `Config`.
- **Adapters (replaceable):** one implementation per port. They are chosen once OQ-001, OQ-002 and OQ-005 are answered.
- **UI layer:** renders view state and sends user intents to the core.

This isolates the three biggest unknowns (platform, weather provider, persistence). Answering them should change only an adapter or the UI layer, not the core.

```
+-------------------------------------------------------------+
| UI layer (C1)  Search | Weather view | Forecast | Favorites   |
+------------------------------+------------------------------+
                               | intents / view state
+------------------------------v------------------------------+
| Core                                                         |
|  App Controller (C2)  --  View State Store (C3)              |
|   |-- Search Service (C4)       |-- Favorites Service (C7)   |
|   |-- Location Flow (C5)        |-- Settings Service (C8)    |
|   |-- Weather Service (C6)      |-- Units & Formatting (C9)  |
|   |                             |-- Condition Mapper (C10)   |
+---+------------+------------+---+------------+---------------+
    | ports      |            |                |
+---v----+ +-----v-----+ +----v------+ +-------v--------+
|Geocoding| | Weather   | | Location  | | KeyValueStore  |
|Provider | | Provider  | | Service   | | (+ Clock)      |
+---+----+ +-----+-----+ +----+------+ +-------+--------+
    |            |            |                |
 [OQ-002]     [OQ-002]     [OQ-001]         [OQ-005]
 adapter      adapter      adapter          adapter
```

### 1.1 Recommended default platform and stack (ASSUMPTION ASM-1, depends on OQ-001, OQ-005, OQ-002)

OQ-001 (platform) is unanswered. The core is platform-neutral, but the UI layer and adapters must target something. The recommended default is:

- **Responsive web single-page application** (browser, desktop and mobile viewports).
  - Rationale: the requirements speak of "desktop and mobile screen sizes" (FR-043), "closed and reopened" (FR-037) and permission prompts (FR-009), and these map directly to a browser.
  - This is not confirmed. A native mobile or desktop app would reuse the core ports and replace the UI layer and the `LocationService` and `KeyValueStore` adapters.
- **Language:** TypeScript (proposed; gives a typed domain model and port contracts).
- **UI:** a component-based framework (React is the proposed default) with mobile-first CSS. The framework choice is low-risk and can be changed before implementation planning.
- **Transport security:** the site must be served over HTTPS. Browser geolocation requires a secure context, and provider calls use HTTPS (F-010).
- **Hosting:** static hosting over HTTPS. No application backend is needed, because there are no accounts (A-001) and no server-side state. The only exception is the proxy in Section 6.2, and only if OQ-002 selects a provider that requires an API key.

If the user answers OQ-001 differently, Sections 4.1 (C1), 5.3 (location adapter) and 5.4 (storage adapter) are the sections to revise. The rest should hold.

---

## 2. Requirements-to-Design Mapping

| Requirement(s) | Component(s) | Design notes |
|----------------|--------------|--------------|
| FR-001, FR-005 | C1 Search UI, C4 Search Service | Input validated (trimmed, non-empty) before any request is issued. Empty input shows a prompt and calls no port. |
| FR-002, FR-003 | C4, C6, ports (`GeocodingProvider`, `WeatherProvider`), C1 | Search resolves a `Location` (name, country optional, coordinates), then C6 loads weather. Country is shown only when present. |
| FR-004, FR-006 | C4, C11 Error Model, C1 | `NOT_FOUND` and `SERVICE_UNAVAILABLE` are distinct typed errors with distinct messages. The app stays operable. |
| FR-007, EC-003, EC-004 | C4 (search policy seam) | ODD-1 (OQ-007). |
| FR-008, FR-009, FR-010, FR-011, EC-009 | C5 Location Flow, `LocationService` port | State machine for permission outcomes. Every non-success path routes to the city search. |
| FR-012, FR-031, NFR-004, EC-006 | C12 Config, C6, C5 | Timeouts are configuration values, not hard-coded. ODD-4 (OQ-008). |
| FR-013, FR-039, EC-018 | C2 App Controller (launch policy seam) | ODD-5 (OQ-009). **[Revised]** Selection token for late results (F-007); device-location favorites rule (F-004). |
| FR-014, FR-015 | C6, C10, C1 | Normalized `CurrentWeather` plus icon key. |
| FR-016, FR-017 | C8 Settings, C9 Units | Data held in canonical units, converted at presentation. Default and control are ODD-2 (OQ-003). |
| FR-018, EC-010 | Domain model (optional fields), C1 | Missing values are `undefined`. UI renders an explicit "Unavailable" for each. |
| FR-019, FR-024, EC-017 | C6, C11, C1 | Current and forecast sections have independent status and retry. |
| FR-020, FR-021, FR-025 | C6, `WeatherProvider` port, C9 | Forecast shape is configurable. ODD-3 (OQ-004). |
| FR-022, FR-041 | C10 Condition Mapper | Provider-independent condition enum maps to an icon plus text label. |
| FR-023, EC-011 | C6, C1 | Forecast list is padded to the expected day count with "unavailable" placeholders. |
| FR-026, FR-027 | C6, C1 | Refresh re-fetches both sections for the selected `Location`. |
| FR-028, EC-012 | C6 (single-flight), C1 | Control disabled in the UI and requests de-duplicated in the service. |
| FR-029, EC-013 | C6, C3 | Previous snapshot is retained when a refresh fails. The error is shown alongside it. |
| FR-030, EC-019 | C6, C9, C12 | **[Revised]** `updatedAt` is recorded per section on each successful fetch. The displayed "Last updated" time is the older of the two section times, so it never overstates freshness (Section 4.6). ODD-6 (OQ-010). |
| FR-032, FR-035, FR-036 | C7 Favorites Service | Add, remove, and de-duplicate by an identity function (ODD-7, OQ-006). **[Revised]** Identity is the provider place ID, else normalized name+admin region+country; no coordinate rounding (Section 4.7). |
| FR-033, FR-034 | C7, C1, C6 | Favorites store the coordinates, so selection loads weather without a new name lookup. |
| FR-037, EC-016 | C7, `KeyValueStore` port | Versioned record. In-memory fallback when storage is unavailable. ODD-8 (OQ-005, OQ-006). |
| FR-038, EC-015 | C7 | Max count, ordering and removal-of-displayed behavior are policy parameters (ODD-7). |
| FR-040, FR-042, FR-043, FR-044, FR-045 | C1 UI, C3 View State Store, C9 | Responsive layout, labeled values with units, explicit loading, empty and error states, one consistent navigation model. |
| NFR-001 | C11, C2, C3 | All port calls return typed results or errors. No unhandled rejection reaches the UI. |
| NFR-002, NFR-003, NFR-007 | C1 | Design principles in Section 7. Numeric targets are ODD-9 (OQ-011). |
| NFR-005 | C5, C7, C8 | Location is used in memory only (Section 6.3). ODD-10 (OQ-012). |
| NFR-006 | `WeatherProvider` and `GeocodingProvider` adapters, optional proxy | Section 6.2. |
| NFR-008 | C9 Units & Formatting | All text and format calls go through one formatting module. ODD-11 (OQ-013). |

Items **not designed** because the requirements place them out of scope or leave them TBD (OQ-014): accounts and sync, alerts, hourly forecast, forecasts beyond 3 days, background refresh, maps, additional languages, offline mode, extra metrics, favorite reordering. The ports and domain model leave room to add them later without committing to them now.

---

## 3. Domain Model (platform- and provider-neutral)

Weather data is stored in canonical units (Celsius, percent). Conversion to Fahrenheit happens only at presentation (C9). This keeps the core correct whichever unit OQ-003 selects.

```
Location        { key, name, admin1?, country?, latitude, longitude, timezone?,
                  placeId?, source: 'search'|'device' }
CurrentWeather  { temperatureC?, humidityPct?, condition?: ConditionCode,
                  conditionText?, observedAt? }
ForecastDay     { date (local date at location), tempMinC?, tempMaxC?,
                  condition?: ConditionCode, conditionText? }
WeatherSnapshot { location, current: Section<CurrentWeather>,
                  forecast: Section<ForecastDay[]> }
Section<T>      { status: 'idle'|'loading'|'ready'|'error', data?: T, error?: AppError,
                  updatedAt? }   // time of the last successful fetch of THIS section
lastUpdated     derived: the older of current.updatedAt and forecast.updatedAt
                (undefined if either section has never succeeded)
ConditionCode   a small provider-independent enum (e.g. CLEAR, PARTLY_CLOUDY, CLOUDY,
                RAIN, SNOW, THUNDERSTORM, FOG, UNKNOWN)
```

- Optional (`?`) fields model FR-018 and FR-023: absence is representable and visible.
- `current` and `forecast` are separate sections so one can fail without hiding the other (FR-019, FR-024), and a failed refresh can keep the previous value of each (FR-029).
- `tempMinC` and `tempMaxC` can both be populated. Whether the UI shows a single value or high/low is a presentation choice (ODD-3).
- `Location.key` is the favorites identity key (ODD-7). **[Revised]** It is `"<providerId>:<placeId>"` when the provider supplies a place ID; otherwise `"name:<normalized name>|<admin1>|<country>"` (Unicode NFC, trimmed, case-folded). Coordinates are required on every `Location` but are never part of the key.
- `Location.timezone` is optional. Fallback for forecast dates (F-012): use the time zone the forecast response reports for the coordinates (the adapter asks the provider to resolve it, if the provider supports that; verify). If none is available, use the device time zone and label the dates as such rather than implying location-local dates.
- `Location.source` records whether the location came from search or from the device. A `device` location is never persisted as-is (Section 4.7).

---

## 4. Components

### 4.1 UI layer (C1)
**Responsibility:** render view state, capture intents (search, use my location, refresh, add/remove favorite, select favorite, change unit if offered).
**Traces to:** FR-001 to FR-006, FR-010, FR-011, FR-014 to FR-016, FR-018 to FR-030, FR-032 to FR-036, FR-040 to FR-045, NFR-002, NFR-003.
**Sub-views:** Search box (with result chooser when ODD-1 requires one), Current Weather card, Forecast list, Favorites list, Status/Message area, Refresh control with last-updated text, Unit control (conditional on ODD-2).
**Rules:**
- No business logic and no direct calls to adapters.
- Every value is rendered with its label and unit (FR-042). Icon plus text is always shown together (FR-041).
- Loading, error, empty and unavailable states are each explicit (FR-044).
- Layout is mobile-first with a single-column flow on small screens and a multi-column arrangement at wider breakpoints (FR-043). Breakpoint values are configuration (ODD-9).

### 4.2 App Controller (C2)
**Responsibility:** the one place that receives UI intents and coordinates the services. Owns the launch policy and the "selected location".
**Traces to:** FR-013, FR-039, FR-045, NFR-001, EC-018.
**Notes:** Launch behavior is a pluggable `LaunchPolicy` (ODD-5). Navigation is state-driven so the search, current weather, forecast and favorites views are consistent (FR-045).

**Launch behavior [Revised] (F-001, ODD-5, option "first load plus a hint"):**
- If location permission is already `granted` at launch, detect the location and show its weather automatically (FR-008, US-002 "automatically detect").
- Otherwise do **not** open a permission prompt on first paint. Show the search and favorites, plus a prominent "Use my location" control with a short hint. The control triggers the permission request (FR-009).
- The hint includes a one-line disclosure: the location is sent to the weather service to obtain weather and is not saved (F-004).
- This is a reading of US-002 AC1/AC2, not a confirmed requirement. Alternatives: button only, or prompt on first load. Either is a change to `LaunchPolicy` only. OQ-009 remains open.

**Selection token (F-007):** C2 owns a monotonically increasing `selectionToken`. Every intent that changes the selected location (search result selected, favorite selected, "Use my location", launch auto-detect) increments it and cancels outstanding work started under the previous token (AbortSignal to C5, C4 and C6). Results from C4, C5 and C6 carry the token they started under and are discarded on arrival if it no longer matches. The latest user intent therefore always wins, including over a slow device-location result or a launch auto-detect that finishes after the user has searched. Discarded results produce no UI change.

### 4.3 View State Store (C3)
**Responsibility:** a single observable store holding the state the UI renders: selected location, `WeatherSnapshot`, search state, location-flow state, favorites, settings, and transient messages.
**Traces to:** FR-029, FR-044, NFR-001.
**Notes:** One source of truth prevents mismatched displays. The previous snapshot is retained until a new successful result replaces it.

### 4.4 Search Service (C4)
**Responsibility:** validate input, call `GeocodingProvider`, and apply the ambiguity policy.
**Traces to:** FR-001 to FR-007, EC-001 to EC-004.
**Behavior:**
1. Trim input. If it is empty, return `EMPTY_INPUT` and make no request (FR-005, AC-P-01).
2. Call `GeocodingProvider.search(query)`, which returns a list of candidate `Location`s.
3. Zero candidates: `NOT_FOUND` (FR-004). Provider failure: `SERVICE_UNAVAILABLE` (FR-006).
4. One or more candidates: apply the `AmbiguityPolicy` (ODD-1).

### 4.5 Location Flow (C5)
**Responsibility:** obtain the device location through the `LocationService` port and translate the outcome to the user-facing state.
**Traces to:** FR-008 to FR-012, NFR-005, EC-007, EC-008, EC-009, EC-018.

States and transitions:

Outcome names are the port contract in Section 5.3 (a permission state from `getPermissionState`, then a `Result` from `getCurrentPosition`). **[Revised]** (F-011)

| Port outcome | App behavior |
|--------------|--------------|
| Permission `granted`, then `getCurrentPosition` returns coordinates | Build a `Location` with `source: 'device'` (name via `reverse` if available, otherwise the label "Current location") and load weather (FR-008). |
| Permission `prompt` | Ask before access (FR-009). `getCurrentPosition` is the call that triggers the platform prompt, and it runs only on a user action ("Use my location"). |
| Permission `denied`, or `AppError` `LOCATION_DENIED` | Message plus the city search stays available (FR-010). |
| `AppError` `TIMEOUT` or `LOCATION_UNAVAILABLE` | Helpful message plus city search (FR-011). |
| Permission `unsupported` | Treated as `LOCATION_UNAVAILABLE` (EC-009). |

The timeout value comes from `Config.locationTimeoutMs` (ODD-4). Device coordinates are held in memory and are never persisted as-is (Section 6.3). Results are subject to the selection token (Section 4.2): a late or superseded location result is discarded, so it cannot replace a city the user has since chosen (F-007).

### 4.6 Weather Service (C6)
**Responsibility:** fetch current weather and forecast for a `Location`, normalize failures, record per-section `updatedAt`, and prevent duplicate in-flight requests.
**Traces to:** FR-002, FR-014, FR-018 to FR-031, NFR-001, NFR-004, EC-005, EC-006, EC-010 to EC-013, EC-017.

**Behavior:**
- `load(location)` and `refresh(location)` call `WeatherProvider.getCurrent` and `WeatherProvider.getForecast`. Both may be backed by one provider call; the section statuses are still tracked separately.
- **Single-flight (FR-028, AC-P-03):** at most one outstanding request per (location, operation). A repeat call while one is in flight returns the same pending result and issues no new request. This is combined with the refresh control being disabled in the UI. Both mechanisms are used so the requirement holds whichever way OQ-008 resolves "disable vs ignore".
- **Stale-response protection:** each load carries the C2 `selectionToken` (Section 4.2). If the user selects another location while an earlier request is outstanding, the earlier result is discarded when it arrives and the request is aborted. This prevents showing weather for the wrong city.
- **Per-section timestamps [Revised] (F-002, replaces the old single `fetchedAt` and ASM-2):** each section stores its own `updatedAt`, set from `Clock.now()` only when that section's fetch succeeds. A failed section keeps its previous data and its previous `updatedAt`.
- **Displayed update time (FR-030):** the "Last updated" text shows `lastUpdated`, the older of the two section times. It therefore never claims fresher data than the oldest data on screen. After a fully successful refresh both times are equal, which satisfies FR-027 and FR-030. When the two sections differ (one failed), the failed section also shows its own time ("Showing data from HH:MM") next to its error message, so stale data is never presented as fresh.
- **Partial failure:** if one section fails on refresh, the other section updates and the failed section keeps its prior data with an error indicator and retry (FR-029, FR-024).
- **Forecast shaping:** the service requests `Config.forecastDays` days and pads the result with "unavailable" placeholder days up to the expected count (FR-023).
- **Timeouts and retry:** each provider call is wrapped with `Config.weatherTimeoutMs`. No automatic retry; the retry is user-initiated (ODD-4).

### 4.7 Favorites Service (C7)
**Responsibility:** manage the list of favorite locations and persist them through `KeyValueStore`.
**Traces to:** FR-032 to FR-039, EC-014 to EC-017.

**Behavior:**
- `add(location)`: reject if `identity(location)` already exists (FR-035); enforce `maxFavorites` if configured (ODD-7).
- `remove(key)`, `list()`.
- **Identity rule [Revised] (F-003):** two favorites are duplicates when their `Location.key` is equal (Section 3). The key is the provider place ID when available, otherwise normalized name + admin region + country. Coordinates are not rounded or compared, so distinct nearby places are not wrongly blocked and the same place is not admitted twice because of a rounding boundary. Known limits: if the provider is replaced, stored keys carry the old provider prefix and the same place could be added once more under the new provider; and two places with identical name, region and country but no place ID would be treated as one. Both are accepted as rare; the stored coordinates keep every favorite loadable.
- **Device-location favorites [Revised] (F-004, F-005, ODD-5):** a `Location` with `source: 'device'` is never saved with the raw device coordinates. The add-to-favorites control is offered for a device-location result only when `GeocodingProvider.reverse` resolved it to a named place; the saved favorite is that resolved place (name, region, country, place ID and the place's own coordinates, `source: 'search'`). If reverse lookup is unavailable or returns nothing, the control is not offered, and a short message tells the user to search the city by name. This keeps favorites distinguishable and avoids storing a precise home or work position. Whether device-location favorites are allowed at all is FR-039 / OQ-009, still open.
- Each favorite stores a full `Location` (name, region, country, place ID if any, coordinates), so selecting it (FR-034) calls `WeatherService.load` directly without a new name search.
- **Persistence:** stored as one versioned JSON record: `{ "version": 1, "favorites": [Location...] }`. On load the record is validated; a corrupt or unrecognized record is ignored (not crashed on) and the user starts with an empty list.
- **Storage failure (EC-016):** if the store is unavailable or write fails, the service keeps the list in memory for the session and surfaces a non-blocking notice that favorites may not be saved. Whether to show that notice is ODD-8.
- Removal of the currently displayed favorite (EC-015): the service only changes the list. The displayed weather is not cleared by default (ODD-7).

### 4.8 Settings Service (C8)
**Responsibility:** hold user preferences (currently only temperature unit) and persist them via `KeyValueStore`.
**Traces to:** FR-016, FR-017.
**Notes:** Exists only if ODD-2 resolves to a user-configurable unit. If the unit is a fixed setting, C8 reduces to a constant in `Config`.

### 4.9 Units & Formatting (C9)
**Responsibility:** convert canonical values to display strings with labels and units; format dates and times.
**Traces to:** FR-016, FR-021, FR-030, FR-042, NFR-008, AC-P-04.
**Notes:**
- All user-visible text goes through this module and a message table so localization (OQ-013) is a change in one place. Only English strings are provided (ASSUMPTION A-006).
- Missing values format to an "Unavailable" token, not "0" or a blank (FR-018).
- Dates for forecast days use the location's local date, not the device date (see ODD-3).

### 4.10 Condition Mapper (C10)
**Responsibility:** map each provider's condition codes to the internal `ConditionCode`, then to an icon key and a text label. Unknown codes map to `UNKNOWN` with a neutral icon and the provider's text if present.
**Traces to:** FR-015, FR-022, FR-041, NFR-003.
**Notes:** The mapping table lives inside each provider adapter (provider code to `ConditionCode`); the `ConditionCode` to icon/label table is shared. Icons are shipped with the application (no third-party icon fetch is assumed). Icon source/licence is an implementation detail to settle in planning.

### 4.11 Error Model (C11)
**Responsibility:** one typed `AppError` with a stable `code` and a user-safe message for each failure class.
**Traces to:** FR-004, FR-005, FR-006, FR-010, FR-011, FR-019, FR-024, FR-029, NFR-001, NFR-006.

| Code | Source | User-visible behavior |
|------|--------|-----------------------|
| `EMPTY_INPUT` | C4 | Prompt to enter a city. |
| `INPUT_TOO_LONG` | C4 | Static message asking for a shorter city name. See the amendment below. |
| `NOT_FOUND` | C4 | "City not found" message. |
| `SERVICE_UNAVAILABLE` | Provider (HTTP error, bad payload, rate-limit) | Error message plus retry. |
| `NETWORK` | No connectivity | Same as `SERVICE_UNAVAILABLE` by default (EC-006, ODD-4). |
| `TIMEOUT` | Weather or location | Message plus retry or city search. |
| `LOCATION_DENIED` / `LOCATION_UNAVAILABLE` | C5 | Message plus city search. |
| `STORAGE_UNAVAILABLE` | C7, C8 | Non-blocking notice (ODD-8). |

Raw provider payloads, stack traces, request URLs and credentials are never shown to the user (NFR-006).

**User-approved amendment 2026-10-27 (change request C2):** a ninth code, `INPUT_TOO_LONG`, is added for search input longer than `Config.maxInputLength` (counted in characters). C4 returns it with no port call. It has its own static message-table entry ("That search is too long. Please enter a shorter city name.", wording proposed by the Implementer, no placeholders) and is not mapped to `NOT_FOUND`, which previously stood in for it (impl-plan TASK-013 decision 1). The EC-003 / OQ-007 behaviour stays TBD; this is the recommended default, and the length cap value itself is unchanged (100).

### 4.12 Config (C12)
**Responsibility:** a single typed configuration object for values the requirements leave TBD.

| Key | Purpose | Related OQ | Recommended default (not a requirement) |
|-----|---------|------------|-------------------------------------------|
| `weatherTimeoutMs` | Weather request timeout | OQ-008 | 10000 |
| `locationTimeoutMs` | Location request timeout | OQ-008 | 10000 |
| `forecastDays` | Forecast days requested | OQ-004 | 3 |
| `forecastIncludesToday` | Whether today counts as day 1 | OQ-004 | false |
| `maxFavorites` | Favorites cap | OQ-006 | none (unbounded) |
| `defaultTemperatureUnit` | Initial unit | OQ-003 | see ODD-2 |
| `staleAfterMs` | Age after which data is flagged | OQ-010 | disabled |
| `searchResultLimit` | Max candidates shown | OQ-007 | 5 |
| `breakpoints` | Responsive layout widths | OQ-011 | set in planning |
| `maxInputLength` | Search input length cap | OQ-007 | set in planning |
| `attributionText` | Data-source attribution shown in the UI, if the provider's terms require it | OQ-002 | empty until the terms are verified (Section 6.1) |
| `loadingIndicatorMaxDelayMs` | Latest time the loading state must appear after submit/refresh | OQ-008 | 200 (recommended, Section 7) |

Using configuration means an OQ answer is a value change rather than a code change.

---

## 5. Interfaces and Contracts

All port methods return a result or a typed `AppError`; they do not throw to callers (NFR-001).

### 5.1 `GeocodingProvider`
```
search(query: string, limit: number): Promise<Result<Location[], AppError>>
reverse?(lat: number, lon: number): Promise<Result<Location, AppError>>   // optional
```
Returns an empty list for no match (mapped to `NOT_FOUND` by C4). `reverse` is optional; absence falls back to a generic "Current location" label, and a device-location result without a resolved place cannot be saved as a favorite (Section 4.7). Whether the chosen provider offers reverse geocoding is **not verified** (F-005, Section 6.1). `Location` returned by `search` and `reverse` includes `placeId` and `admin1` when the provider supplies them.

**User-approved amendment 2026-10-26:** `search` and `reverse` each take an optional trailing `signal?: AbortSignal` so a superseded request can be cancelled. Omitting it keeps the original behavior. No geocoding timeout key is added to Config (Section 4.12).

### 5.2 `WeatherProvider`
```
getCurrent(loc: Location, signal): Promise<Result<CurrentWeather, AppError>>
getForecast(loc: Location, days: number, includeToday: boolean, signal):
                                      Promise<Result<ForecastDay[], AppError>>
```
The adapter must: normalize to canonical units, map provider conditions to `ConditionCode`, leave unknown or missing fields `undefined` rather than defaulting them, and honor the abort signal for the timeout.

### 5.3 `LocationService`
```
getPermissionState(): Promise<'granted'|'prompt'|'denied'|'unsupported'>
getCurrentPosition(timeoutMs: number, signal): Promise<Result<{lat, lon}, AppError>>
   // AppError codes: LOCATION_DENIED, LOCATION_UNAVAILABLE, TIMEOUT; aborted calls produce no result
```
**Portability (F-009):** some platforms may not support a permission query for location (verify per target browser). When the adapter cannot determine the state, `getPermissionState` returns `'prompt'`, and the denial or grant is learned from the `getCurrentPosition` outcome. Because of this, launch auto-detect (Section 4.2) runs only when the state is positively reported as `granted`. Calling `getCurrentPosition` is the point at which the platform asks for permission. In a browser the adapter wraps the Geolocation API. On other platforms it wraps the native equivalent (D-002, OQ-001).

**User-approved amendment 2026-10-26:** an aborted `getCurrentPosition` call no longer leaves its promise unsettled. It resolves to an `Aborted` variant (`{ ok: false, aborted: true }`), so the return type is `Promise<Ok<{lat, lon}> | Err<AppError> | Aborted>`. Callers discard it without changing state or showing a message. This replaces "aborted calls produce no result" in the contract above.

### 5.4 `KeyValueStore`
```
get(key: string): Result<string | undefined, AppError>
set(key: string, value: string): Result<void, AppError>
remove(key: string): Result<void, AppError>
```
Recommended web adapter: browser `localStorage`. Native platforms would use their local preferences or database. Both fit the same three calls (D-003, OQ-005).

### 5.5 `Clock`
`now(): Date`. Exists so `updatedAt` and date logic are testable and so time-zone handling is isolated.

### 5.6 Provider selection (ODD-12, OQ-002)
The provider adapters are the only code that knows a provider's endpoints, parameters, field names and codes. Replacing the provider means writing two adapters and one condition-code table. Nothing else changes. No provider is selected by this document as a requirement. The recommended default is in Section 6.1.

---

## 6. Data Flows, Storage, and External Dependencies

### 6.1 External weather data source (D-001; OPEN DESIGN DECISION ODD-12, OQ-002)
OQ-002 is unanswered, so the provider, its cost, rate limits and credential needs are unknown.

- **Selection criteria for the user:** provides current temperature, humidity and condition; a daily forecast of at least 3 days; city lookup returning country and coordinates; acceptable terms, cost and rate limits; browser-callable (CORS) if the platform is a web app; whether an API key is needed.
- **Recommended default (proposed, unverified against current terms):** a free provider that needs no API key for non-commercial use, for example Open-Meteo (which offers a geocoding endpoint and a forecast endpoint). This keeps the key-handling problem in 6.2 from arising. The user must confirm that its terms and limits are acceptable.
- **Alternative:** a keyed provider, which requires the proxy described in 6.2.
- **Needs user verification before this default is relied on (F-005). The Architect has not verified any of these and makes no claim about them:**
  1. Current terms of use: whether the intended use (personal, non-commercial, or commercial) is permitted.
  2. Whether attribution is required and in what form. If it is, the text is set in `Config.attributionText` and shown in the UI footer.
  3. Rate limits and quota versus expected usage.
  4. Whether a reverse geocoding endpoint exists. If not, device-location weather is labeled "Current location" and cannot be saved as a favorite (Section 4.7). A different reverse-geocoding source would be a second provider and needs its own terms check.
  5. Whether browser calls (CORS over HTTPS) are allowed.
  6. Whether the forecast can report the location's time zone (Section 3).
  Until the user confirms these, ODD-12 stays open.

### 6.2 Credential handling (NFR-006, depends on OQ-002)
- If the provider needs **no key**: no credential handling is needed, and the application remains static.
- If the provider **needs a key** and the platform is a web app: a key embedded in client code is visible to anyone using browser tools, so it cannot be treated as secret. In that case the recommended design is a small server-side proxy (or serverless function) that holds the key, forwards the two provider calls and returns the response. The `WeatherProvider` and `GeocodingProvider` adapters then point to the proxy. This adds a hosted component and an operational cost, and must be confirmed by the user before it is planned.
- **Minimum proxy requirements (F-006), applying only if a keyed provider is chosen:**
  - Forward only the specific provider endpoints and parameters the adapters need (allowlist). It must not be an open forwarder.
  - Accept requests only from the application's own origin (origin check), and apply per-client rate limiting and a global quota guard so the key's quota cannot be drained by third parties. Origin checks alone do not stop non-browser abuse, so the rate limit is required.
  - Hold the key only in server environment configuration; strip it from any response, redirect or error body.
  - Apply its own upstream timeout shorter than `weatherTimeoutMs`, and return a small fixed error contract that the adapters map to `SERVICE_UNAVAILABLE`, `TIMEOUT` or `NOT_FOUND`. It forwards no raw upstream errors.
  - Do not log search text or coordinates beyond what operations require.
  - Choosing a keyed provider means this document must be revised (hosting, deployment, cost) and re-reviewed before planning.
- In all cases: keys are never committed to the repository, never shown in UI content or error messages, and are supplied through environment configuration.

### 6.3 Data storage and privacy (NFR-005, OQ-006, OQ-012)
| Data | Where | Persistent | Note |
|------|-------|------------|------|
| Favorites (name, region, country, place ID, coordinates of the named place) | `KeyValueStore` | Yes (FR-037) | Per device or browser profile (A-002). **[Revised]** Coordinates saved are those of the resolved place, never the raw device position (F-004). |
| Temperature unit preference | `KeyValueStore` | Recommended yes, ODD-2 | Only if user-configurable. |
| Device coordinates from location flow | Memory only | No | **[Revised]** Never persisted. A device-location result can become a favorite only by being resolved to a named place, which is then saved in its own right (Section 4.7). A browser or OS may keep its own location permission record outside the application. |
| Search queries and history | Not stored | No | No history feature is required. |
| Last viewed city | Not stored by default | No | Becomes persistent only if ODD-5 chooses "show last viewed on launch". |
| Weather snapshots | Memory only | No | No offline mode (out-of-scope candidate). |

Search text and coordinates (including device coordinates) are sent to the weather provider only to obtain weather; no analytics or other third party is included. **[Revised]** A one-line disclosure is shown beside the "Use my location" control (Section 4.2). A fuller privacy notice remains ODD-10 / OQ-012.

### 6.4 Flow A: city search (FR-001 to FR-006)
1. User submits text in the search UI.
2. C4 trims. Empty: show the prompt, stop (no request).
3. C4 calls `GeocodingProvider.search`.
4. No match: show "city not found". Failure: show an error. Neither state crashes the app.
5. Match(es): apply the ambiguity policy, then set the selected `Location`.
6. C6 `load(location)`: current and forecast sections move to `loading`, then to `ready` or `error` individually.
7. UI renders the city name, the country when present, current weather, and forecast. The add-to-favorites control is shown if not already a favorite.

### 6.5 Flow B: device location (FR-008 to FR-011)
1. Trigger (launch auto-detect when permission is already `granted`, or the "Use my location" control, ODD-5). C2 increments the `selectionToken` and cancels any earlier work.
2. C5 reads `getPermissionState`. If granted, call `getCurrentPosition`. If prompt, ask for permission first (FR-009).
3. Success, and the token still matches: build `Location`, call C6 `load`. If the token no longer matches (the user has acted since), discard the result silently.
4. Denied, timeout or error (token still matching): show a message and keep the city search available.

### 6.6 Flow C: refresh (FR-026 to FR-030)
1. User activates refresh; the control becomes disabled.
2. C6 `refresh(selectedLocation)`: single-flight check, then fetch both sections.
3. Both sections succeed: replace both and set each section's `updatedAt`. The UI shows `lastUpdated` (FR-027, FR-030).
4. One section fails: the succeeded section is replaced with its new `updatedAt`. The failed section keeps its previous data and previous `updatedAt`, shows an error with retry and its own "data from HH:MM" time. "Last updated" shows the older section time, so it does not overstate freshness (F-002).
5. Both fail: keep both previous sections and times, and show an error (AC-P-02).
6. The control is re-enabled in all cases. A result for a location that is no longer selected is discarded (selection token).

### 6.7 Flow D: favorites (FR-032 to FR-037)
- Add: C7 `add` checks identity, applies the cap, writes to the store, updates the view state.
- Open app: C7 reads and validates the stored record, then fills the list (FR-037).
- Select: C2 sets the selected location to the favorite's stored `Location` and C6 loads it (FR-034).
- Remove: C7 removes it and writes the new list.

---

## 7. Quality Considerations

**Reliability (NFR-001).** Port methods return typed results. A top-level error boundary in the UI shows a fallback message if an unexpected exception occurs. Each failure class has a user-visible state, and the search stays available in every error state.

**Performance (NFR-004, OQ-008).** No numeric target exists in the requirements. Design supports a fast path: the two weather calls are issued in parallel, the UI renders each section as it resolves, and a loading state is shown immediately.

**Recommended NFR-004 target [Proposed, not user-confirmed] (F-008):**
- The loading state appears within 200 ms of a search submit or refresh activation (`loadingIndicatorMaxDelayMs`).
- Under normal conditions (device online, provider responding normally), current weather and forecast are both displayed within 3 s for at least 90% of searches and refreshes, measured from submit or refresh activation to both sections rendered. The time spent in the location permission prompt is excluded.
- If neither result has arrived after `weatherTimeoutMs` (10 s), an error with retry is shown.
- The 3 s / 90% figures are a starting point chosen without measuring any provider. They must be checked against the chosen provider's real latency during planning or early implementation and adjusted, and the user must accept them or state a different target. Until then NFR-004 stays TBD in the requirements.
- **User-accepted 2026-10-27:** loading state within 200 ms; both sections within 3 s for 90% of requests under defined conditions (impl-plan.md TASK-042; measured on one machine/network only).

**Accessibility (NFR-003, OQ-011).** The target standard is not chosen. Design principles that are low-cost and apply under any target: semantic HTML and landmarks; every control keyboard-operable with visible focus; icons always paired with text and an accessible name so meaning is not color- or icon-only (this also satisfies FR-041); status and error messages announced through a polite live region; sufficient color contrast; form fields with labels. Recommended default target: WCAG 2.1 AA (ODD-9).

**Responsiveness (NFR-002, NFR-007).** Mobile-first layout, fluid units, and touch-sized targets. Supported viewport widths and browser versions are TBD (ODD-9, ODD-13); the recommended default is the current stable versions of major evergreen browsers.

**Security (NFR-006).** See 6.2. All provider responses are treated as untrusted: they are validated and normalized in the adapter, and values are rendered as text (never as HTML) to prevent injection through city names or condition text. Calls use HTTPS. User input is URL-encoded in requests.

**Diagnostics (F-014).** No logging, telemetry or analytics service is included (out of scope). Unexpected errors are caught by the top-level error boundary. Any development-time console output must not include search text, coordinates or credentials.

**Maintainability.** Ports and adapters isolate the unknowns. Pure functions in the core (unit conversion, condition mapping, identity, forecast padding) are easy to test without a browser or network.

**Scalability / operations.** There is no server-side state, so scaling is the provider's rate limit. If the provider has a low free quota, the exposure is the number of users per day; a short in-memory cache of recent results (not designed here, to avoid scope expansion) is a possible later mitigation. Rate-limit responses map to `SERVICE_UNAVAILABLE`.

**Localization (NFR-008).** English only (A-006). All text and formatting are centralized (C9) so adding languages later is contained.

---

## 8. Assumptions, Risks, Constraints, and Open Decisions

### 8.1 Assumptions introduced by this design (not confirmed)

| ID | Assumption | Related | Recommended default / how to reject |
|----|------------|---------|-------------------------------------|
| ASM-1 | The target is a responsive web SPA in TypeScript with static hosting. | OQ-001, OQ-005 | If rejected, state the platform; C1 and the two platform adapters change. The core is reused. |
| ASM-2 | **[Revised]** Update time is tracked per section; the displayed "Last updated" is the older of the two section times. (Replaces the earlier single `fetchedAt` rule that updated on any success.) | OQ-010 | Alternative: a single time updated only when both sections succeed. |
| ASM-3 | Data is held in Celsius and percent internally and converted on display. | OQ-003 | Internal choice; no user impact. |
| ASM-4 | Favorites store the resolved place's coordinates and place ID so selection does not re-run a name search. | OQ-006 | Alternative: store names only and re-search. This is less reliable for ambiguous names. Depends on the identity rule in Section 4.7. |

Status of ASM-1 to ASM-4 and ODD-1 to ODD-14: the Orchestrator reports the user accepted the recommended defaults (see the Revision 2 note). Items marked **[Revised]** are new defaults introduced in this revision and should be confirmed.

Requirements assumptions A-001 to A-006 are adopted as stated and remain unconfirmed.

### 8.2 Open design decisions the user must review

| ID | Decision | OQ | Seam in the design | Recommended default |
|----|----------|----|--------------------|---------------------|
| ODD-1 | Ambiguous names, "City, Country" input, special characters | OQ-007 | `AmbiguityPolicy` in C4 | One match: select it automatically. Several matches: show a short list (up to `searchResultLimit`, 5) with name, region and country for the user to choose. Pass input as entered (Unicode supported); do not parse "City, Country" specially. Cap input length at a sensible limit (value set in planning). Treat whitespace-only as empty. |
| ODD-2 | Default temperature unit and how it is set | OQ-003 | C8, C9, `defaultTemperatureUnit` | Celsius default, with a visible C/F toggle, persisted between sessions. The user may prefer a fixed unit or a locale-derived default. |
| ODD-3 | Forecast shape: today included, single or high/low, time zone | OQ-004 | `forecastDays`, `forecastIncludesToday`, C9 | Three days after today (today is covered by current weather), high and low per day, dates in the searched location's time zone. |
| ODD-4 | Timeouts, retry, offline, target response time, duplicate-refresh handling | OQ-008 | C12, C6 | 10 s timeouts (placeholders), manual retry only, no offline mode (network failure treated as service unavailable), control disabled and service de-duplicated. **[Revised]** Response-time target proposed in Section 7 (200 ms loading indicator; both sections within 3 s for 90% of requests); needs user acceptance and a provider latency check. |
| ODD-5 | Launch behavior, device location as favorite, permission change | OQ-009 | `LaunchPolicy` in C2 | **[Revised]** Use device location on launch automatically only if permission is already granted; otherwise show search and favorites with a prominent "Use my location" control, a short hint and a one-line data-use disclosure; no permission prompt on first paint. A device-location result can be added as a favorite only if it resolves to a named place, and the named place (not the device coordinates) is saved (Section 4.7). Permission state is re-read each time the control is used, which handles later changes. The user should confirm, in particular the no-prompt-on-first-paint reading of FR-009 and US-002 "automatically". |
| ODD-6 | What "update time" means; staleness | OQ-010 | C6, C9, `staleAfterMs` | Show the app's fetch time in the device's local time format; do not flag staleness. |
| ODD-7 | Favorites cap, ordering, duplicate identity, removal of the displayed favorite | OQ-006 | C7, `identity()` | No cap, insertion order. **[Revised]** Duplicate identity: provider place ID when available, otherwise normalized name + admin region + country. No coordinate rounding. When the displayed favorite is removed, keep showing its weather (it is still the selected city) and make the add-to-favorites control available again. |
| ODD-8 | Storage unavailable: notify user or not | OQ-005, OQ-006 | C7, C11 | Keep working in memory and show a non-blocking notice that favorites may not be saved. |
| ODD-9 | Accessibility standard, viewport range, keyboard/screen-reader level | OQ-011 | C1, `breakpoints` | WCAG 2.1 AA, keyboard and screen-reader support as in Section 7, viewport range set in planning. |
| ODD-10 | Privacy notice and additional storage | OQ-012 | Section 6.3 | Store nothing beyond favorites and the unit preference; raw device coordinates are never stored; a one-line data-use disclosure beside "Use my location"; no fuller privacy notice unless the user requires one. |
| ODD-11 | Language and date/number formats | OQ-013 | C9 | English; formats follow the device locale. |
| ODD-12 | Weather provider, key, cost | OQ-002 | Provider adapters, 6.1, 6.2 | A keyless provider (for example Open-Meteo), subject to the user verifying terms, attribution, limits, reverse geocoding and CORS (checklist in 6.1). **Not verified by the Architect; remains open.** |
| ODD-13 | Browser/OS support targets | OQ-001, OQ-005 | C1, storage adapter | Current stable versions of major browsers with `localStorage` and Geolocation. |
| ODD-14 | Out-of-scope list | OQ-014 | Section 2 note | The candidate list in requirements Section 8 is adopted for design purposes only. |

### 8.3 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Platform changes after design (OQ-001) | UI layer and two adapters are rewritten | Ports and adapters isolate them; the core is unaffected. |
| Chosen provider lacks a needed field or a free tier | Adapter or provider change; possible FR-018 or FR-023 gaps | Adapter boundary and the optional-field model absorb this. Provider criteria are listed in 6.1. |
| API key forced into client code | Key disclosure (NFR-006) | Use a keyless provider or a proxy (6.2). |
| Ambiguous city names show the wrong city | Wrong weather shown (FR-003 undermined) | Candidate list (ODD-1) and always show the city and country. |
| `localStorage` cleared or blocked | Favorites lost | Accepted by FR-037; in-memory fallback and notice (ODD-8). |
| Time zone mismatch between forecast dates and the user's day | Confusing dates | Dates in location's local time zone (ODD-3) and clear labeling. |
| Race between overlapping requests (weather, search or device location) | Wrong city displayed | Shared `selectionToken` in C2 applied to C4, C5 and C6 results (Section 4.2). |
| Partial refresh failure shows fresh time beside stale data | Misleading freshness | Per-section `updatedAt`; "Last updated" is the older time (Section 4.6). |
| Device-location favorite exposes a precise position | Privacy | Raw device coordinates never stored; only a resolved named place is saved (Section 4.7). |

### 8.4 Constraints
- The requirements are approved, but OQ-001 to OQ-014 are open. Nothing here may be read as an answer to them.
- No existing code or technology constrains the design.
- This document does not contain an implementation plan, code, or test design.

### 8.5 Items requiring clarification before implementation planning
The user should at minimum answer OQ-001 (platform), OQ-002 (provider and key), OQ-003 (unit), OQ-004 (forecast shape), and OQ-005 (persistence), because they determine which adapters are built. The remaining OQs can be accepted at the recommended defaults in 8.2 if the user is content.

**Values deferred to planning (F-013):** breakpoints, viewport range, `maxInputLength`, icon set and licence, and the final NFR-004 numbers after a provider latency check. The Planner must record each chosen value in the implementation plan.

---

## 9. Review and Approval Status

- Requirements approval: verified from `requirements.md` Section 10 (user message "approve", dated 2026-10-26, recorded by the main session) and from the task statement that invoked this work. The Architect cannot independently confirm the original chat message.
- Design status: **Approved with Conditions**. The user approved Revision 2 on 2026-10-26 (own message "approve", in reply to the choice "re-review first, or approve the revised design now"), recorded by the main session. Revision 2 was not re-reviewed by the Design Reviewer; F-005 is unverified; OQ-001 to OQ-014 remain TBD.
- Consistency check: every FR-001 to FR-045 and NFR-001 to NFR-008 is mapped in Section 2 or listed as unresolved (FR-007, FR-012, FR-013, FR-017, FR-025, FR-031, FR-038, FR-039, NFR-002 to NFR-005, NFR-007, NFR-008 via ODD items).

---

## 10. Revision Log (Revision 2, against `design-review.md`)

| Finding | Resolution | Where |
|---------|------------|-------|
| F-001 | Changed: launch auto-detects only when permission is already granted; otherwise a prominent "Use my location" control and hint, no prompt on first paint. Recorded in 4.2. Still needs user confirmation (OQ-009). | 4.2, ODD-5 |
| F-002 | Changed: single `fetchedAt` and old ASM-2 replaced by per-section `updatedAt`; displayed time is the older one; Flow C rewritten for partial and total failure. | 3, 4.6, 6.6, ASM-2 |
| F-003 | Changed: identity is place ID, else normalized name+region+country; no coordinate rounding; inconsistent fallback removed; limits stated. | 3, 4.7, ODD-7 |
| F-004 | Changed: raw device coordinates never persisted; device-location favorite only as a resolved named place; one-line data-use disclosure. Whether such favorites are allowed at all stays open (FR-039, OQ-009, OQ-012). | 4.7, 6.3, ODD-5, ODD-10 |
| F-005 | Not resolved: terms, attribution, limits, reverse geocoding and CORS are listed as items for the user to verify; nothing is claimed. Added the label fallback, the "not favoritable" rule and `attributionText`. | 5.1, 6.1, ODD-12 |
| F-006 | Partly changed: minimum proxy requirements added. Applies only to a keyed provider, which would need a revision and re-review. | 6.2 |
| F-007 | Changed: `selectionToken` in C2 applied to C4, C5 and C6 results, with cancellation. | 4.2, 4.5, 4.6, 6.5 |
| F-008 | Recommendation added (200 ms loading state; both sections within 3 s for 90% of requests; 10 s timeout). Unconfirmed and not measured against any provider; NFR-004 stays TBD. | 7, ODD-4 |
| F-009 | Changed: adapter returns `prompt` when the permission query is unsupported; auto-detect requires a positive `granted`. | 5.3 |
| F-010 | Changed: HTTPS required for hosting and for geolocation. | 1.1 |
| F-011 | Changed: "C5-ports" label fixed, C1 trace list extended, C5 outcomes aligned with the port contract and error codes. | 2, 4.1, 4.5 |
| F-012 | Changed: timezone fallback defined. | 3 |
| F-013 | Deferred to planning by design; the Planner must record the values. | 8.5 |
| F-014 | Changed: logging and telemetry stated as out of scope. | 7 |

Not changed: `requirements.md` and `design-review.md` were not modified. Update (2026-10-26): the user skipped the Design Reviewer re-review of this revision and approved it with conditions (Section 9): Revision 2 was not re-reviewed, F-005 provider terms are unverified, and OQ-001 to OQ-014 remain TBD with the recommended defaults standing.
