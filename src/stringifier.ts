// src/stringifier.ts
// AST → source string. Canonical style. Pure, synchronous, no I/O.
// Round-trip guarantee: parse(stringify(ast)) is structurally equivalent to ast
// (positions may differ).

import type {
  Argument,
  Arrow,
  Block,
  Conclusion,
  Document,
  Element,
  FactHead,
  FactRef,
  FactStatement,
  Frontmatter,
  Premise,
  Relation,
  RelationEndpoint,
  RelationStatement,
  RuleStatement,
  AttributeBlock,
  Value,
  YamlValue,
  YamlLine,
  FlowSequence,
  FlowMapping,
  FlowScalar,
  PlainScalar,
  StringValue,
  NumberValue,
  BooleanValue,
  NullValue,
} from './ast.js';

export type StringifyOptions = Record<string, never>;

export function stringify(ast: Document, _options: StringifyOptions = {}): string {
  void _options;
  const parts: string[] = [];
  if (ast.frontmatter) {
    parts.push(emitFrontmatter(ast.frontmatter));
  }
  for (const el of ast.elements) {
    parts.push(emitElement(el));
  }
  return parts.join('\n\n') + (parts.length > 0 ? '\n' : '');
}

function emitFrontmatter(fm: Frontmatter): string {
  const lines = ['==='];
  for (const [key, value] of Object.entries(fm.entries)) {
    lines.push(`${key}: ${emitValue(value)}`);
  }
  lines.push('===');
  return lines.join('\n');
}

function emitElement(el: Element): string {
  switch (el.kind) {
    case 'Heading':
      return `${'#'.repeat(el.level)} ${el.text}`;
    case 'LineComment':
      return `// ${el.text}`;
    case 'BlockComment':
      return `/* ${el.text} */`;
    case 'Block':
      return emitBlock(el);
    case 'FactStatement':
      return emitFactStatement(el);
    case 'Argument':
      return emitArgument(el);
    case 'RelationStatement':
      return emitRelationStatement(el);
    case 'RuleStatement':
      return emitRuleStatement(el);
  }
}

function emitBlock(_b: Block): string {
  return '';
}

function emitFactStatement(f: FactStatement): string {
  const fact = f.fact;
  const ref = emitFactRef(fact.ref);
  // argdown-2 uses space-separated claim text (BNF NOTE 4); the colon form
  // is silently stripped by the parser. Spec §5.6a.
  const claimPart = fact.claimText !== undefined ? ` ${fact.claimText}` : '';
  const attrPart = fact.attributes ? emitAttributeBlock(fact.attributes) : '';
  return `${ref}${claimPart}${attrPart}`;
}

function emitFactRef(ref: FactRef): string {
  return emitFactHead(ref.head);
}

function emitFactHead(head: FactHead): string {
  switch (head.kind) {
    case 'IdentifierHead':
      return `[#${head.identifier}]`;
    case 'TitleHead':
      return `[${head.title}]`;
  }
}

function emitAttributeBlock(attr: AttributeBlock): string {
  const entries = Object.entries(attr.entries);
  if (entries.length === 0) {
    return '';
  }
  if (entries.length === 1) {
    const [k, v] = entries[0]!;
    return ` {${k}: ${emitValue(v)}}`;
  }
  const lines = entries.map(([k, v]) => `  ${k}: ${emitValue(v)},`);
  return ` {\n${lines.join('\n')}\n}`;
}

// Deviation from plan: the plan's emit format uses `-- ` premises on
// separate lines under the conclusion, but the argdown-2 grammar (per
// docs/GRAMMAR.bnf NOTE 4 + DESIGN.md §2.3) does NOT accept `--` as
// a premise prefix. Emitting non-parseable source would break the
// round-trip invariant (spec §7). We emit the canonical single-line
// form `([#C]) -> [#P1], [#P2]. {attrs}` matching what the parser
// accepts. A future grammar extension that adds `--` premise syntax
// can swap this without changing the AST shape.
//
// When an argument is used as a value (a conclusion or a premise),
// it becomes an <arg-expr>: per docs/GRAMMAR.bnf NOTE 11, an arg-expr
// carries NO terminating period and NO attribute block — only the
// outermost argument owns them. `asExpr` propagates that constraint.
function emitArgument(a: Argument, asExpr = false): string {
  const conclText = emitConclusion(a.conclusion);
  const premisesText = a.premises.map(emitPremise).join(', ');
  if (asExpr) {
    return `(${conclText}) -> ${premisesText}`;
  }
  const attrPart = a.attributes ? emitAttributeBlock(a.attributes) : '';
  return `(${conclText}) -> ${premisesText}.${attrPart}`;
}

function emitConclusion(c: Conclusion): string {
  switch (c.kind) {
    case 'atom':
      return emitFactRef(c.value);
    case 'argument':
      return emitArgument(c.value, true);
  }
}

function emitPremise(p: Premise): string {
  switch (p.kind) {
    case 'atom':
      return emitFactRef(p.value);
    case 'argument':
      return emitArgument(p.value, true);
    case 'disjunction':
      return `(${p.values.map(emitFactRef).join(' | ')})`;
  }
}

const ARROW_SYMBOL: Record<Arrow, string> = {
  support: '-->',
  attack: '--x',
  undercut: '-.->',
  undermine: '-.-',
  concession: '~>',
  qualification: '?>',
  equivalence: '<->',
};

function emitRelationStatement(rs: RelationStatement): string {
  return rs.relations.map(emitRelation).join('\n');
}

function emitRelation(r: Relation): string {
  const from = emitRelationEndpoint(r.from);
  const arrow = ARROW_SYMBOL[r.arrow];
  const to = emitRelationEndpoint(r.to);
  const attrPart = r.attributes ? emitAttributeBlock(r.attributes) : '';
  return `${from} ${arrow} ${to}${attrPart}`;
}

function emitRelationEndpoint(e: RelationEndpoint): string {
  if (e.kind === 'FactRef') {
    return emitFactRef(e);
  }
  return emitArgument(e);
}

function emitRuleStatement(_r: RuleStatement): string {
  return '';
}

function emitValue(v: Value | PlainScalar): string {
  switch (v.kind) {
    case 'StringValue':
      return emitString(v);
    case 'NumberValue':
      return String(v.value);
    case 'BooleanValue':
      return String(v.value);
    case 'NullValue':
      return 'null';
    case 'FlowSequence':
      return emitFlowSequence(v);
    case 'FlowMapping':
      return emitFlowMapping(v);
    case 'FlowScalar':
      return v.text;
    case 'PlainScalar':
      return v.text;
  }
}

function emitString(s: StringValue): string {
  // Escape order matters: backslash first so we don't double-escape the
  // backslashes we introduce for the other escapes.
  let out = '';
  for (const ch of s.value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x5c) {
      out += '\\\\';
    } else if (code === 0x22) {
      out += '\\"';
    } else if (code === 0x0a) {
      out += '\\n';
    } else if (code === 0x0d) {
      out += '\\r';
    } else if (code === 0x09) {
      out += '\\t';
    } else if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else {
      out += ch;
    }
  }
  return `"${out}"`;
}

function emitFlowSequence(seq: FlowSequence): string {
  return `[${seq.items.map(emitValue).join(', ')}]`;
}

function emitFlowMapping(m: FlowMapping): string {
  const entries = Object.entries(m.entries).map(([k, v]) => `${k}: ${emitValue(v)}`);
  return `{${entries.join(', ')}}`;
}

// YamlLine and YamlValue are reserved for future use by block body emission.
export type { YamlLine, YamlValue };
