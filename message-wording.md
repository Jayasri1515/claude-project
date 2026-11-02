# User-Facing Message Wording (T-07 / U7)

| Field | Value |
|---|---|
| Status | **APPROVED BY USER (2026-10-30), footer Option A.** See the Approval record at the end. The text of this file below the header is the draft as approved, unedited. |
| Messages | **45 messages** (M-01..M-45), of which 19 are marked ADDED (M-04, M-08, M-29..M-45) (not in the T-07 list) |
| Drafted by | Implementation Planner (U7 decision "Planner drafts, you approve", 2026-10-30). Reconciled 2026-11-02: it was drafted for the user to approve or edit, and the user approved it unedited on 2026-10-30 (Approval record at the end). |
| Approval | **APPROVED BY USER 2026-10-30, as drafted, footer Option A (M-24); no edits.** See the Approval record at the end. Reconciled 2026-11-02 (evidence: line 5 and the Approval record). Earlier state (superseded, true while this was a draft): "Nothing in this file is approved. No text below may be treated as final, and no wording-dependent task (T-25, T-41, T-42, T-44, T-45, T-47, T-60, T-61 and the tasks that inherit them) may start until the user approves or edits this file and the approval is recorded in the section at the end." Open choices stay as the Approval record states (M-05 rate-limit text firm only after T-75; GeoNames credit wording M-22/M-23). |
| Authority | `requirements.md` (approved) and `architecture.md` (approved with conditions) decide which messages exist. Wording is not specified there ("message wording is not specified" in requirements Section 4). |
| Provider facts used | `provider-verification.md` items 1, 2, 8 (attribution, limits, 90-day logs). |
| Reference only | `src/core/messages.ts` was read as a NON-authoritative reference for tone. Where a line below is close to it, that is noted; the existing file was written before U7 and under an earlier architecture (conformance-review.md F-12) and is not treated as approved. |

## Drafting rules applied

- Plain, neutral English (Q27: English only). Short. No message blames the user.
- No message contains a URL, coordinates, or raw provider text. The attribution link text "Weather data by Open-Meteo.com" names the provider; the link target is an `href`, not message text (the user may want to confirm that reading).
- `aborted` has NO message (it is internal and never shown, architecture 3.1 and 3.7).
- Kind to message mapping is one-to-one (see the mapping table below). Where one kind needs two texts, the trigger column says exactly when each applies.
- `{time}`, `{place}` are placeholders filled by the app; they are never raw provider text.

## Messages

Live region: "yes" means the text is announced through the `aria-live` status region (architecture 5.5). Source column cites architecture sections; "(ADDED)" marks a string not in the T-07 row list, which the user is asked to confirm.

