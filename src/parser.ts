// src/parser.ts
// ArgdownParser: Chevrotain-based parser for Argdown Extended.

import { CstParser, EOF } from 'chevrotain';
import type { ParserMethod, CstNode } from 'chevrotain';

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
  // Rule field declarations — populated by $.RULE at runtime
  declare document: ParserMethod<[], CstNode>;
  declare element: ParserMethod<[], CstNode>;
  declare statement: ParserMethod<[], CstNode>;
  declare frontmatter: ParserMethod<[], CstNode>;
  declare blankLine: ParserMethod<[], CstNode>;
  declare comment: ParserMethod<[], CstNode>;
  declare heading: ParserMethod<[], CstNode>;
  declare block: ParserMethod<[], CstNode>;
  declare factStatement: ParserMethod<[], CstNode>;
  declare ruleStatement: ParserMethod<[], CstNode>;
  declare relationStatement: ParserMethod<[], CstNode>;

  constructor() {
    super(allTokens, {
      recoveryEnabled: true,
      maxLookahead: 3,
    });

    // Chevrotain convention: alias `this` to `$` so rule DSL reads as `$.RULE(...)` / `$.CONSUME(...)`.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const $ = this;

    // ----- Top-level structure -----

    $.RULE('document', () => {
      $.OPTION(() => $.SUBRULE($.frontmatter));
      $.MANY({
        GATE: () => this.LA(1).tokenType !== EOF,
        DEF: () => $.SUBRULE($.element),
      });
    });

    $.RULE('element', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.blankLine) },
        { ALT: () => $.SUBRULE($.comment) },
        { ALT: () => $.SUBRULE($.heading) },
        { ALT: () => $.SUBRULE($.block) },
        { ALT: () => $.SUBRULE($.statement) },
      ]);
    });

    // The `statement` rule disambiguates fact / rule / relation.
    $.RULE('statement', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.ruleStatement) },
        { ALT: () => $.SUBRULE($.relationStatement) },
        { ALT: () => $.SUBRULE($.factStatement) },
      ]);
    });

    // Placeholder rules — defined in later tasks
    $.RULE('frontmatter', () => {});
    $.RULE('blankLine', () => { $.CONSUME(EOF); });
    $.RULE('comment', () => {});
    $.RULE('heading', () => {});
    $.RULE('block', () => {});
    $.RULE('factStatement', () => {});
    $.RULE('ruleStatement', () => {});
    $.RULE('relationStatement', () => {});
  }
}

export function formatError(err: ParseError, filename = '<anonymous>'): string {
  return `${filename}:${err.loc.line}:${err.loc.column}: ${err.message}`;
}

export function parse(source: string, options: ParseOptions = {}): ParseResult {
  // Implementation in Task 18.
  throw new Error('parse() not yet implemented');
}
