import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export const REPO_ROOT = process.cwd();

export interface SourceFile {
  /** Path relative to the repository root, with forward slashes. */
  readonly path: string;
  readonly text: string;
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

/** All files under `dir` (relative to the repo root) whose name matches `pattern`. */
export function sourceFiles(dir: string, pattern = /\.(ts|tsx|css|html)$/): SourceFile[] {
  const out: string[] = [];
  walk(resolve(REPO_ROOT, dir), out);
  return out
    .filter((file) => pattern.test(file))
    .map((file) => ({ path: relative(REPO_ROOT, file).split(sep).join('/'), text: readFileSync(file, 'utf8') }));
}

/** Source text with // and block comments removed, so a comment cannot trigger or hide a finding. */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
}
