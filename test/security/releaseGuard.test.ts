/**
 * The release-build guard (scripts/releaseGuard.mjs, used by vite.config.ts): a build that is not a demo
 * build must refuse to run when VITE_USE_DEMO=true is set. Unit cases for the function, plus real
 * `vite build` runs (into temporary folders) to prove the guard is wired into the config and that a plain
 * build produces a bundle that passes the release scan.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertReleaseBuildAllowed } from '../../scripts/releaseGuard.mjs';
import { scanDirectory } from '../../scripts/scanDistLib.mjs';
import { REPO_ROOT } from '../support/sourceFiles';

describe('assertReleaseBuildAllowed', () => {
  const run = (command: string, mode: string, VITE_USE_DEMO?: string) => () =>
    assertReleaseBuildAllowed({ command, mode, env: { VITE_USE_DEMO } });

  it.each([
    ['build', 'production'],
    ['build', 'staging'],
    ['build', 'development'],
  ])('refuses %s in mode %s when VITE_USE_DEMO=true', (command, mode) => {
    expect(run(command, mode, 'true')).toThrow(/VITE_USE_DEMO=true/);
  });

  it('the message says what to do instead', () => {
    expect(run('build', 'production', 'true')).toThrow(/build:release/);
  });

  it.each([
    ['build', 'production', undefined],
    ['build', 'production', ''],
    ['build', 'production', 'false'],
    ['build', 'production', 'TRUE'],
    ['build', 'demo', 'true'],
    ['build', 'demo', undefined],
    ['serve', 'development', 'true'],
    ['serve', 'test', 'true'],
  ])('allows %s in mode %s with VITE_USE_DEMO=%j', (command, mode, value) => {
    expect(run(command, mode, value)).not.toThrow();
  });
});

describe('vite build wiring (real builds into temporary folders)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function viteBuild(extraArgs: string[], envOverrides: Record<string, string | undefined>) {
    const outDir = mkdtempSync(join(tmpdir(), 'vite-out-'));
    dirs.push(outDir);
    // NODE_ENV (set to "test" by Vitest) is removed: a production build must not see it, or it would bundle React's development build.
    const env: Record<string, string | undefined> = { ...process.env, NODE_ENV: undefined, ...envOverrides };
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
    const result = spawnSync(
      process.execPath,
      [join(REPO_ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', ...extraArgs],
      { cwd: REPO_ROOT, env: env as NodeJS.ProcessEnv, encoding: 'utf8' },
    );
    return { outDir, status: result.status, output: `${result.stdout}\n${result.stderr}` };
  }

  it('a plain build with VITE_USE_DEMO=true fails and writes nothing', () => {
    const r = viteBuild([], { VITE_USE_DEMO: 'true' });
    expect(r.status).not.toBe(0);
    expect(r.output).toContain('Refusing to build');
    expect(scanDirectory(r.outDir).scanned).toEqual([]);
  }, 60_000);

  it('a build with --mode production and VITE_USE_DEMO=true fails too', () => {
    const r = viteBuild(['--mode', 'production'], { VITE_USE_DEMO: 'true' });
    expect(r.status).not.toBe(0);
    expect(r.output).toContain('Refusing to build');
  }, 60_000);

  it('a plain build without VITE_USE_DEMO succeeds and its bundle passes the release scan (no demo code)', () => {
    const r = viteBuild([], { VITE_USE_DEMO: undefined });
    expect(r.status, r.output).toBe(0);
    const scan = scanDirectory(r.outDir);
    expect(scan.scanned.length).toBeGreaterThan(1);
    expect(scan.findings).toEqual([]);
    expect(scan.unreadable).toEqual([]);
  }, 60_000);

  it('a demo-mode build still works with VITE_USE_DEMO=true, and the release scan rejects its output', () => {
    const r = viteBuild(['--mode', 'demo'], { VITE_USE_DEMO: 'true' });
    expect(r.status, r.output).toBe(0);
    expect(scanDirectory(r.outDir).findings.length).toBeGreaterThan(0);
    expect(scanDirectory(r.outDir, { allowDemo: true }).findings).toEqual([]);
  }, 60_000);
});
