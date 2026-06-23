// src/visitor.ts
// Walks the Chevrotain CST and produces the typed AST.

import type {
  Document,
  Frontmatter,
  Heading,
  Block,
  BlockTitle,
  ListItem,
  FactStatement,
  RuleStatement,
  RelationStatement,
  Fact,
  FactRef,
  FactHead,
  IdentifierHead,
  TitleHead,
  Rule,
  Relation,
  RelationEndpoint,
  RuleExpr,
  Arrow,
  AttributeBlock,
  Value,
  StringValue,
  NumberValue,
  BooleanValue,
  NullValue,
  FlowSequence,
  FlowMapping,
  FlowScalar,
  YamlLine,
  YamlValue,
  PlainScalar,
  LineComment,
  BlockComment,
  BlockType,
  Element,
  SourceLocation,
  CstNode,
  CstChildren,
} from './ast.js';

type TokenLike = {
  image: string;
  startOffset?: number;
  endOffset?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
};

// ----- Helpers -----

function pickFirst<T>(arr: T[] | undefined): T | undefined {
  return arr?.[0];
}

function locFromTokens(tokens: TokenLike[]): SourceLocation {
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

function collectAllTokens(cst: CstChildren): TokenLike[] {
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

function decodeString(s: string): string {
  const inner = s.slice(1, -1);
  return inner
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\\//g, '/')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeNumber(s: string): number {
  return Number(s);
}

// ----- Value visitor -----

function makeValueNode(cst: CstChildren): Value {
  const stringChild = pickFirst(cst['string'] as CstNode[]);
  if (stringChild) {
    const tok = stringChild.image ?? '';
    return {
      kind: 'StringValue',
      value: decodeString(tok),
      loc: locFromTokens([stringChild as TokenLike]),
    };
  }
  const numberChild = pickFirst(cst['number'] as CstNode[]);
  if (numberChild) {
    const tok = numberChild.image ?? '';
    return {
      kind: 'NumberValue',
      value: decodeNumber(tok),
      loc: locFromTokens([numberChild as TokenLike]),
    };
  }
  const boolChild = pickFirst(cst['boolean'] as CstNode[]);
  if (boolChild) {
    const tok = boolChild.image ?? '';
    return {
      kind: 'BooleanValue',
      value: tok === 'true',
      loc: locFromTokens([boolChild as TokenLike]),
    };
  }
  const nullChild = pickFirst(cst['nullValue'] as CstNode[]);
  if (nullChild) {
    return { kind: 'NullValue', loc: locFromTokens([nullChild as TokenLike]) };
  }
  const seqChild = pickFirst(cst['flowSequence'] as CstNode[]);
  if (seqChild) return visitFlowSequence(seqChild as CstChildren);
  const mapChild = pickFirst(cst['flowMapping'] as CstNode[]);
  if (mapChild) return visitFlowMapping(mapChild as CstChildren);
  const scalarChild = pickFirst(cst['flowScalar'] as CstNode[]);
  if (scalarChild) {
    const tok = scalarChild.image ?? '';
    return { kind: 'FlowScalar', text: tok, loc: locFromTokens([scalarChild as TokenLike]) };
  }
  throw new Error('value rule matched no alternative');
}

function visitFlowSequence(cst: CstChildren): FlowSequence {
  const items = ((cst['value'] as CstNode[]) ?? []).map((v) => makeValueNode(v as CstChildren));
  return { kind: 'FlowSequence', items, loc: locFromTokens(collectAllTokens(cst)) };
}

function visitFlowMapping(cst: CstChildren): FlowMapping {
  const entries: Record<string, Value> = {};
  for (const entry of (cst['attributeEntry'] as CstNode[]) ?? []) {
    const child = entry as CstChildren;
    const idSub = pickFirst(child['identifier'] as CstNode[]);
    const valSub = pickFirst(child['value'] as CstNode[]);
    if (!idSub || !valSub) continue;
    const key = idSub.image ?? '';
    entries[key] = makeValueNode(valSub as CstChildren);
  }
  return { kind: 'FlowMapping', entries, loc: locFromTokens(collectAllTokens(cst)) };
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

function visitFrontmatter(cst: CstChildren): Frontmatter {
  const entries: Record<string, Value | PlainScalar> = {};
  for (const yl of (cst['yamlLine'] as CstNode[]) ?? []) {
    const child = yl as CstChildren;
    const idSub = pickFirst(child['identifier'] as CstNode[]);
    const valSub = pickFirst(child['yamlValue'] as CstNode[]);
    if (!idSub) continue;
    const key = idSub.image ?? '';
    if (!valSub) continue; // empty yaml value: skip the entry
    const yv = valSub as CstChildren;
    const stringChild = pickFirst(yv['string'] as CstNode[]);
    const seqChild = pickFirst(yv['flowSequence'] as CstNode[]);
    const scalarChild = pickFirst(yv['plainScalar'] as CstNode[]);
    if (stringChild) {
      const tok = stringChild.image ?? '';
      entries[key] = {
        kind: 'StringValue',
        value: decodeString(tok),
        loc: locFromTokens([stringChild as TokenLike]),
      };
    } else if (seqChild) {
      entries[key] = visitFlowSequence(seqChild as CstChildren);
    } else if (scalarChild) {
      const tok = scalarChild.image ?? '';
      entries[key] = {
        kind: 'PlainScalar',
        text: tok.trim(),
        loc: locFromTokens([scalarChild as TokenLike]),
      };
    }
  }
  return { kind: 'Frontmatter', entries, loc: locFromTokens(collectAllTokens(cst)) };
}

function visitElement(cst: CstChildren): Element | undefined {
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
  const rule = pickFirst(cst['ruleStatement'] as CstNode[]);
  if (rule) return visitRuleStatement(rule as CstChildren);
  const rel = pickFirst(cst['relationStatement'] as CstNode[]);
  if (rel) return visitRelationStatement(rel as CstChildren);
  throw new Error('statement rule matched no alternative');
}

function visitComment(cst: CstChildren): LineComment | BlockComment {
  const line = pickFirst(cst['lineComment'] as CstNode[]);
  if (line) {
    const tokens = collectAllTokens(cst);
    const text = tokens
      .map((t) => t.image)
      .join('')
      .replace(/^\/\//, '');
    return { kind: 'LineComment', text, loc: locFromTokens(tokens) };
  }
  const block = pickFirst(cst['blockComment'] as CstNode[]);
  if (block) {
    const tokens = collectAllTokens(cst);
    const text = tokens
      .map((t) => t.image)
      .join('')
      .replace(/^\/\*|\*\/$/g, '');
    return { kind: 'BlockComment', text, loc: locFromTokens(tokens) };
  }
  throw new Error('comment rule matched no alternative');
}

function visitHeading(cst: CstChildren): Heading {
  const marker = pickFirst(cst['HeadingMarker'] as CstNode[]);
  const textNodes = (cst['headingText'] as CstNode[]) ?? [];
  // Join multiple tokens with single spaces (skip Colon — it visually
  // belongs in the heading text like `# Position: ...`).
  let text = '';
  for (const n of textNodes) {
    if (n.tokenType?.name === 'Colon') {
      text += ':';
      continue;
    }
    const img = n.image ?? '';
    if (text.length > 0 && !/\s$/.test(text) && !/^\s/.test(img) && !text.endsWith(':')) {
      text += ' ';
    }
    text += img;
  }
  return {
    kind: 'Heading',
    level: (marker?.image?.length ?? 1) as 1 | 2 | 3 | 4 | 5 | 6,
    text: text.trim(),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitBlock(cst: CstChildren): Block {
  const tokens = collectAllTokens(cst);
  const open = pickFirst(cst['blockOpen'] as CstNode[]) as CstChildren;
  const body = pickFirst(cst['blockBody'] as CstNode[]) as CstChildren | undefined;

  const typeTok = pickFirst(open['blockType'] as CstNode[]);
  const typeName = typeTok?.tokenType?.name ?? 'Meta';

  const titleChild = pickFirst(open['blockTitle'] as CstNode[]);
  let title: BlockTitle | undefined;
  if (titleChild) {
    const parts = ((titleChild as CstChildren)['titleText'] as CstNode[]) ?? [];
    let text = '';
    for (const n of parts) {
      const img = n.image ?? '';
      if (text.length > 0 && !/\s$/.test(text) && !/^\s/.test(img)) {
        text += ' ';
      }
      text += img;
    }
    text = text.trim();
    if (text.length > 0) {
      title = {
        kind: 'BlockTitle',
        text,
        loc: locFromTokens(collectAllTokens(titleChild as CstChildren)),
      };
    }
  }

  const bodyLines: Block['body'] = [];
  if (body) {
    for (const line of (body['blockLine'] as CstNode[]) ?? []) {
      const child = line as CstChildren;
      const yl = pickFirst(child['yamlLine'] as CstNode[]);
      if (yl) {
        bodyLines.push(visitYamlLine(yl as CstChildren));
        continue;
      }
      const li = pickFirst(child['listItem'] as CstNode[]);
      if (li) {
        const l = visitListItem(li as CstChildren);
        if (l) bodyLines.push(l);
        continue;
      }
      const el = pickFirst(child['element'] as CstNode[]);
      if (el) {
        const e = visitElement(el as CstChildren);
        if (e) bodyLines.push(e);
      }
    }
  }
  return {
    kind: 'Block',
    type: blockTypeName(typeName),
    ...(title ? { title } : {}),
    body: bodyLines,
    loc: locFromTokens(tokens),
  };
}

function visitListItem(cst: CstChildren): ListItem | undefined {
  const factSub = pickFirst(cst['fact'] as CstNode[]);
  if (!factSub) return undefined;
  return {
    kind: 'ListItem',
    fact: visitFact(factSub as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitYamlLine(cst: CstChildren): YamlLine {
  const idSub = pickFirst(cst['identifier'] as CstNode[]);
  const valSub = pickFirst(cst['yamlValue'] as CstNode[]);
  let value: YamlValue = null;
  if (valSub) {
    const yv = valSub as CstChildren;
    const stringChild = pickFirst(yv['string'] as CstNode[]);
    const seqChild = pickFirst(yv['flowSequence'] as CstNode[]);
    const scalarChild = pickFirst(yv['plainScalar'] as CstNode[]);
    if (stringChild) {
      const tok = stringChild.image ?? '';
      value = {
        kind: 'StringValue',
        value: decodeString(tok),
        loc: locFromTokens([stringChild as TokenLike]),
      };
    } else if (seqChild) {
      value = visitFlowSequence(seqChild as CstChildren);
    } else if (scalarChild) {
      const tok = scalarChild.image ?? '';
      value = { kind: 'PlainScalar', text: tok, loc: locFromTokens([scalarChild as TokenLike]) };
    }
  }
  return {
    kind: 'YamlLine',
    key: idSub?.image ?? '',
    value,
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitFactStatement(cst: CstChildren): FactStatement {
  return {
    kind: 'FactStatement',
    fact: visitFact(pickFirst(cst['fact'] as CstNode[]) as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitFact(cst: CstChildren): Fact {
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

function visitFactRef(cst: CstChildren): FactRef {
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

function visitRuleStatement(cst: CstChildren): RuleStatement {
  return {
    kind: 'RuleStatement',
    rule: visitRule(pickFirst(cst['rule'] as CstNode[]) as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitRule(cst: CstChildren): Rule {
  const refSub = pickFirst(cst['factRef'] as CstNode[]);
  const listSub = pickFirst(cst['factRefList'] as CstNode[]);
  const premises: FactRef[] = [];
  if (listSub) {
    for (const fr of ((listSub as CstChildren)['factRef'] as CstNode[]) ?? []) {
      premises.push(visitFactRef(fr as CstChildren));
    }
  }
  return {
    kind: 'Rule',
    ref: visitFactRef(refSub as CstChildren),
    premises,
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitRelationStatement(cst: CstChildren): RelationStatement {
  return {
    kind: 'RelationStatement',
    relation: visitRelation(pickFirst(cst['relation'] as CstNode[]) as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitRelation(cst: CstChildren): Relation {
  const endpoints = (cst['relationEndpoint'] as CstNode[]) ?? [];
  const arrowNode = pickFirst(cst['arrow'] as CstNode[]);
  const attrSub = pickFirst(cst['attributeBlock'] as CstNode[]);
  return {
    kind: 'Relation',
    from: visitRelationEndpoint(endpoints[0] as CstChildren),
    arrow: arrowName(arrowNode?.tokenType?.name ?? 'Support'),
    to: visitRelationEndpoint(endpoints[1] as CstChildren),
    ...(attrSub ? { attributes: visitAttributeBlock(attrSub as CstChildren) } : {}),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

function visitRelationEndpoint(cst: CstChildren): RelationEndpoint {
  const fr = pickFirst(cst['factRef'] as CstNode[]);
  if (fr) return visitFactRef(fr as CstChildren);
  const re = pickFirst(cst['ruleExpr'] as CstNode[]);
  if (re) return visitRuleExpr(re as CstChildren);
  throw new Error('relationEndpoint matched no alternative');
}

function visitRuleExpr(cst: CstChildren): RuleExpr {
  const refSub = pickFirst(cst['factRef'] as CstNode[]);
  const listSub = pickFirst(cst['factRefList'] as CstNode[]);
  if (!refSub) throw new Error('ruleExpr matched no alternative');
  const premises: FactRef[] = [];
  if (listSub) {
    for (const fr of ((listSub as CstChildren)['factRef'] as CstNode[]) ?? []) {
      premises.push(visitFactRef(fr as CstChildren));
    }
  }
  const loc = locFromTokens(collectAllTokens(cst));
  return {
    kind: 'RuleExpr',
    rule: { kind: 'Rule', ref: visitFactRef(refSub as CstChildren), premises, loc },
    loc,
  };
}

function visitAttributeBlock(cst: CstChildren): AttributeBlock {
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
