# Weather application, initial version (0.0.0)

> **Status.** This branch (`feature/weather-app`) is pushed to the repository on top of a setup-only `main`. Nothing is merged, tagged, deployed or published, no GitHub workflow exists, and GitHub Pages is off. Publishing needs the user's separate, explicit authorization. TASK-046 (release readiness) is **not approved**. This description must not be read as a statement that the app is ready to release.
>
> **Scope note.** This pull request is the first feature branch (`feature/weather-app`) on top of a setup-only `main` (agent definitions and user story), so the diff is the whole application. Before the branch was created the project folder was not a git repository, so there was no earlier history to read. The content below is derived from the artifacts (`requirements.md`, `architecture.md`, `design-review.md`, `impl-plan.md`, `verification.md` Run 4, `docs/provider-checklist.md`, `docs/deployment.md`, `README.md`), `package.json` and the real file tree. The user approved the local commits and the push of both branches on 2026-10-27 (own messages in the session); merging, tagging, deployment and publishing are not approved.

## Summary

An initial responsive web app (TypeScript, React 19, Vite; `package.json` version `0.0.0`, private) that lets a visitor search for a city or use the device location, and see current weather and a 3-day forecast, with refresh, a Celsius/Fahrenheit toggle and favorites kept in the browser. Weather and place search come directly from the keyless Open-Meteo APIs over HTTPS. There is no server, no account and no API key.

Requirements: `requirements.md` (approved 2026-10-26; open questions OQ-001 to OQ-014 still TBD). Design: `architecture.md` Revision 2 (approved with conditions on 2026-10-26, not re-reviewed). Task list and statuses: `impl-plan.md`.

## Changes Made

All items are new (initial version). See `CHANGELOG.md` for the grouped list. In short:

- **Core logic** (`src/core/`): services, controller, store, config, message table. No browser or provider code.
- **Browser adapters** (`src/adapters/web/`): `localStorage` and Geolocation.
- **Open-Meteo adapters** (`src/adapters/openMeteo/`): search and weather adapters and the weather-code table. Plain GETs, no custom headers, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, latitude/longitude rounded to 2 decimals.
- **UI** (`src/ui/`): search, current weather, 3-day forecast, refresh, unit toggle, favorites, "Use my location", status and error areas, footer and in-panel attribution, Lucide icons (8 bundled), responsive layout (wide tier 768 px, extra-wide 1024 px; wide-screen visual order equals tab order).
- **Opt-in demo mode** (`src/dev/`): invented data, loaded only in `dev:demo` / `build:demo`, left out of normal and release builds.
- **Build and release guard** (`scripts/`): `build:release` = build + `scan:dist`; refusal to build with `VITE_USE_DEMO=true`; base path `/claude-project/` (`VITE_BASE` overrides).
- **Tests** (`test/`, `e2e/`): Vitest (51 test files), Playwright in installed Edge and Chrome (4 spec files), a manual live smoke test.
- **Docs**: `README.md`, `docs/deployment.md`, `docs/provider-checklist.md`.

## Test Evidence

**There is no CI, and the history is a setup-only `main` plus the commits on `feature/weather-app`.** The evidence is the Verifier's Run 4 record, `verification.md` (started 2026-10-27 02:19 local, commands run in this folder). Earlier runs (1-3) are superseded and not cited. "Reported" means stated in an artifact; this description did **not** re-run anything.

### What the Verifier ran (verification.md Run 4, section R4.1)

| Command | Result recorded |
|---------|-----------------|
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0; 51 files, **1199 passed**, 0 failed, 0 skipped |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0; JS 276.11 kB (85.13 kB gzip) |
| `npm run build:release` / `npm run scan:dist` | exit 0; 4 files scanned, 8 icons, no findings |
| `VITE_USE_DEMO=true npm run build:release` (negative) | exit 1 as expected ("Refusing to build") |
| `npm run build:demo`, `npm run scan:dist:demo` | exit 0 |
| `npm run scan:dist` on the demo build (negative) | exit 1 as expected (10 findings) |
| `npm run test:browser` | exit 0; **126 passed** (Edge 49, Chrome 49, release-edge 14, release-chrome 14). Uses demo data or recorded Open-Meteo responses; **no live API call** |
| `npm audit` | exit 0; 0 vulnerabilities (single run) |
| `npm run smoke:live` (once) | exit 0; 3 real requests, 3 passed |
| TASK-042 latency probes | 96 real requests in total, no error; see NFR-004 below |
| 19 temporary mutation spot-checks of `src/` | 17 caught, 2 survived (icon swaps); source restored and a SHA-256 comparison of 163 files was identical |

