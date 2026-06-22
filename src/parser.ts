// src/parser.ts
// ArgdownParser: Chevrotain-based parser for Argdown Extended.

import { CstParser, EOF } from 'chevrotain';
import type { ParserMethod, CstNode } from 'chevrotain';

import type { Document } from './ast.js';
import {
  allTokens,
  Identifier,
  StringTok,
  Number,
  TitleText,
  ClaimText,
  HeadingText,
  PlainScalar,
  FlowScalar,
  LBrack,
  RBrack,
  LBrace,
  RBrace,
  LParen,
  RParen,
  Colon,
  Comma,
  Period,
  Minus,
  Plus,
  RuleOp,
  LineCommentTok,
  BlockCommentTok,
  True,
  False,
  Null,
  HeadingMarker,
  Support,
  Attack,
  Undercut,
  Undermine,
  Concession,
  Qualification,
  Equivalence,
  FrontmatterDelim,
  BlockMarker,
  Meta,
  Evidence,
  PositionKw,
  Stakeholder,
  Domain,
} from './tokens.js';

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
  | { ok: true; ast: Document; errors: ParseError[] }
  | { ok: false; errors: ParseError[]; partial?: Document };

// ----- Parser class -----

export class ArgdownParser extends CstParser {
  // ----- Rule field declarations (populated by $.RULE at runtime) -----
  declare document: ParserMethod<[], CstNode>;
  declare element: ParserMethod<[], CstNode>;
  declare statement: ParserMethod<[], CstNode>;
  declare frontmatter: ParserMethod<[], CstNode>;
  declare blankLine: ParserMethod<[], CstNode>;
  declare comment: ParserMethod<[], CstNode>;
  declare lineComment: ParserMethod<[], CstNode>;
  declare blockComment: ParserMethod<[], CstNode>;
  declare heading: ParserMethod<[], CstNode>;
  declare block: ParserMethod<[], CstNode>;
  declare factStatement: ParserMethod<[], CstNode>;
  declare ruleStatement: ParserMethod<[], CstNode>;
  declare relationStatement: ParserMethod<[], CstNode>;
  // Terminals
  declare identifier: ParserMethod<[], CstNode>;
  declare string: ParserMethod<[], CstNode>;
  declare number: ParserMethod<[], CstNode>;
  declare titleText: ParserMethod<[], CstNode>;
  declare claimText: ParserMethod<[], CstNode>;
  declare headingText: ParserMethod<[], CstNode>;
  declare plainScalar: ParserMethod<[], CstNode>;
  declare flowScalar: ParserMethod<[], CstNode>;
  // Fact refs and heads
  declare factRef: ParserMethod<[], CstNode>;
  declare factHead: ParserMethod<[], CstNode>;
  declare identifierHead: ParserMethod<[], CstNode>;
  declare titleHead: ParserMethod<[], CstNode>;
  // Values and attributes
  declare value: ParserMethod<[], CstNode>;
  declare boolean: ParserMethod<[], CstNode>;
  declare nullValue: ParserMethod<[], CstNode>;
  declare flowSequence: ParserMethod<[], CstNode>;
  declare flowMapping: ParserMethod<[], CstNode>;
  declare attributeBlock: ParserMethod<[], CstNode>;
  declare attributeEntry: ParserMethod<[], CstNode>;
  // Facts and rules
  declare fact: ParserMethod<[], CstNode>;
  declare rule: ParserMethod<[], CstNode>;
  declare factRefList: ParserMethod<[], CstNode>;
  // Relations (Task 12)
  declare relation:              ParserMethod<[], CstNode>;
  declare relationEndpoint:      ParserMethod<[], CstNode>;
  declare ruleExpr:              ParserMethod<[], CstNode>;
  declare arrow:                 ParserMethod<[], CstNode>;
  // Headings (Task 13)
  // (heading already declared in Task 6)
  // List items and YAML (Task 14)
  declare listItem:              ParserMethod<[], CstNode>;
  declare yamlLine:              ParserMethod<[], CstNode>;
  declare yamlValue:             ParserMethod<[], CstNode>;
  // Blocks (Task 15)
  // (block already declared in Task 6)
  declare blockOpen:             ParserMethod<[], CstNode>;
  declare blockClose:            ParserMethod<[], CstNode>;
  declare blockType:             ParserMethod<[], CstNode>;
  declare blockTitle:            ParserMethod<[], CstNode>;
  declare blockBody:             ParserMethod<[], CstNode>;
  declare blockLine:             ParserMethod<[], CstNode>;
  // Frontmatter (Task 16)
  // (frontmatter already declared in Task 6)

