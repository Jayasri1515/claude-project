export const PROJECT_BASE: string;
export function resolveBase(input: { command: string; mode: string; env: Record<string, string | undefined> }): string;
