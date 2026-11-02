/**
 * Unit tests for scripts/secretScan.mjs (TASK-041, TASK-043). Every rule has at least one positive sample
 * (the scan must report that rule) and at least one negative sample (ordinary text must not trigger it).
 * A coverage test fails if a rule is added to the scanner without samples here.
 *
 * Secret-shaped samples are assembled at run time so this file itself carries no secret-shaped literal.
 * All samples are invented; none is a real key.
 */
import { describe, expect, it } from 'vitest';
import { ALLOWED_INSECURE_HOSTS, SECRET_PATTERNS, hostOf, scanText } from '../../scripts/secretScan.mjs';

const names = (text: string): string[] => scanText(text).map((f) => f.name);

interface RuleCase {
  readonly rule: string;
  readonly positives: readonly string[];
  readonly negatives: readonly string[];
}

const hex32 = 'a1b2c3d4'.repeat(4);
const digits32 = '12345678901234567890123456789012';
const jwtHead = 'ey' + 'JhbGciOiJIUzI1NiJ9';
const jwtBody = 'ey' + 'JzdWIiOiIxMjM0NTY3ODkwIn0';

const CASES: readonly RuleCase[] = [
  {
    rule: 'private key block',
    positives: ['-----BEGIN ' + 'RSA PRIVATE KEY-----', '-----BEGIN ' + 'PRIVATE KEY-----'],
    negatives: ['-----BEGIN CERTIFICATE-----', 'a private key is not included'],
  },
  {
    rule: 'AWS access key id',
    positives: ['AK' + 'IA' + 'ABCDEFGHIJKLMNOP', 'AS' + 'IA' + 'ABCDEFGHIJKLMNOP', 'id="' + 'AK' + 'IA' + '1234567890ABCDEF"'],
    negatives: ['AKIA' + 'SHORT', 'AK' + 'IA' + 'ABCDEFGHIJKLMNOPQRSTUV', 'NAKIAABCDEFGHIJKLMNOP'],
  },
  {
    rule: 'Google API key',
    positives: ['AI' + 'za' + 'A'.repeat(35)],
    negatives: ['AI' + 'za' + 'short', 'AIzaAAAA'],
  },
  {
    rule: 'GitHub token',
    positives: ['gh' + 'p_' + 'a'.repeat(36), 'gh' + 'o_' + 'B1'.repeat(20)],
    negatives: ['ghp_short', 'gh' + 'p_' + 'a'.repeat(35), 'light_' + 'a'.repeat(40)],
  },
  {
    rule: 'GitHub fine-grained token',
    positives: ['github_' + 'pat_' + 'A1b2C3'.repeat(5), 'github_' + 'pat_' + 'x'.repeat(22)],
    negatives: ['github_pat_short', 'github_patterns_are_listed_here'],
  },
  {
    rule: 'Slack token',
    positives: ['xo' + 'xb-' + '1234567890-abcdef'],
    negatives: ['xoxb-1', 'xoxo-hugs-and-kisses'],
  },
  {
    rule: 'secret-style key (sk-)',
    positives: ['s' + 'k-' + 'A1b2C3d4E5f6G7h8I9j0K1', 's' + 'k-' + 'proj-' + 'A1b2C3d4E5f6G7h8I9j0K1_xyz', 's' + 'k-' + 'svcacct-' + 'abc-DEF_123456789012345'],
    negatives: ['sk-short', 'task-list-item-with-a-long-class-name', 'disk-usage-indicator-widget-large', 'ask-me-anything-about-the-weather'],
  },
  {
    rule: 'JSON Web Token',
    positives: [`${jwtHead}.${jwtBody}.abc_DEF-123`, `${jwtHead}.${jwtBody}`],
    negatives: [jwtHead, 'eyJ.eyJ', 'eyeJ.eyeJ.eyeJ', 'some.dotted.name'],
  },
  {
    rule: 'credential assignment',
    positives: [
      'const api' + '_key = "abcd1234efgh";',
      "const api" + "Key = 'abcd1234efgh';",
      'const password = `hunter2hunter2`;',
      'const token = `${import.meta.env.VITE_SOME_TOKEN}`;',
      '{"client' + '_secret":"abcd1234efgh"}',
      '{\\"api' + 'Key\\":\\"abcd1234efgh\\"}',
      'x.accessToken = "abcd1234efgh"',
    ],
    negatives: [
      'const apiKey = "short";',
      'const label = "Password";',
      'password: ""',
      'const token = someVariable;',
      'placeholder="enter your password here"',
      'const tokens = ["abcd1234efgh"];',
    ],
  },
  {
    rule: 'long hex value assigned to a key-like name',
    positives: [`const key = "${hex32}";`, `{ auth: '${hex32}' }`, `const signature = \`${hex32}\``, `key: "${digits32}"`],
    negatives: ['const key = "abc123";', `const key = "${hex32.slice(0, 31)}";`, `const id = "${hex32}";`, `const key = ${hex32};`],
  },
  {
    rule: 'long base64-style value assigned to a key-like name',
    positives: [
      'const key = "dGhpcyBpcyBhIHRlc3Qgc2VjcmV0IGtleSE0Mg==";',
      "{ auth: 'Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1Wx2' }",
      'const credential = `Zm9vYmFyYmF6MTIzNDU2Nzg5MGFiY2RlZmdoaWo`;',
    ],
    negatives: [
      'const key = "ThisIsJustALongIdentifierWithoutAnyDigitsXYZ";',
      'const key = "1234567890123456789012345678901";',
      'const name = "Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1Wx2";',
      'const key = "has spaces and 123 digits so it is plain text";',
    ],
  },
  {
    rule: 'credentials inside a URL',
    positives: [
      'https://user:pass' + 'word@example.invalid/',
      'WSS://user:pass@example.invalid/socket',
      'ftp://user:pass@example.invalid/file',
      'HTTP://user:pass@example.invalid/',
      '`https://user:pass@${host}/`',
    ],
    negatives: ['https://example.invalid/a@b', 'https://example.invalid:8080/x@y', 'mailto:person@example.invalid', 'user:pass@example'],
  },
  {
    rule: 'key in a URL query',
    positives: [
      'https://example.invalid/data?' + 'api' + 'key=abcdef123456',
      'https://example.invalid/data?token=x',
      'https://example.invalid/data?a=1&KEY=Z',
      'https://example.invalid/data?api_key=1',
      'https://example.invalid/data?appid=12',
      'https://example.invalid/data?key=${apiKey}',
      '`https://example.invalid/data?key=${k}&q=1`',
      '"https://example.invalid/data?key="+k',
      "'https://example.invalid/data?token=' + t",
      'href="https://example.invalid/data?a=1&amp;token=abc"',
      'https://example.invalid/cb#access_token=abcdef',
    ],
    negatives: [
      'https://example.invalid/data?keyboard=1',
      'https://example.invalid/data?monkey=1',
      'https://example.invalid/data?q=weather&page=2',
      'https://example.invalid/data?key=&page=2',
      'https://example.invalid/data?tokens=1',
      'press the key=value button',
    ],
  },
  {
    rule: 'bearer token',
    positives: ['Authorization: Bearer ' + 'abcdefghijklmnop1234', 'Bearer ' + 'A.b-c_d~e+f/g123456789'],
    negatives: ['Bearer token', 'Bearer of bad news travels fast', 'bearer'],
  },
  {
    rule: 'non-HTTPS URL',
    positives: [
      'see http://example.invalid/page',
      'HTTP://EXAMPLE.invalid/page',
      'ws://example.invalid/socket',
      'WS://example.invalid',
      'ftp://example.invalid/file',
      'FTP://example.invalid/file',
      'http://localhost.evil.invalid/',
      'http://localhost@evil.invalid/',
      'http://localhost:80@evil.invalid/',
      'http://www.w3.org.evil.invalid/2000/svg',
      'http://127.0.0.1.evil.invalid/',
      'http://localhostx/',
      'http://${host}/path',
    ],
    negatives: [
      'xmlns="http://www.w3.org/1999/xhtml"',
      'http://localhost:5173/',
      'http://localhost',
      'ws://localhost:5173/',
      'HTTP://LOCALHOST/',
      'http://127.0.0.1:8080/x',
      'http://[::1]:3000/',
      'wss://example.invalid/',
      'https://example.invalid/',
      'news://example.invalid/',
      'startsWith("http://")',
    ],
  },
];