### Newer than Run 4: Implementer-reported only, not Verifier-verified

- After Run 4 the Implementer reported pinning every weather condition to its specific Lucide icon in `test/ui/weatherIcon.test.tsx` (this closes the two surviving mutants M7 and M7b; `impl-plan.md` TASK-035, "Icon mapping pinned"). The orchestrator reported **1209 unit tests** after that change (Implementer-reported after the final icon test pin; Verifier Run 4 verified 1199). **The only Verifier-recorded count is 1199; 1209 is mentioned in `verification.md` only in the top correction note, as Implementer-reported.** File timestamps are consistent with `test/ui/weatherIcon.test.tsx` being the only file changed after Run 4's recorded work, but timestamps are not proof (restoring files after mutations also changes them). Per `verification.md` R4.9, any change since 02:19 needs re-verification, and **it has not been re-verified by the Verifier**.

### NFR-004 (accepted by the user; measured on one machine and network)

Verifier Run 4, section R4.3: loading text appeared within 10 ms in 18 of 18 activations (target 200 ms); both sections were displayed within 3 s in 26 of 26 observations (slowest end-to-end sequence about 2.5 s). One Windows laptop on Wi-Fi in India, one window of about 5 minutes, from `http://localhost`. The Verifier states this is "consistent with the accepted target here; not proof that 90% of all users meet it". The user accepted the target on those numbers.

### Not verified (read this)

- **No** screen reader (NVDA, VoiceOver, TalkBack), **no** Firefox or Safari, **no** real phone or tablet, **no** real browser location prompt (browser tests use a test-granted permission), **no** human visual review at 320/768/1280/1920 px, **no** zoom 200/400%, **no** forced-colours check, **no** human check of how the icons look.
- **CORS from a deployed https origin** is untested. `access-control-allow-origin: *` was seen only from `http://localhost` and by `curl`. Nothing is deployed.
- Open-Meteo's **acceptance of the credit placement** and its stance on this use are not confirmed with them.
- No coverage report exists (none is configured); "all tests pass" is not line or branch coverage.
- `npm run dev`, `npm run dev:demo` and `npm install` from a clean checkout were not run by the Verifier.
- The hands-on manual end-to-end check of TASK-037 was not done; the user accepted the Verifier's automated real-API runs instead.
- Tasks only **partially verified** by the Verifier: TASK-010, 025, 035, 037, 039, 040, 041, 045. TASK-044 (code review): the plan lists it as In Progress with independent review not done. Code Reviewer findings (M1 to M3, L1 to L5) are referred to in `impl-plan.md`, but no review report file exists in the repository root, so this description cannot cite one.
- The "hands-on" and "fresh reader" validations of the README were not done.

## Known Limitations and Risks

- **Device-location favorites are disabled** and **TASK-024 (reverse geocoding) was not built**: Open-Meteo has no reverse-geocoding endpoint (user answer A4 = No). A device location shows as "Current location".
- **Free API is non-commercial only.** The user's answers cover a student/demo use. Any commercial use needs a fresh check of Open-Meteo's terms. Free-tier limits quoted by the user: 10,000 calls/day, 5,000/hour, 600/minute.
- **No cache and no debounce** (accepted risk, 2026-10-27). Search is submit-only; one search is 1 geocoding request and choosing a place is 2 weather requests; duplicate refreshes of the same place are coalesced. The user's rate-limit answer assumed caching and debouncing, which the app does not have.
- **OQ-001 to OQ-014 are TBD** and run at the recommended defaults: web app, `localStorage`, evergreen browsers, WCAG 2.1 AA target, English only, Celsius default, no favorites cap, no stale-data flag, 10 s timeouts, today not counted in the forecast, no launch-time location prompt.
- **Design Revision 2** was approved with conditions **without a re-review** by the Design Reviewer; a design defect could still surface.
- **Same-origin storage**: all GitHub Pages project sites of one account share an origin, so another site using the keys `weather-app.favorites` or `weather-app.settings` would collide. No such site is known.
- **The bundle scan is a pattern scan**, not proof that no secret or demo code is present (`docs/deployment.md`, "What the scan cannot catch").
- **Repository name in the build**: the base `/claude-project/` must match the real repository name; a rename needs a rebuild.
- **Provider dependency**: behavior depends on a third-party service that may change; the first request on a new connection took about 0.7 to 1.0 s longer in the Verifier's runs, which is the main risk to the 3 s target.
- **Artifact inconsistencies:** `impl-plan.md` Section 10 was corrected on 2026-10-27 and now lists the approved tasks (TASK-024 and TASK-046 are not approved); older `verification.md` runs carry historical notes saying so. The newer dated approval notes were used. `impl-plan.md` Section 1 still contains a historical Planner note about older `design-review.md` and `architecture.md` wording; those two files now carry historical notes.