| ID | Situation / trigger | Exact proposed text | Where shown (live region?) | REQ | Notes / source |
|---|---|---|---|---|---|
| M-01 | `empty_input`: search submitted empty or whitespace-only | Please enter a city name. | Inline under the search input (yes) | WF1-04 | 3.2, Q8. Close to existing `error.emptyInput`. No request is made. |
| M-02 | `not_found`: geocoding returned zero results (also: qualifier filter left none) | No matching city was found. Try a different name. | Search area, below the input (yes) | WF1-03 | 3.2, A-Q5. Differs from existing text, which says "Check the spelling" (can read as blaming). |
| M-03 | `service`: provider unavailable or HTTP 5xx, on search, first load, refresh or retry | The weather service is unavailable right now. Please try again. | Search area (search failure) or both weather sections (whole-`get` failure) (yes) | WF1-05, WF3-05, WF4-05, WF5-04, WF7-05 | 3.6, 5.4. Followed by the Retry control (M-34). |
| M-04 | `network`: request could not reach the provider (offline, DNS, blocked) (ADDED, not in T-07 list; kind exists in the approved taxonomy) | Could not connect to the weather service. Check your internet connection and try again. | Same places as M-03 (yes) | WF1-05, WF3-05, WF4-05, WF5-04 | 3.1 taxonomy; requirements E4. Never used for `aborted`. |
| M-05 | `rate_limited`: adapter maps HTTP 429 (and any other response the browser test shows to be a limit) to this kind | The weather service is busy. Please wait a minute and try again. | Same places as M-03 (yes) | WF1-05, WF3-05, WF4-05, WF5-04 | 5.4 ("try again later"). The provider status code is NOT CONFIRMED (provider-verification.md item 2), so this trigger is firm only after task T-75. "A minute" is a choice, not a documented reset time (limits are per minute, hour, day; see item 2). |
| M-06 | `invalid_response`: whole response unreadable or fails validation (search or whole-`get` failure) | The weather service sent a response this app could not read. Please try again later. | Same places as M-03 (yes) | WF1-05, WF3-05, WF4-05 | 5.3. No raw provider text. |
| M-07 | `permission_denied`: location state `denied` | Location access is turned off for this site. You can search for a city instead. | Location area (yes); city search stays enabled, no weather shown | WF2-03 | 3.3 step 5, Q11. Differs from existing "Location access was denied". |
| M-08 | Hint with M-07 when the Permissions API reports `denied` (ADDED, hint is in architecture Section 8 Q11 but not in the T-07 list) | To use your location, allow location access for this site in your browser settings, then choose Use my location. | Directly under M-07 (yes) | WF2-03 | Section 8 Q11. Wording does not name a browser because settings differ. |
| M-09 | `position_unavailable`: OS location off or hardware error; `unavailable` state | Your location could not be determined. You can search for a city instead. | Location area (yes) | WF2-04 | 3.3 step 5. Matches existing `error.locationUnavailable`. |
| M-10 | `timeout`, Permissions API MISSING (watchdog started at the call) | Finding your location took too long. Your browser may still be waiting for your answer to its location prompt. You can search for a city instead, or choose Use my location to try again. | Location area (yes) | WF2-04 | 3.3 step 2: text must hint that the prompt may still be pending. |
| M-11 | `timeout`, Permissions API available (permission was granted, watchdog expired) | Finding your location took too long. You can search for a city instead, or choose Use my location to try again. | Location area (yes) | WF2-04 | The hint is omitted because the prompt is known to be answered (3.3 step 2). Split into two texts so each trigger is unambiguous. |
| M-12 | `unsupported`: no geolocation in this browser | Location detection is not available in this browser. You can search for a city instead. | Location area (yes) | WF2-04 | 3.3 step 1. |
| M-13 | State `requesting` (waiting for prompt answer or position) | Detecting your location... | Location area (yes) | WF2-01, WF2-02, WF2-04 | 3.3 step 2, 8.1. Text given in the T-07 row; kept exactly. |
| M-14 | DR-20 "search instead" cue, shown whenever M-13 is shown | Taking a while? You can search for a city instead. | Beside/below M-13, search input stays enabled (yes, announced once) | WF2-04 | DR-20; no timeout value is invented. |
| M-15 | `storage_unavailable`: favorites storage missing or throwing; list is session-only | Favorites cannot be saved on this device. They will be kept only until you close this page. | Favorites panel (yes) | WF6-06 | 3.4, 5.4, Q22. Close to existing `error.storageUnavailable`, which is vaguer. |
| M-16 | Stored favorites unreadable (unknown version or invalid items); data discarded | Your saved favorites could not be read and were cleared. You can add cities again. | Favorites panel (yes) | WF6-06 | 3.4 (DR-15); conformance-review.md F-10 (silent discard in existing code). |
| M-17 | Add attempted for a city already saved (key match) | This city is already in your favorites. | Favorites panel / next to the add control (yes) | WF6-04 | 3.4. Matches existing `ui.favoriteDuplicate`. |
| M-18 | Favorites list is empty | No favorites yet. Search for a city and choose Add to favorites. | Favorites panel (no, static content) | WF6-02 | Q24, 3.4. Refers to the label in M-38. |
| M-19 | Add control disabled because the selected location is a device location with no `Place` (baseline option (a)) | Your current location cannot be saved. Search for the city by name to add it to your favorites. | Beside the disabled add control; also its accessible description (no) | WF6-01 | Section 7 item 6, U1(a). |
| M-20 | Unavailable label for any missing value (temperature, humidity, condition, a forecast day) | Unavailable | In place of the value, in current card and forecast (no) | WF3-04, WF4-04 | Q17: ONE label for all views, so no per-field variants. Same as existing `ui.unavailable`. For a missing forecast day, the date row shows the date if known and each field shows this label. |
| M-21 | Error boundary: unexpected render fault | Something went wrong and this page could not be shown. Please reload the page and try again. | Replaces the page content; `role="alert"` (yes) | WF1-05 | 8.1, C1. No error detail shown. No separate reload button label is proposed beyond the text. |
| M-22 | Weather data attribution link text | Weather data by Open-Meteo.com | A link (`https://open-meteo.com/`, `rel="noopener noreferrer"`) **beside every displayed location** (the location label of the current card) and in the footer (no) | WF1-02, WF3-01 | **UI placement requirement** from provider-verification.md item 1 ("a link next to any location Open-Meteo data are displayed"). Text is the provider's example; the page says "for example", so it is not mandated. |
| M-23 | Geocoding data credit | Location data based on GeoNames | Footer, and beside the pick list (M-41) because it displays search results (no) | WF1-01 | provider-verification.md item 1: the geocoding page says "Location data based on GeoNames"; no mandated wording or link target. **Wording is a choice** (flagged below). |
| M-24 | Footer privacy disclosure (A-Q28, provider-verification.md item 8) | **Option A:** The city you search for and your device location (rounded to two decimal places) are sent to Open-Meteo to get the weather, along with your IP address. Open-Meteo keeps server logs that may contain coordinates for 90 days. This app does not save your device location and collects no other data: there are no analytics, cookies or tracking. Favorites and your unit choice stay on this device. <br> **Option B (shorter):** Your searched city and device location (rounded) are sent to Open-Meteo, which may keep them in server logs for up to 90 days. This app collects nothing else. | Footer, always visible text (no) | WF2-01, WF1-01 | Required content (all three): what is sent, the provider's 90-day log retention, nothing else collected. The user chooses A or B. "Along with your IP address" follows the terms page (item 8: IP addresses gathered). Does not claim the provider cannot see coordinates. |
| M-25 | Partial failure: current section missing or invalid, forecast OK (matrix row 3) | Current weather could not be loaded. Please try again. | In the current-weather section; forecast stays visible; with Retry (M-34) (yes) | WF3-05, WF5-04 | 3.5 matrix, 3.6. Used instead of M-06 for a section-level fault. If previous current data exists it stays and this text is shown with M-27 instead (see M-27). |
| M-26 | Partial failure: forecast section missing or invalid, current OK (matrix row 2) | The forecast could not be loaded. Please try again. | In the forecast section; current weather stays visible; with Retry (M-34) (yes) | WF4-05, WF5-04 | Same rule as M-25. |
| M-27 | Refresh or retry failed (whole `get`, or a section) and previous data for the same location is kept | Could not refresh. The weather shown may be out of date. | Above the weather block, followed by the kind message (M-03..M-06) for a whole failure, or beside the section for M-25/M-26 (yes); Retry (M-34) | WF5-04, WF7-05 | 3.5 matrix ("keep previous data"). The "Updated" times (M-31..M-33) stay so the age is visible. Never shown for first load, and never shows another location's data (DR-18). |
| M-28 | Loading placeholder on first load of a location; also the busy text for a section | Loading... | Each weather section (yes, announced once at start) | WF7-05, WF5-03 | 3.6 (DR-14). Matches the T-07 row. No delay. |
| M-29 | Label for a device location with no resolved place (ADDED, fixed label named in the architecture) | Current location | Location label of the current card (no) | WF2-05 | 3.1, U1(a). |
| M-30 | First forecast card label (ADDED) | Today | First forecast card, with its date (no) | WF4-02 | Section 7 item 7. Omitted when no time zone is returned (3.1). |
| M-31 | Update time, both sections have the same `fetchedAt` (ADDED) | Updated {time} | Weather block header (no) | WF5-05 | 3.5, U4 approved. `{time}` is short style in device local time, e.g. "14:05". |
| M-32 | Update time, sections differ: current line (ADDED) | Current weather updated {time} | Current section (no) | WF5-05 | 3.5, U4. Omitted for a section never loaded. |
| M-33 | Update time, sections differ: forecast line (ADDED) | Forecast updated {time} | Forecast section (no) | WF5-05 | 3.5, U4. |
| M-34 | Retry control label (all failed loads; failed search re-submits the last text) (ADDED) | Retry | Button next to every error message (M-03..M-06, M-25..M-27) (no) | WF1-05, WF3-05, WF4-05, WF5-04 | Q18, 3.5 retry scope: one control per failed block (whole failure: one), not per kind. |
| M-35 | Refresh control label (ADDED) | Refresh | Refresh bar (no) | WF5-01 | 3.5. |
| M-36 | Refresh control while a load is in progress (ADDED) | Refreshing... | Same control, disabled (yes, announced once) | WF5-03 | Q19, 3.5. |
| M-37 | "Use my location" control (ADDED, named in 8.1 but not in the T-07 list) | Use my location | Location area, shown after denial, timeout, unavailable (and available when idle) (no) | WF2-01, WF2-03, WF2-04 | 8.1, 3.3 step 7. |
| M-38 | Add-to-favorites control (ADDED) | Add to favorites | Current card / location area (no) | WF6-01 | 3.4. Disabled for device locations (see M-19). |
| M-39 | Remove control (ADDED); accessible name includes the place | Visible: Remove. Accessible name: Remove {place} from favorites | Each favorites entry (no) | WF6-05 | 3.4, 5.5. Immediate, no confirm. |
| M-40 | Unit toggle (ADDED) | Group name: Temperature unit. Options: °C and °F | Unit toggle (no) | WF3-03, X-03 | 3.8. |
| M-41 | Pick-list prompt for multiple matches (ADDED) | Several places match. Choose one: | Above the pick list (yes, announced when the list appears) | WF1-01 | Q5, 3.2. Each entry is name, region, country with parts omitted when missing. |
| M-42 | Search labels (ADDED) | Input label: City name. Button: Search | Search panel (no) | WF1-01, WF7-06 | Q25, 5.5. |
| M-43 | Value labels (ADDED) | Temperature, Humidity, Condition, High, Low | Current card and each forecast day (no) | WF7-03 | WF7-03 requires an identifiable label per value. Units: °C/°F and %. |
| M-44 | Condition texts (ADDED; text is user-facing wording owned by C11) | Sunny (clear, day, and forecast days); Clear (clear at night, or when `isDay` is absent); Partly cloudy; Cloudy; Fog; Drizzle; Rain; Snow; Thunderstorm; fallback for an unmapped code: Unknown conditions | Beside every condition icon (no) | WF3-02, WF4-03, WF7-02 | Section 7 item 8 fixes Sunny/Clear/Partly cloudy; the other words and the fallback text are my proposal. Existing code has no Drizzle text (conformance-review.md C11). |
| M-45 | Area headings and landmark names (ADDED) | Search; Current weather; Forecast; Favorites | Landmark/heading of each area (no) | WF7-01, WF7-06 | Q25, 5.5. |

