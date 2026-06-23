// src/visitor-block.ts
// CST → AST for block, heading, comment, list-item productions.

import type {
  Block,
  BlockTitle,
  CstChildren,
  CstNode,
  Heading,
  LineComment,
  BlockComment,
  ListItem,
} from './ast.js';
import { collectAllTokens, locFromTokens, pickFirst, visitElement, visitFact } from './visitor.js';
import { visitYamlLine } from './visitor-frontmatter.js';

function blockTypeName(tokName: string): Block['type'] {
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

export function visitBlock(cst: CstChildren): Block {
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

export function visitListItem(cst: CstChildren): ListItem | undefined {
  const factSub = pickFirst(cst['fact'] as CstNode[]);
  if (!factSub) return undefined;
  return {
    kind: 'ListItem',
    fact: visitFact(factSub as CstChildren),
    loc: locFromTokens(collectAllTokens(cst)),
  };
}

export function visitHeading(cst: CstChildren): Heading {
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

export function visitComment(cst: CstChildren): LineComment | BlockComment {
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
