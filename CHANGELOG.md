# Changelog

> **DRAFT. Local file only. Nothing here has been released, tagged, committed, pushed or deployed.**
>
> **Scope note.** This is the first feature branch on top of a setup-only `main` (agent definitions and user story), so the diff is the whole application. Before the branch was created the project folder was not a git repository, so there was no earlier history to read. This changelog is derived from the project artifacts (`requirements.md`, `architecture.md`, `design-review.md`, `impl-plan.md`, `verification.md` Run 4, `docs/provider-checklist.md`, `docs/deployment.md`, `README.md`), `package.json` and the actual file tree. A sample of claims was checked against the files (see "How this was derived" at the end). Everything else is as reported by those artifacts.
>
> **This is not a release-readiness statement.** TASK-046 (release readiness) is not approved and is blocked. Publishing needs the user's separate, explicit authorization.

## [0.0.0] - unreleased draft (initial version)

The version is the value in `package.json` (`"version": "0.0.0"`, `"private": true`). No version bump and no release date have been chosen.

### Added

A responsive single-page web app (TypeScript, React 19, Vite) that shows weather from the keyless Open-Meteo APIs.

- **City search** (US-001): submit a city name; if several places match, a chooser is shown; "city not found", empty input and service-error messages. A dedicated message for over-long input (change request C2; limit `maxInputLength` = 100 characters, a proposal the user accepted to keep).
- **Current weather** (US-003): temperature, humidity and condition with a weather icon and text; missing values are shown as unavailable instead of hidden.
- **3-day forecast** (US-004): date, temperature and condition with an icon for each day. Defaults: today is not counted as day 1; the location's own calendar dates are used (`timezone=auto`).
- **Manual refresh** (US-005): refreshes current weather and forecast together, avoids duplicate in-flight requests, keeps the previous data if a refresh fails, and shows the last successful update time.
- **Temperature unit toggle** (Celsius/Fahrenheit, default Celsius), saved in the browser.
- **Favorites** (US-006): add, list, select, remove, no duplicates, saved in the browser's `localStorage` (keys `weather-app.favorites` and `weather-app.settings`).
- **Device location** (US-002): "Use my location" asks the browser for permission only when the user presses it. Falls back to city search when permission is denied or the location fails or times out. A device location is shown as "Current location".
- **Privacy disclosure** next to "Use my location" saying what the weather service receives (see the pull request draft).
- **Data-source attribution** (TASK-025): "Weather data by Open-Meteo.com" (linked to https://open-meteo.com/) and "Location data based on GeoNames" in the footer, plus a short linked Open-Meteo credit inside the Current weather and Forecast panels while they show real data; a link to the third-party notices. All gated by `Config.attributionText`.
- **Lucide weather icons** (TASK-035): eight icons (sun, cloud-sun, cloud, cloud-rain, cloud-snow, cloud-lightning, cloud-fog, circle-question-mark), tree-shaken into the build. The condition text is always shown beside the icon.
- **Demo mode, opt-in only** (`npm run dev:demo`, `npm run build:demo`): invented, clearly labelled sample data (for example "Testville") and no network use, with its own storage key prefix. Demo code is excluded from normal and release builds.
- **Release guard and bundle scans**:
  - `npm run build:release` (build, then `npm run scan:dist`); a plain build refuses to run when `VITE_USE_DEMO=true` is set.
  - `scan:dist` fails on credential-like text, non-HTTPS URLs, demo markers, an icon set other than the pinned eight, and a missing or incomplete `THIRD_PARTY_NOTICES.txt` entry for any runtime package. `scan:dist:demo` checks a demo build.
  - It is a pattern scan, not proof that no secret is present (see `docs/deployment.md`).
- **Accessibility and responsive layout work**: WCAG 2.1 AA as the working target (a default, not a confirmed decision); mobile-first layout with wide (768 px) and extra-wide (1024 px) tiers over a proposed 320-1920 px range; on wide screens visual order matches keyboard tab order (change request C3); live regions for status, focus handling, labelled controls; the favorite button's accessible name was fixed for WCAG 2.5.3.
- **Static-site build for a sub-path host**: release builds use the Vite base `/claude-project/` (override with `VITE_BASE`); an inline empty favicon; relative notices link.
- **Tests and tooling**: Vitest unit, component and scenario tests (51 files); Playwright browser tests in installed Edge and Chrome (`e2e/`, 4 spec files); a manual live smoke test (`npm run smoke:live`, 3 real requests); ESLint; strict TypeScript.
- **Documentation**: `README.md`, `docs/deployment.md`, `docs/provider-checklist.md` (the user's provider and icon answers).

### Changed

There is no earlier release, so there are no behavior changes against a published version. Recorded design decisions that shape the behavior:

- Provider is Open-Meteo (user decision, 2026-10-27). Requests are plain GETs: no custom headers, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, HTTPS only, search text percent-encoded, latitude/longitude rounded to 2 decimals before being sent.
- Geocoding requests reuse the 10 s `weatherTimeoutMs`. The time zone name is not shown in the UI.
- Launch behavior is the architecture's default (no location prompt at first paint); TBD requirements OQ-001 to OQ-014 are kept at the recommended defaults.
- Open-Meteo is called directly from the browser; there is no server and no API key.

### Security

- No API key or credential is needed or bundled; the only build-time variables read are `VITE_USE_DEMO` and the Vite mode.
- `npm audit` reported 0 vulnerabilities in Verifier Run 4 (single run, registry reachable).
- Location is read only after the user presses "Use my location" and is not stored; nothing is requested or stored until the user acts (checked in the release-build browser specs).
- HTTPS is required for hosting (Geolocation needs a secure context).

### Dependencies and licences

Runtime dependencies (`package.json`; versions confirmed in `node_modules`):

| Package | Version | Licence | Notes |
|---------|---------|---------|-------|
| `lucide-react` | 1.61.0 | ISC | A few Lucide icons derive from Feather (MIT); both notices ship in `THIRD_PARTY_NOTICES.txt`. Only 8 icons are bundled. |
| `react` | 19.3.1 | MIT | Notice shipped. |
| `react-dom` | 19.3.1 | MIT | Notice shipped. |
| `scheduler` | 0.28.0 | MIT | Installed as a dependency of `react-dom`; notice shipped. |

Data and services:

- **Open-Meteo** data is offered under CC BY 4.0. Attribution is "Weather data by Open-Meteo.com", linked; the notices file also states what the app changes (temperatures rounded for display and optionally converted to Fahrenheit).
- **GeoNames** place data behind the Open-Meteo geocoding API is credited ("Location data based on GeoNames", CC BY 4.0).
- The free Open-Meteo API is for **non-commercial** use only. The user's provider answers cover a non-commercial student/demo use.
- Development dependencies (Vite, Vitest, Playwright, ESLint, TypeScript, Testing Library, axe-core, jsdom and others) are listed in `package.json`; they are not shipped in `dist/`. Their licences were not reviewed for this draft.
- No legal review of licence compliance has been done.

### Known limitations

- **Not built: TASK-024 (reverse geocoding).** Open-Meteo has no reverse-geocoding endpoint (user answer A4 = No). A device location shows as "Current location" and **cannot be saved as a favorite** (disabled by design).
- **Not human-verified:** screen readers, Firefox, Safari, a real phone or tablet, the real browser location prompt, a human visual review of layout and icons, browser zoom, forced-colours mode. Automated checks ran in Edge and Chrome only.
- **CORS from a deployed https origin is untested.** It was observed from `http://localhost` and by `curl` response headers only. The expected GitHub Pages URL `https://jayasri1515.github.io/claude-project/` is unverified and **nothing is deployed**.
- **Open-Meteo has not confirmed** that the credit placement (footer plus in-panel lines) satisfies "next to" the data. The search-candidate and favorites lists are covered by the footer credit only (accepted by the user).
- **No response cache and no debounce** (accepted risk; search is submit-only, duplicate refreshes of the same place are coalesced).
- **NFR-004 (loading state in 200 ms; both sections in 3 s for 90% of requests)** was measured on one machine, one network, one short window; consistent with the target there, not proof for other users.
- **Requirements OQ-001 to OQ-014 are unanswered** and run at the recommended defaults (for example English only, `localStorage`, evergreen browsers, WCAG 2.1 AA, no favorites cap).
- **Design Revision 2 was approved with conditions without a re-review** by the Design Reviewer.
- **Partially verified tasks:** TASK-039, 040, 041 (manual lists remain), TASK-044 (independent code review not recorded as done in the plan), TASK-045 (documentation not validated by a fresh reader).
- Free-tier request limits can be reached from a busy shared network address; shared-IP hosting platforms may be rate limited earlier.
- Several statements in `impl-plan.md` and `verification.md` conflict with each other or are superseded (for example older `verification.md` runs say Section 10 of the plan lists no approved tasks; Section 10 was corrected on 2026-10-27 and now lists the approved tasks, with TASK-024 and TASK-046 not approved); the newer, dated notes were used.

### How this was derived

- Read: `requirements.md` (approved 2026-10-26, OQs open), `architecture.md`, `design-review.md`, `impl-plan.md` (approvals and task statuses), `verification.md` (Run 4 is current; Runs 1-3 are superseded), `docs/provider-checklist.md`, `docs/deployment.md`, `README.md`, `package.json`.
- Checked against the files: every script named in this changelog exists in `package.json`; the script files exist under `scripts/`; `vitest.live.config.ts` and `public/THIRD_PARTY_NOTICES.txt` exist; installed versions and licences of `lucide-react` (1.61.0, ISC), `react` and `react-dom` (19.3.1, MIT) and `scheduler` (0.28.0, MIT) match; the notices file mentions Open-Meteo CC BY 4.0 and GeoNames; 51 test files and 4 Playwright spec files exist; `dist/` holds 4 files (the release build, 276,111-byte JS).
- Test counts and results are quoted only from `verification.md` Run 4 or labelled as reported by the Implementer in the pull request draft.
