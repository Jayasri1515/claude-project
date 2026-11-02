# Design Review: Weather Forecasting Application

| Field | Value |
|---|---|
| Stage | SDLC Stage 3, Design Reviewer |
| Review date | 2026-10-30 |
| Branch | `feature/weather-app` |
| Review rounds | Round 0 (initial review, Sections 1-6 and 8) and re-review round 1 of 1 (Section 7, verdict and decisions in Section 9). Round 1 is the final review round: items still open go to the human. |
| Architecture status | **APPROVED WITH CONDITIONS** by the user on 2026-10-30; see Section 10. Reconciled 2026-11-02: header rows updated to the current state recorded in Section 10 (the user chose "Accept all proposals"; conditions are listed there). Earlier state (superseded): "**NOT APPROVED.** The revised Architect draft (revision 1) still states "DRAFT / NOT APPROVED" (`architecture.md` header Status row and Section 11)." |
| Human approval decision | **APPROVED WITH CONDITIONS**, 2026-10-30, recorded in Section 10 by the top-level Claude Code session from the user's direct choice. Reconciled 2026-11-02 (evidence: Section 10 and the note at its end). Earlier state (superseded, true when Sections 1-9 were written): "**PENDING.** No human has approved, conditionally approved or rejected this architecture. Nothing in this document is, or implies, human approval." |
| Prior `design-review.md` | A prior version was not valid and was overwritten. Nothing from it was used. |

> Reconciled 2026-11-02: the header rows 9-10 now show the Section 10 approval. The Sections 1-9 text below is the review as written and is history, not the current status.
>
> Reading note: Sections 1-6 and 8 are the round 0 record, kept unchanged. Their `architecture.md` line references point to the pre-revision file and are now stale. Finding statuses in Section 3 are the round 0 statuses. The current status of every finding is in Section 7 (re-review). The current verdict and decision list are in Section 9.

## 1. Scope and Evidence

Documents reviewed:

- `requirements.md`. Approved by the user on 2026-10-30. Evidence: header rows 5-6, Section 11.5 and Section 12 (lines 605-617), which quote the user's statement "approve the requirements". Open items 11.1-11.3 were DEFERRED to the Architect and are not approved values. The 11.4 sub-questions were not covered by the deferral and must be flagged as assumptions.
- `architecture.md`. Architect draft, NOT approved.

Not used as input: `archive/pre-jira-restart/`. The existing `src/`, tests and e2e were not reviewed for conformance. They are a prior implementation and are not approved. Only these repository facts were checked, because the Architect cites them:

- `.gitignore` lists `.env` and `.env.*` (lines 4-5).
- `package.json` lists `react ^19.3.1`, `lucide-react`, `vite`, `vitest` and `axe-core`, and a `playwright test` script.
- `scripts/scanDist.mjs` exists.

Whether these files are correct or conforming was NOT assessed.

Limitations: no network access was used. All provider, browser and standards statements in `architecture.md` Section 7 and Section 10 (R5, R9) are unverified by the Architect and are also unverified by this reviewer. They are marked "not verified" below.

## 2. Coverage Results

### 2.1 Requirements traceability (40 IDs) - verified, not trusted

The matrix (`architecture.md` lines 164-205) was counted row by row against `requirements.md` Sections 4.1-4.8 and 6 (line 250).

| Group | Expected | Present in matrix |
|---|---|---|
| REQ-WF1-01..05 | 5 | 5 |
| REQ-WF2-01..05 | 5 | 5 |
| REQ-WF3-01..05 | 5 | 5 |
| REQ-WF4-01..05 | 5 | 5 |
| REQ-WF5-01..05 | 5 | 5 |
| REQ-WF6-01..06 | 6 | 6 |
| REQ-WF7-01..06 | 6 | 6 |
| REQ-X-01..03 | 3 | 3 |
| **Total** | **40** | **40** |

Result: complete. No ID is missing or duplicated, and each row has components and a design reference. The accuracy of the "Open" markers is weaker (DR-11). The matrix points to design text but gives no verification method per requirement. That was not requested, so it is not a defect.

### 2.2 Deferred items 11.1-11.3 against "Proposed values" (Section 7)

| Requirements item | Architecture item | Covered | Labelled proposal / pending user approval |
|---|---|---|---|
| Q2 (11.1) | Item 1 | Yes | Yes |
| Q10 (11.1) | Item 2 | Yes | Yes |
| Q26 (11.1) | Item 3 | Yes | Yes |
| Q29 (11.1) | Item 4 | Yes | Yes |
| Q3 (11.2) | Item 5 | Yes (candidates, recommendation, key handling, limits) | Yes |
| Q12 and Q23 (11.2) | Item 6 | Yes | Yes |
| Q13 and A8 (11.2) | Item 7 | Yes (includes-today, date format, A8) | Yes |
| Q16 (11.2) | Item 8 | Yes (set and day/night) | Yes |
| P-OUT-2 (11.3) | Item 9 | Yes | Yes |
| P-OUT-3 (11.3) | Item 10 | Yes | Yes |
| P-OUT-4 remainder (11.3) | Item 11 | Yes | Yes |

Result: all 11 deferred items are addressed and labelled as proposals. The quality of some proposals is open (DR-01, DR-06, DR-07, DR-08).

### 2.3 Section 11.4 sub-questions as explicit assumptions (Section 8)

