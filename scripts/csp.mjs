// The Content-Security-Policy of the release build (impl-plan T-51, architecture 5.3) and the rules the build gate
// holds a built dist/index.html to (scanDistLib.mjs, checkCsp).
//
// Delivery: a <meta http-equiv="Content-Security-Policy"> tag that vite.config.ts adds to dist/index.html on
// `vite build` only (never in dev, where Vite's HMR needs inline script). The target host is any static HTTPS host
// (U5), which usually cannot set response headers, so the meta tag is the only mechanism that works everywhere.
// Limits of a meta CSP: `frame-ancestors`, `report-uri` and `sandbox` are ignored in a meta tag, so clickjacking
// protection and violation reports need a real header, which the host would have to be asked to send with the same
// directives (docs/deployment.md).
//
// The two provider origins are duplicated from src/adapters/openMeteo/{geocoding,weather}.ts (scripts are plain
// JavaScript and cannot import the TypeScript sources); test/security/scanDistRules.test.ts fails if they drift apart.

/** The only origins the page may connect to: the two documented Open-Meteo hosts. */
export const PROVIDER_ORIGINS = ['https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com'];

/**
 * The policy as directive name -> sources.
 * - script-src 'self': the built bundle only; no inline script, no eval, no third-party script.
 * - style-src 'self': the built stylesheet only; no inline <style> and no style="" attribute in markup (styles set
 *   from script through the DOM API are not blocked by CSP).
 * - img-src 'self' data:: the inline favicon (`<link rel="icon" href="data:,">`) is a data: URI.
 * - connect-src: exactly the two provider origins (no 'self': the app makes no request to its own origin).
 */
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'connect-src': PROVIDER_ORIGINS,
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

/** The policy as the string for the `content` attribute. */
export function buildCsp(directives = CSP_DIRECTIVES) {
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

/** The meta tag, ready to insert into <head>. */
export function cspMetaTag(directives = CSP_DIRECTIVES) {
  return `<meta http-equiv="Content-Security-Policy" content="${buildCsp(directives)}" />`;
}

/** Parses a policy string into directive name -> sources (first occurrence of a directive wins, as in browsers). */
export function parseCsp(policy) {
  const out = {};
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const name = tokens[0].toLowerCase();
    if (!(name in out)) out[name] = tokens.slice(1);
  }
  return out;
}

/** Decodes the few character references an HTML serializer writes into an attribute (Vite writes ' as &#39;). */
function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** The content of every <meta http-equiv="Content-Security-Policy"> tag in an HTML text. */
export function findCspMetaPolicies(html) {
  const policies = [];
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/http-equiv\s*=\s*["']?content-security-policy["']?/i.test(tag[0])) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag[0]);
    policies.push(content ? decodeEntities(content[1] ?? content[2] ?? '') : '');
  }
  return policies;
}

/**
 * Checks the CSP of a built index.html. Returns problems as { name, context }; an empty list means the policy
 * satisfies the rules: present, default-src 'self', connect-src exactly the two provider origins, script-src without
 * inline, eval, wildcard or third-party sources, no http: source anywhere, and no inline <script> body or inline
 * event handler in the page (which the policy would block).
 */
export function checkCsp(html, providerOrigins = PROVIDER_ORIGINS) {
  const problems = [];
  const policies = findCspMetaPolicies(html);
  if (policies.length !== 1) {
    return [{ name: 'CSP missing', context: `${policies.length} <meta http-equiv="Content-Security-Policy"> tag(s) in index.html, expected 1` }];
  }
  const csp = parseCsp(policies[0]);
  const add = (name, context) => problems.push({ name, context });
  const sources = (name) => csp[name] ?? csp['default-src'] ?? [];

  if (JSON.stringify(csp['default-src']) !== JSON.stringify(["'self'"])) {
    add('CSP default-src not self', `default-src is "${(csp['default-src'] ?? ['(absent)']).join(' ')}"`);
  }
  const connect = csp['connect-src'];
  if (connect === undefined || JSON.stringify([...connect].sort()) !== JSON.stringify([...providerOrigins].sort())) {
    add('CSP connect-src not the provider origins', `connect-src is "${(connect ?? ['(absent)']).join(' ')}", expected "${providerOrigins.join(' ')}"`);
  }
  for (const directive of ['script-src', 'script-src-elem', 'script-src-attr']) {
    for (const source of csp[directive] ?? []) {
      if (source !== "'self'" && source !== "'none'") add('CSP script source not allowed', `${directive} allows "${source}"`);
    }
  }
  if (csp['script-src'] === undefined && sources('script-src').some((s) => s !== "'self'" && s !== "'none'")) {
    add('CSP script source not allowed', 'script-src absent and default-src allows more than self');
  }
  if (csp['object-src'] === undefined || csp['object-src'].some((s) => s !== "'none'")) {
    add('CSP object-src not none', `object-src is "${(csp['object-src'] ?? ['(absent)']).join(' ')}"`);
  }
  for (const [directive, list] of Object.entries(csp)) {
    for (const source of list) {
      if (/^'unsafe-(?:inline|eval)'$/i.test(source) && directive !== 'style-src-attr') {
        add('CSP unsafe source', `${directive} allows ${source}`);
      }
      if (/^http:/i.test(source) || source === '*' || source === 'http:' || source === 'https:' || source === 'ws:' || source === 'wss:') {
        add('CSP broad or non-HTTPS source', `${directive} allows "${source}"`);
      }
    }
  }
  // The policy blocks inline script, so a page that has one would be broken (and nothing should add one later).
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/i.test(m[1]) || m[2].trim() !== '') add('inline script in index.html', m[0].slice(0, 80));
  }
  const handler = /<[a-z][^>]*\son[a-z]+\s*=/i.exec(html);
  if (handler) add('inline event handler in index.html', handler[0].slice(0, 80));
  return problems;
}
