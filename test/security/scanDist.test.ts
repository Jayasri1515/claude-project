/**
 * Tests for the bundle scan (scripts/scanDistLib.mjs and the scripts/scanDist.mjs command), run on temporary
 * folders: which file types are read, what fails, what is reported as not scanned or unreadable, and the exit
 * codes. Secret-shaped samples are assembled at run time and are all invented.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkNotices,
  EXPECTED_ICONS,
  isFailure,
  lucideName,
  MAX_BUNDLED_ICONS,
  readRuntimePackages,
  scanDirectory,
} from '../../scripts/scanDistLib.mjs';
import { REPO_ROOT } from '../support/sourceFiles';

const SECRET = 'const api' + '_key = "' + 'abcd1234efgh' + '";';
const CLEAN_JS = 'function r(){return"forecast-"+i}';
const CLEAN_HTML = '<!doctype html><title>Weather</title><div id="root"></div>';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeDist(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'scan-dist-'));
  dirs.push(root);
  for (const [name, text] of Object.entries(files)) {
    const full = join(root, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

type ScanOptions = NonNullable<Parameters<typeof scanDirectory>[1]>;
/** Options that switch off the package rules (notices, icon set) so a test of another rule is not about them. */
const NO_PACKAGE_RULES: ScanOptions = { expectedIcons: null, runtimePackages: [] };
const scan = (root: string, options: ScanOptions = {}) => scanDirectory(root, { ...NO_PACKAGE_RULES, ...options });
const findingNames = (root: string, options?: ScanOptions): string[] => scan(root, options).findings.map((f) => f.name);

/** The notices file the build copies from public/ (valid for the installed packages; notices.test.ts checks that). */
const REAL_NOTICE = readFileSync(join(REPO_ROOT, 'public', 'THIRD_PARTY_NOTICES.txt'), 'utf8').replace(/\r\n/g, '\n');
/** What one Lucide icon looks like in a minified bundle. */
const icon = (name: string): string => `var x=${'{'}name:\`${name}\`,size:24,node:[[\`path\`,{d:\`M1 1\`,key:\`k\`}]]};`;
/** A bundle with Lucide code and exactly the pinned icons. */
const FULL_JS = 'function lucideIcon(){}' + EXPECTED_ICONS.map(icon).join('');
/** A complete, valid release folder (what the build produces, in miniature). */
const validDist = (extra: Record<string, string> = {}): Record<string, string> => ({
  'index.html': CLEAN_HTML,
  'assets/a.js': FULL_JS,
  'THIRD_PARTY_NOTICES.txt': REAL_NOTICE,
  ...extra,
});

describe('scanDirectory: what is read', () => {
  it('a clean release folder has no findings and lists what it scanned', () => {
    const root = makeDist({ 'index.html': CLEAN_HTML, 'assets/index-abc.js': CLEAN_JS, 'assets/index-abc.css': '.a{color:red}' });
    const result = scan(root);
    expect(result.findings).toEqual([]);
    expect(result.unreadable).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.scanned).toHaveLength(3);
  });

  it.each([
    ['assets/app.js'],
    ['assets/app.mjs'],
    ['assets/app.cjs'],
    ['assets/app.css'],
    ['index.html'],
    ['assets/app.js.map'],
    ['data.json'],
    ['robots.txt'],
    ['icon.svg'],
    ['sitemap.xml'],
    ['site.webmanifest'],
    ['LICENSE'],
    ['_headers'],
    ['.htaccess'],
  ])('a credential in %s is found (this file type is read)', (name) => {
    const root = makeDist({ 'index.html': CLEAN_HTML, [name]: SECRET });
    expect(findingNames(root)).toContain('credential assignment');
  });

  it('files of types that are not read are listed as not scanned, not silently passed', () => {
    const root = makeDist({ 'index.html': CLEAN_HTML, 'logo.png': SECRET, 'font.woff2': SECRET, 'data.bin.dat': SECRET });
    const result = scan(root);
    expect(result.findings).toEqual([]);
    expect(result.skipped.map((p) => p.split(/[\\/]/).pop()).sort()).toEqual(['data.bin.dat', 'font.woff2', 'logo.png']);
    expect(result.scanned).toHaveLength(1);
  });

  it('a file that cannot be read is reported as unreadable', () => {
    const root = makeDist({ 'index.html': CLEAN_HTML, 'assets/locked.js': CLEAN_JS });
    const result = scan(root, {
      readFile: (path) => {
        if (path.endsWith('locked.js')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
        return CLEAN_HTML;
      },
    });
    expect(result.unreadable).toHaveLength(1);
    expect(result.unreadable[0]).toMatchObject({ reason: 'EACCES' });
    expect(result.unreadable[0]?.path).toMatch(/locked\.js$/);
  });

  it('a folder that does not exist is reported as unreadable', () => {
    const result = scan(join(tmpdir(), 'scan-dist-does-not-exist-' + Date.now()));
    expect(result.unreadable).toHaveLength(1);
    expect(result.scanned).toEqual([]);
  });
});

