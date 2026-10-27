# Provider and Icon Decisions - User Answers

Answers given by the user in the Claude Code chat on 2026-10-27 and recorded here by the main session. They are the user's statements. The agents have not verified them against the provider's documentation.

## A. Weather provider (TASK-001)

**A0. Provider:** Open-Meteo. No API key is required for the free non-commercial API. No payment within the free-tier limits.

| # | Question | Answer | Notes (user's words) |
|---|----------|--------|----------------------|
| 1 | Do the terms allow the intended use? | Yes | For a non-commercial student/demo application. |
| 2 | Is attribution required? | Yes | Wording: "Weather data by Open-Meteo.com", linked to https://open-meteo.com/. Follow the CC BY 4.0 attribution requirements. |
| 3 | Rate limits vs expected usage | Sufficient | Fewer than 10,000 calls/day, 5,000/hour, 600/minute; 300,000/month. Enough for a student/demo app with caching and debouncing. |
| 4 | Reverse-geocoding endpoint? | **No** | No documented reverse-geocoding endpoint in Open-Meteo's Geocoding API. Another provider would be needed to convert coordinates to a city name. |
| 5 | Browser access over HTTPS (CORS)? | Yes | Direct HTTPS browser requests are supported through CORS. |
| 6 | Forecast reports location time zone? | Yes | Use `timezone=auto`. |

## B. Icons and deferred values (TASK-002)

- **B1. Icon set:** Lucide icons, ISC licence. Map weather conditions to appropriate icons and provide accessible labels.
- **B2. Breakpoints, viewport range, `maxInputLength`:** keep the proposed values in `impl-plan.md` Section 3 (verify the exact values against the requirements document).
- **B3. NFR-004:** accepted. Loading state within 200 ms and both sections within 3 seconds for 90% of requests, under defined test conditions.

## C. Remaining decisions

- **C1. Hosting:** GitHub Pages, for the static student/demo release.
- **C2. Over-long search input:** add a dedicated error message.
- **C3. Wide-screen visual order vs tab order:** not acceptable. Keep visual order and keyboard tab order aligned.
- **C4. Open questions OQ-001 to OQ-014:** keep the recommended defaults provisionally. Mark unresolved decisions as assumptions/TBD and confirm them before finalizing the requirements.

## D. Consequences recorded by the main session

- **A4 = No:** reverse geocoding is unavailable, so a device location cannot be turned into a named place with this provider. Under the approved architecture, device-location favorites stay disabled. TASK-024 (reverse geocoding) would not be built unless the user names a second provider.
- **A1 limits the release:** the user's answer covers a non-commercial student/demo use only. Any commercial use needs a fresh check of the provider's terms.
- **C2 and C3 are new work:** C2 needs a new error code (an architecture amendment the user has now requested), and C3 needs a UI layout change. Neither is an approved task yet.
- **C1:** deploying to GitHub Pages is a publishing action and needs separate explicit authorization from the user when the time comes.
