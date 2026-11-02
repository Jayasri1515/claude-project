export interface DemoFinding {
  name: string;
  context: string;
}
export const DEMO_MARKERS: ReadonlyArray<{ name: string; pattern: RegExp }>;
export const DEMO_FILE_NAME_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }>;
export function scanDemoMarkers(text: string): DemoFinding[];
export function scanDemoFileName(path: string): DemoFinding[];
