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

import type { IToken, ILexingResult } from 'chevrotain';

import type { Document } from './ast.js';
import { ArgdownLexer } from './tokens.js';
import { buildAst } from './visitor.js';

// =========================================================================
// Public API
// =========================================================================

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

// =========================================================================
// CST shape
// =========================================================================

export type CstNode = {
  image?: string | undefined;
  tokenType?: { name: string } | undefined;
  startLine?: number | undefined;
  startColumn?: number | undefined;
  startOffset?: number | undefined;
  endLine?: number | undefined;
  endColumn?: number | undefined;
  endOffset?: number | undefined;
} & Record<string, unknown>;

export type CstChildren = Record<string, CstNode[] | unknown[] | undefined>;

// =========================================================================
// EOF constant (tokens.ts doesn't export it directly; we synthesize one)
// =========================================================================

const EOF_TOKEN: IToken = {
  image: '',
  tokenType: { name: 'EOF' } as IToken['tokenType'],
  tokenTypeIdx: -1,
  startOffset: 0,
  endOffset: 0,
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1,
};

// =========================================================================
// TokenStream — wraps the flat token list with lookahead/backtracking/error
// =========================================================================

class TokenStream {
  public tokens: IToken[];
  public pos: number;
  public errors: ParseError[];

  constructor(tokens: IToken[]) {
    this.tokens = tokens;
    this.pos = 0;
    this.errors = [];
  }

  current(): IToken {
    const t = this.tokens[this.pos];
    return t ?? EOF_TOKEN;
  }

  peek(offset = 0): IToken {
    const t = this.tokens[this.pos + offset];
    return t ?? EOF_TOKEN;
  }

  check(...names: string[]): boolean {
    return names.includes(this.current().tokenType.name);
  }

  // Consume the current token if it matches the given name. On mismatch,
  // record an error and return undefined. On success, advance and return.
  consume(name?: string): IToken | undefined {
    const tok = this.current();
    if (tok.tokenType.name === 'EOF') {
      if (name) {
        this.recordError(`expected ${name}`, tok, 'parse.mismatchedToken');
      }
      return undefined;
    }
    if (name && tok.tokenType.name !== name) {
      this.recordError(`expected ${name}`, tok, 'parse.mismatchedToken');
      return undefined;
    }
    this.pos++;
    return tok;
  }

  expect(name: string, hint?: string): IToken | undefined {
    const tok = this.current();
    if (tok.tokenType.name !== name) {
      this.recordError(hint ?? `expected ${name}`, tok, 'parse.mismatchedToken');
      return undefined;
    }
    this.pos++;
    return tok;
  }

  save(): number {
    return this.pos;
  }

  restore(p: number): void {
    this.pos = p;
  }

  eof(): boolean {
    return this.current().tokenType.name === 'EOF';
  }

  hasMore(): boolean {
    return !this.eof();
  }

  skipUntil(...names: string[]): void {
    while (!this.eof() && !names.includes(this.current().tokenType.name)) {
      this.pos++;
    }
  }

  recordError(message: string, tok?: IToken, code: ParseErrorCode = 'parse.mismatchedToken'): void {
    const t = tok ?? this.current();
    this.errors.push({
      code,
      message,
      severity: 'error',
      loc: {
        line: t.startLine ?? 1,
        column: t.startColumn ?? 1,
        offset: t.startOffset ?? 0,
      },
      found: t.tokenType.name,
    });
  }
}

// =========================================================================
// Helpers
// =========================================================================

function tokenNode(tok: IToken): CstNode {
  return {
    image: tok.image,
    tokenType: { name: tok.tokenType.name },
    startLine: tok.startLine,
    startColumn: tok.startColumn,
    startOffset: tok.startOffset,
    endLine: tok.endLine,
    endColumn: tok.endColumn,
    endOffset: tok.endOffset,
  };
}

// Single-token rule: match the named token, wrap it as a CST node.
function tokenRule(s: TokenStream, tokenName: string): CstNode | undefined {
  const tok = s.expect(tokenName);
  if (!tok) return undefined;
  return tokenNode(tok);
}

const ARROW_TOKEN_NAMES: ReadonlySet<string> = new Set([
  'Support',
  'Attack',
  'Undercut',
  'Undermine',
  'Concession',
  'Qualification',
  'Equivalence',
]);

function isArrowToken(name: string): boolean {
  return ARROW_TOKEN_NAMES.has(name);
}

// =========================================================================
// Parsing rules
// =========================================================================

function parseIdentifier(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'Identifier');
}

function parseString(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'String');
}

