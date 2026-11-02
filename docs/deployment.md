# Deployment notes (TASK-043)

Status: build and secret scan are implemented and were run; **no host has been chosen and nothing has been deployed.** Choosing and operating a host is a user decision (impl-plan.md TASK-043, Section 9 item 4).

## What the build produces

`npm run build:release` (type check, `vite build`, then the bundle scan) writes a static site to `dist/`: `index.html`, `THIRD_PARTY_NOTICES.txt` (copied from `public/`: the Lucide ISC licence text and the Open-Meteo/GeoNames credit; it must be deployed with the site, and `scan:dist` fails without it), one JavaScript file and one CSS file under `dist/assets/` (4 files in total in the last release build, 2026-10-27, base `/claude-project/`: `index.html` 584 bytes, `THIRD_PARTY_NOTICES.txt` 8,782 bytes, CSS 3,311 bytes (1.18 kB gzip), JS 276,111 bytes (85.13 kB gzip)). **Use `build:release`, not a bare `build`, for anything that may be deployed:** it is the documented release path because it fails on any scan finding. There is no server component, no accounts and no server-side state (architecture 1.1).

- **Base path.** The GitHub repository is `Jayasri1515/claude-project`, so a GitHub Pages **project** site would be served under a sub-path. The expected URL is `https://jayasri1515.github.io/claude-project/` (**expected only: not verified, and nothing is deployed**). The Vite `base` comes from the environment variable `VITE_BASE` (`scripts/baseUrl.mjs`, used by `vite.config.ts`); the default is `/`, so a project-site build must set it, for example `VITE_BASE=/claude-project/ npm run build:release` (or `VITE_BASE=/other-name/` if the repository is renamed). The value must be `/` or a plain path, otherwise the build fails. Which default a real deployment should use is an open decision (impl-plan T-10 note). With `VITE_BASE=/claude-project/` the script and stylesheet URLs in `dist/index.html` are `/claude-project/assets/...`; the favicon is an inline empty icon (`data:,`), there is no web manifest, and the footer's notices link is relative (`THIRD_PARTY_NOTICES.txt`), so it resolves next to `index.html` under any base. `test/security/baseUrl.test.ts` (real builds) and the base-path test in `e2e/release.spec.ts` (Playwright browsers on `vite preview` at `http://localhost:4174/weather-e2e/`, a test-only base) check this. The repository name in the base must match the real repository name; a renamed repository needs a rebuild with the new base.
- **Same-origin storage.** All Pages project sites of one account share the origin `https://jayasri1515.github.io`, so `localStorage` is shared with any other site of that account. This app uses the keys `weather-app.favorites` and `weather-app.settings`; another site using the same keys would collide. Not an issue today (no other site is known).
- **Publishing needs the user's explicit authorization.** Nothing in this repository publishes anything: there is no GitHub workflow, no remote has been configured or touched by the agents, and no deployment was made. Enabling Pages, pushing and uploading `dist/` are the user's decisions.

## HTTPS is required

Serve the site over **HTTPS only**. The browser Geolocation API works only in a secure context (architecture 1.1, F-010), and the provider calls are to use HTTPS. Plain `http://` hosting would break "Use my location" in browsers. `http://localhost` is treated as secure by browsers, so local development works.

## No secrets are bundled

- The app needs no API key: Open-Meteo's free non-commercial API is keyless (documentation checked 2026-10-27), and the architecture assumes a keyless provider (architecture 6.2). If a keyed provider is ever chosen, a key must **not** be placed in the client bundle; architecture 6.2 describes a server-side proxy, which would first need an architecture revision and review.
- The only build-time variable read is `VITE_BASE`, and only by `vite.config.ts` (test `test/security/sourceScan.test.ts` checks that nothing in `src/` reads `import.meta.env`). Never put credentials in a `VITE_*` variable: Vite copies those into the public bundle.
- Check a build: `npm run build:release` (build, then `scan:dist`). The scanner (`scripts/secretScan.mjs`) looks for private-key blocks; AWS, Google, GitHub (including `github_pat_`), Slack and `sk-` (including `sk-proj-`) token shapes; JSON Web Tokens; credential-style assignments in single, double or backtick quotes (including escaped quotes in JSON and source maps); long hex or base64-style values assigned to key-like names; credentials or keys inside URLs; `key=`, `token=`, `apikey=`-style query values of any length, including `${...}` expressions and `"?key="+x` concatenations; bearer tokens; and `http://`, `ws://` and `ftp://` URLs (scheme matched in any letter case). Unencrypted URLs pass only for the exact hosts `www.w3.org`, `localhost`, `127.0.0.1` and `[::1]` (so `http://localhost.example` fails). The scan also checks the packages the bundle ships: the Lucide icons found must be exactly the pinned set of 11 (`EXPECTED_ICONS` in `scripts/scanDistLib.mjs`; at most 16 ever; Lucide code with zero detected icons fails instead of passing), and `THIRD_PARTY_NOTICES.txt` must hold a notice (package name, the installed version, the licence name and its licence text, plus the Feather MIT notice for `lucide-react`) for `lucide-react`, `react`, `react-dom` and `scheduler`, with versions read from `node_modules`. Last run on the release build (2026-10-27): scanned 4 files, not scanned 0, unreadable 0, 8 icons, no findings.

