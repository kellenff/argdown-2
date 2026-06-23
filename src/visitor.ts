// src/visitor.ts
// Walks the Chevrotain CST and produces the typed AST.

import type {
  Document,
  FactStatement,
  RelationStatement,
  Fact,
  FactRef,
  FactHead,
  IdentifierHead,
  TitleHead,
  Relation,
  Arrow,
  AttributeBlock,
  Value,
  BlockType,
  Element,
  SourceLocation,
  CstNode,
  CstChildren,
} from './ast.js';

import {
  visitArgument,
  visitConclusion,
  visitPremise,
  visitRelationEndpoint,
} from './visitor-arg.js';

import { makeValueNode, visitFrontmatter, visitYamlLine } from './visitor-frontmatter.js';

import { visitBlock, visitComment, visitHeading } from './visitor-block.js';

type TokenLike = {
  image: string;
  startOffset?: number;
  endOffset?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
};

// ----- Helpers (exported so visitor-arg.ts can share them) -----

export function pickFirst<T>(arr: T[] | undefined): T | undefined {
  return arr?.[0];
}

export function locFromTokens(tokens: TokenLike[]): SourceLocation {
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (!first || !last) {
    return { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };
  }
  return {
    start: {
      line: first.startLine ?? 1,
      column: first.startColumn ?? 1,
      offset: first.startOffset ?? 0,
    },
    end: {
      line: last.endLine ?? 1,
      column: (last.endColumn ?? 1) + 1,
      offset: (last.endOffset ?? 0) + 1,
    },
  };
}