## Privacy Note

The app has no accounts, analytics or background requests, and keeps only favorites and the unit choice in the browser's `localStorage`. The device location is not saved.

What the weather service (Open-Meteo) receives, per the in-app text next to "Use my location": "The weather service receives the text you search for, the location used for the weather (rounded to two decimal places) and your IP address, and may log requests. This app does not save your device location."

- Requests are made from the visitor's browser straight to `geocoding-api.open-meteo.com` and `api.open-meteo.com`. There is no proxy.
- The page address is not sent as a Referer (`referrerPolicy: 'no-referrer'`; checked in real Edge and Chrome with recorded responses); no cookies or credentials are sent (`credentials: 'omit'`).
- Per `docs/deployment.md`, Open-Meteo's terms (read 2026-10-27 by the Implementer) say it may collect IP addresses and keeps web-server logs that may contain coordinates, deleted after 90 days. The page deliberately does not repeat the 90-day figure. The Verifier did not read Open-Meteo's privacy terms (`verification.md` R4.4); recheck the wording against the provider's current terms before publishing.
- In demo mode nothing is sent to a weather service and the device location is not used.

## Licence and Attribution Compliance Notes

- **Open-Meteo data (CC BY 4.0):** credit "Weather data by Open-Meteo.com", linked to https://open-meteo.com/, appears in the footer and in the Current weather and Forecast panels when real data is shown; `THIRD_PARTY_NOTICES.txt` gives the licence link and states the app's changes (rounding, optional Fahrenheit). Presence, wording, links and gating are test-verified. **Open-Meteo has not confirmed that this placement satisfies "next to" the data.**
- **GeoNames (CC BY 4.0):** "Location data based on GeoNames" is credited in the footer and the notices file.
- **Lucide (ISC) and Feather (MIT):** `lucide-react` 1.61.0 (confirmed in `node_modules`); the ISC text and the Feather MIT notice ship in `THIRD_PARTY_NOTICES.txt`. A test ties the notice to the installed package, and `scan:dist` fails if it is missing.
- **React, React DOM, Scheduler (MIT):** 19.3.1, 19.3.1 and 0.28.0 (confirmed); notices ship in the same file.
- The notices file must be uploaded with the rest of `dist/`; the footer link is relative.
- **No legal review** was done. Licences of development-only dependencies were not reviewed.

## Dependencies

- Runtime: `lucide-react` ^1.61.0, `react` ^19.3.1, `react-dom` ^19.3.1 (plus `scheduler` 0.28.0 via `react-dom`).
- Dev: `@playwright/test`, `vite`, `vitest`, `typescript`, `eslint` and plugins, `jsdom`, Testing Library, `axe-core`, `@vitejs/plugin-react` (full list in `package.json`).
- External service: Open-Meteo Geocoding and Forecast APIs (free, keyless, non-commercial use).
- Tooling: Node.js and npm (developed with Node v24, npm 11; other versions untested). `npm run test:browser` needs Microsoft Edge and Google Chrome installed (nothing is downloaded).
- `npm audit`: 0 vulnerabilities in Run 4, single run; not repeated for this description.

## Manual Test Checklist (for the user)

Run `npm run dev` (live Open-Meteo) or `npm run build:release` then `npx vite preview`, and open the printed URL. Use `npm run dev:demo` to try without a network.