## Kind to message mapping (unambiguous)

| `AppError.kind` / state | Message ID | Notes |
|---|---|---|
| `empty_input` | M-01 | |
| `not_found` | M-02 | |
| `service` | M-03 | |
| `network` | M-04 | |
| `rate_limited` | M-05 | Firm only after T-75 (status code unconfirmed). |
| `invalid_response` (search failure or whole `get` failure) | M-06 | |
| `invalid_response` limited to one weather section of a successful response | M-25 (current) or M-26 (forecast) | |
| `permission_denied` | M-07 (+ M-08 when the Permissions API shows denied) | |
| `position_unavailable` | M-09 | |
| `timeout` (location, Permissions API missing) | M-10 | |
| `timeout` (location, Permissions API available) | M-11 | |
| `timeout` (provider request, search or weather) | M-03 | Reuses the service text; user-visible difference is not needed. The user may ask for a separate text. |
| `unsupported` | M-12 | |
| `storage_unavailable` | M-15 | |
| Corrupt favorites data (not an `AppError.kind`; a read result) | M-16 | |
| `aborted` | none | Never shown, never mapped (3.1). |
| Whole `get` failure on first load | kind message (M-03..M-06) in each section + one Retry (M-34) | No extra text. |
| Whole `get` failure on refresh with previous data | M-27 + kind message + one Retry | |