  constructor() {
    super(allTokens, {
      recoveryEnabled: true,
      maxLookahead: 3,
    });

    // Chevrotain convention: alias `this` to `$` so rule DSL reads as `$.RULE(...)` / `$.CONSUME(...)`.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const $ = this;

    // ----- Top-level structure (Task 6) -----

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

    $.RULE('statement', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.ruleStatement) },
        { ALT: () => $.SUBRULE($.relationStatement) },
        { ALT: () => $.SUBRULE($.factStatement) },
      ]);
    });

    // Placeholders (filled in by later tasks)
    $.RULE('frontmatter', () => {});
    $.RULE('blankLine', () => {
      $.CONSUME(EOF);
    });
    $.RULE('heading', () => {});
    $.RULE('block', () => {});

    // ----- Terminal rules (Task 7) -----

    $.RULE('identifier', () => {
      $.CONSUME(Identifier);
    });
    $.RULE('string', () => {
      $.CONSUME(StringTok);
    });
    $.RULE('number', () => {
      $.CONSUME(Number);
    });
    $.RULE('titleText', () => {
      $.CONSUME(TitleText);
    });
    $.RULE('claimText', () => {
      $.CONSUME(ClaimText);
    });
    $.RULE('headingText', () => {
      $.CONSUME(HeadingText);
    });
    $.RULE('plainScalar', () => {
      $.CONSUME(PlainScalar);
    });
    $.RULE('flowScalar', () => {
      $.CONSUME(FlowScalar);
    });

    // ----- Fact refs and heads (Task 8, simplified — no Hash token needed) -----

    $.RULE('factRef', () => {
      $.CONSUME(LBrack);
      $.SUBRULE($.factHead);
      $.CONSUME(RBrack);
    });

    $.RULE('factHead', () => {
      $.OR([{ ALT: () => $.SUBRULE($.identifierHead) }, { ALT: () => $.SUBRULE($.titleHead) }]);
    });

    $.RULE('identifierHead', () => {
      $.CONSUME(Identifier); // The "#" is part of the Identifier pattern in the BNF
      // NOTE: This is a simplification — the BNF's Identifier doesn't include "#",
      // but for the parser we accept any identifier (including #-prefixed ones via
      // the HeadingMarker's pattern, since # is in the Identifier start chars).
      // For now, this will be revisited when we add the Hash token.
    });

    $.RULE('titleHead', () => {
      $.SUBRULE($.titleText);
    });

    // ----- Comments (Task 8) -----

    $.RULE('comment', () => {
      $.OR([{ ALT: () => $.SUBRULE($.lineComment) }, { ALT: () => $.SUBRULE($.blockComment) }]);
    });

    $.RULE('lineComment', () => {
      $.CONSUME(LineCommentTok);
    });

    $.RULE('blockComment', () => {
      $.CONSUME(BlockCommentTok);
    });

    // ----- Values (Task 9) -----

    $.RULE('value', () => {
      $.OR1([
        { ALT: () => $.SUBRULE($.string) },
        { ALT: () => $.SUBRULE($.number) },
        { ALT: () => $.SUBRULE($.boolean) },
        { ALT: () => $.SUBRULE($.nullValue) },
        { ALT: () => $.SUBRULE($.flowSequence) },
        { ALT: () => $.SUBRULE($.flowMapping) },
        { ALT: () => $.SUBRULE($.flowScalar) },
      ]);
    });

    $.RULE('boolean', () => {
      $.OR2([{ ALT: () => $.CONSUME(True) }, { ALT: () => $.CONSUME(False) }]);
    });

    $.RULE('nullValue', () => {
      $.CONSUME(Null);
    });

    $.RULE('flowSequence', () => {
      $.CONSUME(LBrack);
      $.MANY_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.value),
      });
      $.CONSUME(RBrack);
    });

    $.RULE('flowMapping', () => {
      $.CONSUME(LBrace);
      $.MANY_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.attributeEntry),
      });
      $.CONSUME(RBrace);
    });

    // ----- Attribute blocks (Task 9) -----

    $.RULE('attributeBlock', () => {
      $.CONSUME(LBrace);
      $.MANY_SEP({
        SEP: Comma,
        DEF: () => $.SUBRULE($.attributeEntry),
      });
      $.CONSUME(RBrace);
    });

    $.RULE('attributeEntry', () => {
      $.SUBRULE($.identifier);
      $.CONSUME(Colon);
      $.SUBRULE($.value);
    });

    // ----- Facts (Task 10) -----

    $.RULE('fact', () => {
      $.SUBRULE($.factRef);
      $.OPTION1(() => $.SUBRULE($.claimText));
      $.OPTION2(() => $.SUBRULE($.attributeBlock));
    });

    $.RULE('factStatement', () => {
      $.SUBRULE($.fact);
    });

    // ----- Rules (Task 11) -----

    $.RULE('rule', () => {
      $.SUBRULE($.factRef);
      $.CONSUME(RuleOp);
      $.SUBRULE($.factRefList);
      $.CONSUME(Period);
    });

    $.RULE('factRefList', () => {
      $.SUBRULE($.factRef);
      $.MANY({
        DEF: () => {
          $.CONSUME(Comma);
          $.SUBRULE($.factRef);
        },
      });
    });

    $.RULE('ruleStatement', () => {
      $.SUBRULE($.rule);
    });

    // ----- Relations (Task 12) -----

    $.RULE('relation', () => {
      $.SUBRULE($.relationEndpoint);
      $.SUBRULE($.arrow);
      $.SUBRULE($.relationEndpoint);
      $.OPTION3(() => $.SUBRULE($.attributeBlock));
    });

    $.RULE('relationEndpoint', () => {
      $.OR3([
        { ALT: () => $.SUBRULE($.factRef) },
        { ALT: () => $.SUBRULE($.ruleExpr) },
      ]);
    });

    $.RULE('ruleExpr', () => {
      $.CONSUME(LParen);
      $.SUBRULE($.factRef);
      $.CONSUME(RuleOp);
      $.SUBRULE($.factRefList);
      $.CONSUME(RParen);
    });

    $.RULE('arrow', () => {
      $.OR4([
        { ALT: () => $.CONSUME(Support,         { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Attack,          { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Undercut,        { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Undermine,       { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Concession,      { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Qualification,   { LABEL: 'arrow' }) },
        { ALT: () => $.CONSUME(Equivalence,     { LABEL: 'arrow' }) },
      ]);
    });

    $.RULE('relationStatement', () => {
      $.SUBRULE($.relation);
    });

    // ----- Heading (Task 13) -----

    $.RULE('heading', () => {
      $.CONSUME(HeadingMarker);
      $.OPTION5(() => $.SUBRULE($.headingText));
    });

    // ----- List items and YAML (Task 14) -----

    $.RULE('listItem', () => {
      $.CONSUME(Minus);
      $.SUBRULE($.fact);
    });

    $.RULE('yamlLine', () => {
      $.SUBRULE($.identifier);
      $.CONSUME(Colon);
      $.OPTION6(() => $.SUBRULE($.yamlValue));
    });

    $.RULE('yamlValue', () => {
      $.OR5([
        { ALT: () => $.SUBRULE($.flowSequence) },
        { ALT: () => $.SUBRULE($.string) },
        { ALT: () => $.SUBRULE($.plainScalar) },
      ]);
    });

    // ----- Blocks (Task 15) -----

    $.RULE('block', () => {
      $.SUBRULE($.blockOpen);
      $.SUBRULE($.blockBody);
      $.SUBRULE($.blockClose);
    });

    $.RULE('blockOpen', () => {
      $.CONSUME(BlockMarker);
      $.SUBRULE($.blockType);
      $.OPTION7(() => $.SUBRULE($.blockTitle));
    });

    $.RULE('blockClose', () => {
      $.CONSUME(BlockMarker);
    });

    $.RULE('blockType', () => {
      $.OR6([
        { ALT: () => $.CONSUME(Meta) },
        { ALT: () => $.CONSUME(Evidence) },
        { ALT: () => $.CONSUME(PositionKw) },
        { ALT: () => $.CONSUME(Stakeholder) },
        { ALT: () => $.CONSUME(Domain) },
      ]);
    });

    $.RULE('blockTitle', () => {
      $.CONSUME(LBrack);
      $.SUBRULE($.titleText);
      $.CONSUME(RBrack);
    });

    $.RULE('blockBody', () => {
      $.MANY({
        GATE: () => this.LA(1).tokenType !== BlockMarker && this.LA(1).tokenType !== EOF,
        DEF: () => $.SUBRULE($.blockLine),
      });
    });

    $.RULE('blockLine', () => {
      $.OR7([
        { ALT: () => $.SUBRULE($.yamlLine) },
        { ALT: () => $.SUBRULE($.listItem) },
        { ALT: () => $.SUBRULE($.element) },
      ]);
    });

    // ----- Frontmatter (Task 16) -----

    $.RULE('frontmatter', () => {
      $.CONSUME(FrontmatterDelim);
      $.MANY({
        GATE: () => this.LA(1).tokenType !== FrontmatterDelim && this.LA(1).tokenType !== EOF,
        DEF: () => $.SUBRULE($.yamlLine),
      });
      $.CONSUME(FrontmatterDelim);
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