### What the scan cannot catch

It is a heuristic text scan. It does **not** find: a secret split across string pieces (`"AK" + "IA..."`), built at run time, or encoded (base64, hex, escapes such as `\u0041`); a low-entropy or short secret under a name it does not know; an unquoted `KEY=value` line; a secret inside a binary file (images, fonts, `.wasm`, archives; these are listed as "not scanned" and not read); a secret that a provider returns or the user types at run time; anything outside `dist/` (the repository, the host's settings, response headers); a protocol-relative URL (`//host/...`, which inherits the page's scheme); a URL that is only built at run time. Names are matched without word boundaries on the left, so a development-mode bundle can trigger a false positive (React's attribute table contains the pair accesskey and accessKey); the release (production) bundle currently has none. A clean scan means "none of these patterns", not "no secret".

## The invented-data ("demo") layer was removed

An earlier version had a demo mode with invented places, a demo-prefixed store and `src/dev/`. It was removed in impl-plan T-14: there is no `src/dev/`, no demo build or script, and `src/main.tsx` always composes the real Open-Meteo adapters. A release build is the real app over the live Open-Meteo APIs (the "Weather is not set up yet" page appears only if no providers are composed, as in some tests).

- `npm run scan:dist` treats `dist/` as a release bundle and **fails** if it finds a marker of the removed layer. This is a regression guard, so it cannot come back unnoticed. The markers are structural: a file whose name starts with `demo` or names a demo module (checked for every file type), the symbols `composeDemo`, `DemoGeocodingProvider`, `DemoWeatherProvider`, `DemoLocationService`, `PrefixedKeyValueStore`, `DEMO_STORAGE_PREFIX`, references to the old module names, and a string literal that starts with `demo:`; and by content: the old invented place names. There is no option to switch the check off. Markers are in `scripts/demoMarkers.mjs` and are tested by `test/security/demoMarkers.test.ts` and `test/security/scanDist.test.ts` (which inject a marker and expect exit 1).
- File types read as text: `.js`, `.mjs`, `.cjs`, `.css`, `.html`, `.map`, `.json`, `.txt`, `.svg`, `.xml`, `.webmanifest`, `.md`, and files with no extension. Other types are listed as not scanned. A file or folder that cannot be read fails the scan.
- A minifier can rename local symbols, so absence of a symbol is not proof that the removed code is absent; the place-name and file-name checks are the backstop.
- The release build is also checked in Playwright's Chromium, Firefox and WebKit by `e2e/release.spec.ts` (run by `npm run test:browser`, which builds with `build:release` and serves it with `vite preview`): the real app renders (not the "not set up" page), no invented-data content appears, nothing is requested or stored until the user acts, the only requests that leave the origin are HTTPS GETs to `geocoding-api.open-meteo.com` and `api.open-meteo.com` (intercepted and answered from recorded responses), and there is no console output, page error or failed request (the page declares an empty icon, `<link rel="icon" href="data:,">`, so no `/favicon.ico` 404). Not covered: the live API in that suite, other browsers.

## Release check

```
npm run typecheck
npm test
npm run lint
npm run build:release
npm run test:browser
```

These check the build, not release readiness: the live API is not exercised by them (use `npm run smoke:live` by hand), and release readiness (TASK-046) is blocked.

## Build gate: service worker, bundle size, Content-Security-Policy (impl-plan T-50, T-51)

`npm run scan:dist` (the last step of `npm run build:release`) also fails the build when:

- **A service worker exists.** A file named like one (`sw.js`, `service-worker.js`, `registerSW.js`, `workbox-*.js`) or the word `serviceWorker` in a script or page. The app uses none (architecture 3.9).
- **The JavaScript is over the budget.** All `.js` files in `dist/`, each gzipped at level 9 and summed, must not exceed 200,000 bytes (`bundleBudgetGzipBytes` in `src/core/config.ts`; the script keeps a copy in `scripts/scanDistLib.mjs` because scripts are plain JavaScript, and `test/security/scanDistRules.test.ts` fails if the two differ). Summing every file is the stricter reading of "initial JavaScript". The current build is about 86 KB.
- **The CSP is missing or loose.** `dist/index.html` must contain exactly one `<meta http-equiv="Content-Security-Policy">` with `default-src 'self'`, `connect-src` equal to exactly `https://api.open-meteo.com` and `https://geocoding-api.open-meteo.com`, no `unsafe-inline`/`unsafe-eval`, no wildcard or `http:` source, no third-party script host, `object-src 'none'`, and no inline script or event handler in the page.

The policy is defined in `scripts/csp.mjs` and added to `dist/index.html` by `vite.config.ts` on `vite build` only (the dev server needs inline script for hot reload, so the source `index.html` has no CSP). It is: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https://api.open-meteo.com https://geocoding-api.open-meteo.com; object-src 'none'; base-uri 'self'; form-action 'self'` (`data:` is for the inline `data:,` favicon).

**Assumption (T-51 leaves it to the user):** a static host usually cannot set response headers, so the delivery is the `<meta>` fallback. A meta CSP ignores `frame-ancestors`, `report-uri` and `sandbox`, so it gives no clickjacking protection and sends no violation reports. A host that can set headers should send the same policy as a `Content-Security-Policy` response header and add `frame-ancestors 'none'`. `e2e/release.spec.ts` and the other browser specs run the release build with the policy and fail on any console output, so a violation shows up there. The deployed-origin check stays open (blocker HOST).

## CORS and request headers (L4)

The app calls `geocoding-api.open-meteo.com` and `api.open-meteo.com` directly from the visitor's browser, so the browser's CORS rules apply. Open-Meteo's documentation does not mention CORS. What was actually observed (2026-10-27):

- Real Edge and Chrome, built app served from `http://localhost`: search and weather worked (TASK-037 live run).
- `curl` with `Origin: https://example.github.io`: both hosts answer a GET with `access-control-allow-origin: *`. This reads response headers only; **no browser has made a request from an https page**, and the **real deployed origin has not been tried**. After deploying, search for a city and open the browser's network tab to confirm it works from that origin.
- **No extra request headers may be added.** A custom header (API key, `Content-Type: application/json`, `Authorization`, and so on) triggers a CORS preflight (OPTIONS). By `curl`, the geocoding host answers OPTIONS with HTTP 404, so the browser would block the search. (The forecast host answers OPTIONS with 200, but the two adapters stay consistent: plain GET, no headers, `credentials: 'omit'`.) The adapters do set the request option `referrerPolicy: 'no-referrer'`, which is not a header the page adds and causes no preflight: tests assert `init.headers` is still undefined, `e2e/release.spec.ts` checks in real Edge and Chrome that the requests carry no Referer and only the browser's default headers (with a control request that does carry one), and a one-off check on 2026-10-27 in real Chrome from a page on `http://localhost` got HTTP 200 JSON from both live hosts with those options; `npm run smoke:live` (3 real requests, Node) passed as well. Still unchecked: any https origin, in particular the real Pages address.

## Privacy statement shown in the app

The footer always shows, as approved in message-wording.md (M-24, footer Option A, message `ui.footer.privacy`): "The city you search for and your device location (rounded to two decimal places) are sent to Open-Meteo to get the weather, along with your IP address. Open-Meteo keeps server logs that may contain coordinates for 90 days. This app does not save your device location and collects no other data: there are no analytics, cookies or tracking. Favorites and your unit choice stay on this device." It is based on Open-Meteo's terms and privacy notice (https://open-meteo.com/en/terms, read 2026-10-27): the free API may collect non-personal information such as IP addresses; web server log files kept for troubleshooting may contain geographical coordinates; they are not shared with third parties and all log files are deleted after 90 days. Check the wording again against the provider's current terms before publishing.

## Current limitation

The Open-Meteo adapters are wired (TASK-037, 2026-10-27), so a production build is the real app. **Before publishing:** the attribution Open-Meteo's licence requires ("Weather data by Open-Meteo.com", linked to https://open-meteo.com/, "next to any location Open-Meteo data are displayed"; its geocoding documentation also credits GeoNames; CC BY also asks for a licence link and a note of changes) is built as a footer and, since the follow-up of 2026-10-27, also as a short linked credit line inside the Current weather and Forecast panels (TASK-025). `Config.attributionText` gates every credit: it is non-empty in a normal build (`composeLive`) and the in-panel lines show only while the panel has real data. Whether Open-Meteo accepts this reading of "next to" is not confirmed with them, and the user's answers cover non-commercial student/demo use only. Open-Meteo's terms say shared-IP hosting platforms can be rate-limited earlier; here each visitor's browser makes its own requests. Publishing needs the user's separate, explicit authorization.

## Still needed from the user

1. A hosting choice (and who operates it), and authorization to publish if GitHub Pages is chosen.
2. TASK-025 (attribution) and TASK-035 (icons) are implemented but not yet independently reviewed or verified; Open-Meteo's own view of the in-panel and footer credits is unconfirmed.
3. Static hosts only serve `THIRD_PARTY_NOTICES.txt` if it is uploaded with the rest of `dist/`; the notices link is relative and works under the `/claude-project/` base. After any future deployment, open the real address and confirm that search and weather work from that origin (CORS from an https page is unchecked).

