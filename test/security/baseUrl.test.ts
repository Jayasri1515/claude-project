/**
 * The Vite `base` (scripts/baseUrl.mjs, used by vite.config.ts): release builds are made for the GitHub Pages
 * project site path /claude-project/, dev and demo use /, VITE_BASE overrides. Unit cases plus real builds into
 * temporary folders that check every URL the built page and bundle use. Nothing is published by these tests.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_BASE, resolveBase } from '../../scripts/baseUrl.mjs';
import { REPO_ROOT } from '../support/sourceFiles';

const base = (command: string, mode: string, VITE_BASE?: string): string => resolveBase({ command, mode, env: { VITE_BASE } });

describe('resolveBase', () => {
  it('the project base is the repository name', () => {
    expect(PROJECT_BASE).toBe('/claude-project/');
  });

  it.each([
    ['build', 'production'],
    ['build', 'staging'],
    ['serve', 'production'], // vite preview: must match the build it serves
  ])('%s in mode %s uses the project base', (command, mode) => {
    expect(base(command, mode)).toBe('/claude-project/');
  });

  it.each([
    ['serve', 'development'], // npm run dev
    ['serve', 'test'], // vitest
    ['serve', 'demo'], // npm run dev:demo
    ['build', 'demo'], // npm run build:demo
  ])('%s in mode %s uses the root', (command, mode) => {
    expect(base(command, mode)).toBe('/');
  });

  it.each([
    ['/', '/'],
    ['/app/', '/app/'],
    ['/app', '/app/'],
    ['app', '/app/'],
    ['/a/b/', '/a/b/'],
    [' /claude-project/ ', '/claude-project/'],
    ['/my.site_v2~x/', '/my.site_v2~x/'],
  ])('VITE_BASE=%j is accepted as %j, in every mode', (value, expected) => {
    for (const [command, mode] of [['build', 'production'], ['serve', 'development'], ['build', 'demo']] as const) {
      expect(base(command, mode, value)).toBe(expected);
    }
  });

  it.each(['', '   ', undefined])('VITE_BASE=%j is ignored (the default applies)', (value) => {
    expect(base('build', 'production', value)).toBe('/claude-project/');
    expect(base('serve', 'development', value)).toBe('/');
  });

  it.each([
    'https://example.invalid/x/',
    '//example.invalid/',
    './',
    '../x/',
    '/a/../b/',
    '/a/./b/',
    '/a b/',
    '/a?x=1/',
    '/a#b/',
    '/%2e%2e/',
    '/a\\b/',
  ])('VITE_BASE=%j is rejected with a clear error', (value) => {
    expect(() => base('build', 'production', value)).toThrow(/VITE_BASE=.* is not usable/);
  });
});

describe('vite build with the base (real builds into temporary folders)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function viteBuild(extraArgs: string[], VITE_BASE?: string) {
    const outDir = mkdtempSync(join(tmpdir(), 'vite-base-'));
    dirs.push(outDir);
    const env: Record<string, string | undefined> = { ...process.env, NODE_ENV: undefined, VITE_USE_DEMO: undefined, VITE_BASE };
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
    const result = spawnSync(
      process.execPath,
      [join(REPO_ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', ...extraArgs],
      { cwd: REPO_ROOT, env: env as NodeJS.ProcessEnv, encoding: 'utf8' },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    return outDir;
  }

  /** Every `src=` and `href=` value in the page. */
  const pageUrls = (html: string): string[] => [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1] as string);

  it('a release build serves its assets under /claude-project/, and no page URL points at the site root', () => {
    const out = viteBuild([]);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    const urls = pageUrls(html);
    const assets = urls.filter((u) => /\.(?:js|css)$/.test(u));
    expect(assets.length).toBeGreaterThanOrEqual(2); // the script and the stylesheet
    for (const u of assets) expect(u).toMatch(/^\/claude-project\/assets\/[\w.-]+\.(?:js|css)$/);
    // The only other URL is the inline empty favicon; nothing else (no manifest, no absolute root URL).
    for (const u of urls.filter((x) => !assets.includes(x))) expect(u).toBe('data:,');
    expect(urls.some((u) => /^\/(?!claude-project\/)/.test(u))).toBe(false);
    // The files the page names exist at those paths relative to the base.
    const files = readdirSync(join(out, 'assets'));
    for (const u of assets) expect(files).toContain(u.replace('/claude-project/assets/', ''));
    // The notices file sits next to index.html, which is where the relative footer link resolves to.
    expect(readdirSync(out)).toContain('THIRD_PARTY_NOTICES.txt');
  }, 90_000);

  it('VITE_BASE overrides the release base (and "/" gives root-relative assets)', () => {
    const custom = readFileSync(join(viteBuild([], '/other-name/'), 'index.html'), 'utf8');
    expect(pageUrls(custom).filter((u) => /\.(?:js|css)$/.test(u)).every((u) => u.startsWith('/other-name/assets/'))).toBe(true);
    const root = readFileSync(join(viteBuild([], '/'), 'index.html'), 'utf8');
    expect(pageUrls(root).filter((u) => /\.(?:js|css)$/.test(u)).every((u) => u.startsWith('/assets/'))).toBe(true);
  }, 120_000);

  it('a demo build is served from the root', () => {
    const html = readFileSync(join(viteBuild(['--mode', 'demo']), 'index.html'), 'utf8');
    expect(pageUrls(html).filter((u) => /\.(?:js|css)$/.test(u)).every((u) => u.startsWith('/assets/'))).toBe(true);
  }, 90_000);

  it('the bundle has no hard-coded root-absolute app URLs: the notices link stays relative and the base is not baked in twice', () => {
    const out = viteBuild([]);
    const js = readdirSync(join(out, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(out, 'assets', f), 'utf8'))
      .join('\n');
    expect(js).toContain('THIRD_PARTY_NOTICES.txt');
    expect(js).not.toMatch(/["'`]\/THIRD_PARTY_NOTICES\.txt/);
    expect(js).not.toMatch(/["'`]\/favicon|["'`]\/manifest/);
  }, 90_000);
});
