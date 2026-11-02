// Pattern scan for credentials and insecure URLs in text (TASK-041, TASK-043).
// Used by scripts/scanDist.mjs (built bundle) and by test/security (source tree and self-tests).
// It looks for secret-shaped text only; it knows nothing about any weather provider.
// It is a heuristic text scan, NOT proof that no secret exists (see docs/deployment.md for what it cannot catch).

/** Opening quote of a string literal: ' " ` , optionally escaped with backslashes (as inside JSON or source maps). */
const OPEN = '\\\\*["\'`]';
/** Names that suggest a credential when followed by `=` or `:` and a quoted value. */
const CREDENTIAL_NAME =
  '(?:api[_-]?key|apikey|access[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|secret|token|passwd|password|private[_-]?key)';
/** Names for the generic long-value rules (also plain `key`, `auth`, `credential`). */
const KEYLIKE_NAME = `(?:${CREDENTIAL_NAME.slice(3, -1)}|key|auth|credentials?|signature)`;
/** Query-string parameter names that carry a credential. */
const QUERY_NAME =
  '(?:api[_-]?key|apikey|key|token|access[_-]?token|auth|auth[_-]?token|appid|app[_-]?id|secret|client[_-]?secret|password|sig|signature)';
/** URL schemes that are not encrypted. */
const INSECURE_SCHEME = '(?:http|ws|ftp)';

/** @type {ReadonlyArray<{ name: string, pattern: RegExp }>} */
export const SECRET_PATTERNS = [
  { name: 'private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'AWS access key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}/ },
  { name: 'Slack token', pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  // OpenAI-style keys, including sk-proj-..., sk-svcacct-... and sk-admin-... (the dashes are part of the key).
  { name: 'secret-style key (sk-)', pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/ },
  { name: 'JSON Web Token', pattern: /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]+)?/ },
  {
    // Name = quoted value, in single, double or backtick quotes (a backtick value may hold a ${...} expression).
    name: 'credential assignment',
    pattern: new RegExp(`${CREDENTIAL_NAME}\\\\*["'\`]?\\s*[:=]\\s*${OPEN}[^"'\`\\s]{8,}`, 'i'),
  },
  {
    name: 'long hex value assigned to a key-like name',
    pattern: new RegExp(`${KEYLIKE_NAME}\\\\*["'\`]?\\s*[:=]\\s*${OPEN}[A-Fa-f0-9]{32,}(?![A-Za-z0-9])`, 'i'),
  },
  {
    // Needs a letter and a digit, so plain words and identifiers do not match.
    name: 'long base64-style value assigned to a key-like name',
    pattern: new RegExp(
      `${KEYLIKE_NAME}\\\\*["'\`]?\\s*[:=]\\s*${OPEN}(?=[A-Za-z0-9+/_=-]*[A-Za-z])(?=[A-Za-z0-9+/_=-]*\\d)[A-Za-z0-9+/_=-]{32,}(?![A-Za-z0-9+/_=-])`,
      'i',
    ),
  },
  {
    name: 'credentials inside a URL',
    pattern: /(?<![A-Za-z0-9+.-])(?:https?|wss?|ftp):\/\/[^/\s:@"'`]+:[^/\s@"'`]+@/i,
  },
  {
    // Any non-empty value (any length), a ${...} expression, or a string that ends right before a `+` concatenation.
    name: 'key in a URL query',
    pattern: new RegExp(`(?:[?&#]|&amp;)${QUERY_NAME}=(?:[^\\s&"'\`#<>]|["'\`]\\s*\\+)`, 'i'),
  },
  { name: 'bearer token', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/ },
];

/**
 * Hosts for which an unencrypted http://, ws:// or ftp:// URL is accepted: the XML namespace host (identifiers,
 * not requests) and the local machine. Matched against the exact host only: "localhost.example" or
 * "localhost@other.example" do not match.
 */
export const ALLOWED_INSECURE_HOSTS = ['www.w3.org', 'localhost', '127.0.0.1', '[::1]'];

/** The host of a URL's text after the scheme (userinfo, port, path, query and a trailing dot removed, lower case). */
export function hostOf(afterScheme) {
  const authority = afterScheme.split(/[/?#\s"'`)<>]/, 1)[0] ?? '';
  const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1);
  const host = hostAndPort.startsWith('[') ? hostAndPort.slice(0, hostAndPort.indexOf(']') + 1) : (hostAndPort.split(':', 1)[0] ?? '');
  return host.replace(/\.$/, '').toLowerCase();
}

/**
 * Returns findings as { name, context }. The context is a short redacted
 * excerpt so a real secret is never echoed in full into logs.
 * @param {string} text
 * @param {{ checkInsecureUrls?: boolean }} [options]
 * @returns {Array<{ name: string, context: string }>}
 */
export function scanText(text, options = {}) {
  const findings = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    const match = pattern.exec(text);
    if (match) findings.push({ name, context: redact(text, match.index, match[0].length) });
  }
  if (options.checkInsecureUrls !== false) {
    const insecure = new RegExp(`(?<![A-Za-z0-9+.-])${INSECURE_SCHEME}://([^\\s"'\`)<>]+)`, 'gi');
    for (const match of text.matchAll(insecure)) {
      if (!ALLOWED_INSECURE_HOSTS.includes(hostOf(match[1] ?? ''))) {
        findings.push({ name: 'non-HTTPS URL', context: redact(text, match.index ?? 0, match[0].length) });
      }
    }
  }
  return findings;
}

function redact(text, index, length) {
  const start = Math.max(0, index - 20);
  const before = text.slice(start, index).replace(/\s+/g, ' ');
  return `${before}[${length} chars redacted]`;
}