| 11.4 item | Covered in `architecture.md` Section 8 | Flagged as needing user confirmation |
|---|---|---|
| Q5 input handling | Yes (line 282) | Yes |
| Q11 re-prompt / re-enable | Yes (line 283) | Yes |
| Q19 location change during pending request | Yes (line 284) | Yes |
| Q20 time format and "supported" | Yes (line 285) | Yes |
| Q28 privacy notice / analytics | Yes (line 286) | Yes |

Result: all five are covered and labelled. Two assumptions are internally weak (Q20 leaves the displayed time undefined, DR-04; Q5 is inconsistent about case matching, DR-12).

### 2.4 Consistency with accepted defaults

| Accepted default | Architecture treatment | Assessment |
|---|---|---|
| Coordinates not stored, not logged (Q28) | D4, 5.2, 3.3 | Mostly consistent for device coordinates. Conflicts with favorites storing place coordinates (DR-02). Wording "never written to URLs" is inaccurate (DR-10). The HTTP cache is unaddressed (DR-05). |
| No persisted weather cache (Q21) | D3, 3.5 | Consistent at app level. The browser HTTP cache is unaddressed (DR-05). |
| No accounts (Q22) | D2, "Not present by design" | Consistent. |
| No API key committed (Q3 process part) | D5, 5.1, C12 | Consistent. `.gitignore` and the scan script exist. |
| Place name if resolvable (Q12) | Item 5, baseline (a) | Made inoperative by design choice (DR-01). |
| Retry on every failed load; successful part still shown (Q18) | 3.6 | Consistent in intent. Partial-refresh semantics are unclear (DR-04). |
| Update time after any successful load (Q20) | 3.5, Section 8 | Not resolvable when sections differ (DR-04, U4). |
| Only one request active during refresh (Q19) | 3.5, 3.7 | Mostly consistent. Flag scope is ambiguous (DR-09). |

Nothing was found presented as approved that is not approved. The Architect marks the status, proposals and assumptions consistently. Items that look settled but have no approval path are listed in DR-08.

## 3. Findings (ordered by severity)

No Critical or High findings. Severity scale: Critical blocks any progress. High is a likely defect or an unmet approved requirement. Medium is a design gap or risk that needs a revision or a decision. Low is a clarification. Info is a neutral note.

### Medium

**DR-01 (Medium) - Baseline reverse-geocoding choice makes the accepted Q12 default and device-location favoriting inoperative.**
- Evidence: `requirements.md` Q12 resolution (lines 436-440) and REQ-WF2-05 (line 130) say a place name is shown "if resolvable". `architecture.md` item 5 (lines 247-248) proposes baseline (a), with no reverse geocoder. The device location is then always labelled "Current location". Item 6 (line 253) disables add-to-favorites for such locations. This is a consequence of the recommended provider choice, not of a technical constraint, because option (b) and (c) exist. The decision is recorded as U1 (line 292).
- Impact: the accepted default is never exercised in the baseline. WF-2 users cannot favorite their location (REQ-WF6-01 is only partly met). The label is less clear (WF-7).
- Recommendation: present U1 as an explicit trade-off in the approval request. State that choosing (a) means the Q12 place-name behaviour is dropped for the baseline and device locations cannot be favorited. Alternatively, choose (b) or (c) and record the privacy cost (a second third party receives coordinates, Q28).
- Status: Open (user decision U1).

**DR-02 (Medium) - Favorites persist place coordinates while the accepted Q28 default says coordinates are "not stored".**
- Evidence: Q28 (`requirements.md` lines 521-525) and 5.2 of that file (line 232): "coordinates are used only to get weather, not stored, not logged". `architecture.md` 5.2 (line 132) and the `Location` contract (line 65) store `lat`/`lon` in the favorites record. The Architect raises this as U3 (line 294) but the design, the matrix (REQ-WF6-06) and 3.4 already assume "store the place coordinates".
- Impact: a literal reading of the accepted default is violated by the baseline design. The alternative (store identity only, re-geocode on select) adds a request and an ambiguity risk.
- Recommendation: do not treat U3 as a footnote. Ask the human to rule explicitly on whether city-centroid coordinates count as "coordinates" for Q28, and record the ruling. If the human says no, update 3.4, 3.1 and the matrix.
- Status: Open (user decision U3).

**DR-03 (Medium) - `Location` contract mixes device and place coordinates and requires a time zone that a device location does not have.**
- Evidence: `architecture.md` line 65: `Location = { id, name, admin1?, country?, lat, lon, timeZone, source }`. Line 76 builds a `source:'device'` Location from the device position. Line 253 says the stored favorite uses "place-level coordinates, never the device coordinates". The contract has one `lat/lon` pair. For a device Location there is no geocoder, so no `timeZone` and no `id` exist until the weather response (or a reverse geocoder) provides them. The text does not say where `timeZone` comes from for REQ-WF4-01/02 (location-local days).
- Impact: an implementer could persist the device's precise coordinates in a favorite (a Q28 breach), or fail to compute location-local day boundaries for device locations.
- Recommendation: define the contract so a device Location carries its coordinates separately from a resolved place record. State the source of `timeZone` for device locations (for example, from the weather response, if the chosen provider returns it; not verified). State that the favorite record is built only from the resolved place.
- Status: Open.

