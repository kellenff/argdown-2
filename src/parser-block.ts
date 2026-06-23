// src/parser-block.ts
// Block, heading, and list-item parsing productions for Argdown Extended.
//
// These productions handle the "container" grammar: section headings,
// list items, and bracketed metadata blocks (e.g. `==== Meta [...]`).
// Extracted from src/parser.ts as part of the rich-arguments cycle 1
// refactor to keep that file focused on the top-level dispatch.
//
// Forward imports: parseFact and parseElement still live in parser.ts
// (they will move to parser-fact.ts and parser-relation.ts in later
// cycle tasks). Importing them here resolves naturally once those
// refactors land.

import type { CstChildren, CstNode } from './ast.js';

import { TokenStream, tokenNode, tokenRule } from './parser-util.js';
import { parseTitleText, parseYamlLine } from './parser-frontmatter.js';
import { parseFact, parseElement } from './parser.js';

// ----- Headings -----

function parseHeading(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const hm = s.consume('HeadingMarker');
  if (!hm) return undefined;
  cst['HeadingMarker'] = [tokenNode(hm)];
  // Consume all consecutive text-run tokens (the lexer often splits heading
  // text into multiple Identifiers). Optionally skip `:` between segments.
  const parts: CstNode[] = [];
  while (true) {
    const tok = s.peek();
    if (
      (tok.tokenType.name === 'HeadingText' ||
        tok.tokenType.name === 'TitleText' ||
        tok.tokenType.name === 'ClaimText' ||
        tok.tokenType.name === 'Identifier') &&
      (tok.image ?? '').trim().length > 0
    ) {
      s.pos++;
      parts.push(tokenNode(tok));
      // Allow `:` between tokens (e.g. `# Position: Aggressive Mitigation`).
      if (s.check('Colon')) {
        s.pos++;
        parts.push(tokenNode(s.peek(-1)));
      }
    } else {
      break;
    }
  }
  if (parts.length > 0) cst['headingText'] = parts;
  return cst;
}

// ----- List items -----

function parseListItem(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  if (!s.consume('Minus')) return undefined;
  cst['Minus'] = [tokenNode(s.peek(-1))];
  const f = parseFact(s);
  if (!f) return undefined;
  cst['fact'] = [f];
  return cst;
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
  // Collect all consecutive text-run/identifier tokens.
  const parts: CstNode[] = [];
  let tt = parseTitleText(s);
  while (tt) {
    parts.push(tt);
    tt = parseTitleText(s);
  }
  if (parts.length === 0) return undefined;
  cst['titleText'] = parts;
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
    // parseBlockLine / parseYamlLine may consume tokens before bailing on
    // a multi-word value mismatch. Save/restore so the recovery `pos++`
    // below skips exactly one token, not two.
    const before = s.save();
    const line = parseBlockLine(s);
    if (line) {
      lines.push(line);
    } else {
      s.restore(before);
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
};
