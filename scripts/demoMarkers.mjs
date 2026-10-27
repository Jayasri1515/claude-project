// Markers of the demo layer (src/dev/*) in built output. A release bundle (plain `npm run build`)
// must contain none of them; a demo bundle (`npm run build:demo`) contains them by design.
// Used by scripts/scanDist.mjs and checked by test/security. Not a provider fact: these are the
// invented names the demo providers use, the demo storage-key prefix, and the names of the demo code itself.
//
// Two kinds of marker:
// - structural: the demo chunk's file name, the demo code's own symbols (composeDemo, Demo*Provider, ...)
//   and the demo storage prefix. These do not depend on what the invented data looks like.
// - content: the invented place names. They catch the data if the structure ever changes.
// Minifiers may rename local symbols, so a missing symbol is not proof that the demo code is absent.

/** @type {ReadonlyArray<{ name: string, pattern: RegExp }>} */
export const DEMO_MARKERS = [
  { name: 'demo composition symbol "composeDemo"', pattern: /\bcomposeDemo\b/ },
  {
    name: 'demo provider symbol (DemoGeocodingProvider, DemoWeatherProvider, DemoLocationService)',
    pattern: /\bDemo(?:Geocoding|Weather)Provider\b|\bDemoLocationService\b/,
  },
  { name: 'demo store symbol (PrefixedKeyValueStore, DEMO_STORAGE_PREFIX)', pattern: /\bPrefixedKeyValueStore\b|\bDEMO_STORAGE_PREFIX\b/ },
  { name: 'reference to a demo module (demoComposition, demoProviders, prefixedStore)', pattern: /demoComposition|demoProviders|prefixedStore/ },
  // A string literal that starts with the prefix ("demo:" or "demo:key"); object keys such as `demo:` in minified code
  // have no quote before them and do not match.
  { name: 'demo storage key prefix "demo:"', pattern: /["'`]demo:/ },
  { name: 'demo place "Testville"', pattern: /Testville/ },
  { name: 'demo place "Sampleton"', pattern: /Sampleton/ },
  { name: 'demo place "Partialia"', pattern: /Partialia/ },
  { name: 'demo place "Glitchton"', pattern: /Glitchton/ },
];

/** File names (any path) that belong to the demo layer: the demo chunk is emitted as demoComposition-<hash>.js. */
export const DEMO_FILE_NAME_PATTERNS = [
  { name: 'demo chunk file name', pattern: /(?:^|[\\/])demo[^\\/]*$/i },
  { name: 'demo module file name', pattern: /demoComposition|demoProviders|prefixedStore/i },
];

/** @param {string} text @returns {Array<{ name: string, context: string }>} */
export function scanDemoMarkers(text) {
  const findings = [];
  for (const { name, pattern } of DEMO_MARKERS) {
    const match = pattern.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 20);
      findings.push({ name, context: text.slice(start, match.index + match[0].length + 20).replace(/\s+/g, ' ') });
    }
  }
  return findings;
}

/** @param {string} path A file path (relative or absolute). @returns {Array<{ name: string, context: string }>} */
export function scanDemoFileName(path) {
  return DEMO_FILE_NAME_PATTERNS.filter(({ pattern }) => pattern.test(path)).map(({ name }) => ({ name, context: path }));
}