## Coverage check against the T-07 row list

| T-07 item | Message ID(s) |
|---|---|
| empty-input prompt | M-01 |
| not found | M-02 |
| service unavailable | M-03 (M-04 for network) |
| rate limited | M-05 |
| invalid response | M-06 |
| denied | M-07, M-08 |
| unavailable (position) | M-09 |
| timeout (with prompt-wait hint) | M-10 (hint), M-11 |
| unsupported | M-12 |
| waiting ("Detecting your location...") | M-13 |
| "search instead" cue (DR-20) | M-14 |
| storage-unavailable notice | M-15 |
| corrupted-favorites notice | M-16 |
| duplicate favorite | M-17 |
| empty favorites | M-18 |
| add-disabled explanation (device location) | M-19 |
| unavailable label | M-20 |
| footer disclosure | M-22, M-23, M-24 |
| error-boundary fallback | M-21 |
| partial-failure: current-only failed | M-25 |
| partial-failure: forecast-only failed | M-26 |
| partial-failure: whole failure incl. retry label | kind message + M-34 (mapping table) |
| first-load failure vs refresh failure keeping previous data | mapping table rows; M-27 |
| Added strings: loading, current location, Today, Updated lines, retry/refresh/use-my-location/add/remove/unit labels, pick-list prompt, network, labels, condition texts, headings | M-28..M-45, M-04, M-08 |

