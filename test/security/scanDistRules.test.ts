/**
 * Tests for the build gate rules added for impl-plan T-50 (no service worker, gzipped JavaScript budget) and T-51
 * (Content-Security-Policy meta tag): scripts/scanDistLib.mjs and scripts/csp.mjs, run on temporary folders. Each rule
 * has a clean case and a negative case that must make the gate fail (exit code 1 for the command).
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCsp, checkCsp, cspMetaTag, parseCsp, PROVIDER_ORIGINS } from '../../scripts/csp.mjs';
import { BUNDLE_BUDGET_GZIP_BYTES, EXPECTED_ICONS, scanDirectory } from '../../scripts/scanDistLib.mjs';
import { GEOCODING_SEARCH_URL } from '../../src/adapters/openMeteo/geocoding';
import { FORECAST_URL } from '../../src/adapters/openMeteo/weather';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { REPO_ROOT } from '../support/sourceFiles';

const CLEAN_JS = 'function r(){return"forecast-"+i}';
const HTML = `<!doctype html><html><head>${cspMetaTag()}<title>Weather</title></head><body><div id="root"></div></body></html>`;
const REAL_NOTICE = readFileSync(join(REPO_ROOT, 'public', 'THIRD_PARTY_NOTICES.txt'), 'utf8').replace(/\r\n/g, '\n');
const icon = (name: string): string => `var x={name:\`${name}\`,size:24,node:[[\`path\`,{d:\`M1 1\`,key:\`k\`}]]};`;
const FULL_JS = 'function lucideIcon(){}' + EXPECTED_ICONS.map(icon).join('');

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeDist(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'scan-rules-'));
  dirs.push(root);
  for (const [name, text] of Object.entries(files)) {
    const full = join(root, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}
/** A complete, valid release folder with the CSP, within every budget; `extra` adds or replaces files. */
const validDist = (extra: Record<string, string> = {}): Record<string, string> => ({
  'index.html': HTML,
  'assets/a.js': FULL_JS,
  'THIRD_PARTY_NOTICES.txt': REAL_NOTICE,
  ...extra,
});
type ScanOptions = NonNullable<Parameters<typeof scanDirectory>[1]>;
const names = (files: Record<string, string>, options?: ScanOptions): string[] =>
  scanDirectory(makeDist(files), options).findings.map((f) => f.name);
const runCommand = (root: string) => spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/scanDist.mjs'), root], { encoding: 'utf8' });

/** Text that does not compress (random base64), so its gzipped size is about three quarters of its length. */
const noise = (length: number): string => randomBytes(Math.ceil((length * 3) / 4)).toString('base64').slice(0, length);

describe('baseline', () => {
  it('a valid folder (CSP, pinned icons, notices, small bundle) has no finding', () => {
    expect(names(validDist())).toEqual([]);
    expect(runCommand(makeDist(validDist())).status).toBe(0);
  });
});

describe('no service worker (T-50, architecture 3.9)', () => {
  it.each(['sw.js', 'service-worker.js', 'serviceWorker.js', 'registerSW.js', 'workbox-abc123.js', 'sw-v2.js', 'sw.mjs'])(
    'a file named %s is a finding',
    (name) => {
      expect(names(validDist({ [`assets/${name}`]: CLEAN_JS }))).toContain('service worker file');
    },
  );

  it.each(['navigator.serviceWorker.register("/sw.js")', 'if("serviceWorker"in navigator)navigator.serviceWorker.register(u)'])(
    'a registration in a script is a finding: %s',
    (code) => {
      expect(names(validDist({ 'assets/b.js': CLEAN_JS + code }))).toContain('service worker registration');
    },
  );

  it('a registration in the page is a finding', () => {
    const html = HTML.replace('<div', '<script src="a.js">navigator.serviceWorker.register(1)</script><div');
    expect(names(validDist({ 'index.html': html }))).toContain('service worker registration');
  });

  it('the command exits 1 on a sw.js file', () => {
    const r = runCommand(makeDist(validDist({ 'sw.js': 'self.addEventListener("fetch",()=>{})' })));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('service worker file');
  });

  it('React own lower-case "serviceworker" literal and similar words are not findings', () => {
    const js = 'switch(a){case`serviceworker`:case`sharedworker`:break}var worker=1;var sw=2';
    expect(names(validDist({ 'assets/c.js': js }))).toEqual([]);
  });

  it('files with similar names (swatch.js, answer.js, network.js) are not findings', () => {
    const files = validDist({ 'assets/swatch.js': CLEAN_JS, 'assets/answer.js': CLEAN_JS, 'assets/network.js': CLEAN_JS });
    expect(names(files)).toEqual([]);
  });
});