**DR-04 (Medium) - Partial-failure, partial-refresh and update-time behaviour is under-specified and partly unresolved.**
- Evidence: 3.1 (line 60) says each section has its own Result. 3.5 (lines 83-88) specifies refresh success as "replace both sections" and failure as one outcome, with no per-section refresh outcome. 3.6 (line 92) says retry "re-requests the selected location", which is not stated to be section-scoped. The recommended provider can return both sections in one call (item 5, line 240), in which case network-level partial failure cannot happen and only a missing or invalid section can. Section 8 Q20 (line 285) gives each section its own `fetchedAt` and says a single time is shown "only when both sections share it", but not what is shown otherwise. U4 (line 295) leaves this open. REQ-WF5-05 and REQ-WF7-05 need a defined, non-misleading display.
- Impact: after a refresh where one section fails, the UI can show mixed-age data with no defined time label, which risks "confusing or misleading information" (WF-7 AC5). Testing REQ-WF5-02/04/05 is not possible until this is defined.
- Recommendation: state whether the port makes one call or two. Define the refresh outcome matrix (both OK, current only, forecast only, both fail). Define the retry scope. Resolve U4 in the document (for example, show per-section times only when they differ), or have the human decide.
- Status: Open (U4).

**DR-05 (Medium) - Browser HTTP cache is not addressed, which touches Q21 (no persisted cache), WF-5 (latest data) and Q28.**
- Evidence: D3 and 3.5 (line 88) say "Nothing is persisted", but weather and geocoding are plain browser GET requests (item 5, line 242). Browsers may store responses in the HTTP cache according to provider headers and may serve them on refresh. The request URL would include coordinates (see DR-10). No `no-store`/`reload` cache policy, no service worker statement and no mention of cache headers appears. Provider cache headers are not verified.
- Impact: a refresh might return stale data and then show a new "last update" time (a false statement). Weather responses and coordinate-bearing URLs could persist in the browser cache, against the intent of Q21 and Q28.
- Recommendation: add an explicit statement that adapters request with a cache-bypass policy for weather and reverse-geocoding calls, and that no service worker is used. Add a test for refresh returning new data.
- Status: Open.

**DR-06 (Medium) - Geolocation timeout and prompt handling is not implementable as written and leaves a waiting state undefined.**
- Evidence: item 2 (line 217) and R5 (line 308) say an unanswered permission prompt is treated as "still waiting", not as a timeout, because browsers differ on whether the timer includes prompt time (not verified). Section 3.1 (line 62) gives `getPosition({timeoutMs}, signal)`. The browser `getCurrentPosition` API (general knowledge, not verified) has no abort signal, and the app cannot always tell a prompt-time timeout from a fix timeout (the Permissions API is "where it exists", line 75). The text does not say what the UI shows while waiting, and whether city search stays usable.
- Impact: REQ-WF2-04 may be wrongly reported on browsers where the timer includes prompt time. The app may wait indefinitely with no visible state, or discard a late position silently after the user searched (3.7). A "silent discard" can look like the app ignored a granted permission.
- Recommendation: define the waiting state in the UI (loading message with search available). State the fallback when the Permissions API is missing. State that cancellation means "discard the result", not abort. State what happens if the position arrives after the user chose another location.
- Status: Open.

