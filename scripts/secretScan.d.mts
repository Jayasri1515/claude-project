export interface Finding {
  name: string;
  context: string;
}
export const SECRET_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }>;
export const ALLOWED_INSECURE_HOSTS: readonly string[];
export function hostOf(afterScheme: string): string;
export function scanText(text: string, options?: { checkInsecureUrls?: boolean }): Finding[];
