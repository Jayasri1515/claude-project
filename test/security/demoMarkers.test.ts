/**
 * Unit tests for scripts/demoMarkers.mjs (TASK-043). Each marker has a positive sample (the scan must report
 * it) and a negative one (ordinary release text must not). Structural markers (chunk file name, symbols,
 * storage prefix) are checked against the real names exported by src/dev, so renaming the demo code without
 * updating the markers fails here.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_FILE_NAME_PATTERNS, DEMO_MARKERS, scanDemoFileName, scanDemoMarkers } from '../../scripts/demoMarkers.mjs';
import { sourceFiles } from '../support/sourceFiles';

const names = (text: string): string[] => scanDemoMarkers(text).map((f) => f.name);

const MARKER_CASES: ReadonlyArray<{ marker: string; positives: string[]; negatives: string[] }> = [
  {
    marker: 'demo composition symbol "composeDemo"',
    positives: ['export{S as composeDemo};', 'let{composeDemo:e}=await import(x)'],
    negatives: ['composeDemonstration()', 'compose()', 'recompose'],
  },
  {
    marker: 'demo provider symbol (DemoGeocodingProvider, DemoWeatherProvider, DemoLocationService)',
    positives: ['new DemoGeocodingProvider()', 'class DemoWeatherProvider{}', 'new DemoLocationService()'],
    negatives: ['class GeocodingProvider{}', 'DemoWeatherProviderX', 'new WeatherProvider()'],
  },
  {
    marker: 'demo store symbol (PrefixedKeyValueStore, DEMO_STORAGE_PREFIX)',
    positives: ['new PrefixedKeyValueStore(a,b)', 'const p=DEMO_STORAGE_PREFIX'],
    negatives: ['class LocalStorageStore{}', 'STORAGE_PREFIX'],
  },
  {
    marker: 'reference to a demo module (demoComposition, demoProviders, prefixedStore)',
    positives: ['import(`./demoComposition-Cr6nNFPP.js`)', 'from"./demoProviders-x.js"', '../dev/prefixedStore'],
    negatives: ['import(`./index-Cr6nNFPP.js`)', 'a demonstration of composition'],
  },
  {
    marker: 'demo storage key prefix "demo:"',
    positives: ['new P(a,"demo:")', "k='demo:favorites'", 'b=`demo:`'],
    negatives: ['{demo:r,mode:1}', 'e.demo===!0?`demo`:`live`', 'a demo: not a string start', 'x="ordinary"'],
  },
  {
    marker: 'demo place "Testville"',
    positives: ['x={name:"Testville"}', 'Testville, Testshire'],
    negatives: ['Test ville', 'testville'],
  },
  {
    marker: 'demo place "Sampleton"',
    positives: ['d(`2`,`Sampleton`)', 'Sampleton'],
    negatives: ['Sample ton', 'sampleton'],
  },
  {
    marker: 'demo place "Partialia"',
    positives: ['d(`4`,`Partialia`)', 'Partialia'],
    negatives: ['Partial', 'partialia'],
  },
  {
    marker: 'demo place "Glitchton"',
    positives: ['d(`5`,`Glitchton`)', 'Glitchton'],
    negatives: ['Glitch', 'glitchton'],
  },
];

describe('demo markers: positive and negative samples for every marker', () => {
  it('covers every marker in DEMO_MARKERS', () => {
    const covered = new Set(MARKER_CASES.map((c) => c.marker));
    for (const { name } of DEMO_MARKERS) expect(covered.has(name), `no samples for marker "${name}"`).toBe(true);
    expect(MARKER_CASES.length).toBe(DEMO_MARKERS.length);
  });

  for (const c of MARKER_CASES) {
    describe(c.marker, () => {
      it.each(c.positives.map((s) => [s]))('is reported for %j', (sample) => {
        expect(names(sample)).toContain(c.marker);
      });
      it.each(c.negatives.map((s) => [s]))('is NOT reported for %j', (sample) => {
        expect(names(sample)).not.toContain(c.marker);
      });
    });
  }

  it('plain release code reports nothing', () => {
    expect(scanDemoMarkers('function r(){return"forecast-"+i}const a={demo:r,live:2}')).toEqual([]);
  });
});

describe('demo file names', () => {
  it('covers every pattern in DEMO_FILE_NAME_PATTERNS', () => {
    expect(DEMO_FILE_NAME_PATTERNS.map((p) => p.name)).toEqual(['demo chunk file name', 'demo module file name']);
  });

  it.each([
    ['assets/demoComposition-Cr6nNFPP.js', 'demo chunk file name'],
    ['dist\\assets\\demoComposition-Cr6nNFPP.js', 'demo chunk file name'],
    ['demo.js', 'demo chunk file name'],
    ['assets/Demo-abc.js', 'demo chunk file name'],
    ['assets/chunk-demoProviders-abc.js', 'demo module file name'],
    ['assets/prefixedStore-abc.js', 'demo module file name'],
  ])('%s is reported (%s)', (path, marker) => {
    expect(scanDemoFileName(path).map((f) => f.name)).toContain(marker);
  });

  it.each(['index.html', 'assets/index-DV-ZUVLj.js', 'assets/index-SepI_PU-.css', 'assets/index-abc.png', 'docs/remodel-abc.js'])(
    '%s is not reported',
    (path) => {
      expect(scanDemoFileName(path)).toEqual([]);
    },
  );
});

describe('markers match the real demo layer in src/dev', () => {
  const dev = sourceFiles('src/dev', /\.ts$/);

  it('src/dev is not empty', () => {
    expect(dev.map((f) => f.path).sort()).toEqual([
      'src/dev/demoComposition.ts',
      'src/dev/demoProviders.ts',
      'src/dev/prefixedStore.ts',
    ]);
  });

  it('every exported class, function and constant name of src/dev is reported by a marker', () => {
    const exported = dev.flatMap((f) => [...f.text.matchAll(/export\s+(?:class|function|const)\s+(\w+)/g)].map((m) => m[1] ?? ''));
    expect(exported.length).toBeGreaterThan(4);
    for (const name of exported) {
      expect(scanDemoMarkers(`x=${name}(1)`).length, name).toBeGreaterThan(0);
    }
  });

  it('a build chunk named after each src/dev module is reported by the file-name check', () => {
    for (const f of dev) {
      const base = f.path.split('/').pop()?.replace(/\.ts$/, '') ?? '';
      expect(scanDemoFileName(`assets/${base}-AbC123_x.js`).length, base).toBeGreaterThan(0);
    }
  });

  it('the demo storage prefix used by the code is reported', () => {
    const demo = dev.find((f) => f.path === 'src/dev/demoComposition.ts')?.text ?? '';
    const prefix = /DEMO_STORAGE_PREFIX\s*=\s*'([^']+)'/.exec(demo)?.[1] ?? '';
    expect(prefix).not.toBe('');
    expect(scanDemoMarkers(`new P(a,"${prefix}")`).map((f) => f.name)).toContain('demo storage key prefix "demo:"');
  });

  it('every demo place name in src/dev/demoProviders.ts is reported by a marker', () => {
    const demo = dev.find((f) => f.path === 'src/dev/demoProviders.ts')?.text ?? '';
    const places = [...demo.matchAll(/place\('\d+', '([^']+)'/g)].map((m) => m[1] ?? '');
    expect(places.length).toBeGreaterThan(0);
    for (const name of places) expect(scanDemoMarkers(name).length, name).toBeGreaterThan(0);
  });
});
