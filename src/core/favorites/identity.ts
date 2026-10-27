/**
 * Location identity (architecture 3 and 4.7, ODD-7, F-003).
 *
 * The key is the favorites de-duplication identity:
 * - "<providerId>:<placeId>" when the provider supplied a place ID;
 * - otherwise "name:<name>|<admin1>|<country>" where each part is normalized
 *   (Unicode NFC, trimmed, inner whitespace collapsed, case folded). A missing
 *   admin region or country is an empty part.
 *
 * Coordinates are never part of the key and are never compared, so two nearby
 * places with different names stay distinct and no rounding boundary exists.
 *
 * Documented limits (accepted by the architecture): replacing the provider
 * changes the prefix of stored keys; two places with identical name, region and
 * country and no place ID are treated as one. Inside a part, "|" and "\" are
 * escaped with a backslash, so keys of names without them are unchanged and a
 * "|" in a name cannot make two different places collide.
 */

export interface LocationKeyInput {
  /** Stable identifier of the geocoding provider that issued `placeId`. */
  readonly providerId: string;
  readonly placeId?: string;
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
  const placeId = input.placeId?.trim();
  if (placeId !== undefined && placeId !== '') {
    return `${input.providerId}:${placeId}`;
  }
  const parts = [input.name, input.admin1, input.country].map((p) => escapeKeyPart(normalizeNamePart(p)));
  return `name:${parts.join('|')}`;
}

/** Escape the separator and the escape character so a "|" in a name cannot shift parts. */
function escapeKeyPart(part: string): string {
  return part.replace(/[\\|]/g, (c) => `\\${c}`);
}
