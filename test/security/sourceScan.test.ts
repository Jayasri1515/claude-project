/**
 * TASK-041 (security and privacy) and TASK-044 (automated architecture
 * conformance): scans of the source tree. These are text scans of src/, so they
 * show what the code contains, not what a built bundle does at runtime; the
 * bundle itself is scanned by `npm run scan:dist` (scripts/scanDist.mjs).
 *
 * Each rule has a detector self-test, so a rule that can never fire is caught.
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hostOf, scanText } from '../../scripts/secretScan.mjs';
import { REPO_ROOT, sourceFiles, stripComments } from '../support/sourceFiles';
import type { SourceFile } from '../support/sourceFiles';

const src = sourceFiles('src');
const code = src.filter((f) => /\.(ts|tsx)$/.test(f.path)).map((f) => ({ ...f, text: stripComments(f.text) }));

/** Files in `files` whose (comment-free) text matches `pattern`. */
const matching = (files: readonly SourceFile[], pattern: RegExp): string[] =>
  files.filter((f) => pattern.test(f.text)).map((f) => f.path);

const NETWORK_API = /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon)/;
const BROWSER_STORAGE = /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/;
const GEOLOCATION = /navigator\s*\.\s*geolocation|\bgeolocation\b\s*\.\s*(getCurrentPosition|watchPosition)/;
const HTML_INJECTION = /dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\s*\(/;
const CONSOLE = /\bconsole\s*\./;
/** The only hosts the app may CALL (user-verified provider facts, checked in docs 2026-10-27). Adapters only. */
const OPEN_METEO_HOSTS = ['api.open-meteo.com', 'geocoding-api.open-meteo.com'];
/**
 * The only hosts the UI may LINK to (credit links in the footer, TASK-025; exact hosts from the Open-Meteo licence page
 * and geocoding documentation, read 2026-10-27). Never requested by the app. Kept sorted. Exact match only: no
 * prefix, suffix or sub-domain match, so `open-meteo.com.evil.invalid` and `api.open-meteo.com` do not qualify.
 */
const LINK_HOSTS = ['creativecommons.org', 'open-meteo.com', 'www.geonames.org'];
const ALLOWED_HOSTS = [...OPEN_METEO_HOSTS, ...LINK_HOSTS].sort();

/** Exact hosts of the https URLs written in the given files (comments excluded). */
function httpsHostsIn(files: readonly SourceFile[]): string[] {
  const found = new Set<string>();
  for (const f of files) {
    for (const m of f.text.matchAll(/https?:\/\/([^\s"'`)<>]+)/g)) {
      if (!m[0].startsWith('https://')) continue; // non-HTTPS URLs are covered by the credential/URL rule above
      found.add(hostOf(m[1] ?? ''));
    }
  }
  return [...found].sort();
}

describe('Rule detectors can fire (self-tests)', () => {
  it.each([
    ['network', NETWORK_API, 'await fetch(url)'],
    ['network', NETWORK_API, 'new XMLHttpRequest()'],
    ['storage', BROWSER_STORAGE, 'window.localStorage.setItem(a, b)'],
    ['geolocation', GEOLOCATION, 'navigator.geolocation.getCurrentPosition(a)'],
    ['html', HTML_INJECTION, '<div dangerouslySetInnerHTML={{ __html: x }} />'],
    ['html', HTML_INJECTION, 'el.innerHTML = x'],
    ['console', CONSOLE, 'console.log(query)'],
  ])('%s rule matches %j', (_name, pattern, sample) => {
    expect(pattern.test(sample)).toBe(true);
  });

  it('stripComments hides commented code but keeps real code and URLs in strings', () => {
    expect(stripComments('// fetch(x)\nconst a = 1;')).not.toContain('fetch');
    expect(stripComments('/* console.log(1) */ const a = 1;')).not.toContain('console');
    expect(stripComments('const u = "https://a.example/x";')).toContain('https://a.example/x');
  });

  it('the source file list is not empty (a scan of nothing proves nothing)', () => {
    expect(code.length).toBeGreaterThan(40);
    expect(code.some((f) => f.path === 'src/core/appController.ts')).toBe(true);
    expect(code.some((f) => f.path === 'src/ui/App.tsx')).toBe(true);
  });

  it('the secret scanner detects secret-shaped text and non-HTTPS URLs, and passes ordinary text', () => {
    // Built at run time so this test file itself carries no secret-shaped literal.
    const fakeAws = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
    const fakeAssign = 'const api' + '_key = "' + 'abcd1234efgh' + '";';
    const fakeQuery = 'https://example.invalid/data?' + 'api' + 'key=' + 'abcdef123456';
    const fakeBlock = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
    expect(scanText(fakeAws).map((f) => f.name)).toContain('AWS access key id');
    expect(scanText(fakeAssign).map((f) => f.name)).toContain('credential assignment');
    expect(scanText(fakeQuery).map((f) => f.name)).toContain('key in a URL query');
    expect(scanText(fakeBlock).map((f) => f.name)).toContain('private key block');
    expect(scanText('see http://example.invalid/page').map((f) => f.name)).toContain('non-HTTPS URL');
    expect(scanText('xmlns="http://www.w3.org/1999/xhtml" https://example.invalid/ok')).toEqual([]);
    // Findings never echo the secret itself.
    expect(JSON.stringify(scanText(fakeAws))).not.toContain(fakeAws);
  });
});

describe('TASK-041: security and privacy rules over src/', () => {
  it('no credential-shaped text and no non-HTTPS URL anywhere in src/ or index.html', () => {
    const all = [...src, ...sourceFiles('.', /^index\.html$/).filter((f) => f.path === 'index.html')];
    const findings = all.flatMap((f) => scanText(f.text).map((x) => `${f.path}: ${x.name}`));
    expect(findings).toEqual([]);
  });

  it('no .env file or key file is present in the repository root', () => {
    const names = readdirSync(REPO_ROOT).filter((n) => /^\.env/.test(n) || /\.(pem|key|p12|pfx)$/.test(n));
    expect(names).toEqual([]);
  });

  it('only VITE_USE_DEMO and MODE are read from import.meta.env (nothing credential-like is injected)', () => {
    // Always written out as import.meta.env.NAME (never the whole object), so Vite replaces each read
    // with a literal in a build and the demo code can be removed from release bundles.
    const used = new Map<string, Set<string>>();
    for (const f of code) {
      for (const m of f.text.matchAll(/import\.meta\.env(?:\.(\w+))?/g)) {
        const names = used.get(f.path) ?? new Set<string>();
        names.add(m[1] ?? '(whole object)');
        used.set(f.path, names);
      }
    }
    expect([...used.keys()]).toEqual(['src/main.tsx']);
    expect([...(used.get('src/main.tsx') ?? [])].sort()).toEqual(['MODE', 'VITE_USE_DEMO']);
  });

  it('release builds can drop the demo layer: it is loaded only through a dynamic import guarded by the build-time env reads', () => {
    const main = code.find((f) => f.path === 'src/main.tsx')?.text ?? '';
    expect(main).toMatch(
      /if\s*\(\s*import\.meta\.env\.MODE\s*===\s*'demo'\s*\|\|\s*import\.meta\.env\.VITE_USE_DEMO\s*===\s*'true'\s*\)\s*\{[\s\S]*?await import\('\.\/dev\/demoComposition'\)/,
    );
    expect(main).not.toMatch(/^\s*import\b[^;]*\bdev\//m);
  });

  it('no logging anywhere in src/ (search text and coordinates cannot be logged)', () => {
    expect(matching(code, CONSOLE)).toEqual([]);
  });

  it('no HTML injection sinks in src/ (provider and user text is rendered as text only)', () => {
    expect(matching(code, HTML_INJECTION)).toEqual([]);
  });

  it('no network API in src/core or src/ui (network calls belong to adapters, which are not restricted here)', () => {
    // Scoped to core and ui on purpose: provider adapters (src/adapters/) will legitimately call fetch.
    // They are reviewed separately (TASK-022 to 025); this rule must not need editing when they arrive.
    const scoped = code.filter((f) => f.path.startsWith('src/core/') || f.path.startsWith('src/ui/'));
    expect(scoped.length).toBeGreaterThan(30);
    expect(matching(scoped, NETWORK_API)).toEqual([]);
  });

  it('the network is reached from exactly one file, the Open-Meteo HTTP helper (TASK-022/023 review point)', () => {
    expect(matching(code, NETWORK_API)).toEqual(['src/adapters/openMeteo/http.ts']);
  });

  it('the only external hosts named in src/ are the two Open-Meteo API hosts and the three credit-link hosts (exact host match, HTTPS)', () => {
    expect(httpsHostsIn(code)).toEqual(ALLOWED_HOSTS);
  });

  it('the hosts the app calls are named only in the adapters, and only the two API hosts', () => {
    const adapters = code.filter((f) => f.path.startsWith('src/adapters/'));
    expect(adapters.length).toBeGreaterThan(3);
    expect(httpsHostsIn(adapters)).toEqual(OPEN_METEO_HOSTS);
  });

  it('the credit-link hosts are named only in src/ui/attribution.ts, and nothing else in src/ names a link host', () => {
    const outsideAdapters = code.filter((f) => !f.path.startsWith('src/adapters/'));
    expect(httpsHostsIn(outsideAdapters)).toEqual(LINK_HOSTS);
    const naming = code.filter((f) => httpsHostsIn([f]).some((h) => LINK_HOSTS.includes(h))).map((f) => f.path);
    expect(naming).toEqual(['src/ui/attribution.ts']);
  });

  it('the host check matches exact hosts only (self-test)', () => {
    expect(hostOf('api.open-meteo.com.evil.invalid/v1')).not.toBe('api.open-meteo.com');
    expect(hostOf('api.open-meteo.com@evil.invalid/v1')).toBe('evil.invalid');
    expect(hostOf('api.open-meteo.com:443/v1/forecast')).toBe('api.open-meteo.com');
    expect(OPEN_METEO_HOSTS).toEqual(['api.open-meteo.com', 'geocoding-api.open-meteo.com']);
    // The credit-link list: look-alike, prefix, suffix and userinfo tricks are different hosts, so they would fail the list.
    expect(LINK_HOSTS).toEqual(['creativecommons.org', 'open-meteo.com', 'www.geonames.org']);
    for (const bad of [
      'open-meteo.com.evil.invalid/',
      'open-meteo.com@evil.invalid/',
      'evil-open-meteo.com/',
      'www.open-meteo.com/',
      'geonames.org/',
      'creativecommons.org.evil.invalid/licenses/by/4.0/',
      'sub.creativecommons.org/',
    ]) {
      expect(ALLOWED_HOSTS, bad).not.toContain(hostOf(bad));
    }
    for (const good of ['open-meteo.com/', 'www.geonames.org/', 'creativecommons.org/licenses/by/4.0/', 'open-meteo.com:443/']) {
      expect(LINK_HOSTS, good).toContain(hostOf(good));
    }
  });

  it('the host scan detects a stray host (the rule can fire)', () => {
    const planted = [{ path: 'src/ui/x.ts', text: 'const u = "https://tracker.invalid/pixel";' }];
    expect(httpsHostsIn(planted)).toEqual(['tracker.invalid']);
    expect(httpsHostsIn(planted)).not.toEqual(LINK_HOSTS);
  });

  it('browser storage is touched only by the localStorage adapter', () => {
    expect(matching(code, BROWSER_STORAGE)).toEqual(['src/adapters/web/localStorageStore.ts']);
  });

  it('the Geolocation API is touched only by the geolocation adapter', () => {
    expect(matching(code, GEOLOCATION)).toEqual(['src/adapters/web/geolocation.ts']);
  });

  it('the source tree has no other persistence channel (cookies, IndexedDB, caches, service workers)', () => {
    expect(matching(code, /\b(caches\.open|serviceWorker|indexedDB|document\.cookie)\b/)).toEqual([]);
  });
});

describe('TASK-044 (automated part): architecture conformance of src/', () => {
  const inDir = (dir: string) => code.filter((f) => f.path.startsWith(dir));

  it('core/ imports nothing from ui/, adapters/, dev/ or composition, and no React or DOM-library', () => {
    const bad = inDir('src/core/').filter((f) =>
      /from\s+['"](\.\.\/)+(ui|adapters|dev)\/|from\s+['"](\.\.\/)+composition|from\s+['"]react|from\s+['"]react-dom/.test(f.text),
    );
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it('core/ uses no browser globals (document, window, navigator, localStorage)', () => {
    expect(matching(inDir('src/core/'), /\b(document|window|navigator|localStorage|sessionStorage)\b\s*[.[]/)).toEqual([]);
  });

  it('ui/ never imports adapters/, dev/ or composition (it receives the controller and store)', () => {
    const bad = inDir('src/ui/').filter((f) => /from\s+['"](\.\.\/)+(adapters|dev)\/|from\s+['"]\.\.\/composition/.test(f.text));
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it('ui/ calls no service directly: it imports only the controller type, the store and pure core helpers', () => {
    const serviceImports = inDir('src/ui/').filter((f) =>
      /from\s+['"]\.\.\/core\/(search|weatherService|locationFlow|settings|favorites\/favoritesService)['"]/.test(f.text),
    );
    expect(serviceImports.map((f) => f.path)).toEqual([]);
  });

  it('adapters/ depend only on core/ ports, errors and results (not on ui/ or services)', () => {
    const bad = inDir('src/adapters/').filter((f) =>
      /from\s+['"](\.\.\/)+(ui|dev)\/|from\s+['"](\.\.\/)+core\/(appController|store|search|weatherService|locationFlow|settings|favorites\/favoritesService)/.test(f.text),
    );
    expect(bad.map((f) => f.path)).toEqual([]);
  });

  it('no port interface method is declared to throw or to return a bare Promise<T> without a Result', () => {
    const ports = sourceFiles('src/core/ports').filter((f) => !f.path.endsWith('index.ts'));
    expect(ports.length).toBeGreaterThan(3);
    for (const f of ports) {
      expect(f.text).not.toMatch(/@throws/);
    }
    for (const name of ['geocodingProvider', 'weatherProvider']) {
      const text = ports.find((f) => f.path.endsWith(`${name}.ts`))?.text ?? '';
      const asyncSignatures = [...stripComments(text).matchAll(/Promise<([^;]*)>;/g)].map((m) => m[1] ?? '');
      expect(asyncSignatures.length).toBeGreaterThan(0);
      for (const sig of asyncSignatures) expect(sig).toMatch(/^Result</);
    }
  });

  it('every .ts/.tsx under src/ lives in a known layer directory', () => {
    const top = new Set(code.map((f) => f.path.split('/')[1]));
    for (const entry of top) expect(['core', 'ui', 'adapters', 'dev', 'composition.ts', 'main.tsx', 'env.d.ts']).toContain(entry);
  });

  it('the demo layer is referenced only by main.tsx (dynamic import); composition.ts and the UI never import it', () => {
    const importers = code.filter(
      (f) => /(?:from\s+|import\s*\(\s*)['"](\.\.?\/)+dev\//.test(f.text) && !f.path.startsWith('src/dev/'),
    );
    expect(importers.map((f) => f.path)).toEqual(['src/main.tsx']);
  });
});