- [ ] Search a real city (for example Berlin): the chooser or result appears, with name and country, current temperature, humidity and condition, and 3 forecast days.
- [ ] Search for a nonsense name: "city not found" message. Submit empty input: a prompt, and no request in the browser's network tab. Paste 101+ characters: the "too long" message.
- [ ] Press Refresh: both sections update and the update time changes. Press it repeatedly: no flood of requests.
- [ ] Toggle Celsius/Fahrenheit; reload the page: the choice is kept.
- [ ] Add a favorite, add it again (no duplicate), select it, remove it, reload (persistence).
- [ ] Press "Use my location": the browser asks first. Try Allow, Deny and dismiss. Allowed: "Current location" weather appears and there is no "Add to favorites". Denied: a message and city search still works.
- [ ] Switch off the network and search: a clear error, no crash. Reconnect and refresh.
- [ ] Look at the icons: do rain, snow, thunderstorm, fog, cloudy and clear look right, and is the text always beside them?
- [ ] Check the footer and in-panel credits and the "Third-party notices" link.
- [ ] Resize from phone width (320 px) to 1920 px; on wide screens confirm Tab order follows the visual order.
- [ ] Keyboard only: reach and operate every control; focus is always visible.
- [ ] Try a screen reader (NVDA, VoiceOver or TalkBack), Firefox, Safari and a real phone.
- [ ] Browser zoom 200% and 400%; high-contrast / forced-colours mode.
- [ ] Look at the browser console: no errors.
- [ ] Open `dist/THIRD_PARTY_NOTICES.txt` from a built site.
- [ ] After any future deployment only: open the real https address, search, and confirm in the network tab that CORS works from that origin.

## NOT YET DONE

- **Not merged, tagged, deployed or published.** The branch is pushed (`main` is the setup-only commit `d906824`). No GitHub workflow and no GitHub Pages enabled. The expected URL `https://jayasri1515.github.io/claude-project/` is unverified.
- **TASK-046 (release readiness) is not approved and is blocked.** This pull request does not claim readiness.
- **Hosting decision and publish authorization**: GitHub Pages was named as the intended host (user answer C1), but publishing needs the user's separate explicit authorization.
- **CORS check from the deployed https origin.**
- **Confirmation from Open-Meteo** that the credit placement is acceptable; a fresh terms check for any commercial use.
- **Re-verification of the post-Run-4 change** (icon-mapping tests; the 1209 count is Implementer-reported after the final icon test pin; Verifier Run 4 verified 1199).
- **Manual and human checks** listed under "Not verified" above, including the TASK-037 hands-on check and the TASK-039/040 manual lists.
- **Independent code review (TASK-044) and fresh-reader documentation check (TASK-045)** are not recorded as complete.
- **TASK-024** (reverse geocoding) not built or approved.
- **OQ-001 to OQ-014** unanswered (defaults in use); the Design Reviewer has not re-reviewed Revision 2.
- **Privacy wording** to be rechecked against Open-Meteo's current terms before publishing.
- **Version and release date**: none chosen (`0.0.0`).

## Reviewer Checklist

- [ ] The scope note (one feature branch on a setup-only `main`) is acceptable and the scope of this initial version is right.
- [ ] The Run 4 numbers above match `verification.md`; the 1209 figure is Implementer-reported after the final icon test pin; Verifier Run 4 verified 1199.
- [ ] Privacy text, attribution placement and licence notes are accepted or sent to Open-Meteo for confirmation.
- [ ] The Known Limitations (no reverse geocoding, no cache or debounce, TBD requirements) are accepted.
- [ ] The user has completed the manual checklist, or consciously accepted the gaps.
- [ ] Nothing is published until the user explicitly authorizes it.


## Manual check by the user (2026-10-27)

The user ran `npm run dev` in live mode and reported "all looked right" for: search and select, current weather and forecast, icons, Open-Meteo credit, unit toggle, favorites and persistence, keyboard navigation, "Use my location", and layout at about 320 px and 1280 px. Browser, device and exact steps were not recorded. Not covered: screen readers, Firefox/Safari, a real phone, CORS from a deployed https origin, and Open-Meteo's acceptance of the credit placement.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