export function collectAllTokens(cst: CstChildren): TokenLike[] {
  const out: TokenLike[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    if (typeof obj['image'] === 'string' && obj['tokenType'] !== undefined) {
      out.push(obj as unknown as TokenLike);
      return;
    }
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(cst);
  return out;
}

function arrowName(tokName: string): Arrow {
  switch (tokName) {
    case 'Support':
      return 'support';
    case 'Attack':
      return 'attack';
    case 'Undercut':
      return 'undercut';
    case 'Undermine':
      return 'undermine';
    case 'Concession':
      return 'concession';
    case 'Qualification':
      return 'qualification';
    case 'Equivalence':
      return 'equivalence';
    default:
      throw new Error(`unknown arrow token: ${tokName}`);
  }
}

function blockTypeName(tokName: string): BlockType {
  switch (tokName) {
    case 'Meta':
      return 'meta';
    case 'Evidence':
      return 'evidence';
    case 'Position':
      return 'position';
    case 'Stakeholder':
      return 'stakeholder';
    case 'Domain':
      return 'domain';
    default:
      throw new Error(`unknown block type token: ${tokName}`);
  }
}

// ----- Top-level -----

function visitDocument(cst: CstChildren): Document {
  const frontmatterChild = pickFirst(cst['frontmatter'] as CstNode[]) as CstChildren | undefined;
  const elementChildren = (cst['element'] as CstNode[]) ?? [];
  const elements = elementChildren
    .map((e) => visitElement(e as CstChildren))
    .filter((e): e is Element => e !== undefined);
  return {
    kind: 'Document',
    ...(frontmatterChild ? { frontmatter: visitFrontmatter(frontmatterChild) } : {}),
    elements,
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

export function visitElement(cst: CstChildren): Element | undefined {
  if (pickFirst(cst['blankLine'] as CstNode[])) return undefined; // stripped
  const comment = pickFirst(cst['comment'] as CstNode[]);
  if (comment) return visitComment(comment as CstChildren);
  const heading = pickFirst(cst['heading'] as CstNode[]);
  if (heading) return visitHeading(heading as CstChildren);
  const block = pickFirst(cst['block'] as CstNode[]);
  if (block) return visitBlock(block as CstChildren);
  const statement = pickFirst(cst['statement'] as CstNode[]);
  if (statement) return visitStatement(statement as CstChildren);
  return undefined;
}

function visitStatement(cst: CstChildren): Element {
  const fact = pickFirst(cst['factStatement'] as CstNode[]);
  if (fact) return visitFactStatement(fact as CstChildren);
  const arg = pickFirst(cst['argument'] as CstNode[]);
  if (arg) return visitArgument(arg as CstChildren);
  const rel = pickFirst(cst['relationStatement'] as CstNode[]);
  if (rel) return visitRelationStatement(rel as CstChildren);
  throw new Error('statement rule matched no alternative');
}

function visitFactStatement(cst: CstChildren): FactStatement {
  return {
    kind: 'FactStatement',
    fact: visitFact(pickFirst(cst['fact'] as CstNode[]) as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

export function visitFact(cst: CstChildren): Fact {
  const refSub = pickFirst(cst['factRef'] as CstNode[]);
  const claimSubs = (cst['claimText'] as CstNode[]) ?? [];
  const attrSub = pickFirst(cst['attributeBlock'] as CstNode[]);
  let claimText: string | undefined;
  if (claimSubs.length > 0) {
    // Join consecutive claim-text tokens (the lexer may split a single
    // claim into multiple tokens, e.g. separate identifiers for each word).
    // Insert a space between consecutive tokens unless the previous one
    // ended in whitespace. Trim leading whitespace.
    let buf = '';
    for (const n of claimSubs) {
      const img = n.image ?? '';
      if (buf.length > 0 && !/\s$/.test(buf) && !/^\s/.test(img)) {
        buf += ' ';
      }
      buf += img;
    }
    claimText = buf.trimStart();
  }
  return {
    kind: 'Fact',
    ref: visitFactRef(refSub as CstChildren),
    ...(claimText !== undefined ? { claimText } : {}),
    ...(attrSub ? { attributes: visitAttributeBlock(attrSub as CstChildren) } : {}),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

export function visitFactRef(cst: CstChildren): FactRef {
  return {
    kind: 'FactRef',
    head: visitFactHead(pickFirst(cst['factHead'] as CstNode[]) as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitFactHead(cst: CstChildren): FactHead {
  const idSub = pickFirst(cst['identifierHead'] as CstNode[]);
  if (idSub) {
    const id = pickFirst((idSub as CstChildren)['identifier'] as CstNode[]);
    return {
      kind: 'IdentifierHead',
      identifier: id?.image ?? '',
      loc: locFromTokens(collectAllTokens(idSub as CstChildren)),
    };
  }
  const titleSub = pickFirst(cst['titleHead'] as CstNode[]);
  if (titleSub) {
    // titleText may be an array of tokens (lexer may split a title into
    // separate identifiers/heading-text tokens). Join with spaces.
    const parts = ((titleSub as CstChildren)['titleText'] as CstNode[]) ?? [];
    let title = '';
    for (const n of parts) {
      const img = n.image ?? '';
      if (title.length > 0 && !/\s$/.test(title) && !/^\s/.test(img)) {
        title += ' ';
      }
      title += img;
    }
    return {
      kind: 'TitleHead',
      title: title.trim(),
      loc: locFromTokens(collectAllTokens(titleSub as CstChildren)),
    };
  }
  throw new Error('factHead matched no alternative');
}

function visitRelationStatement(cst: CstChildren): RelationStatement {
  return {
    kind: 'RelationStatement',
    relations: visitRelations(pickFirst(cst['relation'] as CstNode[]) as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitRelations(cst: CstChildren): Relation[] {
  // EndpointList nodes: each contains one or more `relationEndpoint`
  // children (a single endpoint, or a comma-separated list of endpoints).
  const endpointLists = (cst['endpointList'] as CstNode[]) ?? [];
  const arrowNode = pickFirst(cst['arrow'] as CstNode[]);
  const attrSub = pickFirst(cst['attributeBlock'] as CstNode[]);
  const fromList =
    ((endpointLists[0] as CstChildren | undefined)?.['relationEndpoint'] as
      | CstNode[]
      | undefined) ?? [];
  const toList =
    ((endpointLists[1] as CstChildren | undefined)?.['relationEndpoint'] as
      | CstNode[]
      | undefined) ?? [];
  const arrow = arrowName(arrowNode?.tokenType?.name ?? 'Support');
  const attrs = attrSub ? visitAttributeBlock(attrSub as CstChildren) : undefined;
  const loc = locFromTokens(collectAllTokens(cst));
  // Unfold into one binary Relation per from/to pair (cartesian
  // product). For the common single-endpoint case, this yields one
  // Relation. For multi-premise source like `[#A], [#B] --> [#C]`,
  // this yields two Relations. The AST is always binary; the CST
  // preserves the source structure (EndpointList).
  const relations: Relation[] = [];
  for (const fromNode of fromList) {
    for (const toNode of toList) {
      relations.push({
        kind: 'Relation',
        from: visitRelationEndpoint(fromNode as CstChildren),
        arrow,
        to: visitRelationEndpoint(toNode as CstChildren),
        ...(attrs ? { attributes: attrs } : {}),
        loc,
      });
    }
  }
  return relations;
}

function visitRelation(cst: CstChildren): Relation {
  const rels = visitRelations(cst);
  if (rels.length !== 1) {
    throw new Error(
      `visitRelation: expected exactly one Relation, got ${rels.length} (use visitRelations for multi-endpoint relations)`,
    );
  }
  return rels[0] as Relation;
}

export function visitAttributeBlock(cst: CstChildren): AttributeBlock {
  const entries: Record<string, Value> = {};
  for (const entry of (cst['attributeEntry'] as CstNode[]) ?? []) {
    const child = entry as CstChildren;
    const idSub = pickFirst(child['identifier'] as CstNode[]);
    const valSub = pickFirst(child['value'] as CstNode[]);
    if (!idSub || !valSub) continue;
    // Identifier may be a text-run token (when the lexer produced
    // HeadingText/TitleText/etc.); trim whitespace in that case.
    let key = idSub.image ?? '';
    if (!/^[A-Za-z0-9_-]+$/.test(key)) key = key.trim();
    entries[key] = makeValueNode(valSub as CstChildren);
  }
  return { kind: 'AttributeBlock', entries, loc: locFromTokens(collectAllTokens(cst)) };
}

// ----- Public entry -----

export function buildAst(cst: CstChildren): Document {
  return visitDocument(cst);
}

// Re-export sibling visitor modules' surface for consumers that want
// the full CST-to-AST surface from a single import.
export {
  visitFrontmatter,
  visitYamlLine,
  makeValueNode,
  decodeString,
} from './visitor-frontmatter.js';
export { visitBlock, visitListItem, visitHeading, visitComment } from './visitor-block.js';
export {
  visitArgument,
  visitConclusion,
  visitPremise,
  visitRelationEndpoint,
} from './visitor-arg.js';
