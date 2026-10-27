import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, sourceFiles } from '../support/sourceFiles';

/**
 * TASK-035: the ISC licence text of the icon package must ship with the app. `public/THIRD_PARTY_NOTICES.txt` is
 * copied to dist/ by the build. These tests tie it to the INSTALLED package, so upgrading lucide-react without
 * refreshing the notice fails here.
 */
const read = (...parts: string[]): string => readFileSync(join(REPO_ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
const pkg = JSON.parse(read('node_modules', 'lucide-react', 'package.json')) as { name: string; version: string; license: string };

interface InstalledPackage {
  name: string;
  version: string;
  license: string;
  dependencies?: Record<string, string>;
}

/** Every package that can end up in the release bundle: package.json "dependencies" and, recursively, their installed "dependencies" (peer and dev dependencies are not shipped). */
function runtimePackages(): InstalledPackage[] {
  const manifest = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
  const found = new Map<string, InstalledPackage>();
  const queue = Object.keys(manifest.dependencies);
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (found.has(name)) continue;
    const installed = JSON.parse(read('node_modules', name, 'package.json')) as InstalledPackage;
    found.set(name, installed);
    queue.push(...Object.keys(installed.dependencies ?? {}));
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

describe('third-party notices (every runtime dependency)', () => {
  const notice = read('public', 'THIRD_PARTY_NOTICES.txt');
  const packages = runtimePackages();

  it('the runtime set is what the release bundle is built from: lucide-react, react, react-dom and react-dom\'s scheduler', () => {
    expect(packages.map((p) => p.name)).toEqual(['lucide-react', 'react', 'react-dom', 'scheduler']);
  });

  it.each(packages.map((p) => [p.name, p] as const))('%s: the notice names the installed version and licence, and holds the installed LICENSE text unchanged', (_name, p) => {
    expect(['ISC', 'MIT']).toContain(p.license);
    expect(notice).toContain(`Package:  ${p.name}\nVersion:  ${p.version}\nLicence:  ${p.license}`);
    const licence = read('node_modules', p.name, 'LICENSE').trimEnd();
    expect(licence).toMatch(/Copyright \(c\)/);
    expect(notice).toContain(licence);
  });

  it('the React family notices carry the Meta copyright line, once per package', () => {
    const meta = notice.match(/Copyright \(c\) Meta Platforms, Inc\. and affiliates\./g) ?? [];
    expect(meta).toHaveLength(3);
  });
});

describe('third-party notices (Lucide icons)', () => {
  it('the notice file exists in public/ (so the build copies it to dist/)', () => {
    expect(existsSync(join(REPO_ROOT, 'public', 'THIRD_PARTY_NOTICES.txt'))).toBe(true);
  });

  it('names the installed package, its exact version and its licence', () => {
    const notice = read('public', 'THIRD_PARTY_NOTICES.txt');
    expect(pkg.name).toBe('lucide-react');
    expect(pkg.license).toBe('ISC');
    expect(notice).toContain(`Package:  ${pkg.name}`);
    expect(notice).toContain(`Version:  ${pkg.version}`);
    expect(notice).toMatch(/Licence:\s+ISC/);
  });

  it("contains the installed package's LICENSE text unchanged (ISC permission notice, and the MIT notice for Feather-derived icons)", () => {
    const notice = read('public', 'THIRD_PARTY_NOTICES.txt');
    const licence = read('node_modules', 'lucide-react', 'LICENSE').trimEnd();
    expect(licence).toContain('Permission to use, copy, modify, and/or distribute this software for any');
    expect(licence).toContain('Copyright (c)');
    expect(notice).toContain(licence);
  });

  it('credits Open-Meteo (CC BY 4.0) and GeoNames, and says what the app changes', () => {
    const notice = read('public', 'THIRD_PARTY_NOTICES.txt');
    expect(notice).toContain('Weather data by Open-Meteo.com (https://open-meteo.com/)');
    expect(notice).toContain('https://creativecommons.org/licenses/by/4.0/');
    expect(notice).toContain('Location data based on GeoNames (https://www.geonames.org/)');
    expect(notice).toMatch(/Changes made by this app/);
  });

  it('lucide-react is a runtime dependency and no other icon package is declared', () => {
    const manifest = JSON.parse(read('package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(Object.keys(manifest.dependencies)).toContain('lucide-react');
    const all = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(all.filter((name) => /icon|lucide|fontawesome|feather|heroicons|material-symbols/i.test(name))).toEqual(['lucide-react']);
  });

  it('no icon is imported from outside the single table, and always by name (tree-shakeable)', () => {
    const table = read('src', 'ui', 'weatherIcons.ts');
    expect(table).toMatch(/import \{[^}]+\} from 'lucide-react';/);
    expect(table).not.toMatch(/import \* as/);
    expect(table).not.toMatch(/lucide-react\/dynamic|DynamicIcon|dynamicIconImports/);
    const importers = sourceFiles('src', /\.(ts|tsx)$/).filter((f) => /from\s+['"]lucide-react/.test(f.text)).map((f) => f.path);
    expect(importers).toEqual(['src/ui/weatherIcons.ts']);
  });
});