describe('scanDirectory: findings', () => {
  it('a secret in a nested file is found with its path', () => {
    const root = makeDist({ 'index.html': CLEAN_HTML, 'assets/deep/er/app.js': SECRET });
    const result = scan(root);
    expect(result.findings.map((f) => f.name)).toEqual(['credential assignment']);
    expect(result.findings[0]?.file).toMatch(/app\.js$/);
  });

  it('a non-HTTPS URL is found; an exact-host localhost URL is not', () => {
    expect(findingNames(makeDist({ 'a.js': 'fetch("http://example.invalid/x")' }))).toEqual(['non-HTTPS URL']);
    expect(findingNames(makeDist({ 'a.js': 'fetch("http://localhost.evil.invalid/x")' }))).toEqual(['non-HTTPS URL']);
    expect(findingNames(makeDist({ 'a.js': 'fetch("http://localhost:5173/x")' }))).toEqual([]);
  });

  it('demo content is a finding in a release scan and allowed with allowDemo (credentials still are findings)', () => {
    const root = makeDist({ 'index.html': CLEAN_HTML, 'assets/app.js': 'x={name:"Testville"}' });
    expect(findingNames(root)).toContain('demo place "Testville"');
    expect(findingNames(root, { allowDemo: true })).toEqual([]);
    const withSecret = makeDist({ 'assets/app.js': 'x={name:"Testville"};' + SECRET });
    expect(findingNames(withSecret, { allowDemo: true })).toEqual(['credential assignment']);
  });

  it('a demo chunk file name is a finding even if its content looks clean; allowed with allowDemo', () => {
    const root = makeDist({ 'index.html': CLEAN_HTML, 'assets/demoComposition-Cr6nNFPP.js': CLEAN_JS });
    expect(findingNames(root)).toEqual(expect.arrayContaining(['demo chunk file name', 'demo module file name']));
    expect(findingNames(root, { allowDemo: true })).toEqual([]);
  });

  it('a demo-named file of a type that is not read (an image) is still caught by name', () => {
    const root = makeDist({ 'index.html': CLEAN_HTML, 'assets/demoBanner.png': 'x' });
    expect(findingNames(root)).toContain('demo chunk file name');
  });

  it('the structural demo symbol is found even without any place name', () => {
    const root = makeDist({ 'assets/app.js': 'let{composeDemo:e}=await import(`./x.js`)' });
    expect(findingNames(root)).toEqual(['demo composition symbol "composeDemo"']);
  });
});

describe('isFailure: what makes the command exit 1', () => {
  const clean = { scanned: ['a'], unreadable: [], findings: [] };
  it('a clean scan does not fail', () => {
    expect(isFailure(clean)).toBe(false);
  });
  it('a finding fails', () => {
    expect(isFailure({ ...clean, findings: [{}] })).toBe(true);
  });
  it('an unreadable file or folder fails (a file that was not read cannot be called clean)', () => {
    expect(isFailure({ ...clean, unreadable: [{}] })).toBe(true);
  });
  it('a scan that read nothing fails', () => {
    expect(isFailure({ ...clean, scanned: [] })).toBe(true);
  });
});

