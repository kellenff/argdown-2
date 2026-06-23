// src/visitor-frontmatter.ts
// CST → AST for frontmatter / YAML / value productions.
//
// Kept in its own module so the main visitor stays under the file-size
// limit. These productions are self-contained: they only depend on
// shared helpers (locFromTokens, pickFirst, collectAllTokens).

import type {
  CstChildren,
  CstNode,
  FlowMapping,
  FlowSequence,
  Frontmatter,
  PlainScalar,
  StringValue,
  Value,
  YamlLine,
  YamlValue,
} from './ast.js';
import { collectAllTokens, locFromTokens, pickFirst } from './visitor.js';

type TokenLike = {
  image: string;
  startOffset?: number;
  endOffset?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
};

export function decodeString(s: string): string {
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

export function makeValueNode(cst: CstChildren): Value {
  const stringChild = pickFirst(cst['string'] as CstNode[]);
  if (stringChild) {
    const tok = stringChild.image ?? '';
    const v: StringValue = {
      kind: 'StringValue',
      value: decodeString(tok),
      loc: locFromTokens([stringChild as TokenLike]),
    };
    return v;
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

export function visitFrontmatter(cst: CstChildren): Frontmatter {
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

export function visitYamlLine(cst: CstChildren): YamlLine {
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
