// src/parser.ts
// ArgdownParser: Chevrotain-based parser for Argdown Extended.

import { CstParser } from 'chevrotain';

import type { Document } from './ast.js';
import { allTokens } from './tokens.js';

// ----- Result types -----

export type ParseErrorCode =
  | 'parse.mismatchedToken'
  | 'parse.noViableAlternative'
  | 'parse.notAllInputParsed'
  | 'parse.earlyExit'
  | 'parse.unexpectedToken'
  | 'parse.invalidStringEscape'
  | 'parse.invalidNumber'
  | 'parse.unterminatedString'
  | 'parse.unterminatedBlockComment'
  | 'parse.unclosedFrontmatter';

export type ParseError = {
  code: ParseErrorCode;
  message: string;
  severity: 'error' | 'warning';
  loc: { line: number; column: number; offset: number };
  expected?: string[];
  found?: string;
};

export type ParseOptions = {
  filename?: string;
  maxErrors?: number;
};

export type ParseResult =
  | { ok: true;  ast: Document;        errors: ParseError[] }
  | { ok: false; errors: ParseError[]; partial?: Document };

// ----- Parser class -----

export class ArgdownParser extends CstParser {
  constructor() {
    super(allTokens, {
      recoveryEnabled: true,
      maxLookahead: 3,
    });

    // Chevrotain convention: alias `this` to `$` so rule DSL reads as `$.RULE(...)` / `$.CONSUME(...)`.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const $ = this;

    // RULES WILL BE ADDED IN SUBSEQUENT TASKS
    $.RULE('document', () => {
      // placeholder
    });
  }
}

export function formatError(err: ParseError, filename = '<anonymous>'): string {
  return `${filename}:${err.loc.line}:${err.loc.column}: ${err.message}`;
}

export function parse(source: string, options: ParseOptions = {}): ParseResult {
  // Implementation in Task 18.
  throw new Error('parse() not yet implemented');
}
