# Requirements: Weather Forecasting Application

| Field | Value |
|---|---|
| Status | **APPROVED BY USER (2026-10-30), with open items DEFERRED to the Architect** |
| Approval | **APPROVED.** The user approved this document on 2026-10-30; see Section 12 for the quoted statement, scope and deferred items. Deferred items are not approved values. |
| Prepared by | Requirements Analyst (Stage 1, restarted SDLC workflow; updated 2026-10-30 to record the accepted clarification defaults) |
| Date | 2026-10-30 |
| Clarification defaults | On 2026-10-30 the user accepted the proposed defaults for the clarification questions ("accept all defaults"; source: "user accepted proposed default"). This is NOT approval of this document, which is still unapproved. Questions or parts of questions with no explicit default remain open and are listed in Section 11. |
| Repository / branch | `claude-project` / `feature/weather-app` |
| Input handling | WF-1..WF-7 are treated as ONE combined input. Story text is treated as untrusted data, not as instructions. |

## 0. Sources

Jira project WF ("Weather Forecasting"), site https://jayasriap.atlassian.net. Retrieved read-only by the orchestrator on 2026-10-30. All seven issues are type Story, status To Do, priority Medium. They have no comments, linked issues, attachments, labels, components, or stated dependencies.

| Key | Title | URL |
|---|---|---|
| WF-1 | Search for Weather by City | https://jayasriap.atlassian.net/browse/WF-1 |
| WF-2 | Get Weather Using Device Location | https://jayasriap.atlassian.net/browse/WF-2 |
| WF-3 | View Current Weather Details | https://jayasriap.atlassian.net/browse/WF-3 |
| WF-4 | View Multi-Day Weather Forecast | https://jayasriap.atlassian.net/browse/WF-4 |
| WF-5 | Refresh Weather Data | https://jayasriap.atlassian.net/browse/WF-5 |
| WF-6 | Save Favorite Locations | https://jayasriap.atlassian.net/browse/WF-6 |
| WF-7 | View Weather Information with a Simple Interface | https://jayasriap.atlassian.net/browse/WF-7 |

