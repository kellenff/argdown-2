// src/parser-relation.ts
// Relation and attribute-block parsing productions for Argdown Extended.
//
// These productions cover the grammar pieces that wire facts together:
//   - parseRelation           (from --arrow--> to, with optional attrs)
//   - parseRelationEndpoint   (either a fact ref or a parenthesized rule)
//   - parseArrow              (the directed-edge token)
//   - parseRelationStatement  (relation wrapped as a top-level statement)
//   - parseAttributeBlock     (`{ key: value, ... }` after a fact/relation)
//   - parseAttributeEntry     (one `key: value` pair inside an attr block)
//
// Extracted from src/parser.ts as part of the rich-arguments cycle 1
// refactor so that file stays focused on top-level dispatch.
//
// Dependencies:
//   - parseRelationEndpoint calls parseArgExpr from ./parser-arg.js.
//   - parseAttributeEntry calls parseValue from ./parser-frontmatter.js.
//   - parseRelationEndpoint calls parseFactRef from ./parser-fact.js.

import type { CstChildren, CstNode } from './ast.js';

import { TokenStream, tokenNode, tokenRule, isArrowToken } from './parser-util.js';
import { parseValue } from './parser-frontmatter.js';
import { parseFactRef } from './parser-fact.js';
import { parseArgExpr } from './parser-arg.js';

// ----- Arrows -----

function parseArrow(s: TokenStream): CstNode | undefined {
  if (!isArrowToken(s.current().tokenType.name)) return undefined;
  const tok = s.current();
  s.pos++;
  return tokenNode(tok);
}

// ----- Relation endpoints -----

function parseRelationEndpoint(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (s.check('LParen')) {
    const ae = parseArgExpr(s);
    if (ae) {
      cst['argExpr'] = [ae];
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

function parseRelationStatement(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const r = parseRelation(s);
  if (!r) return undefined;
  cst['relation'] = [r];
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

// =========================================================================
// Exports
// =========================================================================

export {
  parseArrow,
  parseRelation,
  parseRelationEndpoint,
  parseRelationStatement,
  parseAttributeBlock,
  parseAttributeEntry,
};
