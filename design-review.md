# Weather Application - Design Review

**Approval status: Approved with Conditions (see Section 9)**

At the time of this review no human approval of the architecture had been given. The user's first "approve" was permission to start this review. The user later approved Revision 2 with conditions; see Section 9.

**Historical record (noted 2026-10-27):** Sections 1 to 8 describe the review at its own point in time (the original architecture, status "Pending Review", no application code, no accepted risks). The current approval status is the one in the header and Section 9: Approved with Conditions, 2026-10-26.

## 1. Scope and Evidence

- Reviewed: `requirements.md` (status Approved, Section 10, user message "approve", 2026-10-26, OQ-001 to OQ-014 TBD), `architecture.md` (status Pending Review), and `.claude/input/userstory.md` (US-002 only, to check the ODD-5 reading).
- Requirements approval evidence: `requirements.md` Section 10 plus the task statement from the invoking agent. The original chat message could not be independently verified.
- The repository has no application code, so the review is document-only. No technology claim about external providers (Open-Meteo terms, reverse geocoding, Permissions API support) was verified. Those claims are marked "verify".
- `requirements.md` and `architecture.md` were not modified.

## 2. Requirements Coverage

- FR-001 to FR-045 and NFR-001 to NFR-008 each appear in architecture Section 2 or are tied to an ODD. No requirement is omitted. The "consistency check" in architecture Section 9 holds.
- TBD requirements (FR-007, FR-012, FR-013, FR-017, FR-025, FR-031, FR-038, FR-039, NFR-002 to NFR-005, NFR-007, NFR-008) are addressed by an ODD with a default. They are not resolved.
- The design stays within scope. It adds no accounts, offline mode, hourly forecast or similar items.
- Traceability is sound at the requirement level. Minor defects are in F-011.
- Blocking gaps: none that prevent a coherent design. Several defaults need explicit user decisions (Section 5).

## 3. Findings (ordered by severity)

No Critical or High findings.

### Medium

**F-001 Medium. ODD-5 launch default weakens the US-002 intent (Pending Decision)**
- Evidence: US-002 story says "automatically detect my location". ODD-5 uses device location on launch only if permission is already granted. Otherwise the user must press "Use my location".
- Impact: first-time users never get the automatic experience. FR-008 and FR-009 can be read either way, so conformance is arguable.
- Recommendation: the user chooses between (a) button only, (b) prompt on first load, or (c) first load plus a hint. Architecture Section 4.2 should record the choice.

**F-002 Medium. ASM-2 single `fetchedAt` can misstate freshness (Open)**
- Evidence: architecture 4.6 updates `fetchedAt` if at least one section succeeds. Flow C step 4 says a failed refresh keeps the previous `fetchedAt`. FR-030 says "after a successful refresh", and FR-027 says both sections update.
- Impact: the UI may show a new update time next to stale data in the failed section. The two passages are also inconsistent.
- Recommendation: use per-section timestamps, or update `fetchedAt` only when both sections succeed. Reconcile Flow C with ASM-2.

**F-003 Medium. ODD-7 duplicate identity is unsafe as written (Open)**
- Evidence: identity is "same rounded coordinates (2 decimals)", about 1.1 km.
- Impact: two distinct nearby places can be treated as duplicates, which would be wrongly blocked by FR-035. Rounding boundaries can also let the same place pass as two entries. The fallback "name+country when coordinates are missing" contradicts the domain model, where latitude and longitude are required (Section 3).
- Recommendation: use a provider place ID when available, otherwise name+country+admin region. Do not rely on rounding. Fix the fallback clause.

**F-004 Medium. Precise device coordinates may be persisted without a privacy decision (Pending Decision)**
- Evidence: ODD-5 lets a device-location result become a favorite, so exact coordinates go into `localStorage` (6.3). ODD-10 defaults to no privacy notice. Search text and coordinates are sent to a third-party provider. NFR-005 and OQ-012 are TBD.
- Impact: this may store a user's home or work location. The "memory only" claim in 6.3 is true only until the user saves a favorite.
- Recommendation: the user decides on OQ-009 and OQ-012. Options are to disallow device-location favorites, round the saved coordinates, or add a short notice.

**F-005 Medium. Default provider (ODD-12) is unverified and may not fit (Pending Decision)**
- Evidence: architecture 6.1 says "unverified against current terms". The reverse lookup is optional (5.1), and Open-Meteo is believed to lack reverse geocoding (verify).
- Impact: free tiers are typically restricted to non-commercial use and may require attribution (verify). Without reverse lookup, FR-003 for device-location results degrades to "Current location". Several such favorites would then be indistinguishable in the list.
- Recommendation: the user confirms the provider and its terms. Specify the label fallback for device-location favorites, for example coordinates or a user-editable name. Add attribution to the design if the terms require it.

