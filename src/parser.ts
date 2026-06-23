// src/parser.ts
// Hand-written recursive descent parser for Argdown Extended.
//
// We walk a flat token stream produced by the Chevrotain lexer (src/tokens.ts)
// and build a CST (concrete syntax tree) shaped to match what the visitor
// (src/visitor.ts) consumes. Each BNF production is a standalone function
// `parseX(s: TokenStream): CstNode | undefined` that returns either a CST
// node for the matched production or `undefined` to signal failure.
//
// The CST shape follows the Chevrotain default: token-bearing children live
// under their token-type name (e.g. `cst['LBrack']`); subrules live under
// the rule name (e.g. `cst['factRef']`). The visitor uses `pickFirst` to
// pull the first entry from each child slot.

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

import {
  parseValue,
  parseYamlLine,
  parseFrontmatter,
} from './parser-frontmatter.js';

import { parseBlock, parseHeading } from './parser-block.js';
import {
  parseComment,
  parseFactRef,
  parseFactRefList,
  parseFactStatement,
} from './parser-fact.js';

export { TokenStream, tokenNode, tokenRule, isArrowToken, isNonEmptyImage, peekPastFactRef };
export type { CstChildren, CstNode, ParseError, ParseErrorCode };

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

// Cross-cutting helpers — defined here because they are used by both the
// frontmatter path (parser-frontmatter.ts) and the top-level grammar
// (this file). They will move to parser-relation.ts in Task 6 of the
// rich-arguments cycle.
export {
  parseAttributeEntry,
  parseAttributeBlock,
  parseElement,
};

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

// ----- Attribute blocks -----

function parseAttributeBlock(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const lb = s.consume('LBrace');
  if (!lb) return undefined;
  cst['LBrace'] = [tokenNode(lb)];
  const entries: CstNode[] = [];
  if (!s.check('RBrace')) {
    const first = parseAttributeEntry(s);
    if (first) entries.push(first);
  }
  while (s.check('Comma')) {
    s.consume('Comma');
    const next = parseAttributeEntry(s);
    if (next) entries.push(next);
    else break;
  }
  cst['attributeEntry'] = entries;
  const rb = s.consume('RBrace');
  if (!rb) return undefined;
  cst['RBrace'] = [tokenNode(rb)];
  return cst;
}

// parseAttributeEntry lives here (not parser-frontmatter.ts) because it is
// used by both parseAttributeBlock (above) and parseFlowMapping (in
// parser-frontmatter.ts). It will move to parser-relation.ts in Task 6 of
// the rich-arguments cycle.
function parseAttributeEntry(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  // The lexer often produces HeadingText where Identifier was expected
  // (e.g. ` author` after `{`). Accept either.
  s.skipEmptyTextTokens();
  let id: CstNode | undefined;
  if (s.check('Identifier')) {
    id = tokenRule(s, 'Identifier');
  } else {
    // Accept a text-run token as a surrogate identifier — strip whitespace
    // and surrounding punctuation in the visitor.
    for (const name of ['HeadingText', 'TitleText', 'ClaimText', 'PlainScalar']) {
      const tok = s.peek();
      if (tok.tokenType.name === name && (tok.image ?? '').trim().length > 0) {
        s.pos++;
        id = tokenNode(tok);
        cst['__textIdentifier'] = [id];
        break;
      }
    }
  }
  if (!id) return undefined;
  cst['identifier'] = [id];
  s.skipEmptyTextTokens();
  // Silent colon check (caller handles reporting).
  if (!s.check('Colon')) return undefined;
  s.pos++;
  cst['Colon'] = [tokenNode(s.peek(-1))];
  const v = parseValue(s);
  if (!v) return undefined;
  cst['value'] = [v];
  return cst;
}

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

// ----- Relations -----

function parseRelation(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const from = parseRelationEndpoint(s);
  if (!from) return undefined;
  const arrow = parseArrow(s);
  if (!arrow) return undefined;
  const to = parseRelationEndpoint(s);
  if (!to) return undefined;
  cst['relationEndpoint'] = [from, to];
  cst['arrow'] = [arrow];
  // Optional attribute block
  if (s.check('LBrace')) {
    const attr = parseAttributeBlock(s);
    if (attr) cst['attributeBlock'] = [attr];
  }
  return cst;
}

function parseRelationEndpoint(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LParen')) {
    const re = parseRuleExpr(s);
    if (re) {
      cst['ruleExpr'] = [re];
      return cst;
    }
  }
  if (s.check('LBrack')) {
    const fr = parseFactRef(s);
    if (fr) {
      cst['factRef'] = [fr];
      return cst;
    }
  }
  return undefined;
}

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

function parseArrow(s: TokenStream): CstNode | undefined {
  if (!isArrowToken(s.current().tokenType.name)) return undefined;
  const tok = s.current();
  s.pos++;
  return tokenNode(tok);
}

// ----- Statements (fact | rule | relation, disambiguated by lookahead) -----

function parseStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LBrack')) {
    // The BNF's note-4 disambiguation: look past [factHead] ] to the next
    // token. - 'RuleOp' → rule - arrow → relation - else → fact
    const afterClose = peekPastFactRef(s);
    if (afterClose === 'RuleOp') {
      const rs = parseRuleStatement(s);
      if (rs) {
        cst['ruleStatement'] = [rs];
        return cst;
      }
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

function parseRelationStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const r = parseRelation(s);
  if (!r) return undefined;
  cst['relation'] = [r];
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
