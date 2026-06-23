// src/parser-fact.ts
// Fact, fact-ref, identifier, and comment parsing productions for
// Argdown Extended.
//
// These productions cover the core "atom" of an Argdown argument: a
// fact reference (`[head]`), the heads it can carry (identifier or
// title), the comma-separated fact-ref list used by rules, and the
// comments that ride alongside any element. Extracted from src/parser.ts
// as part of the rich-arguments cycle 1 refactor to keep that file
// focused on the top-level dispatch.
//
// Forward imports: parseAttributeBlock still lives in parser.ts (it will
// move to parser-relation.ts in Task 6 of the cycle). Importing it here
// resolves naturally once that refactor lands.

import type { CstChildren, CstNode } from './ast.js';

import { TokenStream, tokenNode, tokenRule } from './parser-util.js';
import { parseTitleText, parseClaimText } from './parser-frontmatter.js';
import { parseAttributeBlock } from './parser.js';

// ----- Identifier -----

function parseIdentifier(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'Identifier');
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
  // TitleHead: any text-run token type, or Identifier (lexer ambiguity).
  if (s.check('TitleText', 'ClaimText', 'HeadingText', 'Identifier')) {
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
  // The lexer may produce a sequence of text-run tokens (e.g. Identifier
  // followed by HeadingText) for what is logically one title. Consume all
  // consecutive text-run tokens and concatenate them.
  const parts: CstNode[] = [];
  let tt = parseTitleText(s);
  while (tt) {
    parts.push(tt);
    tt = parseTitleText(s);
  }
  if (parts.length === 0) return undefined;
  cst['titleText'] = parts;
  return cst;
}

// ----- Comments (used by parseElement and parseFrontmatter) -----

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

// ----- Facts -----

function parseFact(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const ref = parseFactRef(s);
  if (!ref) return undefined;
  cst['factRef'] = [ref];

  // Skip whitespace-only text tokens between ref and claim/attribute.
  s.skipEmptyTextTokens();

  // Optional claim text — consume any text-run tokens that follow (the
  // lexer may split a single claim into multiple consecutive tokens).
  const claimParts: CstNode[] = [];
  let claim = parseClaimText(s);
  while (claim) {
    claimParts.push(claim);
    claim = parseClaimText(s);
  }
  if (claimParts.length > 0) cst['claimText'] = claimParts;

  // Skip whitespace-only text tokens between claim and attribute.
  s.skipEmptyTextTokens();

  // Optional attribute block
  if (s.check('LBrace')) {
    const attr = parseAttributeBlock(s);
    if (attr) cst['attributeBlock'] = [attr];
  }

  return cst;
}

// ----- Fact-ref list (used by rule and ruleExpr) -----

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

// ----- Fact statement -----

function parseFactStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const f = parseFact(s);
  if (!f) return undefined;
  cst['fact'] = [f];
  return cst;
}

// =========================================================================
// Exports
// =========================================================================

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
};