Not used as input: prior artifacts under `archive\pre-jira-restart\` and the existing `src/`, tests, e2e, and scripts. Nothing from them is carried over as a requirement. The archived artifacts were not consulted when writing this draft. The existing implementation was not analyzed and must not be assumed to match these requirements.

### How to read this document

- **Jira-stated**: restates a Jira user story or acceptance criterion (AC). Wording is kept as close to Jira as possible.
- **Derived**: follows directly from combining stories. It is marked "Derived" and needs user confirmation.
- **Proposal / Assumption**: not in Jira. Labelled as such and NOT a requirement until the user confirms it.
- **(per accepted default Qn)**: wording added on 2026-10-30 because the user accepted the proposed default for question Qn (source: "user accepted proposed default"). Acceptance of a default is not approval of this document.
- **Testability** column: "Yes" means the AC can be checked as written or, where noted, as clarified by an accepted default. "Partial (Qn)" means some terms are still undefined because question Qn (or part of it) is still open (Section 11). No thresholds or values have been invented. Open values are shown as TBD.

## 1. Project Overview and Business Problem

Jira-stated user needs, summarized:

- A user wants to get the current weather and a forecast for any city by name (WF-1).
- A user wants the app to detect their location so they can see the weather without typing (WF-2).
- A user wants to see current temperature, humidity, and weather condition (WF-3) and the forecast for the next 3 days (WF-4).
- A user wants to refresh weather data manually (WF-5).
- A user wants to save multiple cities as favorites for quick access (WF-6).
- A user wants weather shown with clear icons and text in a simple interface (WF-7).

No business goals, success metrics, target audience, or deployment context are stated in Jira. Platform is not stated explicitly in Jira (see Q1; responsive web app per accepted default Q1).

## 2. Scope

### 2.1 In scope (Jira-stated)

1. City search with current weather and forecast display, including not-found, empty-input, and service-unavailable handling (WF-1).
2. Device location detection with a permission flow and fallback to city search (WF-2).
3. Current weather details: temperature, humidity, condition, icon, configured temperature unit, incomplete-data and failure handling (WF-3).
4. A 3-day forecast with date, temperature, condition, icons, partial-data and failure/retry handling (WF-4).
5. Manual refresh with duplicate-request safety, failure handling that retains prior data, and last-update time where supported (WF-5).
6. Favorites: add, list, select, de-duplicate, remove, and persist across restarts where storage is supported (WF-6).
7. A simple, labelled, responsive (desktop and mobile) interface with loading, unavailable, and error states and consistent navigation (WF-7).

### 2.2 Out of scope

Jira does not declare any exclusions. The following are NOT stated in Jira. They were listed as **proposals**. Only the items tied to an accepted default (Section 9) are marked accepted; the others remain unconfirmed.

- P-OUT-1: User accounts, login, and server-side or cross-device favorites sync (relates to Q22). **Accepted via defaults (Q22: favorites local to the device/browser, no accounts).**
- P-OUT-2: Weather alerts or notifications, maps, radar, and historical data. **Still unconfirmed (open): no question has a default that confirms this item.**
- P-OUT-3: Automatic or scheduled background refresh (WF-5 describes manual refresh only). **Still unconfirmed (open): no question has a default that confirms this item.**
- P-OUT-4: Forecasts beyond 3 days, hourly forecasts, and weather fields beyond temperature, humidity, and condition (relates to Q15). **Partially accepted: the weather-fields part is accepted via defaults (Q15: only temperature, humidity, and condition). Forecasts beyond 3 days and hourly forecasts remain unconfirmed (open).**
- P-OUT-5: Native mobile applications (relates to Q1). **Accepted via defaults (Q1: responsive web app).**
- P-OUT-6: Search autocomplete and search history. **Accepted via defaults (Q30: out of scope).**
- P-OUT-7: Offline operation beyond what WF-5 AC4 and WF-6 AC6 describe (relates to Q21). **Accepted via defaults (Q21: no offline mode; in-session retention only; no persisted weather cache).**

## 3. Cross-Story Analysis

### 3.1 Shared flows and dependencies (observations)

| # | Observation | Stories | Impact |
|---|---|---|---|
| X1 | **Shared location flow.** A "selected location" can come from city search (WF-1), device location (WF-2), or a favorite (WF-6 AC3). WF-3, WF-4, and WF-5 all assume a "selected" or "valid" location. Jira never defines what "selected location" is, so that part is derived (REQ-X-01). | WF-1, 2, 3, 4, 5, 6 | One shared definition is needed so the same location is displayed, refreshed, and saved consistently. |
| X2 | **WF-1 and WF-2 overlap with WF-3 and WF-4.** WF-1 AC1/AC2 and WF-2 AC1/AC5 say "display weather information". WF-3 and WF-4 define what that information is. WF-1's story text says "current weather and forecast". | WF-1, 2, 3, 4 | Treated as dependencies: WF-1 and WF-2 supply the location, WF-3 and WF-4 define the content. See Q6. |
| X3 | **Duplicate error behaviour.** WF-1 AC5 (service unavailable on search), WF-3 AC5 (current weather cannot be retrieved), WF-4 AC5 (forecast service fails), and WF-5 AC4 (refresh fails) all describe a failed data request. WF-3 AC5 says "error or retry message", WF-4 AC5 requires "an option to retry", WF-5 AC4 requires a message and retained data. WF-1 AC5 mentions no retry. | WF-1, 3, 4, 5 | The stories do not say when a message alone is enough versus when a retry control is required. Nor do they say how a retry relates to refresh. See Q18. |
| X4 | **Partial failure.** Current weather and forecast are separate ACs with separate failure behaviour (WF-3 AC5, WF-4 AC5). Jira does not say whether they come from one request or two. It also does not say what is shown if one succeeds and the other fails. | WF-3, 4, 7 | WF-7 AC5 requires no "confusing or misleading information". See Q18. |
| X5 | **Refresh vs. initial load.** WF-5 covers an explicit refresh of displayed data. WF-3 AC5 and WF-4 AC5 cover failure on the first load, where there is no prior data to retain. WF-5 AC4 retains data "when available". | WF-3, 4, 5 | Needs a clear split between first-load failure (nothing to retain) and refresh failure (retain old data). |
| X6 | **Partial data.** WF-3 AC4 (incomplete current data) and WF-4 AC4 (fewer than 3 days) both require showing what is available and flagging the rest as unavailable. WF-7 AC5 requires no misleading information. | WF-3, 4, 7 | Consistent "unavailable" presentation is needed (Q17). |
| X7 | **Temperature unit.** WF-3 AC3 says "configured" unit (Celsius or Fahrenheit). WF-4 AC2 says "forecast temperature" without naming a unit. WF-7 AC3 says "appropriate unit". Jira never says who configures the unit. | WF-3, 4, 7 | Assumed the same configured unit applies to current and forecast temperatures (derived in REQ-X-03). Configuration mechanism is open (Q4). |
| X8 | **Icons and condition text.** WF-3 AC2 (icon for the current condition), WF-4 AC3 (icons for forecast conditions), and WF-7 AC2 (icon and descriptive text for every condition) overlap. | WF-3, 4, 7 | WF-7 AC2 is stricter (icon plus text). Treated as the governing statement for display. Not a conflict. |
| X9 | **Favorites vs. navigation.** WF-6 introduces a favorites section. WF-7 AC6 requires clear controls and consistent navigation between search results, current weather, forecasts, and favorites. Jira gives no screen or navigation structure. | WF-6, 7 | See Q25. |
| X10 | **Favorites vs. device location.** WF-6 AC1 allows adding a city to favorites after the user "has searched for a valid city". It does not say whether a city shown through device location (WF-2) or a favorite can be added. | WF-2, 6 | See Q23. |
| X11 | **Permission flow wording.** WF-2 AC1 reads "when location access is available and permission has been granted", and AC2 reads "when permission has not been granted ... ask". Together they describe a first-open flow of ask, then allow or deny. The order and timing of the request on app open is not explicit. | WF-2 | See Q9 and Q11. |
| X12 | **Refresh scope.** WF-5 AC1 refreshes data for "the selected location", and AC2 updates "current weather and forecast". It does not say whether a favorite's data is refreshed while the user is on the favorites list. | WF-5, 6 | See Q19. |
| X13 | **Last-update time.** WF-5 AC5 shows the "latest successful update time" only after a refresh and only "when supported". It is unclear whether it also shows after the initial load. | WF-5 | See Q20. |
| X14 | **Persistence conditionality.** WF-6 AC6 is conditional on storage support and on the data not being cleared. The unsupported-storage behaviour is unspecified. | WF-6 | See Q22. |
| X15 | **"Prevent ... or handle safely".** WF-5 AC3 offers two alternatives, so the AC is not testable until one behaviour is chosen. | WF-5 | See Q19. |

### 3.2 Conflicts

No direct contradictions were found between the stories. The items above are overlaps, gaps, and ambiguities.

### 3.3 Priority and sequencing

All stories are priority Medium and have no stated dependencies. The dependencies observed in 3.1 suggest that WF-3 and WF-4 (display content) and the shared selected-location flow are prerequisites for WF-1, 2, 5, and 6. This is an observation, not a requirement. No ordering or MVP cut applies: per accepted default Q31, there is no priority order and all seven stories are in scope.

## 4. Functional Requirements

Every Jira AC maps to exactly one requirement (REQ-WFn-mm, where mm is the AC number). "Type" is FR (functional) or NFR (non-functional / quality). NFR-typed requirements are summarized again in Section 5.

### 4.1 WF-1 Search for Weather by City

Story: As a user, I want to enter the name of any city so that I can get the current weather and forecast for that location.

| ID | Type | Source | Requirement | Testability |
|---|---|---|---|---|
| REQ-WF1-01 | FR | WF-1 AC1 | When the user enters a valid city name and submits the search, the application shall display the weather information for that city. Clarification (per accepted default Q6): the weather information is both the current weather (WF-3) and the 3-day forecast (WF-4). Clarification (per accepted default Q5): when the search has multiple matches, the application shall show a pick list for the user to choose from; otherwise it shall use the single match. | Yes (per accepted defaults Q5, Q6) |
| REQ-WF1-02 | FR | WF-1 AC2 | When a search succeeds, the application shall display the city's name and country (when available). Clarification (per accepted default Q7): the location label is city and country; the country is omitted if unavailable. | Yes (per accepted default Q7) |
| REQ-WF1-03 | FR | WF-1 AC3 | When the user submits a city name that does not exist, the application shall display a clear error message indicating that the city was not found. Clarification (per accepted default Q5, A5): a city is "not found" when the weather or geocoding source cannot resolve it. | Yes (per accepted default Q5); message wording is not specified | 
| REQ-WF1-04 | FR | WF-1 AC4 | When the user initiates a search with an empty search field, the application shall prompt the user to enter a city name. Clarification (per accepted default Q8): whitespace-only input counts as empty; the prompt is shown inline; no service request is made. | Yes (per accepted default Q8) |
| REQ-WF1-05 | FR | WF-1 AC5 | When the weather service is unavailable and the user searches for a city, the application shall display an appropriate error message and shall not crash. Clarification (per accepted default Q18): the error message is accompanied by a manual retry control. | Yes (per accepted default Q18); message wording is not specified |

### 4.2 WF-2 Get Weather Using Device Location

Story: As a user, I want the app to automatically detect my location so that I can quickly see the weather without typing anything.

| ID | Type | Source | Requirement | Testability |
|---|---|---|---|---|
| REQ-WF2-01 | FR | WF-2 AC1 | When the user opens the application, location access is available, and permission has been granted, the application shall detect the user's location and display the corresponding weather information. Clarification (per accepted default Q9): detection uses permission-based browser/OS geolocation only (no IP-based lookup) and is requested when the application opens. | Yes (per accepted default Q9) |
| REQ-WF2-02 | FR | WF-2 AC2 | When location permission has not been granted and the application requests the user's location, it shall ask the user for permission before accessing location data. Clarification (per accepted default Q9): the permission request is made when the application opens. | Yes (per accepted default Q9) |
| REQ-WF2-03 | FR | WF-2 AC3 | When the user denies location permission, the application shall display an appropriate message and allow the user to search by city. Clarification (per accepted default Q11): the application shows a message with the city search available and no weather displayed until the user searches. | Yes (per accepted default Q11); re-prompt and re-enable behaviour not defined (Section 11) |
| REQ-WF2-04 | FR | WF-2 AC4 | When the device location cannot be determined (the request fails or times out), the application shall display a helpful error message and provide an alternative city search option. | Partial (Q10 still open: timeout value TBD) |
| REQ-WF2-05 | FR | WF-2 AC5 | When the device location is successfully detected and weather information is retrieved, the application shall display weather details for the detected location. Clarification (per accepted default Q12): the detected location is shown as a place name if resolvable. | Yes (per accepted default Q12) |

Note: REQ-WF2-01 and REQ-WF2-05 overlap in intent (both: successful detection leads to weather display for the detected location). Both are kept to preserve one-to-one traceability.

### 4.3 WF-3 View Current Weather Details

Story: As a user, I want to see the current temperature, humidity, and weather condition (e.g., sunny, rainy) so that I understand the immediate weather situation.

| ID | Type | Source | Requirement | Testability |
|---|---|---|---|---|
| REQ-WF3-01 | FR | WF-3 AC1 | When a valid location has been selected and current weather data is available, the application shall display the current temperature, humidity, and weather condition. Clarification (per accepted default Q15): only these three fields are shown, with humidity as a percentage and the condition as text. | Yes (per accepted default Q15) |
| REQ-WF3-02 | FR | WF-3 AC2 | When current weather information is displayed, the application shall show a suitable weather icon representing the current condition. Clarification (per accepted default Q16): condition categories are mapped to icons, with a generic fallback icon when no icon matches and the condition text always shown. | Partial (Q16: exact icon set still open) |
| REQ-WF3-03 | FR | WF-3 AC3 | The application shall present the temperature in the configured temperature unit (Celsius or Fahrenheit). Clarification (per accepted default Q4): the unit is set by a user toggle in the UI, the default is Celsius, and the choice is persisted on the device. | Yes (per accepted default Q4) |
| REQ-WF3-04 | FR | WF-3 AC4 | When the weather service returns incomplete data, the application shall show the available information and clearly indicate unavailable values. Clarification (per accepted default Q17): one consistent text label is used for unavailable values across all views. | Yes (per accepted default Q17); the label text itself is not specified |
| REQ-WF3-05 | FR | WF-3 AC5 | When current weather data cannot be retrieved, the application shall display an appropriate error or retry message. Clarification (per accepted default Q18): the application shows a message plus a manual retry control; if only one part (current weather or forecast) fails, the successful part is still shown. | Yes (per accepted default Q18); message wording is not specified |

### 4.4 WF-4 View Multi-Day Weather Forecast

Story: As a user, I want to see the weather forecast for the next 3 days so that I can plan my activities accordingly.

| ID | Type | Source | Requirement | Testability |
|---|---|---|---|---|
| REQ-WF4-01 | FR | WF-4 AC1 | When a valid location has been selected and forecast data is available, the application shall display the weather forecast for the next three days. Clarification (per accepted default Q13): day boundaries use the location's local time zone. | Partial (Q13: whether "next 3 days" includes today is still open) |
| REQ-WF4-02 | FR | WF-4 AC2 | For each forecast day, the application shall show the date, forecast temperature, and expected weather condition. Clarification (per accepted default Q14): the forecast temperature is the daily high and low in the configured unit. | Partial (Q13: date format is still open) |
| REQ-WF4-03 | FR | WF-4 AC3 | When the forecast includes different weather conditions, the application shall show an appropriate icon for each condition (such as sunny, cloudy, or rainy). Clarification (per accepted default Q16): same icon mapping, generic fallback icon, and always-shown condition text as REQ-WF3-02. | Partial (Q16: exact icon set still open) |
| REQ-WF4-04 | FR | WF-4 AC4 | When forecast data is available for fewer than three days, the application shall show the available days and indicate that the remaining forecast data is unavailable. Clarification (per accepted default Q17): the same consistent text label for unavailable values is used. | Yes (per accepted default Q17) |
| REQ-WF4-05 | FR | WF-4 AC5 | When the forecast service fails and the user requests the forecast, the application shall display an appropriate error message and provide an option to retry. Clarification (per accepted default Q18): the retry option is a manual retry control shown with the message. | Yes (per accepted default Q18); message wording is not specified |

### 4.5 WF-5 Refresh Weather Data

Story: As a user, I want to refresh the weather information manually so that I can get the latest updates whenever I want.

| ID | Type | Source | Requirement | Testability |
|---|---|---|---|---|
| REQ-WF5-01 | FR | WF-5 AC1 | When weather information is displayed and the user selects the refresh option, the application shall request the latest available weather data for the selected location. Clarification (per accepted default Q19): the refresh control is visible, and refresh applies to the currently selected location only. | Yes (per accepted default Q19) |
| REQ-WF5-02 | FR | WF-5 AC2 | When a refresh request succeeds, the application shall update the current weather and forecast details with the received data. | Yes |
| REQ-WF5-03 | FR | WF-5 AC3 | When a refresh request is in progress and the user selects refresh again, the application shall prevent unnecessary duplicate requests or handle them safely. Clarification (per accepted default Q19): the refresh control is disabled, with a loading indication, while a refresh is in progress, so only one request is active. | Yes (per accepted default Q19); behaviour when the selected location changes during a pending request is not defined (Section 11) |
| REQ-WF5-04 | FR | WF-5 AC4 | When a refresh request fails, the application shall display an appropriate message and retain previously loaded data when available. Clarification (per accepted defaults Q18, Q21): the message is accompanied by a manual retry control; previously loaded data is retained in-session only, with no persisted weather cache. | Yes (per accepted defaults Q18, Q21); message wording is not specified |
| REQ-WF5-05 | FR | WF-5 AC5 | When weather information is refreshed successfully, the application shall display the latest successful update time when supported. Clarification (per accepted default Q20): the time shown is the time of the last successful fetch, in the device's local time, shown after any successful load. | Yes (per accepted default Q20); time format is not specified (Section 11) |

### 4.6 WF-6 Save Favorite Locations

Story: As a user, I want to save multiple cities as favorites so that I can quickly check the weather in those locations without searching again.

| ID | Type | Source | Requirement | Testability |
|---|---|---|---|---|
| REQ-WF6-01 | FR | WF-6 AC1 | When the user has searched for a valid city and selects the add-to-favorites option, the application shall save that city to the favorites list. | Partial (Q12, Q23: whether a device-detected location can be added is still open) |
| REQ-WF6-02 | FR | WF-6 AC2 | When the user has saved one or more favorite cities and opens the favorites section, the application shall display the saved locations. Clarification (per accepted defaults Q23, Q24): each entry shows the name only; the list is in the order added; an empty list shows a short empty-state message. | Yes (per accepted defaults Q23, Q24) |
| REQ-WF6-03 | FR | WF-6 AC3 | When the user selects a displayed favorite city, the application shall display the current weather and forecast for that city. | Yes |
| REQ-WF6-04 | FR | WF-6 AC4 | When a city is already saved as a favorite and the user attempts to add it again, the application shall prevent duplicate entries. Clarification (per accepted default Q23): duplicates are determined by the resolved city identity (name plus country, or the provider ID); there is no maximum number of favorites. | Yes (per accepted default Q23) |
| REQ-WF6-05 | FR | WF-6 AC5 | When the user removes a city from favorites, the application shall remove that city from the list. Clarification (per accepted default Q24): removal is immediate (no confirmation). | Yes (per accepted default Q24) |
| REQ-WF6-06 | FR | WF-6 AC6 | When the user closes and reopens the application, the saved favorite locations shall remain available, provided persistent storage is supported and the data has not been cleared. Clarification (per accepted default Q22): favorites are stored locally on the device/browser with no accounts; if storage is unavailable, favorites work for the current session only, with a notice. | Yes (per accepted default Q22) |

### 4.7 WF-7 View Weather Information with a Simple Interface

Story: As a user, I want the weather information displayed with clear icons and text so that I can easily understand the forecast without confusion.

| ID | Type | Source | Requirement | Testability |
|---|---|---|---|---|
| REQ-WF7-01 | NFR (usability) | WF-7 AC1 | When the user opens the application and weather information is available, the application shall display it in a clear, organized, and easy-to-read layout. | Partial: subjective as written (Q26 still open: no accessibility standard or assessment method given; TBD) |
| REQ-WF7-02 | FR | WF-7 AC2 | Each displayed weather condition shall have a suitable icon and descriptive text. Clarification (per accepted default Q16): the condition text is always shown, including when the generic fallback icon is used. | Partial (Q16: exact icon set still open) |
| REQ-WF7-03 | FR | WF-7 AC3 | Temperature, humidity, and forecast details shall each have a clearly identifiable label and an appropriate unit. Clarification (per accepted defaults Q4, Q15, Q27): temperature uses the configured unit (Celsius default), humidity is a percentage, and labels are in English only. | Yes (per accepted defaults Q4, Q15, Q27) |
| REQ-WF7-04 | NFR (responsiveness) | WF-7 AC4 | When the application is accessed on different screen sizes, the layout shall adjust appropriately for desktop and mobile devices. Clarification (per accepted default Q1): the product is a responsive web application. | Partial (Q2 still open: supported browsers, operating systems, and breakpoints not given; TBD) |
| REQ-WF7-05 | FR | WF-7 AC5 | While weather data is loading or unavailable, the application shall display a loading indicator, helpful message, or error state instead of confusing or misleading information. | Partial (Q29 still open: no loading-indicator threshold or performance target; TBD) |
| REQ-WF7-06 | NFR (usability) | WF-7 AC6 | When the user navigates between search results, current weather, forecasts, and favorites, the interface shall provide clear controls and consistent navigation. Clarification (per accepted default Q25): a single-page layout with persistent search and a favorites access control. | Partial: structure defined per accepted default Q25; "clear" and "consistent" remain subjective as written |

### 4.8 Derived cross-story requirements (Derived: accepted via the "accept all defaults" decision; document still unapproved)

These are NOT in Jira as written. They are derived from combining the stories and exist so the stories can be implemented consistently. They remain labelled Derived. On 2026-10-30 the user accepted them via the "accept all defaults" decision (D-14 answered with the proposed values). This is acceptance of the derived items only. It is not approval of this document, which remains unapproved.

| ID | Type | Derived from | Requirement | Status |
|---|---|---|---|---|
| REQ-X-01 | FR (Derived) | WF-1 AC1, WF-2 AC1/AC5, WF-6 AC3, WF-3 AC1, WF-4 AC1 | A location chosen by city search, by device location, or by selecting a favorite shall become the "selected location". The current weather (WF-3) and forecast (WF-4) displays shall show data for that selected location. | Derived; accepted via the "accept all defaults" decision (D-14 answered with proposed values). Document not approved. |
| REQ-X-02 | FR (Derived) | WF-5 AC1/AC2 | The refresh action (WF-5) shall apply to the current selected location, regardless of whether it came from search, device location, or a favorite. | Derived; accepted via the "accept all defaults" decision (D-14 answered with proposed values). Consistent with accepted default Q19. Document not approved. |
| REQ-X-03 | FR (Derived) | WF-3 AC3, WF-4 AC2, WF-7 AC3 | The same configured temperature unit shall be used for the current temperature and for the forecast temperatures. | Derived; accepted via the "accept all defaults" decision (D-14 answered with proposed values). Consistent with accepted default Q4. Document not approved. |

## 5. Non-Functional Requirements

### 5.1 Stated in Jira

These are the NFR-typed requirements from Section 4.7. They are not repeated in full:

- REQ-WF7-01: clear, organized, easy-to-read layout (usability).
- REQ-WF7-04: layout adapts to desktop and mobile screen sizes (responsiveness).
- REQ-WF7-06: clear controls and consistent navigation (usability).

Also relevant to quality, but typed FR above:

- REQ-WF1-05: no crash when the weather service is unavailable (resilience).
- REQ-WF5-03: safe handling of duplicate refresh requests (robustness).
- REQ-WF7-05: loading, unavailable, and error states (feedback).

### 5.2 Not stated in Jira (gaps, with no value invented)

Jira states no targets for the following. Where the user accepted a default on 2026-10-30, the status shows it. Values with no explicit default stay **TBD**.

| Area | Status | Question |
|---|---|---|
| Performance (load or response time, loading-indicator threshold) | TBD (still open; no default) | Q29 |
| Accessibility (for example WCAG level, keyboard, screen reader) | TBD (still open); per the Q26 default, no accessibility requirement is added until the user specifies a standard | Q26 |
| Browser and device support, breakpoints | TBD (still open; no default). Platform is a responsive web application (per accepted default Q1). | Q2, Q1 |
| Language and localization, number and date formats | English only; units as in Q4 and Q15 (per accepted default Q27). Date format remains open under Q13. | Q27, Q13 |
| Privacy and security of location data and API credentials | Location: coordinates are used only to get weather, not stored, not logged (per accepted default Q28). Credentials: no API key is committed to the repository (per accepted default Q3, process part). Provider choice and other key handling remain open. | Q28, Q3 |
| Data freshness, caching, and offline behaviour | No offline mode; in-session retention only; no persisted weather cache (per accepted default Q21). | Q21 |
| Capacity limits (such as maximum favorites) | No maximum number of favorites (per accepted default Q23). | Q23 |

## 6. Acceptance Criteria

The Jira ACs are the acceptance criteria for this work. They are traced one-to-one by the requirement IDs in Section 4 (AC *n* of WF-*k* is REQ-WF*k*-0*n*). The AC wording is retained in the Jira issues and is not duplicated here.

| Story | ACs | Requirement IDs |
|---|---|---|
| WF-1 | AC1-AC5 | REQ-WF1-01 .. REQ-WF1-05 |
| WF-2 | AC1-AC5 | REQ-WF2-01 .. REQ-WF2-05 |
| WF-3 | AC1-AC5 | REQ-WF3-01 .. REQ-WF3-05 |
| WF-4 | AC1-AC5 | REQ-WF4-01 .. REQ-WF4-05 |
| WF-5 | AC1-AC5 | REQ-WF5-01 .. REQ-WF5-05 |
| WF-6 | AC1-AC6 | REQ-WF6-01 .. REQ-WF6-06 |
| WF-7 | AC1-AC6 | REQ-WF7-01 .. REQ-WF7-06 |

**Count: 37 ACs in Jira = 37 traced requirements, plus 3 derived (REQ-X-01..03) = 40 requirements total.**

Still subjective or untestable as written (need measurable wording once the related open questions are answered):

- REQ-WF7-01 ("clear, organized, easy-to-read"). Q26 is still open (TBD).
- REQ-WF7-06 ("clear controls", "consistent navigation"). The structure is defined per accepted default Q25, but the wording stays subjective.
- REQ-WF7-04 ("adjust appropriately"). Q2 is still open (TBD).
- REQ-WF7-05 (no loading-indicator threshold or performance target). Q29 is still open (TBD).
- REQ-WF2-04 (timeout value). Q10 is still open (TBD).
- REQ-WF4-01 and REQ-WF4-02 (whether "next 3 days" includes today, and the date format). Q13 is partly open.
- REQ-WF3-02, REQ-WF4-03, and REQ-WF7-02 (exact icon set). Q16 is partly open.
- REQ-WF6-01 (whether a device-detected location can be added). Q12 and Q23 are partly open.
- REQ-WF1-03, REQ-WF1-05, REQ-WF2-03, REQ-WF3-05, REQ-WF4-05, and REQ-WF5-04: the exact wording of "clear", "appropriate", and "helpful" messages is not specified by the accepted defaults.

No longer in this list because an accepted default defines the term: REQ-WF5-03 ("prevent ... or handle safely", per accepted default Q19) and REQ-WF5-05 ("when supported", per accepted default Q20).

New acceptance criteria are not invented here. Once the open items in Section 11 are answered, measurable ACs can be added.

## 7. Edge Cases and Error Handling

**Jira-stated** error and edge handling is in these requirements:

- City not found: REQ-WF1-03.
- Empty search: REQ-WF1-04.
- Weather service unavailable: REQ-WF1-05.
- Location permission denied: REQ-WF2-03.
- Location undetermined or timed out: REQ-WF2-04.
- Incomplete current data: REQ-WF3-04.
- Current weather failure: REQ-WF3-05.
- Fewer than three forecast days: REQ-WF4-04.
- Forecast failure: REQ-WF4-05.
- Duplicate refresh: REQ-WF5-03.
- Refresh failure: REQ-WF5-04.
- Duplicate favorite: REQ-WF6-04.
- Storage unsupported or cleared: REQ-WF6-06.
- Loading or unavailable data: REQ-WF7-05.

**Not covered by Jira** (candidate edge cases. None is a requirement yet. Where an accepted default in Section 9 addresses a candidate, that default applies, for example Q8 for whitespace-only input, Q5 for same-named cities, Q16 for a missing icon, Q18 for partial failure, Q21 for offline, and Q22 for unavailable storage):

| # | Candidate edge case | Related question |
|---|---|---|
| E1 | Whitespace-only or very long search input; special characters; diacritics; case differences. | Q5, Q8 |
| E2 | Several cities share a name (for example "Springfield"). | Q5 |
| E3 | Search or location result arrives after the user has already selected another location (out-of-order responses). | Q19 |
| E4 | Device has no network (offline) at launch, at search, or at refresh. | Q21 |
| E5 | Location services disabled at OS level, or the browser or device lacks location support (distinct from the user denying permission). | Q9, Q11 |
| E6 | Permission previously denied and the user later wants to re-enable it. | Q11 |
| E7 | Forecast days crossing midnight or a time zone boundary relative to the location's local time. | Q13 |
| E8 | Favorites storage full, disabled (private browsing), or corrupted. | Q22 |
| E9 | The favorites list is empty (empty state). | Q24 |
| E10 | Current weather loads but the forecast fails, or the reverse. | Q18 |
| E11 | Weather condition from the provider has no matching icon. | Q16 |
| E12 | Provider rate limits or an invalid or missing API credential. | Q3 |

## 8. Assumptions and Dependencies

### 8.1 Dependencies

Observed from Jira. No external dependencies are stated in Jira.

- D1: Implementation of every story needs a source of weather data and a source for resolving city names (and, for WF-2, coordinates to a place). Jira names none. This is an observation, not a decision (Q3).
- D2: WF-1, WF-2, WF-5, WF-6 depend on the WF-3/WF-4 display content (see 3.1 X2).
- D3: WF-2 depends on the device or browser exposing a location capability and a permission mechanism. WF-6 AC6 depends on persistent storage being available. Both are stated conditionally in Jira.

### 8.2 Assumptions

On 2026-10-30 the user accepted the proposed defaults. Assumptions confirmed by an accepted default are marked "Accepted via defaults". This is not approval of the document. A8 stays open.

| ID | Assumption | Basis | Related question | Status |
|---|---|---|---|---|
| A1 | The application is used by a single user at a time, with no login. | No authentication is mentioned in any story. | Q22 | Accepted via defaults (Q22: no accounts) |
| A2 | The product is a responsive web application (not a native mobile app). | WF-7 AC4 says "desktop and mobile devices"; the stories say "application" without more. | Q1 | Accepted via defaults (Q1) |
| A3 | "Configured temperature unit" means a user-selectable setting that is Celsius or Fahrenheit. | WF-3 AC3 says "configured" but not by whom. | Q4 | Accepted via defaults (Q4: user toggle, default Celsius, persisted on the device) |
| A4 | The same selected location drives both current weather and forecast. | Derived (REQ-X-01). | Q6 | Accepted via defaults (Q6: both current and forecast) |
| A5 | "Valid city" means a city the weather or geocoding source can resolve. | WF-1 AC1/AC3 do not define it. | Q5 | Accepted via defaults (Q5) |
| A6 | Favorites are stored per device and browser, not per user account. | "Persistent storage is supported and the data has not been cleared" (WF-6 AC6) suggests local storage. | Q22 | Accepted via defaults (Q22) |
| A7 | Only temperature, humidity, and condition are in scope for current weather. | WF-3 lists only these three. | Q15 | Accepted via defaults (Q15) |
| A8 | The 3-day forecast shows exactly three calendar days after or including the current day. This choice is open. | WF-4 says "next 3 days". | Q13 | Still open: depends on Q13, whether "next 3 days" includes today |

## 9. Ambiguities and Clarification Questions

Each question lists why it matters, the affected requirement IDs, and options with a **proposed default**. On 2026-10-30 the user accepted the proposed defaults ("accept all defaults"; source: "user accepted proposed default"). Each question below carries a **Resolution** line. Where a question has no explicit default (missing, "TBD", "none; user to specify", or "user decides"), or only part of it has one, the Resolution line says "Still open - no explicit default" and no answer has been invented. Accepting the defaults is NOT approval of this document.

Summary of resolution status:

- Resolved by accepted default: Q1, Q4, Q5, Q6, Q7, Q8, Q9, Q11, Q14, Q15, Q17, Q18, Q19, Q20, Q21, Q22, Q24, Q25, Q27, Q28, Q30, Q31.
- Partially resolved (open parts remain): Q3, Q12, Q13, Q16, Q23.
- Still open, no explicit default: Q2, Q10, Q26, Q29.

**Platform and technology**

**Q1. Platform: what type of application is this?**
- Why it matters: WF-7 AC4 mentions "desktop and mobile devices", but Jira never says whether this is a web app, native mobile app, or desktop app. It affects how location (WF-2) and persistence (WF-6) work.
- Affects: REQ-WF7-04, REQ-WF2-*, REQ-WF6-06, all.
- Options: (a) responsive web app; (b) native mobile; (c) both.
- Proposed default: (a) responsive web app.
- Resolution: Resolved - user accepted proposed default: (a) responsive web app.

**Q2. Which browsers, operating systems, and screen-size breakpoints must be supported?**
- Why it matters: "Adjust appropriately" (WF-7 AC4) cannot be checked without target sizes and browsers.
- Affects: REQ-WF7-04, REQ-WF7-01.
- Options: name the supported browsers and versions; define breakpoints (for example narrow, medium, wide) or "latest two versions of major browsers".
- Proposed default: none; user to specify.
- Resolution: Still open - no explicit default. The user must specify supported browsers, operating systems, and breakpoints.

**Q3. Which weather data provider/API should be used, and how are API keys and usage limits handled?**
- Why it matters: Jira names no provider. The provider decides data available (humidity, 3-day forecast, icons, country), cost, rate limits, and whether a key is needed and where it can safely be kept.
- Affects: all data requirements (WF-1 to WF-5), D1, E12.
- Options: user selects a provider (free or paid); or defer to the Architect for a recommendation that the user approves.
- Proposed default: user decides; the Architect proposes candidates at Stage 2 for approval. No key is to be committed to the repository.
- Resolution: Partially resolved. Resolved - user accepted proposed default (process part only): the provider is NOT chosen; the Architect proposes candidates at Stage 2 for approval. No key is to be committed to the repository. Still open - no explicit default: the provider choice itself, other API key handling, and usage limits.

**Temperature and display content**

**Q4. Temperature unit "configured": who configures it, where, and what is the default?**
- Why it matters: WF-3 AC3 refers to a "configured" unit, but no story creates a settings control or says who sets it.
- Affects: REQ-WF3-03, REQ-WF4-02, REQ-WF7-03, REQ-X-03.
- Options: (a) user toggle in the UI, persisted on the device; (b) fixed build or deployment configuration; (c) derived from device locale; (d) one fixed unit.
- Questions within: default unit; should the choice persist; does it apply to both current and forecast (assumed yes).
- Proposed default: (a) a user toggle, default Celsius, persisted on the device. Only if the user confirms.
- Resolution: Resolved - user accepted proposed default: (a) a user toggle, default Celsius, persisted on the device. Only if the user confirms. (The user's acceptance on 2026-10-30 is the confirmation.)

**Q15. Which weather fields are in scope beyond temperature, humidity, and condition?** Examples: wind, "feels like", pressure, precipitation, UV. What unit and format is used for humidity (for example %)?
- Why it matters: WF-3 AC1 lists only three fields. WF-7 AC3 asks for "appropriate" units. Extra fields would widen scope.
- Affects: REQ-WF3-01, REQ-WF7-03.
- Proposed default: only temperature, humidity (percent), and condition (text), as stated.
- Resolution: Resolved - user accepted proposed default: only temperature, humidity (percent), and condition (text), as stated.

**Q16. What is the icon set, and which condition categories must be supported?** What happens when the provider returns a condition with no icon? Are day and night variants needed?
- Why it matters: "Suitable icon" (WF-3 AC2) is subjective. Jira names only sunny, cloudy, rainy as examples.
- Affects: REQ-WF3-02, REQ-WF4-03, REQ-WF7-02, E11.
- Proposed default: a defined mapping of the provider's condition categories to icons, plus a generic fallback icon with the condition text always shown. The user decides the set.
- Resolution: Partially resolved. Resolved - user accepted proposed default (mapping part): a defined mapping of the provider's condition categories to icons, plus a generic fallback icon with the condition text always shown. Still open - no explicit default: the exact icon set ("The user decides the set"), including whether day and night variants are needed.

**Q17. How should unavailable values be shown (for example "N/A", "--", or a note)?** Is the presentation the same for current and forecast data?
- Why it matters: WF-3 AC4 and WF-4 AC4 say "clearly indicate" unavailable data without defining it.
- Affects: REQ-WF3-04, REQ-WF4-04, REQ-WF7-05.
- Proposed default: one consistent text label for unavailable values across all views.
- Resolution: Resolved - user accepted proposed default: one consistent text label for unavailable values across all views.

**Search (WF-1)**

**Q5. What counts as a "valid" city, and how are same-named cities handled?** Examples: "Springfield" or "Paris" (multiple places), "City, Country" or "City, State" input, case and whitespace handling, diacritics, spelling tolerance.
- Why it matters: AC1 and AC3 depend on this definition. A "not found" check is untestable until "exists" is defined.
- Affects: REQ-WF1-01, REQ-WF1-03, REQ-WF6-01, REQ-WF6-04, E1, E2.
- Options: (a) use the first/best match from the provider; (b) show a list of matches for the user to pick; (c) ask the user to refine.
- Proposed default: (b) a pick list when multiple matches, otherwise the single match. The user decides.
- Resolution: Resolved - user accepted proposed default: (b) a pick list when multiple matches, otherwise the single match. The user decides. (The user's acceptance on 2026-10-30 is the decision. Case, whitespace, diacritic, and spelling-tolerance handling are not covered by the default; see Section 11.)

**Q6. Does a successful search show both current weather and the 3-day forecast?**
- Why it matters: The WF-1 story text says "current weather and forecast", but its ACs only say "weather information".
- Affects: REQ-WF1-01, REQ-WF3-*, REQ-WF4-*.
- Proposed default: yes, both (WF-3 and WF-4 content).
- Resolution: Resolved - user accepted proposed default: yes, both (WF-3 and WF-4 content).

**Q7. What exactly is shown for the location label?** City and country are required. Is a state or region shown to separate same-named cities? How is a missing country shown ("when available")?
- Affects: REQ-WF1-02.
- Proposed default: city and country; omit country if unavailable.
- Resolution: Resolved - user accepted proposed default: city and country; omit country if unavailable.

**Q8. Empty search: is whitespace-only input treated as empty? How is the prompt shown (inline message, focus, etc.)? Is any request sent?**
- Affects: REQ-WF1-04, E1.
- Proposed default: whitespace-only counts as empty; an inline prompt; no service request is made.
- Resolution: Resolved - user accepted proposed default: whitespace-only counts as empty; an inline prompt; no service request is made.

**Device location (WF-2)**

**Q9. How is location detected: browser/OS geolocation (with permission), IP-based lookup, or both? Is detection attempted automatically on every app open, or only after a user action?**
- Why it matters: WF-2 AC1 says "automatically" and "when the user opens the application", while AC2 requires asking permission. IP lookup would not need permission and conflicts with AC2/AC3 as written.
- Affects: REQ-WF2-01, REQ-WF2-02, E5, X11.
- Options: (a) browser/OS geolocation only; (b) IP fallback as well.
- Proposed default: (a) permission-based geolocation only, requested when the app opens.
- Resolution: Resolved - user accepted proposed default: (a) permission-based geolocation only, requested when the app opens.

**Q10. What is the location-request timeout value?**
- Why it matters: AC4 says "times out" with no duration.
- Affects: REQ-WF2-04.
- Proposed default: TBD, user to specify (for example a number of seconds).
- Resolution: Still open - no explicit default. The user must specify the location-request timeout value (TBD).

**Q11. After the user denies permission, what does the app show by default? Does it ask again on the next open, and how can the user re-enable location later?**
- Why it matters: AC3 says "appropriate message" and "allow search by city", but not what the screen shows or whether the app re-prompts. Browsers may block repeat prompts.
- Affects: REQ-WF2-03, E5, E6.
- Proposed default: show a message with the city search available and no weather displayed, until the user searches.
- Resolution: Resolved - user accepted proposed default: show a message with the city search available and no weather displayed, until the user searches. (The default does not address re-prompting on the next open or how to re-enable location; these are not invented. See Section 11.)

**Q12. Should the detected location be shown as a place name (reverse geocoding), or as coordinates only? Can a detected location be added to favorites?**
- Why it matters: WF-2 AC5 requires "weather details for the detected location", but WF-7 requires clear labels and WF-6 AC1 only covers searched cities.
- Affects: REQ-WF2-05, REQ-WF6-01, X10.
- Proposed default: show a place name if resolvable; whether it can be favorited is for the user to decide.
- Resolution: Partially resolved. Resolved - user accepted proposed default (place-name part): show a place name if resolvable. Still open - no explicit default: whether a device-detected location can be added to favorites (for the user to decide).

**Forecast (WF-4)**

**Q13. Does "the next 3 days" include today? What defines a "day" (the location's local time zone or the device's)? What date format is used?**
- Why it matters: Without this, REQ-WF4-01 cannot be checked, and results differ by time zone near midnight.
- Affects: REQ-WF4-01, REQ-WF4-02, E7.
- Options: (a) today plus 2 more; (b) the next 3 days after today; (c) 3 days starting tomorrow.
- Proposed default: user decides. Use the location's local time zone for day boundaries (proposal only).
- Resolution: Partially resolved. Resolved - user accepted proposed default (time-zone part): use the location's local time zone for day boundaries. Still open - no explicit default: whether "the next 3 days" includes today (options a, b, c), and the date format.

**Q14. What does "forecast temperature" mean per day: a single value, a high/low pair, or both?**
- Affects: REQ-WF4-02, REQ-WF7-03.
- Proposed default: daily high and low in the configured unit.
- Resolution: Resolved - user accepted proposed default: daily high and low in the configured unit.

**Errors, retry, and refresh**

**Q18. What retry behaviour is required, and how should partial failures work?**
- Why it matters: WF-3 AC5 says "error or retry message", WF-4 AC5 says "option to retry", WF-1 AC5 and WF-5 AC4 say only "message". It is unclear whether a retry control is needed everywhere, whether retry is manual or automatic, and how it differs from refresh. If current weather loads but the forecast fails (or vice versa), what is shown?
- Affects: REQ-WF1-05, REQ-WF3-05, REQ-WF4-05, REQ-WF5-04, REQ-WF7-05, X3, X4, E10.
- Options: (a) manual retry control on every failure; (b) a message only on search and refresh; (c) automatic retry.
- Proposed default: a message plus a manual retry control for every failed load; the successful part is still shown when only one part fails.
- Resolution: Resolved - user accepted proposed default: a message plus a manual retry control for every failed load; the successful part is still shown when only one part fails.

**Q19. Refresh details: what is the refresh control and where is it placed? What counts as "duplicate" handling (ignore extra clicks, disable the control, or queue)? Does refresh also apply when viewing a favorites list? What happens if the selected location changes during a pending request?**
- Why it matters: REQ-WF5-03 is not testable as it offers two alternatives. Refresh scope is unclear for X12.
- Affects: REQ-WF5-01, REQ-WF5-03, REQ-X-02, E3.
- Proposed default: a visible refresh control; it is disabled (with a loading indication) while a refresh is in progress, so only one request is active. Refresh applies to the currently selected location only.
- Resolution: Resolved - user accepted proposed default: a visible refresh control; it is disabled (with a loading indication) while a refresh is in progress, so only one request is active. Refresh applies to the currently selected location only. (The default does not address what happens if the selected location changes during a pending request; not invented. See Section 11.)

**Q20. "Latest successful update time ... when supported": what makes it "supported"? Is it the time the app fetched the data or the provider's observation time? What format and time zone? Is it also shown after the initial load or only after a manual refresh?**
- Affects: REQ-WF5-05, X13.
- Proposed default: show the time of the last successful fetch, in the device's local time, after any successful load; user to confirm.
- Resolution: Resolved - user accepted proposed default: show the time of the last successful fetch, in the device's local time, after any successful load; user to confirm. (The user's acceptance on 2026-10-30 is the confirmation. The time format is not defined by the default; not invented. See Section 11.)

**Q21. Offline and caching: what should the app do with no network? Should data be cached, and how fresh must displayed data be?**
- Why it matters: WF-5 AC4 retains previously loaded data after a failed refresh, which implies in-session retention. Jira does not say whether data survives a restart or how old it can be.
- Affects: REQ-WF5-04, REQ-WF1-05, E4, P-OUT-7.
- Proposed default: no offline mode; in-session retention only; no persisted weather cache.
- Resolution: Resolved - user accepted proposed default: no offline mode; in-session retention only; no persisted weather cache.

**Favorites (WF-6)**

**Q22. Where are favorites stored, and are they per device or per account? What happens if storage is unavailable or cleared?**
- Why it matters: WF-6 AC6 says "provided persistent storage is supported" but names no mechanism. "Their favorites list" could suggest accounts, but Jira mentions no login.
- Affects: REQ-WF6-06, A1, A6, E8, P-OUT-1.
- Options: (a) local to the device/browser, no accounts; (b) per-user account synced across devices.
- Proposed default: (a). If storage is unavailable, favorites work for the current session only, with a notice. The user decides.
- Resolution: Resolved - user accepted proposed default: (a) local to the device/browser, no accounts. If storage is unavailable, favorites work for the current session only, with a notice. The user decides. (The user's acceptance on 2026-10-30 is the decision.)

**Q23. What defines a duplicate favorite, and is there a maximum number of favorites?** Is a city identified by name plus country, by coordinates, or by the provider's location ID? Can a favorite be added from the device-detected location or only after a search? Is the list ordered (by added time or alphabetically)?
- Why it matters: REQ-WF6-04 cannot be tested without a duplicate rule. A cap and ordering are not stated.
- Affects: REQ-WF6-01, REQ-WF6-04, X10, Q5.
- Proposed default: duplicates are by the resolved city identity (name plus country, or the provider ID); no maximum unless the user sets one; list in the order added.
- Resolution: Partially resolved. Resolved - user accepted proposed default: duplicates are by the resolved city identity (name plus country, or the provider ID); no maximum unless the user sets one; list in the order added. (The user set no maximum.) Still open - no explicit default: whether a favorite can be added from the device-detected location (same open part as Q12).

**Q24. Favorites list details: does each entry show only the name, or also a weather summary? Is removal confirmed or undoable? What is shown when the list is empty?**
- Affects: REQ-WF6-02, REQ-WF6-05, E9.
- Proposed default: names only; immediate removal; a short empty-state message.
- Resolution: Resolved - user accepted proposed default: names only; immediate removal; a short empty-state message.

**UI, quality, and compliance**

**Q25. What is the navigation structure between search, current weather, forecast, and favorites (single page with sections, or separate screens)? How does the user go back?**
- Why it matters: WF-7 AC6 requires "consistent navigation" without defining the views.
- Affects: REQ-WF7-06, REQ-WF6-02, X9.
- Proposed default: a single-page layout with persistent search and a favorites access control; user decides.
- Resolution: Resolved - user accepted proposed default: a single-page layout with persistent search and a favorites access control; user decides. (The user's acceptance on 2026-10-30 is the decision.)

**Q26. What accessibility standard is expected (for example WCAG 2.1 AA, keyboard navigation, screen-reader labels, colour contrast)? How will "clear, organized, easy-to-read" be assessed?**
- Why it matters: WF-7 AC1 is subjective, and no accessibility requirement is stated.
- Affects: REQ-WF7-01, REQ-WF7-06, NFR gap.
- Proposed default: TBD, user to specify a standard. Without an answer, no accessibility requirement is added.
- Resolution: Still open - no explicit default. Per the default, no accessibility requirement is added until the user specifies a standard (TBD), and how "clear, organized, easy-to-read" is assessed is also open.

**Q27. What languages, locales, and date/number formats are required? Which units apply to humidity and other displayed values?**
- Affects: REQ-WF7-03, REQ-WF4-02.
- Proposed default: English only; units as in Q4 and Q15.
- Resolution: Resolved - user accepted proposed default: English only; units as in Q4 and Q15. (Date format remains open under Q13.)

**Q28. Privacy: how may location data be handled?** Examples: are coordinates sent to a third-party weather service, stored, logged, or kept after the session? Is a privacy notice or consent text expected beyond the browser/OS permission prompt? Is any analytics or telemetry allowed?
- Why it matters: WF-2 handles personal location data, yet no privacy rule is given.
- Affects: REQ-WF2-*, NFR gap.
- Proposed default: coordinates are used only to get weather, not stored, not logged. The user must confirm.
- Resolution: Resolved - user accepted proposed default: coordinates are used only to get weather, not stored, not logged. The user must confirm. (The user's acceptance on 2026-10-30 is the confirmation. The default does not address privacy-notice text or analytics/telemetry; not invented.)

**Q29. Are there performance targets?** Examples: maximum time to show weather, and when the loading indicator should appear.
- Affects: REQ-WF7-05, NFR gap.
- Proposed default: TBD, none invented.
- Resolution: Still open - no explicit default. Performance targets remain TBD; the user must provide them if wanted.

**Q30. Are search suggestions/autocomplete or recent-search history wanted?**
- Why it matters: Not mentioned in Jira. Listed so it can be explicitly excluded.
- Affects: scope (P-OUT-6).
- Proposed default: out of scope.
- Resolution: Resolved - user accepted proposed default: out of scope.

**Q31. Is there a priority order or MVP cut among the seven stories (all are Medium)?**
- Affects: planning only.
- Proposed default: none; all seven are in scope.
- Resolution: Resolved - user accepted proposed default: none; all seven are in scope. (No priority order and no MVP cut; all seven stories are in scope.)

## 10. Decisions the User Must Confirm

On 2026-10-30 the user answered this checklist with the proposed values ("accept all defaults"). A box is checked only where the item is fully answered. Items with open parts are left unchecked and the open parts are noted beside them. A checked box means "answered with proposed default". It does not mean the document is approved.

- [ ] D-1: Confirm the platform (Q1) and supported browsers/breakpoints (Q2). **Status: partially answered - open parts: Q2 (browsers, operating systems, breakpoints; no default). Q1 answered with proposed default.**
- [ ] D-2: Choose the weather data provider and the API key and usage handling (Q3). **Status: partially answered - open parts: the provider choice, other API key handling, and usage limits. Answered: the Architect proposes candidates at Stage 2 for approval, and no key is committed to the repository.**
- [x] D-3: Define the temperature unit configuration, default, and persistence (Q4). **Status: answered with proposed default.**
- [x] D-4: Define "valid city", same-name handling, and whether search shows current weather plus forecast (Q5, Q6, Q7, Q8). **Status: answered with proposed defaults.**
- [ ] D-5: Choose the location-detection mechanism and timeout, and define denial and fallback behaviour (Q9, Q10, Q11, Q12). **Status: partially answered - open parts: Q10 (timeout value, TBD); Q12 (whether a device-detected location can be favorited). Q9, Q11, and the place-name part of Q12 answered with proposed defaults.**
- [ ] D-6: Define "next 3 days", the time zone and day boundary, and the forecast temperature format (Q13, Q14). **Status: partially answered - open parts: Q13 (whether "next 3 days" includes today; date format). Answered: local time zone day boundary (Q13) and daily high and low (Q14).**
- [ ] D-7: Define the in-scope weather fields, icon set and fallback, and unavailable-value presentation (Q15, Q16, Q17). **Status: partially answered - open parts: Q16 (the exact icon set, including day and night variants). Answered: Q15, Q17, and the mapping with generic fallback and always-shown condition text (Q16).**
- [x] D-8: Define retry and partial-failure behaviour, and the refresh duplicate-handling and scope rules (Q18, Q19). **Status: answered with proposed defaults.**
- [x] D-9: Define the "update time" behaviour (Q20) and the offline/caching policy (Q21). **Status: answered with proposed defaults.**
- [ ] D-10: Define the favorites storage, ownership (device vs account), duplicate rule, limits, and list behaviour (Q22, Q23, Q24). **Status: partially answered - open parts: whether a favorite can be added from the device-detected location (Q23, Q12). Q22, Q24, and the duplicate rule, limit, and ordering of Q23 answered with proposed defaults.**
- [ ] D-11: Define the navigation structure (Q25), the accessibility standard (Q26), and localization (Q27). **Status: partially answered - open parts: Q26 (accessibility standard, TBD; no accessibility requirement added until specified). Q25 and Q27 answered with proposed defaults.**
- [ ] D-12: Define location-data privacy rules (Q28) and any performance targets (Q29). **Status: partially answered - open parts: Q29 (performance targets, TBD). Q28 answered with proposed default.**
- [ ] D-13: Confirm or reject each proposed out-of-scope item P-OUT-1..7, and the answers to Q30 and Q31. **Status: partially answered - open parts: P-OUT-2 and P-OUT-3 (still unconfirmed), and the forecast-beyond-3-days and hourly-forecast part of P-OUT-4. Answered: P-OUT-1 (Q22), P-OUT-5 (Q1), P-OUT-6 (Q30), P-OUT-7 (Q21), the weather-fields part of P-OUT-4 (Q15), Q30, and Q31.**
- [x] D-14: Confirm or reject the derived requirements REQ-X-01, REQ-X-02, REQ-X-03. **Status: answered with proposed values (derived items accepted; they remain labelled Derived).**
- [ ] D-15: Confirm or reject assumptions A1-A8. **Status: partially answered - open parts: A8 (depends on Q13). A1-A7 accepted via defaults.**

## 11. Open Questions and Unresolved Decisions

On 2026-10-30 the user accepted the proposed defaults (source: "user accepted proposed default"), which resolved most of Q1-Q31. Only the items below remain open. Each "Partial" Testability entry in Section 4 stays blocked from final pass/fail wording until its related open item is answered. The document itself is still unapproved (Section 12).

### 11.1 Fully open (no explicit default)

| Item | What the user must provide |
|---|---|
| Q2 | Supported browsers and versions, operating systems, and screen-size breakpoints. |
| Q10 | The location-request timeout value (for example a number of seconds). |
| Q26 | An accessibility standard (for example WCAG level, keyboard, screen reader), and how "clear, organized, easy-to-read" is assessed. Until then, no accessibility requirement is added. |
| Q29 | Performance targets, if any (for example maximum time to show weather, and when the loading indicator should appear). |

### 11.2 Partially open (the rest of each question is resolved by an accepted default)

| Item | Open part | What the user must provide |
|---|---|---|
| Q3 | Provider and key handling | The weather data provider choice (the Architect proposes candidates at Stage 2 for the user's approval), other API key handling, and usage limits. |
| Q12 and Q23 | Favoriting a device-detected location | Whether a device-detected location can be added to favorites. |
| Q13 | Forecast day definition and date format | Whether "the next 3 days" includes today (options a, b, c), and the date format. Assumption A8 stays open until this is answered. |
| Q16 | Icon set | The exact icon set, including whether day and night variants are needed. |

### 11.3 Out-of-scope proposals still unconfirmed

- P-OUT-2 (weather alerts or notifications, maps, radar, and historical data): the user must confirm or reject.
- P-OUT-3 (automatic or scheduled background refresh): the user must confirm or reject.
- P-OUT-4, forecasts beyond 3 days and hourly forecasts: the user must confirm or reject. The weather-fields part is accepted via Q15.

### 11.4 Sub-questions not addressed by the accepted defaults (nothing invented)

These are details inside questions that were otherwise resolved. The accepted defaults do not state them, so they are listed here for the user to decide if they matter.

- Q5: handling of "City, Country" or "City, State" input, case, whitespace, diacritics, and spelling tolerance.
- Q11: whether the application asks again for permission on the next open, and how the user re-enables location later.
- Q19: what happens if the selected location changes during a pending request.
- Q20: the time format, and what makes the update time "supported".
- Q28: whether a privacy notice or consent text beyond the browser/OS prompt is expected, and whether analytics or telemetry is allowed.

### 11.5 Document approval

The requirements document was approved by the user on 2026-10-30 (Section 12). The open items in 11.1 to 11.3 are recorded there as DEFERRED to the Architect. The sub-questions in 11.4 were not covered by the user's deferral decision; the Architect must flag each as an explicit assumption for user confirmation at the design review gate.

## 12. Approval

| Field | Value |
|---|---|
| Approval status | **APPROVED** (open items deferred to the Architect) |
| Approved by | The user, in the top-level Claude Code session |
| Approval date | 2026-10-30 |
| User's explicit approval statement | The user typed: "approve the requirements". |
| Scope of approval | All requirements in this document (REQ-WF1-01..REQ-WF7-06 and REQ-X-01..03). |
| Handling of open items | Asked how to treat items with no default, the user chose "Approve, defer to Architect": the open items in 11.1 to 11.3 are DEFERRED to the Architect, who must propose concrete values with rationale. The user will confirm them at the design review gate. They are not approved values. |
| Recorded by | The top-level Claude Code session, which received both user statements directly. Recorded on the user's instruction; not an agent or orchestrator decision. |

Earlier on 2026-10-30 the user typed "accept all defaults" for the clarification questions (see the Clarification defaults row at the top); that was an answer to the questions, not approval of this document.