function parseNumber(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'Number');
}

function parseTitleText(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'TitleText');
}

function parseClaimText(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'ClaimText');
}

function parseHeadingText(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'HeadingText');
}

function parsePlainScalar(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'PlainScalar');
}

function parseFlowScalar(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'FlowScalar');
}

// ----- Fact refs and heads -----

function parseFactRef(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const lb = s.consume('LBrack');
  if (!lb) return undefined;
  cst['LBrack'] = [tokenNode(lb)];
  const head = parseFactHead(s);
  if (!head) return undefined;
  cst['factHead'] = [head];
  const rb = s.consume('RBrack');
  if (!rb) return undefined;
  cst['RBrack'] = [tokenNode(rb)];
  return cst;
}

function parseFactHead(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  // Disambiguate: HeadingMarker → identifierHead, else TitleText → titleHead.
  // TitleText can begin with '#' only if the lexer matched it as TitleText;
  // since HeadingMarker takes precedence in the lexer, an identifier head
  // (the "[#id]" form) always arrives as HeadingMarker+Identifier.
  if (s.check('HeadingMarker')) {
    const idh = parseIdentifierHead(s);
    if (idh) {
      cst['identifierHead'] = [idh];
      return cst;
    }
    return undefined;
  }
  if (s.check('TitleText')) {
    const th = parseTitleHead(s);
    if (th) {
      cst['titleHead'] = [th];
      return cst;
    }
    return undefined;
  }
  return undefined;
}

function parseIdentifierHead(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const hm = s.consume('HeadingMarker');
  if (!hm) return undefined;
  cst['HeadingMarker'] = [tokenNode(hm)];
  const id = parseIdentifier(s);
  if (!id) return undefined;
  cst['identifier'] = [id];
  return cst;
}

function parseTitleHead(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const tt = parseTitleText(s);
  if (!tt) return undefined;
  cst['titleText'] = [tt];
  return cst;
}

// ----- Comments -----

function parseComment(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LineComment')) {
    const lc = parseLineComment(s);
    if (lc) {
      cst['lineComment'] = [lc];
      return cst;
    }
  }
  if (s.check('BlockComment')) {
    const bc = parseBlockComment(s);
    if (bc) {
      cst['blockComment'] = [bc];
      return cst;
    }
  }
  return undefined;
}

function parseLineComment(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'LineComment');
}

function parseBlockComment(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'BlockComment');
}

// ----- Values -----

function parseValue(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('String')) {
    const n = parseString(s);
    if (n) {
      cst['string'] = [n];
      return cst;
    }
  }
  if (s.check('Number')) {
    const n = parseNumber(s);
    if (n) {
      cst['number'] = [n];
      return cst;
    }
  }
  if (s.check('True', 'False')) {
    const b = parseBoolean(s);
    if (b) {
      cst['boolean'] = [b];
      return cst;
    }
  }
  if (s.check('Null')) {
    const n = parseNullValue(s);
    if (n) {
      cst['nullValue'] = [n];
      return cst;
    }
  }
  if (s.check('LBrack')) {
    const fs = parseFlowSequence(s);
    if (fs) {
      cst['flowSequence'] = [fs];
      return cst;
    }
  }
  if (s.check('LBrace')) {
    const fm = parseFlowMapping(s);
    if (fm) {
      cst['flowMapping'] = [fm];
      return cst;
    }
  }
  if (s.check('FlowScalar')) {
    const fs = parseFlowScalar(s);
    if (fs) {
      cst['flowScalar'] = [fs];
      return cst;
    }
  }
  return undefined;
}

function parseBoolean(s: TokenStream): CstNode | undefined {
  return tokenRule(s, s.check('True') ? 'True' : 'False');
}

function parseNullValue(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'Null');
}

function parseFlowSequence(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const lb = s.consume('LBrack');
  if (!lb) return undefined;
  cst['LBrack'] = [tokenNode(lb)];
  const items: CstNode[] = [];
  // First item (optional)
  if (!s.check('RBrack')) {
    const first = parseValue(s);
    if (first) items.push(first);
  }
  while (s.check('Comma')) {
    s.consume('Comma');
    const next = parseValue(s);
    if (next) items.push(next);
    else break;
  }
  cst['value'] = items;
  const rb = s.consume('RBrack');
  if (!rb) return undefined;
  cst['RBrack'] = [tokenNode(rb)];
  return cst;
}