## Wording choices the user should check (most consequential first)

1. **M-05 rate-limited text and trigger.** The HTTP status for an exceeded limit is NOT CONFIRMED (provider-verification.md item 2). The text assumes a limit response can be recognised; if the browser test (T-75) shows a different status or a CORS-blocked response that looks like `network`, M-05 vs M-03/M-04 mapping may need to change. "Wait a minute" is also a choice.
2. **M-10 / M-11 timeout split and hint.** Two texts so the prompt-wait hint appears only when the Permissions API is missing. Check that the hint is clear and the split is acceptable.
3. **M-14 DR-20 cue.** The only protection against an unanswered prompt; its tone ("Taking a while?") and always-visible behaviour need your view.
4. **M-24 footer disclosure (Option A or B)**, including the 90-day logging sentence, the IP address mention, and "collects no other data".
5. **M-22 / M-23 attribution.** Open-Meteo text is the provider's example; GeoNames wording is a choice (no mandated text). Placement beside every displayed location is a UI requirement, not just wording.
6. **M-20 "Unavailable" label.** One label for every view (Q17); alternatives such as "Not available" or "--" are possible.
7. **M-16 corrupted favorites** says the data "were cleared". Check that this is acceptable.
8. **M-27 refresh failure** ("may be out of date") and **M-19** (device location cannot be saved), both consequences of approved decisions.

## Places where requirements or architecture are silent and a proposal was made

- Exact text of every message (requirements say "message wording is not specified").
- Separate text for provider `timeout` (mapped to M-03 here); `network` text (kind exists, no message was listed in T-07).
- Condition words other than Sunny/Clear/Partly cloudy, and the unmapped-condition text (M-44).
- Labels for controls, headings, pick-list prompt, and the refresh-in-progress text (M-28..M-45).
- Whether the footer mentions the IP address (M-24).
- Whether the attribution text is repeated beside each location and beside the pick list (M-22, M-23); the provider rule only mandates the Open-Meteo link beside displayed locations.
- No reload button label for the error boundary (M-21).

## Approval record (to be filled by the top-level session)

| Field | Value |
|---|---|
| Approval status | APPROVED as drafted, with footer Option A (M-24) |
| Approved / edited by | The user, in the top-level Claude Code session |
| Date | 2026-10-30 |
| User statement | Asked "do you approve message-wording.md? Pick the footer option (M-24) if approving", the user chose "Approve, footer Option A". |
| Edits made (message IDs) | None. Open choices stay as drafted (M-05 rate-limit text, firm only after T-75; GeoNames credit wording M-22/M-23). |
| Recorded by | The top-level Claude Code session, which received the choice directly. Not a Planner or Orchestrator decision. |