describe('secretScan rules: every rule has positive and negative samples', () => {
  it('covers every pattern in SECRET_PATTERNS and the URL scheme rule', () => {
    const covered = new Set(CASES.map((c) => c.rule));
    for (const { name } of SECRET_PATTERNS) expect(covered.has(name), `no samples for rule "${name}"`).toBe(true);
    expect(covered.has('non-HTTPS URL')).toBe(true);
    for (const c of CASES) {
      expect(c.positives.length, c.rule).toBeGreaterThan(0);
      expect(c.negatives.length, c.rule).toBeGreaterThan(0);
    }
  });

  for (const c of CASES) {
    describe(c.rule, () => {
      it.each(c.positives.map((s) => [s]))('is reported for %j', (sample) => {
        expect(names(sample)).toContain(c.rule);
      });
      it.each(c.negatives.map((s) => [s]))('is NOT reported for %j', (sample) => {
        expect(names(sample)).not.toContain(c.rule);
      });
    });
  }

  it('the hex rule fires alone on an all-digit value (it does not depend on the base64 rule)', () => {
    expect(names(`key: "${digits32}"`)).toEqual(['long hex value assigned to a key-like name']);
  });

  it('ordinary text and markup produce no finding at all', () => {
    const ordinary = [
      '<a href="https://example.invalid/page?q=weather">Weather</a>',
      'const label = "Use my location"; const key = item.id;',
      'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"',
      '.card{color:#fff;background:#0a0a0a}',
      'function r(){return"forecast-"+i}',
    ];
    for (const sample of ordinary) expect(scanText(sample), sample).toEqual([]);
  });

  it('findings never echo the secret itself', () => {
    const aws = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
    const assign = 'const api' + '_key = "' + 'abcd1234efgh' + '";';
    const query = 'https://example.invalid/data?token=' + 'zzzsecretvaluezzz';
    for (const text of [aws, assign, query]) {
      const json = JSON.stringify(scanText(text));
      expect(json).not.toContain('ABCDEFGHIJKLMNOP');
      expect(json).not.toContain('abcd1234efgh');
      expect(json).not.toContain('zzzsecretvaluezzz');
    }
  });

  it('checkInsecureUrls: false switches only the URL scheme rule off', () => {
    expect(scanText('http://example.invalid/', { checkInsecureUrls: false })).toEqual([]);
    expect(scanText('AK' + 'IA' + 'ABCDEFGHIJKLMNOP', { checkInsecureUrls: false })).not.toEqual([]);
  });
});

describe('URL allow-list is an exact host match', () => {
  it('lists only the XML namespace host and the local machine', () => {
    expect([...ALLOWED_INSECURE_HOSTS]).toEqual(['www.w3.org', 'localhost', '127.0.0.1', '[::1]']);
  });

  it.each([
    ['localhost/', 'localhost'],
    ['localhost:5173/x?y#z', 'localhost'],
    ['LOCALHOST.', 'localhost'],
    ['user:pw@Example.COM/path', 'example.com'],
    ['localhost@evil.invalid/', 'evil.invalid'],
    ['localhost.evil.invalid/', 'localhost.evil.invalid'],
    ['[::1]:3000/x', '[::1]'],
    ['127.0.0.1:80', '127.0.0.1'],
  ])('hostOf(%j) is %j', (input, expected) => {
    expect(hostOf(input)).toBe(expected);
  });
});
