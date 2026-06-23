// Top-level parser dispatch.
//
// This file is a thin facade. The actual parser implementations live in:
//   - parser-util.ts:        shared helpers (TokenStream, tokenNode, etc.)
//   - parser-frontmatter.ts: frontmatter + YAML + value parsers
//   - parser-block.ts:       blocks + headings + list items
//   - parser-fact.ts:        facts + fact-refs + comments
//   - parser-relation.ts:    relations + arrows + attribute blocks
//
// Cycle 2 (separate plan) adds:
//   - parser-arg.ts:         arguments (the -> construct)
//
// We re-export everything from those files so consumers that import
// from 'src/parser.ts' see no change.

import type { ILexingResult } from 'chevrotain';

import type { CstChildren, CstNode, Document, ParseError, ParseErrorCode } from './ast.js';
import { ArgdownLexer } from './tokens.js';
import { buildAst } from './visitor.js';

import {
  TokenStream,
  tokenNode,
  tokenRule,
  isArrowToken,
  isNonEmptyImage,
  peekPastFactRef,
} from './parser-util.js';

import { parseFrontmatter } from './parser-frontmatter.js';

import { parseBlock, parseHeading } from './parser-block.js';
import { parseComment, parseFactRef, parseFactRefList, parseFactStatement } from './parser-fact.js';
import { parseRelationStatement } from './parser-relation.js';

export {
  parseArrow,
  parseRelation,
  parseRelationEndpoint,
  parseRelationStatement,
  parseAttributeBlock,
  parseAttributeEntry,
} from './parser-relation.js';

export { TokenStream, tokenNode, tokenRule, isArrowToken, isNonEmptyImage, peekPastFactRef };
export type { CstChildren, CstNode, ParseError, ParseErrorCode };

// parseElement and parseRuleExpr are still defined here (Cycle 2 / Task 7
// move them out), but their call sites in sibling modules (parser-block.ts,
// parser-relation.ts) need them as named imports. Re-export so the
// forward-reference contract holds.
export { parseElement, parseRuleExpr };

export {
  parseString,
  parseNumber,
  parseTitleText,
  parseClaimText,
  parseHeadingText,
  parsePlainScalar,
  parseFlowScalar,
  parseBoolean,
  parseNullValue,
  parseFlowSequence,
  parseFlowMapping,
  parseValue,
  parseYamlLine,
  parseYamlValue,
  isYamlScalarToken,
  parseFrontmatter,
} from './parser-frontmatter.js';

export {
  parseBlock,
  parseBlockOpen,
  parseBlockClose,
  parseBlockType,
  parseBlockTitle,
  parseBlockBody,
  parseBlockLine,
  parseHeading,
  parseListItem,
} from './parser-block.js';

export {
  parseIdentifier,
  parseIdentifierHead,
  parseTitleHead,
  parseFactRef,
  parseFactHead,
  parseFact,
  parseFactRefList,
  parseFactStatement,
  parseComment,
  parseLineComment,
  parseBlockComment,
} from './parser-fact.js';

// =========================================================================
// Public API
// =========================================================================

export type ParseOptions = {
  filename?: string;
  maxErrors?: number;
};

export type ParseResult =
  | { ok: true; ast: Document; errors: ParseError[] }
  | { ok: false; errors: ParseError[]; partial?: Document };

// =========================================================================
// Parsing rules
// =========================================================================

// ----- Rules -----

function parseRule(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const ref = parseFactRef(s);
  if (!ref) return undefined;
  cst['factRef'] = [ref];
  if (!s.consume('RuleOp')) return undefined;
  cst['RuleOp'] = [tokenNode(s.peek(-1))];
  const list = parseFactRefList(s);
  if (!list) return undefined;
  cst['factRefList'] = [list];
  // Optional trailing period — attach to CST so derived loc includes it.
  if (s.consume('Period')) cst['Period'] = [tokenNode(s.peek(-1))];
  return cst;
}

// parseRuleExpr lives here (not parser-relation.ts) because it is still
// used by the top-level rule/relation dispatch. Cycle 2 will move it
// alongside parseArgExpr once the rule/argument unification lands.
function parseRuleExpr(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const lp = s.consume('LParen');
  if (!lp) return undefined;
  cst['LParen'] = [tokenNode(lp)];
  const ref = parseFactRef(s);
  if (!ref) return undefined;
  cst['factRef'] = [ref];
  if (!s.consume('RuleOp')) return undefined;
  cst['RuleOp'] = [tokenNode(s.peek(-1))];
  const list = parseFactRefList(s);
  if (!list) return undefined;
  cst['factRefList'] = [list];
  const rp = s.consume('RParen');
  if (!rp) return undefined;
  cst['RParen'] = [tokenNode(rp)];
  return cst;
}

// ----- Statements (fact | rule | relation, disambiguated by lookahead) -----

function parseStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LBrack')) {
    // The BNF's note-4 disambiguation: look past [factHead] ] to the next
    // token. - 'RuleOp' (:-) → hard-break error (Cycle 2 removes :-)
    //                      - arrow → relation - else → fact
    const afterClose = peekPastFactRef(s);
    if (afterClose === 'RuleOp') {
      // Hard break: :- is removed. Use -> for inference.
      const tok = s.peek();
      s.errors.push({
        code: 'syntax-removed',
        message: "':-' syntax was removed. Use '->' for inference (e.g., '([#A]) -> [#B].').",
        severity: 'error',
        loc: {
          line: tok?.startLine ?? 1,
          column: tok?.startColumn ?? 1,
          offset: tok?.startOffset ?? 0,
        },
        found: tok?.tokenType.name,
      });
      s.consume('RuleOp'); // consume to make progress
      return undefined;
    }
    if (isArrowToken(afterClose)) {
      const rs = parseRelationStatement(s);
      if (rs) {
        cst['relationStatement'] = [rs];
        return cst;
      }
      return undefined;
    }
    const fs = parseFactStatement(s);
    if (fs) {
      cst['factStatement'] = [fs];
      return cst;
    }
    return undefined;
  }
  if (s.check('LParen')) {
    // Rule used as a relation endpoint (parenthesized rule statement on its own)
    const rs = parseRelationStatement(s);
    if (rs) {
      cst['relationStatement'] = [rs];
      return cst;
    }
    return undefined;
  }
  return undefined;
}

function parseRuleStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const r = parseRule(s);
  if (!r) return undefined;
  cst['rule'] = [r];
  return cst;
}

// ----- Frontmatter (parseFrontmatter lives in parser-frontmatter.ts) -----

// ----- Element (top-level dispatch) -----

function parseElement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LineComment') || s.check('BlockComment')) {
    const c = parseComment(s);
    if (c) {
      cst['comment'] = [c];
      return cst;
    }
  }
  if (s.check('HeadingMarker')) {
    const h = parseHeading(s);
    if (h) {
      cst['heading'] = [h];
      return cst;
    }
  }
  if (s.check('BlockMarker')) {
    const b = parseBlock(s);
    if (b) {
      cst['block'] = [b];
      return cst;
    }
  }
  if (s.check('LBrack', 'LParen')) {
    const st = parseStatement(s);
    if (st) {
      cst['statement'] = [st];
      return cst;
    }
  }
  return undefined;
}

// ----- Document -----

function parseDocument(s: TokenStream): CstNode {
  const cst: CstChildren = {};
  const frontmatter = parseFrontmatter(s);
  if (frontmatter) cst['frontmatter'] = [frontmatter];

  const elements: CstNode[] = [];
  while (!s.eof()) {
    const before = s.save();
    const el = parseElement(s);
    if (el) {
      elements.push(el);
      continue;
    }
    s.restore(before);
    // Skip unrecognized tokens silently. The lexer can emit loose
    // identifier-like text outside the BNF (e.g. leading `abc` before
    // `[#x]`); we drop it without recording an error so ok=true is
    // possible when the rest of the document parses cleanly.
    if (!s.eof()) {
      s.pos++;
    }
  }
  cst['element'] = elements;
  return cst;
}

// =========================================================================
// Lex-error normalization
// =========================================================================

function lexErrorToParseError(lexErr: {
  message?: string | undefined;
  line?: number | undefined;
  column?: number | undefined;
  offset?: number | undefined;
}): ParseError {
  let code: ParseErrorCode = 'parse.invalidStringEscape';
  if (lexErr.message?.includes('UNTERMINATED')) {
    code = lexErr.message.includes('string')
      ? 'parse.unterminatedString'
      : 'parse.unterminatedBlockComment';
  }
  return {
    code,
    message: lexErr.message ?? 'lex error',
    severity: 'error',
    loc: {
      line: lexErr.line ?? 1,
      column: lexErr.column ?? 1,
      offset: lexErr.offset ?? 0,
    },
  };
}

// =========================================================================
// Public API: parse() + formatError()
// =========================================================================

export function formatError(err: ParseError, filename = '<anonymous>'): string {
  return `${filename}:${err.loc.line}:${err.loc.column}: ${err.message}`;
}

export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const maxErrors = options.maxErrors ?? 100;

  // 1. Lex
  const lexResult: ILexingResult = ArgdownLexer.tokenize(source);

  // 2. Normalize lex errors
  const errors: ParseError[] = [];
  for (const lexErr of lexResult.errors) {
    if (errors.length >= maxErrors) break;
    errors.push(lexErrorToParseError(lexErr));
  }

  // 3. Parse (always, even with lex errors, to get partial CST)
  const stream = new TokenStream(lexResult.tokens);
  const cst = parseDocument(stream);

  // 4. Collect parse errors from the stream
  for (const err of stream.errors) {
    if (errors.length >= maxErrors) break;
    errors.push(err);
  }

  // 5. Build AST (best-effort)
  let ast: Document | undefined;
  try {
    ast = buildAst(cst as unknown as Parameters<typeof buildAst>[0]);
  } catch {
    ast = undefined;
  }

  // 6. Decide ok / partial
  const hasLexErrors = lexResult.errors.length > 0;
  if (hasLexErrors) {
    return ast ? { ok: false, errors, partial: ast } : { ok: false, errors };
  }
  if (stream.errors.length > 0) {
    return ast ? { ok: false, errors, partial: ast } : { ok: false, errors };
  }
  if (ast && ast.elements.length > 0) {
    return { ok: true, ast, errors };
  }
  return ast ? { ok: true, ast, errors } : { ok: false, errors };
}