describe('scripts/scanDist.mjs command: exit codes', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/scanDist.mjs'), ...args], { encoding: 'utf8' });

  it('exits 0 on a clean release folder and prints the counts', () => {
    const r = run(makeDist(validDist()));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/scanned 3 file\(s\), not scanned 0, unreadable 0.*no findings/);
  });

  it('exits 1 on a credential', () => {
    const r = run(makeDist(validDist({ 'assets/b.js': SECRET })));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('credential assignment');
    expect(r.stderr).not.toContain('abcd1234efgh');
  });

  it('exits 1 on a demo marker, and 0 with --allow-demo', () => {
    const root = makeDist(validDist({ 'assets/demoComposition-abc.js': 'export{S as composeDemo}; "Testville"' }));
    expect(run(root).status).toBe(1);
    expect(run(root, '--allow-demo').status).toBe(0);
  });

  it('exits 1 when the folder does not exist', () => {
    const r = run(join(tmpdir(), 'scan-dist-missing-' + Date.now()));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('does not exist');
  });

  it('exits 1 when nothing could be scanned (an empty folder, or only binary files)', () => {
    expect(run(makeDist({})).status).toBe(1);
    const r = run(makeDist({ 'logo.png': 'x' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no files scanned');
  });
});

describe('the actual dist/ folder, when present', () => {
  const dist = join(REPO_ROOT, 'dist');
  // Skipped (shown as skipped in the test report) when dist/ is absent, rather than passing vacuously.
  it.skipIf(!existsSync(join(dist, 'index.html')))(
    'has no credential-like text, no non-HTTPS URL and no unreadable file (valid for release and demo builds alike)',
    () => {
      const result = scanDirectory(dist, { allowDemo: true });
      expect(result.scanned.length).toBeGreaterThan(1);
      expect(result.unreadable).toEqual([]);
      expect(result.findings).toEqual([]);
    },
  );

  it('the scan command exists', () => {
    expect(existsSync(join(REPO_ROOT, 'scripts/scanDist.mjs'))).toBe(true);
  });
});

// ---- Icons: the set is pinned, never zero, tree-shaken ---------------------------------------------------------------
describe('scanDirectory: icon rules', () => {
  const only = (js: string) => makeDist({ 'assets/a.js': js });

  it('positive: exactly the pinned icons is clean, and the names are listed', () => {
    const result = scanDirectory(only(FULL_JS), { runtimePackages: [] });
    expect(result.findings).toEqual([]);
    expect(result.icons).toEqual([...EXPECTED_ICONS].sort());
  });

  it('negative: an icon of the pinned set missing from the bundle is a finding naming it', () => {
    const js = 'function lucideIcon(){}' + EXPECTED_ICONS.filter((n) => n !== 'cloud-fog').map(icon).join('');
    const result = scanDirectory(only(js), { runtimePackages: [] });
    expect(result.findings).toEqual([expect.objectContaining({ name: 'icon missing from bundle', context: 'cloud-fog' })]);
  });

  it('negative: an icon that is not in the pinned set is a finding naming it', () => {
    const result = scanDirectory(only(FULL_JS + icon('wind')), { runtimePackages: [] });
    expect(result.findings).toEqual([expect.objectContaining({ name: 'unexpected icon in bundle', context: 'wind' })]);
  });

  it('negative: Lucide code present but zero icons detected (stale detection pattern) FAILS instead of passing', () => {
    // Icon definitions in a shape the pattern does not know (size before name).
    const reshaped = 'function lucideIcon(){}' + 'var x={size:24,name:`sun`,node:[[`path`,{d:`M1`}]]};';
    expect(findingNames(only(reshaped))).toEqual(['icon detection found no icons']);
    // With the pinned set the missing icons are reported as well.
    expect(scanDirectory(only(reshaped), { runtimePackages: [] }).findings.map((f) => f.name)).toEqual([
      'icon detection found no icons',
      'icon missing from bundle',
    ]);
  });

  it('negative: no Lucide code and no icons at all fails the pinned-set check (a build without icons is wrong)', () => {
    expect(scanDirectory(only(CLEAN_JS), { runtimePackages: [] }).findings.map((f) => f.name)).toEqual(['icon missing from bundle']);
  });

  it('positive: with the exact-set check off, a bundle without Lucide code is not a finding', () => {
    expect(findingNames(only(CLEAN_JS))).toEqual([]);
  });

  it('negative: too many icon definitions (a whole-library import) is a finding', () => {
    const many = Array.from({ length: MAX_BUNDLED_ICONS + 1 }, (_, i) => icon(`icon-${i}`)).join('');
    expect(findingNames(only(many))).toEqual(['icon package not tree-shaken']);
  });

  it('positive: exactly the limit is accepted, and repeated definitions of one icon count once', () => {
    const atLimit = Array.from({ length: MAX_BUNDLED_ICONS }, (_, i) => icon(`icon-${i}`)).join('');
    expect(findingNames(only(atLimit + atLimit))).toEqual([]);
  });

  it('the pinned list matches the icons imported in src/ui/weatherIcons.ts (change both together)', () => {
    const source = readFileSync(join(REPO_ROOT, 'src', 'ui', 'weatherIcons.ts'), 'utf8');
    const imported = /import \{([^}]+)\} from 'lucide-react';/.exec(source)?.[1] ?? '';
    const names = imported
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(lucideName)
      .sort();
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...EXPECTED_ICONS].sort());
  });

  it.each([
    ['CloudSun', 'cloud-sun'],
    ['Sun', 'sun'],
    ['CircleQuestionMark', 'circle-question-mark'],
    ['Clock3', 'clock-3'],
  ])('lucideName(%s) = %s', (component, expected) => {
    expect(lucideName(component)).toBe(expected);
  });
});