function parseFlowMapping(s: TokenStream): CstNode | undefined {
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

function parseAttributeEntry(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const id = parseIdentifier(s);
  if (!id) return undefined;
  cst['identifier'] = [id];
  if (!s.consume('Colon')) return undefined;
  cst['Colon'] = [tokenNode(s.peek(-1))];
  const v = parseValue(s);
  if (!v) return undefined;
  cst['value'] = [v];
  return cst;
}

// ----- Facts -----

function parseFact(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const ref = parseFactRef(s);
  if (!ref) return undefined;
  cst['factRef'] = [ref];

  // Optional claim text — only if next is ClaimText
  if (s.check('ClaimText')) {
    const claim = parseClaimText(s);
    if (claim) cst['claimText'] = [claim];
  }

  // Optional attribute block
  if (s.check('LBrace')) {
    const attr = parseAttributeBlock(s);
    if (attr) cst['attributeBlock'] = [attr];
  }

  return cst;
}

// ----- Rules -----

// Comma-separated fact-ref list, used both by rule and ruleExpr.
function parseFactRefList(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const refs: CstNode[] = [];
  const first = parseFactRef(s);
  if (!first) return undefined;
  refs.push(first);
  while (s.check('Comma')) {
    s.consume('Comma');
    const next = parseFactRef(s);
    if (!next) break;
    refs.push(next);
  }
  cst['factRef'] = refs;
  return cst;
}

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
  s.consume('Period'); // optional trailing period
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

// ----- Headings -----

function parseHeading(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const hm = s.consume('HeadingMarker');
  if (!hm) return undefined;
  cst['HeadingMarker'] = [tokenNode(hm)];
  if (s.check('HeadingText')) {
    const ht = parseHeadingText(s);
    if (ht) cst['headingText'] = [ht];
  }
  return cst;
}

// ----- List items and YAML -----

function parseListItem(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (!s.consume('Minus')) return undefined;
  cst['Minus'] = [tokenNode(s.peek(-1))];
  const f = parseFact(s);
  if (!f) return undefined;
  cst['fact'] = [f];
  return cst;
}

function parseYamlLine(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const id = parseIdentifier(s);
  if (!id) return undefined;
  cst['identifier'] = [id];
  if (!s.consume('Colon')) return undefined;
  cst['Colon'] = [tokenNode(s.peek(-1))];
  // Optional yaml value
  if (s.check('String') || s.check('LBrack') || s.check('PlainScalar')) {
    const v = parseYamlValue(s);
    if (v) cst['yamlValue'] = [v];
  }
  return cst;
}

function parseYamlValue(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LBrack')) {
    const fs = parseFlowSequence(s);
    if (fs) {
      cst['flowSequence'] = [fs];
      return cst;
    }
  }
  if (s.check('String')) {
    const n = parseString(s);
    if (n) {
      cst['string'] = [n];
      return cst;
    }
  }
  if (s.check('PlainScalar')) {
    const n = parsePlainScalar(s);
    if (n) {
      cst['plainScalar'] = [n];
      return cst;
    }
  }
  return undefined;
}

// ----- Blocks -----

function parseBlock(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const open = parseBlockOpen(s);
  if (!open) return undefined;
  cst['blockOpen'] = [open];
  const body = parseBlockBody(s);
  cst['blockBody'] = [body];
  const close = parseBlockClose(s);
  if (!close) return undefined;
  cst['blockClose'] = [close];
  return cst;
}

function parseBlockOpen(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (!s.consume('BlockMarker')) return undefined;
  cst['BlockMarker'] = [tokenNode(s.peek(-1))];
  const bt = parseBlockType(s);
  if (!bt) return undefined;
  cst['blockType'] = [bt];
  // Optional title — only if next is LBrack
  if (s.check('LBrack')) {
    const title = parseBlockTitle(s);
    if (title) cst['blockTitle'] = [title];
  }
  return cst;
}

function parseBlockClose(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (!s.consume('BlockMarker')) return undefined;
  cst['BlockMarker'] = [tokenNode(s.peek(-1))];
  return cst;
}

function parseBlockType(s: TokenStream): CstNode | undefined {
  if (s.check('Meta')) return tokenRule(s, 'Meta');
  if (s.check('Evidence')) return tokenRule(s, 'Evidence');
  if (s.check('Position')) return tokenRule(s, 'Position');
  if (s.check('Stakeholder')) return tokenRule(s, 'Stakeholder');
  if (s.check('Domain')) return tokenRule(s, 'Domain');
  return undefined;
}