describe('gzipped JavaScript budget (T-50)', () => {
  it('the script constant equals Config.bundleBudgetGzipBytes (duplicated because scripts are plain JavaScript)', () => {
    expect(BUNDLE_BUDGET_GZIP_BYTES).toBe(DEFAULT_CONFIG.bundleBudgetGzipBytes);
  });

  it('a small bundle passes and its gzip size is reported', () => {
    const result = scanDirectory(makeDist(validDist()));
    expect(result.jsGzipBytes).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });

  it('negative: a bundle over the budget fails and the finding states the measured size', () => {
    const result = scanDirectory(makeDist(validDist({ 'assets/big.js': noise(5000) })), { budgetGzipBytes: 1000 });
    expect(result.findings.map((f) => f.name)).toEqual(['bundle over budget']);
    expect(result.findings[0]?.context).toMatch(/is \d+ bytes gzipped, budget 1000/);
  });

  it('boundary: exactly the budget passes, one byte less fails', () => {
    const files = validDist();
    const size = scanDirectory(makeDist(files)).jsGzipBytes;
    expect(names(files, { budgetGzipBytes: size })).toEqual([]);
    expect(names(files, { budgetGzipBytes: size - 1 })).toEqual(['bundle over budget']);
  });

  it('the size is measured gzipped, not raw: 400 KB of repetitive text is within the default budget', () => {
    expect(names(validDist({ 'assets/repeat.js': 'var a=1;'.repeat(50_000) }))).toEqual([]);
  });

  it('all JavaScript files are summed', () => {
    const one = scanDirectory(makeDist(validDist({ 'assets/one.js': noise(3000) }))).jsGzipBytes;
    const two = scanDirectory(makeDist(validDist({ 'assets/one.js': noise(3000), 'assets/two.js': noise(3000) }))).jsGzipBytes;
    expect(two).toBeGreaterThan(one + 2000);
  });

  it('negative at the real budget: incompressible JavaScript over 200,000 gzipped bytes fails the gate and the command', () => {
    const root = makeDist(validDist({ 'assets/huge.js': noise(300_000) }));
    const result = scanDirectory(root);
    expect(result.jsGzipBytes).toBeGreaterThan(BUNDLE_BUDGET_GZIP_BYTES);
    expect(result.findings.map((f) => f.name)).toEqual(['bundle over budget']);
    const r = runCommand(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('bundle over budget');
  });

  it('null skips the size check', () => {
    expect(names(validDist({ 'assets/big.js': noise(5000) }), { budgetGzipBytes: null })).toEqual([]);
  });
});

describe('Content-Security-Policy (T-51, architecture 5.3)', () => {
  const GOOD = buildCsp();
  const page = (policy: string): string =>
    `<!doctype html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><title>x</title></head>`;
  const findings = (html: string): string[] => names(validDist({ 'index.html': html }));

  it('the generated policy is accepted', () => {
    expect(findings(page(GOOD))).toEqual([]);
    expect(checkCsp(HTML)).toEqual([]);
  });

  it('connect-src is exactly the two Open-Meteo origins, which are the adapters\' origins', () => {
    expect(parseCsp(GOOD)['connect-src']).toEqual(['https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com']);
    expect(new URL(FORECAST_URL).origin).toBe(PROVIDER_ORIGINS[0]);
    expect(new URL(GEOCODING_SEARCH_URL).origin).toBe(PROVIDER_ORIGINS[1]);
  });

  it('keeps the inline favicon working (img-src data:) and allows no inline, eval, wildcard or http source', () => {
    expect(parseCsp(GOOD)['img-src']).toContain('data:');
    expect(GOOD).not.toContain('unsafe-');
    expect(GOOD).not.toContain('*');
    expect(GOOD).not.toContain('http:');
  });

  it('negative: no CSP tag is a finding', () => {
    expect(findings(HTML.replace(cspMetaTag(), ''))).toEqual(['CSP missing']);
  });

  it('negative: two CSP tags are a finding', () => {
    expect(findings(HTML + cspMetaTag())).toEqual(['CSP missing']);
  });

  it.each([
    ['default-src not self', GOOD.replace("default-src 'self'", 'default-src *'), 'CSP default-src not self'],
    ['connect-src with a third host', GOOD.replace('connect-src', 'connect-src https://evil.example'), 'CSP connect-src not the provider origins'],
    ['connect-src missing a host', GOOD.replace(' https://geocoding-api.open-meteo.com', ''), 'CSP connect-src not the provider origins'],
    ['connect-src absent', GOOD.replace(/connect-src [^;]*; /, ''), 'CSP connect-src not the provider origins'],
    ['unsafe-inline script', GOOD.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"), 'CSP script source not allowed'],
    ['unsafe-eval script', GOOD.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"), 'CSP script source not allowed'],
    ['third-party script host', GOOD.replace("script-src 'self'", "script-src 'self' https://cdn.example"), 'CSP script source not allowed'],
    ['wildcard in img-src', GOOD.replace("img-src 'self' data:", 'img-src *'), 'CSP broad or non-HTTPS source'],
    ['http source', GOOD.replace('style-src', 'style-src http://x.example'), 'CSP broad or non-HTTPS source'],
    ['object-src open', GOOD.replace("object-src 'none'", "object-src 'self'"), 'CSP object-src not none'],
  ])('negative: %s', (_label, policy, expected) => {
    expect(findings(page(policy))).toContain(expected);
  });

  it('negative: an inline script or inline event handler in the page is a finding (the policy would block it)', () => {
    expect(findings(HTML + '<script>alert(1)</script>')).toContain('inline script in index.html');
    expect(findings(HTML + '<button onclick="go()">x</button>')).toContain('inline event handler in index.html');
  });

  it('a module script with src is not an inline script', () => {
    expect(findings(HTML + '<script type="module" crossorigin src="/a.js"></script>')).toEqual([]);
  });

  it('entity-encoded quotes (as Vite writes them) are decoded before checking', () => {
    expect(findings(page(GOOD.replace(/'/g, '&#39;')))).toEqual([]);
  });

  it('the command exits 1 for a folder without a CSP and 0 with one', () => {
    const without = runCommand(makeDist(validDist({ 'index.html': HTML.replace(cspMetaTag(), '') })));
    expect(without.status).toBe(1);
    expect(without.stderr).toContain('CSP missing');
    expect(runCommand(makeDist(validDist())).status).toBe(0);
  });

  it('the source index.html has no CSP (the dev server needs inline script); vite.config.ts adds it on build only', () => {
    expect(readFileSync(join(REPO_ROOT, 'index.html'), 'utf8')).not.toMatch(/Content-Security-Policy/i);
    expect(readFileSync(join(REPO_ROOT, 'vite.config.ts'), 'utf8')).toMatch(/apply: 'build'/);
    expect(readFileSync(join(REPO_ROOT, 'vite.config.ts'), 'utf8')).toMatch(/buildCsp\(\)/);
  });
});