**F-006 Medium. Keyed-provider proxy is under-specified (Open, conditional on OQ-002)**
- Evidence: 6.2 recommends a proxy but gives no origin restriction, rate limiting, abuse protection or error contract.
- Impact: an open proxy would leak quota and may breach terms.
- Recommendation: if a keyed provider is chosen, the architecture must be revised and re-reviewed. This does not block the keyless default.

**F-007 Medium. Late location result can override a later user search (Open)**
- Evidence: request tokens protect C6 loads (4.6). The Location Flow (C5) has no cancellation. A slow `getCurrentPosition` finishing after the user has searched a city then calls `load` and replaces the displayed city.
- Impact: the wrong city appears for the user's last action.
- Recommendation: give C5 results the same token, or cancel the location flow on a new user intent.

**F-008 Medium. NFR-004 has no measurable target, so it cannot be verified (Pending Decision)**
- Evidence: ODD-4 leaves the response-time target to the user. 10 s timeouts are placeholders.
- Impact: this does not block design or planning. The Verifier will not be able to test NFR-004.
- Recommendation: the user supplies a target or explicitly accepts "no target".

### Low

- **F-009 Low. `getPermissionState` portability.** The port assumes a permission query exists. Some browsers may not support it for geolocation (verify). The adapter must fall back to `prompt` when it is unsupported. Add this to 5.3.
- **F-010 Low. Secure context.** Browser geolocation needs HTTPS. Static hosting must serve HTTPS. This is not stated in 1.1 or Section 7.
- **F-011 Low. Traceability and contract inconsistencies.**
  - Section 2 labels "C5-ports" for the geocoding and weather ports, but C5 is Location Flow.
  - The C1 trace list omits FR-002, FR-019, FR-020, FR-027 and FR-028.
  - The C5 outcome names (`GRANTED`, `PROMPT_REQUIRED`, `DENIED`) do not match the port contract (permission states plus `AppError` codes).
- **F-012 Low. `Location.timezone` is optional but forecast dates depend on it (ODD-3).** Define the fallback when the provider returns none.
- **F-013 Low. Deferred values.** Breakpoints, input length cap and viewport range are deferred to planning. This is acceptable if the Planner records them.
- **F-014 Low. No logging or diagnostics approach.** Optional. Note it as out of scope or add a minimal approach.

## 4. Safety of Assumptions and Defaults

- **ASM-1** (web SPA, TypeScript, React, static hosting): reasonable and isolated by the adapters. It needs explicit confirmation, because it fixes the UI layer and two adapters.
- **ASM-2:** not safe as written (F-002).
- **ASM-3 and ASM-4:** safe. ASM-4 depends on F-003 being fixed.
- **ODD-2, 3, 6, 8, 9, 11, 13, 14:** acceptable as defaults.
- **ODD-1, 4:** acceptable. ODD-4 has the F-008 caveat.
- **ODD-5, 7, 10, 12:** need an explicit user decision (F-001 to F-005).

## 5. Unresolved Questions and Decisions for the User

1. OQ-001, OQ-005: confirm ASM-1 (web SPA, `localStorage`) or name another platform.
2. OQ-002: confirm provider and terms (F-005).
3. OQ-003, OQ-004: accept ODD-2 and ODD-3, or choose different values.
4. OQ-009 and OQ-012: ODD-5 launch behavior and device-location favorites, and the privacy stance (F-001, F-004).
5. OQ-006: favorites identity rule (F-003).
6. OQ-008: response-time target or explicit "none" (F-008).
7. The remaining OQs (007, 010, 011, 013, 014): accept the defaults or state a different answer.

## 6. Accepted Risks

None recorded. No human has accepted any risk.

## 7. Recommended Revisions (Architect, via the Orchestrator)

Address F-002, F-003, F-004 and F-005, plus F-007. Apply the low-severity corrections in F-009 to F-012. Record the user's decisions as the chosen ODD values. Re-review the revised document before final approval. If the user accepts the findings as risks, record them with the user as the decision-maker.

## 8. Recommendation

Not recommended for approval as-is. The architecture is structurally sound and covers all requirements. No Critical or High findings exist. Revisions F-002, F-003 and F-007 are cheap and should be made first. Items F-001, F-004 and F-005 need user decisions. If the user explicitly accepts them, "Approved with Conditions" is a reasonable outcome.

## 9. Human Approval Record

- Status: **Approved with Conditions**
- Approver: the user (Jayasri), directly in the Claude Code session
- Decision: approved Revision 2 of architecture.md, including its recommended defaults for ASM-1..4 and ODD-1..14 (user message "approve", in reply to the choice "re-review first, or approve the revised design now")
- Conditions: (1) Revision 2 was NOT re-reviewed by the Design Reviewer; the user chose to skip re-review. (2) F-005 (Open-Meteo terms, attribution, rate limits, reverse geocoding, CORS) is unverified and remains a user checklist before release. (3) OQ-001 to OQ-014 remain unanswered; the defaults stand until the user changes them.
- Date: 2026-10-26
- Recorded by: the main Claude Code session, from the user's own message.