function parseBlockTitle(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (!s.consume('LBrack')) return undefined;
  cst['LBrack'] = [tokenNode(s.peek(-1))];
  const tt = parseTitleText(s);
  if (!tt) return undefined;
  cst['titleText'] = [tt];
  if (!s.consume('RBrack')) return undefined;
  cst['RBrack'] = [tokenNode(s.peek(-1))];
  return cst;
}

// blockBody returns the children directly (not wrapped in a CST node) so
// the visitor can iterate blockLine[] without an extra layer of nesting.
function parseBlockBody(s: TokenStream): CstChildren {
  const cst: CstChildren = {};
  const lines: CstNode[] = [];
  while (!s.eof() && !s.check('BlockMarker')) {
    const line = parseBlockLine(s);
    if (line) {
      lines.push(line);
    } else {
      // Skip an unparseable token to make progress.
      if (!s.eof()) s.pos++;
    }
  }
  cst['blockLine'] = lines;
  return cst;
}

function parseBlockLine(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  // yamlLine: identifier : ...
  if (s.check('Identifier')) {
    const yl = parseYamlLine(s);
    if (yl) {
      cst['yamlLine'] = [yl];
      return cst;
    }
  }
  // listItem: - fact
  if (s.check('Minus')) {
    const li = parseListItem(s);
    if (li) {
      cst['listItem'] = [li];
      return cst;
    }
  }
  // element (heading, comment, nested block, statement)
  const el = parseElement(s);
  if (el) {
    cst['element'] = [el];
    return cst;
  }
  return undefined;
}

// ----- Statements (fact | rule | relation, disambiguated by lookahead) -----

function parseStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LBrack')) {
    // The BNF's note-4 disambiguation: look past [factHead] ] to the next
    // token. - 'RuleOp' → rule - arrow → relation - else → fact
    // factHead is either HeadingMarker+Identifier (2 tokens) or TitleText
    // (1 token). We need to scan ahead to the token AFTER the closing ].
    const la3 = s.peek(3).tokenType.name;
    if (la3 === 'RuleOp') {
      const rs = parseRuleStatement(s);
      if (rs) {
        cst['ruleStatement'] = [rs];
        return cst;
      }
      return undefined;
    }
    if (isArrowToken(la3)) {
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

function parseFactStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const f = parseFact(s);
  if (!f) return undefined;
  cst['fact'] = [f];
  return cst;
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

// ----- Frontmatter -----

function parseFrontmatter(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (!s.check('FrontmatterDelim')) return undefined;
  const open = s.consume('FrontmatterDelim');
  if (!open) return undefined;
  cst['FrontmatterDelim'] = [tokenNode(open)];

  const lines: CstNode[] = [];
  while (!s.eof() && !s.check('FrontmatterDelim')) {
    // Blank lines / comments are tolerated between yaml lines.
    if (s.check('LineComment') || s.check('BlockComment')) {
      const c = parseComment(s);
      if (c) lines.push(c);
      continue;
    }
    if (s.check('Identifier')) {
      const yl = parseYamlLine(s);
      if (yl) {
        lines.push(yl);
        continue;
      }
    }
    // Unknown line — skip one token to make progress.
    if (!s.eof()) s.pos++;
  }

  const close = s.consume('FrontmatterDelim');
  if (!close) {
    s.recordError('unclosed frontmatter', s.current(), 'parse.unclosedFrontmatter');
    return undefined;
  }
  cst['FrontmatterDelim'] = (cst['FrontmatterDelim'] as CstNode[]).concat([tokenNode(close)]);
  cst['yamlLine'] = lines.filter(
    (n) => (n as CstChildren)['identifier'] !== undefined && (n as CstChildren)['Colon'] !== undefined,
  );
  return cst;
}

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
    if (!s.eof()) {
      s.recordError('unexpected token', s.current(), 'parse.unexpectedToken');
      s.pos++;
    }
  }
  cst['element'] = elements;
  return cst;
}

// =========================================================================
// Lex-error normalization
// =========================================================================

function lexErrorToParseError(lexErr: { message?: string | undefined; line?: number | undefined; column?: number | undefined; offset?: number | undefined }): ParseError {
  let code: ParseErrorCode = 'parse.invalidStringEscape';
  if (lexErr.message?.includes('UNTERMINATED')) {
    code = lexErr.message.includes('string') ? 'parse.unterminatedString' : 'parse.unterminatedBlockComment';
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
  if (ast && ast.elements.length > 0) {
    return { ok: true, ast, errors };
  }
  if (stream.errors.length > 0) {
    return ast ? { ok: false, errors, partial: ast } : { ok: false, errors };
  }
  return ast ? { ok: true, ast, errors } : { ok: false, errors };
}
