export const PROVIDER_ORIGINS: string[];
export const CSP_DIRECTIVES: Record<string, string[]>;
export function buildCsp(directives?: Record<string, string[]>): string;
export function cspMetaTag(directives?: Record<string, string[]>): string;
export function parseCsp(policy: string): Record<string, string[]>;
export function findCspMetaPolicies(html: string): string[];
export function checkCsp(html: string, providerOrigins?: string[]): Array<{ name: string; context: string }>;