**DR-07 (Medium) - Item 7 rationale contradicts the provider comparison in item 5.**
- Evidence: item 7 (line 259): "three days is the provider-native window for the recommended and the free-plan alternatives". Item 5 (line 238) says the free OpenWeatherMap plan offers a 5-day/3-hour forecast and only WeatherAPI.com is described as "about 3 days including today". Whether Open-Meteo lets the caller choose the number of days is not stated in the document, and the reviewer could not verify it. Item 11 (line 274) also says `forecastDays` is a Config value, implying it is selectable.
- Impact: the stated reason for choosing "today plus two" is unsupported. The human could be misled about a rationale when deciding the A8 resolution.
- Recommendation: remove or correct the rationale. Keep the proposal on its other merit (today's forecast is useful for planning) and leave the choice (a/b/c) to the human.
- Status: Open.

**DR-08 (Medium) - Provider facts are unverified, and the technology stack plus reuse of prior code have no approval path.**
- Evidence (a): header line 12, item 5 (line 233) and R9 (line 312) say provider facts (terms, rate limits, attribution, no reverse geocoding, no key, CORS) come from general knowledge and must be verified before approval. They have not been verified, and this review had no network access either.
- Evidence (b): Section 4 (lines 111-120) marks React 19, Vite, Vitest, Playwright, axe-core, `localStorage` and the static-SPA choice as "Existing" or "Proposed" with rationale such as "Reuses repository conventions". Only Lucide (item 8) and the provider (item 5) are submitted as decisions in Section 7. The prior code is not approved (requirements line 27; architecture line 11). U6 (line 297) leaves keep/adapt/discard open and assigns it partly to the Design Reviewer. This review did not assess the existing code (out of scope for this task), so U6 cannot be answered here.
- Impact: the human could approve the architecture on unverified provider terms (especially non-commercial use, rate limits, which affect U2) and without knowing that the stack choice is being treated as settled by precedent.
- Recommendation: (a) verify provider terms and limits against current documentation before the human decides. (b) Present the technology table as a decision, with the prior-code rationale removed or marked as non-binding. (c) Resolve U6 with the Planner after approval, or ask the human now.
- Status: Open.

### Low

**DR-09 (Low) - Single-flight scope and abort handling.**
- Evidence: 3.7 (line 99) makes the single-flight flag "per selected location". Q19 default (`requirements.md` line 468) says "only one request is active". If a location change aborts a request asynchronously, two requests could briefly overlap. The error taxonomy (line 66) has no `aborted` kind, so an aborted request could be mapped to `network` and shown as a failure.
- Impact: a possible spurious error message after a legitimate abort. A brief overlap against REQ-WF5-03.
- Recommendation: make the flag global to the controller (one active load) and add an `aborted` outcome that is never shown to the user.
- Status: Open.

**DR-10 (Low) - "Never written to URLs" is inaccurate for provider calls.**
- Evidence: 5.2 (line 131): coordinates are "never written to storage, URLs, logs, or error text". Item 5 (line 242) describes direct browser calls to providers, whose queries normally carry latitude and longitude as URL parameters (not verified for each provider). Those URLs appear in browser developer tools and could be echoed in adapter error text.
- Impact: the privacy statement is wrong as written. Error text could expose coordinates.
- Recommendation: restate as "not written to the application's own URL (address bar), storage, logs or error text". Require that adapter errors never include the request URL. Consider rounding coordinates before sending (data minimisation); this is a suggestion for the human.
- Status: Open.

**DR-11 (Low) - Matrix "Open" markers are inconsistent.**
- Evidence: line 162 defines "Open" as dependence on an unapproved Section 7 proposal. Several rows depend on a proposal but are not flagged "Open", for example REQ-WF2-05 (item 5 and U1), REQ-WF6-06 (U3), REQ-WF7-02 (item 8 day/night text), REQ-WF5-05 (Section 8 Q20, U4), REQ-WF2-01 and REQ-WF2-02 (item 1, item 2), REQ-WF1-01/03 (Section 8 Q5).
- Impact: a reader of the matrix alone will underestimate the number of requirements that depend on unapproved values.
- Recommendation: mark every dependent row consistently, or add a column listing the dependent decision IDs.
- Status: Open.

**DR-12 (Low) - Contract and assumption inconsistencies.**
- Evidence: (a) Item 8 (line 263) needs a day/night flag, but the normalized domain model in C3 (line 44) lists no such field. (b) C3 returns "condition category and text" while C11 also owns "condition text" (line 51), so ownership is unclear. (c) Section 8 Q5 (line 282) says matching is "case-insensitive" and also that "the provider's matching decides". (d) Item 8 says "Clear" text replaces "Sunny" at night, but does not say whether daytime shows "Sunny" or "Clear".
- Impact: ambiguous implementation, and a possible mismatch with "sunny" examples in WF-3.
- Recommendation: add the day/night field to the domain model, name one owner for condition text, and correct the Q5 wording and the day text.
- Status: Open.

**DR-13 (Low) - Requirement-like statements and additions not marked as proposals or assumptions.**
- Evidence: 5.3 (line 138) calls a restrictive CSP and HTTPS "a deployment requirement". 5.5 (lines 148-149) lists accessibility behaviours (aria-live, focus restoration, keyboard operability) as design, while requirements Q26 says no accessibility requirement is added until the user specifies a standard (line 513). 3.3 (line 77) adds a retry "location-control button" that the Q11 default does not mention. The footer attribution and the footer note (C1, Section 8 Q28) add visible UI.
- Impact: these read as settled when they are Architect additions. They do not contradict the approved requirements, but the human should know they are additions.
- Recommendation: label them as design additions or proposals and list them in the approval request.
- Status: Open.

**DR-14 (Low) - Loading-indicator proposal is internally inconsistent.**
- Evidence: item 4 (line 228) says the indicator is "visible within 200 ms". C10 (line 50) has a "loading-indicator delay". 3.5 step 2 says the control is disabled "with a loading indication" for the whole request. 3.6 says loading never shows blank values, but a delay leaves a blank interval. The rationale says 200 ms is the limit to "feel immediate without flicker", which describes a delay before showing, not a maximum time to show.
- Impact: ambiguous test condition for REQ-WF7-05 and REQ-WF5-03.
- Recommendation: restate as either "indicator shown immediately" or "indicator shown after N ms, with the previous content kept or a neutral placeholder meanwhile".
- Status: Open.

**DR-15 (Low) - Favorites persistence robustness.**
- Evidence: the identity key is "provider ID, else name+admin1+country" (line 194). The stored record contains a provider-specific ID (line 253). No schema version is mentioned. `requirements.md` Q23 says "name plus country, or the provider ID".
- Impact: switching provider later would orphan or duplicate saved favorites. A mixed-key rule can let the same city be saved twice (once with an ID, once without). The added `admin1` is a refinement of Q23.
- Recommendation: add a stored schema version and one deterministic identity rule. Note the migration risk under R1.
- Status: Open.

**DR-16 (Low) - Verification feasibility.**
- Evidence: item 1 (line 212) lists real Safari on iOS and Chrome on Android. Section 4 (line 114) names Playwright for the browser matrix. Playwright can approximate engines (Chromium, Firefox, WebKit), but not real mobile devices or Edge on all targets (general knowledge, not verified). Item 3 equates axe-core with zero serious/critical violations as the WCAG 2.1 AA check, which covers only part of the criteria. Item 4's 3 s / 95% target depends on a third party and is not repeatable. 5.3's CSP depends on host header support (U5 unresolved).
- Impact: the stated verification does not fully demonstrate the proposed values.
- Recommendation: state which browsers are verified by automation and which by manual or documented review. State that the accessibility check is a partial check plus manual review. Keep the 3 s figure a non-gating observation.
- Status: Open.

### Info

**DR-17 (Info) - Verified positives.**
- All 40 IDs are traced. All 11 deferred items and all five 11.4 sub-questions are covered and labelled as proposals or assumptions. Status and approval wording is correct throughout (architecture lines 5, 209, 278, 318). Sections 5.1 and C12 are consistent with D5, and the supporting `.gitignore` entries and the scan script exist (conformance of the script not assessed). Single-flight with a synchronous guard and generation tokens (3.5, 3.7) is a sound answer to duplicate refresh and stale responses. Per-section state (3.6) is consistent with Q18. Components have clear responsibilities, with the provider isolated in C8. No contradiction with the "no accounts", "no persisted weather cache" and "no committed key" defaults was found at application level.
- Status: Resolved (informational).

## 4. Accepted Risks

None. No risk has been accepted by a human. The Architect's R1-R9 are open risks until the human decides.

## 5. Unresolved Questions and Decisions

(Round 0 text. After re-review, the consolidated list is in Section 9.2.) These are the Architect's U1-U7 plus the review items. All are open.

- U1 reverse geocoding (DR-01). U2 commercial use (DR-08). U3 place coordinates in favorites (DR-02). U4 update time on partial failure (DR-04). U5 hosting and deployment origin. U6 keep, adapt or discard existing code (DR-08). U7 message wording.
- Provider facts unverified (R9, DR-08).

## 6. Recommended Revisions (round 0; the Architect's response is assessed in Section 7)

1. DR-03: separate device coordinates from the resolved place record, and define the source of `timeZone` for device locations.
2. DR-04: define one-call or two-call fetching, the refresh outcome matrix, the retry scope and the displayed update time.
3. DR-05: add a cache-bypass policy and a "no service worker" statement.
4. DR-06: define the geolocation waiting state, late-result handling and the no-Permissions-API fallback.
5. DR-07: correct the item 7 rationale.
6. DR-08: verify the provider facts, and present the technology stack as a decision.
7. DR-01 and DR-02: restate U1 and U3 with their consequences in the approval request.
8. DR-09 to DR-16: apply the Low-severity clarifications or have the human accept them as conditions.

The Architect or user must make these revisions. This reviewer did not change `architecture.md` or `requirements.md`.

## 7. Re-review, round 1 of 1 (revised `architecture.md`, revision 1)

Date: 2026-10-30. Documents re-read: `requirements.md` (user-approved 2026-10-30; Section 12 quotes "approve the requirements"; deferred items 11.1-11.3 are not approved values), revised `architecture.md` including Section 12 (Revision log), and the round 0 findings above. `architecture.md` and `requirements.md` were not modified. No network access was used, so provider, browser and standards facts remain unverified by the Architect and by this reviewer. The Revision log was treated as a claim and each row was checked against the body text.

### 7.1 Status of round 0 findings

Status scale: Resolved (evidence supports it), Partially resolved (design text fixed, but a gap or human decision remains), Open.

| ID | Sev | Round 1 status | Evidence in revised `architecture.md` | Remaining |
|---|---|---|---|---|
| DR-01 | Medium | **Partially resolved** | Section 7 item 5 now has an (a)/(b)/(c) consequence table. It states plainly that under baseline (a) the Q12 place-name default is "dropped in practice" and a device location cannot be favorited. Item 6 repeats this. U1 (Section 9) carries it. | The gap itself stays until the human picks an option (decision 4 below). Option (c) scope is unclear (DR-22). |
| DR-02 | Medium | **Partially resolved** | 3.4 "Coordinates in favorites" labels the centroid storage an explicit Architect assumption, describes the full alternative (identity only, re-geocode on select, ambiguity case) and lists the changes it needs. 5.2 and U3 ask for the ruling. | The Q28 question is unanswered. Only the human can rule (decision 5). |
| DR-03 | Medium | **Resolved** | 3.1 splits `Coordinates`, `Place` and `SelectedLocation` (`place` or `device`). C6 accepts only a `Place`, so device coordinates cannot reach storage. Time zone comes from the weather response for both kinds, with a stated fallback if absent. | The time-zone field in the weather response is unverified (checklist item 5). |
| DR-04 | Medium | **Resolved** | 3.1 and 3.5 define one logical `get` (one or two HTTP calls), the refresh outcome matrix (four cases), the retry scope (whole result, same single-flight rule) and the update-time display (one line if equal, two labelled lines if not). | U4 needs human confirmation. Two sub-gaps are new Low findings (DR-18, DR-19). |
| DR-05 | Medium | **Resolved** | New 3.9: `cache: 'no-store'` on provider calls, no service worker or Cache API, a build check, a changed-payload test that asserts the `cache` option, and stated limits (CDN and provider caches). D3 and R10 updated. | None for the app. Intermediary caches are out of the app's control, as stated. |
| DR-06 | Medium | **Resolved** | 3.3 gives an app-owned watchdog and a state machine (`idle`, `requesting`, `located`, `timed_out`, `denied`, `unavailable`), a visible waiting message with city search enabled, a no-Permissions-API fallback, "discard, not abort" semantics, and a stated late-result rule. R5 and R11 added. | Browser behaviours are unverified. A residual waiting-state risk is DR-20. |
| DR-07 | Medium | **Resolved** | Item 7 now says "No claim is made that three days is a provider-native window" and gives the rationale on its own merit. The a/b/c choice is left to the user. | None. |
| DR-08 | Medium | **Partially resolved** | (a) Provider facts: still unverified. The Architect added an UNVERIFIED banner (header), a Section 7 item 5 checklist, and an instruction not to decide U2 or the provider before it is completed. It was not completed (no network). (b) Stack: Section 4 now presents it as decision T1 with technical rationale, and prior-code reuse is stated as non-binding. (c) U6: put to the user in Section 9. | (a) is Open and cannot be closed by this reviewer. Provider approval has a stated precondition that is not met. (b) has residual prior-code rationale in Section 7 items 1 and 8 (DR-21). |
| DR-09 | Low | **Resolved** | 3.7: the single-flight flag is controller-wide. On a location change the controller aborts, marks `aborted`, releases the flag and starts the new load in one synchronous step. 3.1 adds the internal `aborted` kind, never shown and never mapped to `network`. | None. |
| DR-10 | Low | **Resolved** | 5.2 now says provider URLs carry coordinates and are visible in developer tools. It requires adapter errors to exclude URLs and coordinates, bypasses the HTTP cache, and proposes 2-decimal rounding (U8). | U8 is a human choice, not a defect. |
| DR-11 | Low | **Resolved** | A Dependency index follows the matrix. It covers all 40 IDs (counted: 40). Rows are mostly accurate. | Small omissions (DR-22). |
| DR-12 | Low | **Resolved** | `isDay` is in `Current` (3.1). C11 alone owns condition text (C3 and item 8). Day text is "Sunny" by day and "Clear" at night. Section 8 Q5 now says the app does no matching of its own except on the qualifier. | Two small inconsistencies are in DR-22. |
| DR-13 | Low | **Resolved** | New 8.1 lists nine Architect additions that need confirmation. 5.3 (CSP) and 5.5 (accessibility) are labelled proposals tied to the unapproved Q26. | None. |
| DR-14 | Low | **Resolved** | 3.6: the indicator is shown immediately, with no deliberate delay. C10 no longer has a delay. Item 4 restates 200 ms as a render budget. | None. |
| DR-15 | Low | **Resolved** | 3.4 defines a versioned record (`v: 1`) with discard-on-unknown-version, one deterministic provider-independent key (`name|admin1|country`, normalized), and R1 notes the migration risk. | The key rule refines Q23, and the human confirms it in U3 (decision 5). |
| DR-16 | Low | **Resolved** | New 7.0 states what automation covers and does not (real iOS/Android, Edge), that axe-core is partial for WCAG 2.1 AA, that the 3 s / 95% figure is non-gating, and that CSP depends on U5. | One cross-reference nit (DR-22). |
| DR-17 | Info | **Resolved (informational)** | Positives re-verified: 40 IDs traced, 11 deferred items and 5 assumptions covered, status wording correct, no key policy consistent. | None. |

Counts for DR-01..DR-16: **Resolved 13, Partially resolved 3, Open 0.** DR-17 stays Resolved (informational). The three partials (DR-01, DR-02, DR-08) all end in a human decision or a verification this reviewer cannot perform.

### 7.2 New findings introduced by the revision

All are Low. No Critical, High or new Medium finding was found. Each was checked against the text of the revised file.

**DR-18 (Low) - "Keep previous data" is not scoped to the same location.**
- Evidence: the outcome matrix (3.5) says "keep previous data if any, else error". Section 8 Q19 says previously loaded data for the old location is not shown under the new location. 3.7 does not say that per-section `data` and `fetchedAt` are cleared when the selection changes. Read literally, a first load for a new location that partly fails could keep the old city's section.
- Impact: a possible misleading display (old city's weather under the new label), against WF-7 AC5.
- Recommendation: state that section state is reset on any location change, and that "previous data" means data for the same selected location.
- Status: Open. Can be handled as a condition for the Planner.

**DR-19 (Low) - Two-request provider: transport failure of one request is not mapped consistently with Q18.**
- Evidence: 3.1 says a transport, timeout or rate-limit failure "fails the whole `get`". 3.5 "Fetch shape" lets the adapter make two parallel requests and still return one `WeatherResult`. 3.6 implies per-section failure is possible with two requests. It is not stated whether one failed request discards the other's good data. Accepted Q18 says the successful part is still shown.
- Impact: applies only if a two-request provider is chosen (not the recommended one). It could break Q18.
- Recommendation: state that with two requests each request maps to its own section result, and only a failure of both fails the whole `get`.
- Status: Open (low impact for the recommended provider).

**DR-20 (Low) - The geolocation waiting state has no upper bound.**
- Evidence: 3.3 step 2 starts no watchdog while the Permissions API reports `prompt`, and starts it when the status changes to `granted`. No browser timeout is passed. If a browser keeps reporting `prompt` after a temporary grant, or fires no change event (both unverified), the watchdog never starts. A fix that never arrives then leaves "Detecting your location..." on screen indefinitely.
- Impact: limited, because city search stays enabled, but REQ-WF2-04 would never fire and the message would be misleading.
- Recommendation: add a ceiling on the waiting state after the call is issued, or a visible "search instead" cue. Confirm the Permissions API behaviour in a manual device test.
- Status: Open.

**DR-21 (Low) - Prior-code rationale remains in Section 7 items 1 and 8.**
- Evidence: item 1 says the 768/1024 breakpoints "equal the prior code's defaults (unconfirmed)". Item 8 cites Lucide as "already a repository dependency". The Revision log (DR-08 row) and Section 4 say prior-code rationale was removed.
- Impact: the human may weigh precedent in decisions 7 and 12. The Revision log overstates the clean-up.
- Recommendation: remove those two phrases, or label them non-binding as in Section 4.
- Status: Open.

**DR-22 (Low) - Small internal inconsistencies and omissions.**
- Evidence:
  - Section 8 Q5 says the only case-insensitive comparison is on the qualifier, but the favorites identity key in 3.4 lower-cases the name.
  - 7.0 says the manual accessibility review is "in the item 3 checklist" and names a keyboard-only walk-through and a screen-reader pass. Item 3 (a)-(f) does not list those two.
  - The Dependency index omits U7 (message wording) for the requirements with error messages, U5 for REQ-WF2-01 (secure context), and A-Q5 for REQ-WF1-04 (trim, 100-character cap). T1 is listed for some rows and not others.
  - Item 8 uses day variants and "Sunny" when the provider supplies no `isDay`. That shows "Sunny" at night, the case DR-12 was raised about.
  - Item 5 option (c) says "a keyed provider with an edge proxy". It does not say whether this replaces the weather provider or only supplies reverse geocoding.
- Impact: low. The option (c) wording matters because the human decides U1 on it.
- Recommendation: fix the wording or take these as Planner conditions. For `isDay` absent, use neutral "Clear" text. State the scope of option (c).
- Status: Open.

### 7.3 Re-verified coverage

| Check | Result |
|---|---|
| 40 requirement IDs in the traceability matrix | Present: WF1 5, WF2 5, WF3 5, WF4 5, WF5 5, WF6 6, WF7 6, X 3 = 40. No ID missing or duplicated. |
| 40 IDs in the Dependency index | Present, counted 40. |
| Deferred items 11.1-11.3 (11 items) | All covered in Section 7 items 1-11 and labelled "PROPOSAL, pending user approval": Q2, Q10, Q26, Q29, Q3, Q12/Q23, Q13 (with A8), Q16, P-OUT-2, P-OUT-3, P-OUT-4 remainder. |
| 11.4 assumptions (5) | All covered in Section 8 and labelled as needing user confirmation: Q5, Q11, Q19, Q20, Q28. |
| Approval language | The revised file claims no approval anywhere. Header, Section 11 and Section 12 say draft / not approved, and the Revision log says it records no approval. |
| Accepted defaults | No new conflict found beyond the DR-01 and DR-02 questions that remain with the human. |

Limitation: the Architect's provider, browser, Permissions API, licence and standards statements remain unverified. This reviewer could not verify them.

## 8. Round 0 verdict (superseded by Section 9)

- Architecture status: **NOT APPROVED.**
- Human approval decision: **PENDING.**
- Revisions required: **Yes.** There are no Critical or High findings and the structure is sound, but the eight Medium findings (DR-01 to DR-08) affect approved defaults (Q12, Q21, Q28), WF-5 behaviour, and decisions the human would otherwise make on unverified or contradictory material. A revised draft should be re-reviewed before a final approval request, or the human may approve with explicit conditions covering the open findings.
- This review does not authorize implementation planning. Planning may proceed only after explicit human approval is recorded here and any blocking conditions are met.

### Round 0 decisions list (superseded by Section 9.2)

1. Q2 (item 1): supported browsers, OS and breakpoints (768/1024; 320 px minimum).
2. Q10 (item 2): location timeout of 10 s, and the 10 s weather/geocoding timeout.
3. Q26 (item 3): WCAG 2.1 AA and the REQ-WF7-01 assessment checklist.
4. Q29 (item 4): 200 ms indicator, 3 s / 95% target, 200 KB budget (and DR-14).
5. Q3 (item 5): the provider (Open-Meteo recommended), after verification of terms (DR-08); U2 commercial or non-commercial.
6. U1 / Q12 / Q23 (items 5-6): reverse-geocoding option and whether device locations can be favorited (DR-01).
7. U3: whether place coordinates in favorites are consistent with Q28 (DR-02).
8. Q13 and A8 (item 7): include today or not, and date format.
9. Q16 (item 8): Lucide icon set and day/night variants.
10. P-OUT-2, P-OUT-3, and P-OUT-4 remainder (items 9-11): confirm as out of scope or not.
11. The five assumptions in Section 8 (Q5, Q11, Q19, Q20, Q28), plus U4 update-time display.
12. The technology stack and the disposition of the existing implementation (U6, DR-08), U5 hosting, U7 message wording.
13. Whether the Medium and Low findings above are to be revised first or accepted as conditions.

## 9. Updated Verdict and Decisions (after re-review round 1)

### 9.1 Verdict

- Reconciled 2026-11-02: the two lines below record the state at the end of re-review round 1 and are superseded by Section 10 (APPROVED WITH CONDITIONS, 2026-10-30). Current status is in Section 10 and the header rows.
- Architecture status (earlier state, superseded): **NOT APPROVED.**
- Human approval decision (earlier state, superseded): **PENDING.** No human has approved, conditionally approved or rejected this architecture. Nothing in this document is, or implies, approval.
- Review result: the revision resolved 13 of 16 findings. Three are partially resolved (DR-01, DR-02, DR-08) and none is Open. The revision added five Low findings (DR-18..DR-22). There are no Critical or High findings and no new Medium finding. This is the final review round, so no further Architect revision is requested by this reviewer. Remaining items go to the human.
- Blocking items for human approval: none of the findings is a technical blocker. Three things need the human before approval is meaningful: (1) DR-08(a), provider facts are unverified and the Architect's own instruction is not to decide the provider or U2 until the Section 7 item 5 checklist is completed; (2) U1 and U3, which decide whether accepted defaults Q12 and Q28 are honoured in practice; (3) the unapproved deferred values themselves.
- Possible outcomes for the human: approve; approve with conditions (for example "complete the provider verification checklist before implementation starts" and "DR-18..DR-22 are fixed during planning"); reject; or send back for another revision. This reviewer records only the outcome the human states.
- This review does not authorize implementation planning. Planning may proceed only after explicit human approval is recorded in Section 10 and any blocking conditions are met.

### 9.2 Decisions the human must make to approve (consolidated)

Every value is the Architect's PROPOSAL. None is approved. Source references are to `architecture.md`.

1. **T1, technology stack (Section 4).** Proposed: static SPA with no own backend; TypeScript, React 19, Vite; Vitest with Testing Library, axe-core and Playwright; Lucide icons; `localStorage`.
2. **U6, existing implementation (`src/`, tests, e2e, `scripts/`).** Proposed: no value. The Architect says the design is independent of it and that a conformance review of `src/` must precede any reuse. The user decides keep, adapt or discard.
3. **Provider (Q3, Section 7 item 5) and U2, commercial use.** Proposed: Open-Meteo for weather and forward geocoding, no API key, no proxy. Facts are unverified. The Architect's precondition is that the item 5 checklist is completed and recorded before this is decided. If the product is commercial, the free tier is believed not to apply (unverified).
4. **U1 with Q12 and Q23 (items 5 and 6): reverse geocoding and favoriting a device location.** Proposed: option (a), no reverse geocoder. The label is always "Current location", the Q12 place-name default is dropped in practice, and a device location cannot be favorited (the user searches the city instead). Alternatives: (b) a second keyless reverse geocoder, or (c) a keyed provider with an edge proxy (scope unclear, DR-22).
5. **U3: does Q28 cover a place's city centroid in favorites?** Proposed: store the centroid (stated as an assumption). If the ruling is yes, the alternative is identity-only storage with re-geocoding on selection. Also confirm the identity rule (lower-cased `name|admin1|country`) and the versioned record.
6. **U8: coordinate rounding.** Proposed: round to 2 decimals (about 1 km) before sending to the weather provider.
7. **Q2 (item 1): browsers, OS, breakpoints.** Proposed: latest two stable Chrome, Edge, Firefox and Safari on Windows 11 and macOS (current and previous major), Safari on iOS and Chrome on Android; minimum width 320 px; breakpoints 768 and 1024 px.
8. **Q10 (item 2): timeouts.** Proposed: 10 s app-owned location watchdog (started after permission is granted); 10 s weather and geocoding request timeout.
9. **Q26 (item 3): accessibility.** Proposed: WCAG 2.1 AA with a checklist-based assessment of REQ-WF7-01 (axe-core with zero serious or critical violations, headings and landmarks, 16 px text at 4.5:1 contrast, labels and units, no horizontal scroll at 320 px, a manual walk-through). Applies only if approved.
10. **Q29 (item 4): performance.** Proposed: indicator shown immediately (200 ms render budget); 10 s request timeout; 3 s for 95% of requests as a non-gating observation; at most 200 KB gzipped initial JavaScript.
11. **Q13 and A8 (item 7).** Proposed: today plus the next two days, using the location's time zone; first card labelled "Today"; date format short weekday, day and month, for example "Thu, 30 Oct".
12. **Q16 (item 8): icons.** Proposed: Lucide icons for clear, partly cloudy, cloudy, fog, drizzle, rain, snow, thunderstorm, plus a generic fallback; day/night variants and "Sunny"/"Clear" text only for clear and partly cloudy in the current-weather card.
13. **P-OUT-2, P-OUT-3, P-OUT-4 remainder (items 9-11).** Proposed: confirm all three as out of scope.
14. **The five Section 8 assumptions (11.4).** Proposed: Q5, trim and collapse whitespace, pass text to the provider, split on the first comma and filter by qualifier, 100-character cap; Q11, request location on every open, no stored "denied" flag, "Use my location" control with a browser-settings hint; Q19, abort or discard the old request, start the new load, never show old-location data; Q20, device-local short time style, shown after any successful load; Q28, no consent text beyond the browser prompt, a one-line footer disclosure, no analytics, telemetry or cookies.
15. **U4: update-time display when sections differ.** Proposed: one "Updated HH:MM" line when equal, two labelled lines when they differ.
16. **U5: hosting target and deployment origin** (and the proposed CSP and HTTPS-only deployment). Proposed: no value; any static HTTPS host.
17. **U7: wording of all user-facing messages.** Proposed: no value (user or Planner).
18. **Section 8.1: nine Architect additions** ("Use my location" control, waiting message, footer attribution and disclosure, error boundary, two-line update time, accessibility behaviours, CSP, coordinate rounding, service-worker build check). Proposed: keep all; the human confirms or removes each.
19. **Disposition of the remaining review items.** DR-01, DR-02 and DR-08 follow from decisions 3 to 5. DR-18..DR-22 (Low): the human chooses to have them fixed in the architecture, or accepts them as conditions for the Planner. Proposed by this reviewer: accept as Planner conditions.

## 10. Approval Record

| Field | Value |
|---|---|
| Human approval status | **APPROVED WITH CONDITIONS** |
| Decision | Asked how to decide the Section 9.2 items, the user chose "Accept all proposals" (all 19 decisions as proposed). |
| Approver | The user, in the top-level Claude Code session |
| Conditions | (1) DR-08: complete and record the architecture Section 7 item 5 provider checklist before implementation starts; U2 (commercial use) stays open until then. (2) U6, U5 and U7 had no proposal and are not decided: the Planner raises them with the user, and a conformance review of `src/` precedes any reuse. (3) DR-18..DR-22 are accepted as conditions for the Planner. |
| Date | 2026-10-30 |
| Recorded by | The top-level Claude Code session, which received the user's choice directly. Not an agent or reviewer decision. |

Note: Sections 1 to 9 above are the review as written and still describe the state before this approval.
