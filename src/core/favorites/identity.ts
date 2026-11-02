/**
 * Location identity (architecture 3.4, DR-15; impl-plan T-22).
 *
 * One deterministic, provider-independent rule: the key is the lower-cased, trimmed, whitespace-collapsed
 * "name|admin1|country" (Unicode NFC; a missing part is an empty string). The provider's place ID is NOT part of the
 * key (the provider does not guarantee a stable ID, provider-verification item 6); it is stored for information only.
 *
 * Coordinates are never part of the key and are never compared, so two nearby places with different names stay
 * distinct and no rounding boundary exists.
 *
 * Known limit (architecture 3.4): two distinct places with the same name, region and country are duplicates. Inside a
 * part, "|" and "\" are escaped with a backslash, so keys of names without them are unchanged and a "|" in a name
 * cannot make two different places collide.
 */

export interface LocationKeyInput {
  readonly name: string;
  readonly admin1?: string;
  readonly country?: string;
}

/** NFC, trim, collapse whitespace runs, lower-case. Total: undefined becomes "". */
export function normalizeNamePart(value: string | undefined): string {
  if (value === undefined) return '';
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase().normalize('NFC');
}

export function makeLocationKey(input: LocationKeyInput): string {
  return [input.name, input.admin1, input.country].map((p) => escapeKeyPart(normalizeNamePart(p))).join('|');
}

/** Escape the separator and the escape character so a "|" in a name cannot shift parts. */
function escapeKeyPart(part: string): string {
  return part.replace(/[\\|]/g, (c) => `\\${c}`);
}