// ---- Notices: every runtime package, at the installed version ---------------------------------------------------------
describe('checkNotices: runtime package notices', () => {
  interface Pkg {
    name: string;
    version: string;
    license: string;
  }
  const packages: Pkg[] = readRuntimePackages();
  const pkg = (name: string): Pkg => packages.find((p) => p.name === name) as Pkg;
  const names = (notice: string, pkgs: Pkg[] = packages): string[] => checkNotices(notice, pkgs).map((f) => f.name);
  const contexts = (notice: string, pkgs: Pkg[]): string => checkNotices(notice, pkgs).map((f) => f.context).join(' | ');

  it('the runtime set is lucide-react, react, react-dom and scheduler, read from the installed packages', () => {
    expect(packages.map((p) => p.name)).toEqual(['lucide-react', 'react', 'react-dom', 'scheduler']);
    for (const p of packages) expect(p.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('positive: the shipped notice covers every runtime package, with CRLF line endings too', () => {
    expect(checkNotices(REAL_NOTICE, packages)).toEqual([]);
    expect(checkNotices(REAL_NOTICE.replace(/\r?\n/g, '\r\n'), packages)).toEqual([]);
  });

  it('positive: licence text wrapped differently still counts (whitespace is compared collapsed)', () => {
    const rewrapped = REAL_NOTICE.replace(
      'Permission is hereby granted, free of charge, to any person obtaining a copy',
      'Permission is hereby granted,\n   free of charge, to any person\n obtaining a copy',
    );
    expect(rewrapped).not.toBe(REAL_NOTICE);
    expect(checkNotices(rewrapped, packages)).toEqual([]);
  });

  it('negative: a missing or empty notices file is one finding', () => {
    expect(names('')).toEqual(['third-party notices missing']);
    expect(names('  \n ')).toEqual(['third-party notices missing']);
  });

  it('positive: with no runtime packages nothing is required', () => {
    expect(checkNotices('', [])).toEqual([]);
  });

  it.each(['lucide-react', 'react', 'react-dom', 'scheduler'])(
    'negative: the %s entry missing is "runtime package notice missing" for that package only',
    (name) => {
      const without = REAL_NOTICE.replace(new RegExp(`Package:  ${name}\\r?\\nVersion:  \\S+`), `Package:  not-${name}\nVersion:  1.0.0`);
      expect(without).not.toBe(REAL_NOTICE);
      expect(checkNotices(without, packages)).toEqual([
        expect.objectContaining({ name: 'runtime package notice missing', context: expect.stringContaining(name) }),
      ]);
    },
  );

  it.each(['lucide-react', 'react', 'react-dom', 'scheduler'])(
    'negative: a stale %s version in the notice is a version mismatch naming both versions',
    (name) => {
      const p = pkg(name);
      const stale = REAL_NOTICE.replace(`Package:  ${name}\nVersion:  ${p.version}`, `Package:  ${name}\nVersion:  0.0.1`);
      expect(stale).not.toBe(REAL_NOTICE);
      expect(checkNotices(stale, packages)).toEqual([
        expect.objectContaining({
          name: 'runtime package notice version mismatch',
          context: `${name}: notice says 0.0.1, installed ${p.version}`,
        }),
      ]);
    },
  );

  it('negative: a version that merely starts the same (1.61 vs 1.61.0) does not match', () => {
    expect(names(REAL_NOTICE, [{ name: 'lucide-react', version: '1.61', license: 'ISC' }])).toEqual([
      'runtime package notice version mismatch',
    ]);
  });

  it('negative: the licence name line must match the installed licence', () => {
    const p = pkg('react');
    const wrong = REAL_NOTICE.replace(
      `Package:  react\nVersion:  ${p.version}\nLicence:  MIT`,
      `Package:  react\nVersion:  ${p.version}\nLicence:  ISC`,
    );
    expect(wrong).not.toBe(REAL_NOTICE);
    expect(contexts(wrong, [p])).toContain('missing "Licence: MIT"');
  });

  it('negative: an entry whose licence TEXT is gone is incomplete (react: heading only)', () => {
    const p = pkg('react');
    const start = REAL_NOTICE.indexOf('Licence text, copied unchanged', REAL_NOTICE.indexOf(`Package:  react\nVersion:  ${p.version}`));
    const end = REAL_NOTICE.indexOf('3. User interface library: React DOM');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const stripped = REAL_NOTICE.slice(0, start) + '\n' + REAL_NOTICE.slice(end);
    expect(names(stripped, [p])).toEqual(Array(3).fill('runtime package licence text incomplete'));
    expect(contexts(stripped, [p])).toMatch(/MIT License.*Permission is hereby granted.*Copyright \(c\)/);
  });

  it('negative: the ISC text and the Feather MIT notice of lucide-react are each required', () => {
    const p = pkg('lucide-react');
    expect(contexts(REAL_NOTICE.replace('ISC License', 'Some License'), [p])).toContain('missing "ISC License"');
    expect(contexts(REAL_NOTICE.replace('Cole Bemis', 'Someone Else'), [p])).toContain('missing "Cole Bemis"');
    expect(contexts(REAL_NOTICE.replace('The MIT License (MIT)', 'The Other License'), [p])).toContain('missing "The MIT License (MIT)"');
  });

  it('negative: a licence outside the known set is reported, not silently accepted', () => {
    expect(names(REAL_NOTICE, [{ name: 'react', version: pkg('react').version, license: 'GPL-3.0' }])).toEqual([
      'runtime package licence not recognised',
    ]);
  });
});

describe('scanDirectory: notices rule on a folder', () => {
  const defaults: ScanOptions = { expectedIcons: undefined, runtimePackages: undefined };

  it('positive: a complete folder is clean with the default rules (installed packages and pinned icons)', () => {
    expect(scanDirectory(makeDist(validDist())).findings).toEqual([]);
  });

  it('negative: no notices file is a finding, in a demo scan too', () => {
    const files = validDist();
    delete files['THIRD_PARTY_NOTICES.txt'];
    expect(findingNames(makeDist(files), defaults)).toEqual(['third-party notices missing']);
    expect(findingNames(makeDist(files), { ...defaults, allowDemo: true })).toEqual(['third-party notices missing']);
  });

  it('negative: a notice for a stale version fails the folder scan (the version comes from node_modules)', () => {
    const version = readRuntimePackages().find((p: { name: string }) => p.name === 'react')?.version;
    const stale = REAL_NOTICE.replace(`Package:  react\nVersion:  ${version}`, 'Package:  react\nVersion:  0.0.1');
    expect(stale).not.toBe(REAL_NOTICE);
    const result = scanDirectory(makeDist(validDist({ 'THIRD_PARTY_NOTICES.txt': stale })));
    expect(result.findings.map((f) => f.name)).toEqual(['runtime package notice version mismatch']);
  });

  it('negative: the old, weak notice (ISC heading and the package name only) no longer passes', () => {
    const weak = 'ISC License\n\nCopyright (c) 2026 Lucide Icons and Contributors\n\nPackage:  lucide-react\n';
    const result = scanDirectory(makeDist(validDist({ 'THIRD_PARTY_NOTICES.txt': weak })));
    expect(result.findings.map((f) => f.name)).toContain('runtime package notice missing');
  });

  it('an unreadable notices file is unreadable (a failure), not clean', () => {
    const root = makeDist(validDist());
    const result = scanDirectory(root, {
      readFile: (path) => {
        if (path.endsWith('THIRD_PARTY_NOTICES.txt')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
        return CLEAN_HTML;
      },
      expectedIcons: null,
    });
    expect(result.unreadable.map((u) => u.reason)).toEqual(['EACCES']);
    expect(isFailure(result)).toBe(true);
  });
});

describe('the actual dist/ folder, with every rule', () => {
  const dist = join(REPO_ROOT, 'dist');
  it.skipIf(!existsSync(join(dist, 'index.html')))(
    'bundles exactly the pinned icons and ships a notice for every runtime package at the installed version',
    () => {
      const result = scanDirectory(dist, { allowDemo: true });
      expect(result.icons).toEqual([...EXPECTED_ICONS].sort());
      expect(result.findings).toEqual([]);
      expect(checkNotices(readFileSync(join(dist, 'THIRD_PARTY_NOTICES.txt'), 'utf8'), readRuntimePackages())).toEqual([]);
    },
  );
});
