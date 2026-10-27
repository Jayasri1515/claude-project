import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

/**
 * UI wording must come from src/core/messages.ts (NFR-008, TASK-009 note). This
 * scans src/ui for text a user could read that is typed into code:
 * - .tsx: JSX text, and string values (also inside ternaries, && / || / ??,
 *   parentheses, concatenation and template literals) in JSX children and in
 *   attributes that assistive technology or the browser shows;
 * - .ts: any string or template literal that reads like a sentence (two words
 *   of letters), except the argument of `new Error(...)` (a developer message).
 */
const TEXT_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'title',
  'placeholder',
  'alt',
]);

/** Literal text pieces that can reach the screen from an expression (not through a call). */
function textPieces(node: ts.Expression): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
  }
  if (ts.isParenthesizedExpression(node)) return textPieces(node.expression);
  if (ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
    return textPieces(node.expression);
  }
  if (ts.isConditionalExpression(node)) return [...textPieces(node.whenTrue), ...textPieces(node.whenFalse)];
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken ||
      op === ts.SyntaxKind.PlusToken
    ) {
      return [...textPieces(node.left), ...textPieces(node.right)];
    }
  }
  return [];
}

const readable = (text: string): boolean => text.trim() !== '';

export function findUiLiterals(fileName: string, source: string): string[] {
  const isTsx = fileName.endsWith('.tsx');
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];

  const visitTsx = (node: ts.Node): void => {
    if (ts.isJsxText(node) && readable(node.text)) found.push(node.text.trim());
    if (ts.isJsxExpression(node) && node.expression !== undefined && !ts.isJsxAttribute(node.parent)) {
      for (const piece of textPieces(node.expression)) if (readable(piece)) found.push(piece.trim());
    }
    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(file))) {
      const init = node.initializer;
      if (init !== undefined && ts.isStringLiteral(init)) found.push(init.text);
      if (init !== undefined && ts.isJsxExpression(init) && init.expression !== undefined) {
        for (const piece of textPieces(init.expression)) if (readable(piece)) found.push(piece);
      }
    }
    ts.forEachChild(node, visitTsx);
  };

  const sentenceLike = (text: string): boolean => /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(text);
  const visitTs = (node: ts.Node): void => {
    const isDevError =
      ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Error';
    if (isDevError) return;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (sentenceLike(node.text)) found.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      // Substitutions are dropped, so "Try ${x} again" reads as the sentence "Try  again".
      const joined = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('');
      if (sentenceLike(joined)) found.push(joined);
    }
    ts.forEachChild(node, visitTs);
  };

  if (isTsx) visitTsx(file);
  else visitTs(file);
  return found;
}

describe('no UI text literals outside the message table', () => {
  it('detects JSX text, text attributes and plain string expressions', () => {
    const bad = `export const X = () => <button aria-label="Close" title={'Tip'}>Click me{'Also'}</button>;`;
    expect(findUiLiterals('x.tsx', bad).sort()).toEqual(['Also', 'Click me', 'Close', 'Tip']);
  });

  it('detects literals inside ternaries, logical operators and concatenation', () => {
    const src = [
      'export const X = ({ a }: { a: boolean }) => (',
      '  <div title={a ? "Yes title" : "No title"}>',
      '    {a ? "Shown" : null}',
      '    {a && "Only when a"}',
      '    {(a ? "Nested" : "Other")}',
      '    {"Left " + "right"}',
      '  </div>',
      ');',
    ].join('\n');
    expect(findUiLiterals('x.tsx', src).sort()).toEqual(
      ['Left', 'Nested', 'No title', 'Only when a', 'Other', 'Shown', 'Yes title', 'right'].sort(),
    );
  });

  it('detects template literals, with or without substitutions', () => {
    const src = 'export const X = ({ n }: { n: number }) => <p aria-label={`Total ${n} items`}>{`Hello ${n}`}</p>;';
    expect(findUiLiterals('x.tsx', src).sort()).toEqual(['Hello', 'Total ', ' items'].sort());
  });

  it('accepts message-table lookups, ids and whitespace', () => {
    const good = `export const X = () => <button aria-label={message('a')} id={cond ? 'x' : 'y'}>{message('b')}{' '}<span> </span></button>;`;
    expect(findUiLiterals('x.tsx', good)).toEqual([]);
  });

  it('flags sentence-like strings in .ts files but allows ids, queries and developer errors', () => {
    const bad = `export function f() { return cond ? 'Something went wrong' : \`Try \${x} again\`; }`;
    expect(findUiLiterals('x.ts', bad).sort()).toEqual(['Something went wrong', 'Try  again'].sort());
    const good = [
      `import { a } from 'some module';`,
      `export const q = (n: number) => \`(min-width: \${n}px)\`;`,
      `export const id = 'ui.current.heading';`,
      `export function g() { throw new Error('Context is missing: render inside the provider.'); }`,
    ].join('\n');
    expect(findUiLiterals('x.ts', good)).toEqual([]);
  });

  it('every .ts and .tsx file under src/ui contains no such literals', () => {
    const dir = join(process.cwd(), 'src', 'ui');
    const files = readdirSync(dir).filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'));
    expect(files.filter((n) => n.endsWith('.tsx')).length).toBeGreaterThan(5);
    expect(files.filter((n) => n.endsWith('.ts')).length).toBeGreaterThan(3);
    const offenders = files.flatMap((name) =>
      findUiLiterals(name, readFileSync(join(dir, name), 'utf8')).map((text) => `${name}: ${text}`),
    );
    expect(offenders).toEqual([]);
  });
});
