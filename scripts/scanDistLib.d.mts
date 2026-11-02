export const TEXT_EXTENSIONS: RegExp;
export const BINARY_EXTENSIONS: RegExp;
export const BUNDLE_BUDGET_GZIP_BYTES: number;
export const SERVICE_WORKER_FILE: RegExp;
export const SERVICE_WORKER_REFERENCE: RegExp;
export const NOTICES_FILE: string;
export const REPO_ROOT: string;
export const LUCIDE_ICON_DEFINITION: RegExp;
export const MAX_BUNDLED_ICONS: number;
export const EXPECTED_ICONS: string[];
export const LICENCE_MARKERS: Record<string, string[]>;
export const EXTRA_NOTICE_MARKERS: Record<string, string[]>;
export interface RuntimePackage {
  name: string;
  version: string;
  license: string;
}
export interface DirectoryScan {
  scanned: string[];
  skipped: string[];
  unreadable: Array<{ path: string; reason: string }>;
  findings: Array<{ file: string; name: string; context: string }>;
  /** Names of the Lucide icon definitions found in the bundled JavaScript. */
  icons: string[];
  /** Summed gzip size (level 9) of all JavaScript files. */
  jsGzipBytes: number;
}
export function readRuntimePackages(repoRoot?: string): RuntimePackage[];
export function checkNotices(notice: string, packages: RuntimePackage[]): Array<{ name: string; context: string }>;
export function lucideName(componentName: string): string;
export function scanDirectory(
  root: string,
  options?: {
    readFile?: (path: string) => string;
    runtimePackages?: RuntimePackage[];
    expectedIcons?: string[] | null;
    budgetGzipBytes?: number | null;
    requireCsp?: boolean;
  },
): DirectoryScan;
export function isFailure(result: { scanned: unknown[]; unreadable: unknown[]; findings: unknown[] }): boolean;
