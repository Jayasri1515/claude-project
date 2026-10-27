// Directory scan behind scripts/scanDist.mjs (kept separate so test/security can run it on temporary folders).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDemoFileName, scanDemoMarkers } from './demoMarkers.mjs';
import { scanText } from './secretScan.mjs';

/** Extensions read as text. Files with NO extension are also read as text. */
export const TEXT_EXTENSIONS = /\.(?:js|mjs|cjs|css|html?|map|json|txt|svg|xml|webmanifest|manifest|md)$/i;
/** Known binary types: not read, but listed in the result (a secret inside an image or font is not looked for). */
export const BINARY_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|wasm|pdf|zip|gz|br|mp3|mp4|webm)$/i;

/** The notice file that must sit in the bundle root (licence notices of every runtime package, see checkNotices). */
export const NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';
/** The repository root (this file is in scripts/). Runtime package versions are read from its node_modules. */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * One Lucide icon definition as it appears in a minified bundle: name:`cloud-sun`,size:24,node:[[ ... The icon
 * package is imported by name, so only the icons the app uses should be present (a few), never the whole set (~1,900).
 */
export const LUCIDE_ICON_DEFINITION = /name:[`"']([a-z0-9]+(?:-[a-z0-9]+)*)[`"'],size:24,node:\[/g;
/** More icon definitions than this means the icon package was imported as a whole, not tree-shaken. */
export const MAX_BUNDLED_ICONS = 16;
/**
 * The pinned set of icons the bundle must contain, exactly: the Lucide names of the icons imported in
 * src/ui/weatherIcons.ts (test/security/scanDist.test.ts checks that this list matches that file). Adding or
 * removing an icon there means changing this list too, on purpose. Pass `expectedIcons: null` to scanDirectory to
 * skip the exact-set check (the zero-icons check and the count limit still apply).
 */
export const EXPECTED_ICONS = [
  'circle-question-mark',
  'cloud',
  'cloud-fog',
  'cloud-lightning',
  'cloud-rain',
  'cloud-snow',
  'cloud-sun',
  'sun',
];

/**
 * What a runtime package's notice must contain, by SPDX licence id (compared with whitespace collapsed, so line
 * wrapping does not matter). The licence TEXT is checked by these fixed phrases, not just its name.
 */
export const LICENCE_MARKERS = {
  ISC: [
    'ISC License',
    'Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted',
  ],
  MIT: ['MIT License', 'Permission is hereby granted, free of charge, to any person obtaining a copy'],
};
/** Extra notices a package needs: lucide-react ships a few Feather-derived icons that are MIT-licensed. */
export const EXTRA_NOTICE_MARKERS = {
  'lucide-react': ['The MIT License (MIT)', 'Cole Bemis'],
};

/**
 * The runtime packages the bundle is built from: package.json "dependencies" and, recursively, their installed
 * "dependencies" (dev and peer dependencies are not shipped), each with the INSTALLED version and licence.
 * @param {string} [repoRoot]
 * @returns {Array<{ name: string, version: string, license: string }>}
 */
export function readRuntimePackages(repoRoot = REPO_ROOT) {
  const readJson = (...parts) => JSON.parse(readFileSync(join(repoRoot, ...parts), 'utf8'));
  const manifest = readJson('package.json');
  const found = new Map();
  const queue = Object.keys(manifest.dependencies ?? {});
  while (queue.length > 0) {
    const name = queue.shift();
    if (found.has(name)) continue;
    const installed = readJson('node_modules', name, 'package.json');
    found.set(name, { name, version: String(installed.version), license: String(installed.license) });
    queue.push(...Object.keys(installed.dependencies ?? {}));
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const collapse = (s) => s.replace(/\s+/g, ' ');

/**
 * Checks the text of THIRD_PARTY_NOTICES.txt against the installed runtime packages. For each package the notice
 * must have a "Package: <name>" / "Version: <installed version>" entry whose section (up to the next numbered
 * heading) names the same licence and contains that licence's text markers and a copyright line.
 * @param {string} notice  The file's text, or '' when it is missing.
 * @param {Array<{ name: string, version: string, license: string }>} packages
 * @returns {Array<{ name: string, context: string }>}
 */
export function checkNotices(notice, packages) {
  if (packages.length === 0) return []; // nothing is shipped that needs a notice
  if (notice.trim() === '') {
    return [{ name: 'third-party notices missing', context: `${NOTICES_FILE} is missing or empty` }];
  }
  const findings = [];
  const text = notice.replace(/\r\n/g, '\n');
  const entries = [...text.matchAll(/^Package:[ \t]+(\S+)[ \t]*\n[ \t]*Version:[ \t]+(\S+)[ \t]*$/gm)].map((m) => ({
    name: m[1],
    version: m[2],
    start: m.index ?? 0,
  }));
  for (const pkg of packages) {
    const named = entries.filter((e) => e.name === pkg.name);
    if (named.length === 0) {
      findings.push({ name: 'runtime package notice missing', context: `${pkg.name} ${pkg.version}` });
      continue;
    }
    const entry = named.find((e) => e.version === pkg.version);
    if (entry === undefined) {
      findings.push({
        name: 'runtime package notice version mismatch',
        context: `${pkg.name}: notice says ${named.map((e) => e.version).join(', ')}, installed ${pkg.version}`,
      });
      continue;
    }
    const rest = text.slice(entry.start + 1);
    const next = rest.search(/^\d+\. /m);
    const section = collapse(next === -1 ? rest : rest.slice(0, next));
    const markers = LICENCE_MARKERS[pkg.license];
    if (markers === undefined) {
      findings.push({ name: 'runtime package licence not recognised', context: `${pkg.name}: licence "${pkg.license}"` });
      continue;
    }
    const wanted = [`Licence: ${pkg.license}`, ...markers, 'Copyright (c)', ...(EXTRA_NOTICE_MARKERS[pkg.name] ?? [])];
    for (const marker of wanted) {
      if (!section.includes(marker)) {
        findings.push({
          name: 'runtime package licence text incomplete',
          context: `${pkg.name} ${pkg.version}: missing "${marker.slice(0, 50)}"`,
        });
      }
    }
  }
  return findings;
}

/** Lucide icon name for an exported component name: CloudSun -> cloud-sun, Clock3 -> clock-3. */
export function lucideName(componentName) {
  return componentName
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])([0-9])/g, '$1-$2')
    .toLowerCase();
}

/** Whether a file name has an extension at all (a dotfile such as ".htaccess" counts as extensionless). */
function hasExtension(name) {
  return /.\.[^.]+$/.test(name);
}

/**
 * Scans every file under `root`.
 * - Text files (TEXT_EXTENSIONS and extensionless files): content scan (credentials, URLs, and demo markers unless allowed).
 * - Every file, whatever its type: the demo file-name check unless allowed.
 * - Binary or unknown-extension files: not read; listed in `skipped`.
 * - A file or folder that cannot be read or listed: listed in `unreadable` and counts as a failure.
 * - Always: the notices file must cover every runtime package at its installed version (checkNotices), and the
 *   icons found in the JavaScript must be exactly the pinned set (EXPECTED_ICONS), never zero when the Lucide code
 *   is present, and never more than MAX_BUNDLED_ICONS.
 * @param {string} root
 * @param {{ allowDemo?: boolean, readFile?: (path: string) => string, runtimePackages?: Array<{ name: string, version: string, license: string }>, expectedIcons?: string[] | null }} [options]
 *   `readFile` is for tests (to simulate an unreadable file). `runtimePackages` defaults to the installed packages
 *   (readRuntimePackages); `expectedIcons` defaults to EXPECTED_ICONS and `null` skips the exact-set check.
 * @returns {{ scanned: string[], skipped: string[], unreadable: Array<{ path: string, reason: string }>, findings: Array<{ file: string, name: string, context: string }>, icons: string[] }}
 */
export function scanDirectory(root, options = {}) {
  const allowDemo = options.allowDemo === true;
  const readFile = options.readFile ?? ((path) => readFileSync(path, 'utf8'));
  const expectedIcons = options.expectedIcons === undefined ? EXPECTED_ICONS : options.expectedIcons;
  const result = { scanned: [], skipped: [], unreadable: [], findings: [], icons: [] };
  const iconNames = new Set();
  let usesLucide = false;

  const visit = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch (error) {
      result.unreadable.push({ path: dir, reason: String(error?.code ?? error) });
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let isDir;
      try {
        isDir = statSync(full).isDirectory();
      } catch (error) {
        result.unreadable.push({ path: full, reason: String(error?.code ?? error) });
        continue;
      }
      if (isDir) {
        visit(full);
        continue;
      }
      if (!allowDemo) {
        for (const f of scanDemoFileName(entry)) result.findings.push({ file: full, name: f.name, context: f.context });
      }
      const isText = TEXT_EXTENSIONS.test(entry) || (!hasExtension(entry) && !BINARY_EXTENSIONS.test(entry));
      if (!isText) {
        result.skipped.push(full);
        continue;
      }
      let text;
      try {
        text = readFile(full);
      } catch (error) {
        result.unreadable.push({ path: full, reason: String(error?.code ?? error) });
        continue;
      }
      result.scanned.push(full);
      if (/\.(?:m?js|cjs)$/i.test(entry)) {
        if (/lucide/i.test(text)) usesLucide = true;
        for (const m of text.matchAll(LUCIDE_ICON_DEFINITION)) iconNames.add(m[1]);
      }
      for (const f of [...scanText(text), ...(allowDemo ? [] : scanDemoMarkers(text))]) {
        result.findings.push({ file: full, name: f.name, context: f.context });
      }
    }
  };
  visit(root);

  result.icons = [...iconNames].sort();
  if (result.icons.length > MAX_BUNDLED_ICONS) {
    result.findings.push({
      file: root,
      name: 'icon package not tree-shaken',
      context: `${result.icons.length} icon definitions bundled (limit ${MAX_BUNDLED_ICONS})`,
    });
  }
  if (usesLucide && result.icons.length === 0) {
    // The Lucide code is there but the detection pattern found no icon: the pattern is stale (a new package version
    // changed the minified shape), so "few icons" would be vacuously true. Fail instead of passing.
    result.findings.push({
      file: root,
      name: 'icon detection found no icons',
      context: 'the bundle contains Lucide code but no icon definition matched LUCIDE_ICON_DEFINITION; update the pattern',
    });
  }
  if (expectedIcons !== null) {
    const missing = expectedIcons.filter((name) => !iconNames.has(name));
    const extra = result.icons.filter((name) => !expectedIcons.includes(name));
    if (missing.length > 0) result.findings.push({ file: root, name: 'icon missing from bundle', context: missing.join(', ') });
    if (extra.length > 0) result.findings.push({ file: root, name: 'unexpected icon in bundle', context: extra.join(', ') });
  }

  // Licence notices must travel with copies (ISC for Lucide, MIT for its Feather-derived icons and the React packages).
  let packages = options.runtimePackages;
  if (packages === undefined) {
    try {
      packages = readRuntimePackages();
    } catch (error) {
      result.unreadable.push({ path: join(REPO_ROOT, 'package.json'), reason: `runtime packages: ${String(error?.code ?? error)}` });
      packages = [];
    }
  }
  let notice = '';
  try {
    notice = readFile(join(root, NOTICES_FILE));
  } catch {
    /* reported below as missing */
  }
  for (const f of checkNotices(notice, packages)) {
    result.findings.push({ file: join(root, NOTICES_FILE), name: f.name, context: f.context });
  }
  return result;
}

/**
 * Whether a scan result must fail the command: any finding, or any file or folder that could not be read
 * (a file that was not read cannot be called clean), or nothing scanned at all.
 * @param {{ scanned: string[], unreadable: unknown[], findings: unknown[] }} result
 */
export function isFailure(result) {
  return result.findings.length > 0 || result.unreadable.length > 0 || result.scanned.length === 0;
}
