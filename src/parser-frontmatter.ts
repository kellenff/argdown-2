// src/parser-frontmatter.ts
// Frontmatter and YAML parsing rules extracted from parser.ts.
//
// These rules handle the YAML-style frontmatter block at the top of an
// Argdown Extended document, the flow-style value subgrammar used by
// attribute blocks, and the text-run helpers (titles, claims, headings)
// that participate in both contexts. They are isolated here so the main
// parser file stays focused on the top-level grammar (statements,
// relations, blocks) and so the YAML path can evolve independently
// during the rich-arguments cycle.

import type { CstChildren, CstNode } from './ast.js';
import { TokenStream, tokenNode, tokenRule, isNonEmptyImage } from './parser-util.js';
import { parseIdentifier, parseComment } from './parser-fact.js';
import { parseAttributeEntry } from './parser-relation.js';

// =========================================================================
// Scalar token rules (used by values, flow sequences/mappings, and YAML)
// =========================================================================
//
// parseIdentifier and parseComment live in parser-fact.ts — shared with
// the fact/element path (parser.ts). parseAttributeEntry lives in
// parser-relation.ts — shared with parseAttributeBlock and
// parseFlowMapping (here).

function parseString(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'String');
}

function parseNumber(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'Number');
}

// Text-run rules accept any of the text-run token types because Chevrotain's
// disambiguation between them (TitleText vs ClaimText vs HeadingText) is
// unreliable for overlapping patterns — token order is load-bearing and not
// robust to all BNF contexts. The parser disambiguates by context.
function parseTitleText(s: TokenStream): CstNode | undefined {
  // Numbers are accepted so titles like `[Source 1]` tokenize correctly
  // (the lexer emits Number for `1`, which the parser must consume as part
  // of the title rather than bailing on missing RBrack).
  for (const name of ['TitleText', 'ClaimText', 'HeadingText', 'Identifier', 'Number']) {
    const tok = s.peek();
    if (tok.tokenType.name === name && isNonEmptyImage(tok)) {
      s.pos++;
      return tokenNode(tok);
    }
  }
  return undefined;
}

function parseClaimText(s: TokenStream): CstNode | undefined {
  for (const name of ['ClaimText', 'TitleText', 'HeadingText', 'Identifier']) {
    const tok = s.peek();
    if (tok.tokenType.name === name && isNonEmptyImage(tok)) {
      s.pos++;
      return tokenNode(tok);
    }
  }
  return undefined;
}

function parseHeadingText(s: TokenStream): CstNode | undefined {
  for (const name of ['HeadingText', 'TitleText', 'ClaimText']) {
    const tok = s.peek();
    if (tok.tokenType.name === name && isNonEmptyImage(tok)) {
      s.pos++;
      return tokenNode(tok);
    }
  }
  return undefined;
}

function parsePlainScalar(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'PlainScalar');
}

function parseFlowScalar(s: TokenStream): CstNode | undefined {
  return tokenRule(s, 'FlowScalar');
}

// =========================================================================
// Flow values (used by attribute blocks and YAML)
// =========================================================================

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

// parseAttributeEntry lives in parser-relation.ts — used by both
// parseFlowMapping (here) and parseAttributeBlock (parser-relation.ts).

// =========================================================================
// YAML (frontmatter body)
// =========================================================================

function parseYamlLine(s: TokenStream): CstNode | undefined {
  const cst: CstChildren = {};
  const id = parseIdentifier(s);
  if (!id) return undefined;
  cst['identifier'] = [id];
  // Silent colon check: if missing, abort the yaml line without recording
  // an error (the caller decides whether to report).
  if (!s.check('Colon')) return undefined;
  s.pos++;
  cst['Colon'] = [tokenNode(s.peek(-1))];
  // Optional yaml value — accept Identifier or any text-run token (the
  // lexer often produces HeadingText/TitleText/Identifier where PlainScalar
  // was expected).
  if (
    s.check('String') ||
    s.check('LBrack') ||
    s.check('PlainScalar') ||
    s.check('HeadingText') ||
    s.check('TitleText') ||
    s.check('ClaimText') ||
    s.check('Identifier')
  ) {
    const v = parseYamlValue(s);
    if (v) cst['yamlValue'] = [v];
  }
  return cst;
}

// Scalar value tokens that may appear inside a yaml value run. The order
// matches parseTitleText / parseHeadingText — see those for the lexer
// disambiguation rationale.
const YAML_SCALAR_TOKEN_NAMES = [
  'PlainScalar',
  'HeadingText',
  'TitleText',
  'ClaimText',
  'Identifier',
  'Number',
] as const;

function isYamlScalarToken(name: string): boolean {
  return (YAML_SCALAR_TOKEN_NAMES as readonly string[]).includes(name);
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
  // PlainScalar-shaped values: consume a run of consecutive scalar tokens
  // so multi-word values like `Climate Policy Analysis` are captured as
  // a single value (not truncated to the first word). Stop the run when
  // we see a non-scalar token, or an Identifier followed by Colon (the
  // next yaml line's key), or the frontmatter/block close delimiter.
  const parts: string[] = [];
  while (!s.eof()) {
    const tok = s.peek();
    if (!isYamlScalarToken(tok.tokenType.name)) break;
    // Look ahead: `Identifier Colon` is the start of the next yaml line.
    if (tok.tokenType.name === 'Identifier' && s.peek(1).tokenType.name === 'Colon') {
      break;
    }
    const image = tok.image ?? '';
    if (image.trim().length === 0) {
      s.pos++;
      continue;
    }
    parts.push(image);
    s.pos++;
  }
  if (parts.length === 0) return undefined;
  const joined = parts.join(' ').trim();
  cst['plainScalar'] = [
    {
      kind: 'Token',
      image: joined,
      startOffset: 0,
      endOffset: 0,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: joined.length + 1,
    },
  ];
  return cst;
}

// =========================================================================
// Frontmatter
// =========================================================================

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
      // parseYamlLine may consume the identifier before bailing on a
      // missing colon (e.g. a multi-word yaml value whose second word
      // gets re-interpreted as a new yaml line). Save/restore so the
      // recovery `pos++` below skips exactly one token, not two.
      const before = s.save();
      const yl = parseYamlLine(s);
      if (yl) {
        lines.push(yl);
        continue;
      }
      s.restore(before);
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
    (n) =>
      (n as CstChildren)['identifier'] !== undefined && (n as CstChildren)['Colon'] !== undefined,
  );
  return cst;
}

// =========================================================================
// Comments (parseComment / parseLineComment / parseBlockComment)
// =========================================================================
//
// These live in parser-fact.ts — used by both parseFrontmatter (here)
// and parseElement (parser.ts).

// =========================================================================
// Exports
// =========================================================================

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
};
