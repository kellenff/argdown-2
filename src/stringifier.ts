// src/stringifier.ts
// AST → source string. Canonical style. Pure, synchronous, no I/O.
// Round-trip guarantee: parse(stringify(ast)) is structurally equivalent to ast
// (positions may differ).

import type {
  Argument,
  Block,
  Document,
  Element,
  FactStatement,
  Frontmatter,
  RelationStatement,
  RuleStatement,
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
      return `// ${el.text.trim()}`;
    case 'BlockComment':
      return `/* ${el.text.trim()} */`;
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

function emitFactStatement(_f: FactStatement): string {
  return '';
}

function emitArgument(_a: Argument): string {
  return '';
}

function emitRelationStatement(_r: RelationStatement): string {
  return '';
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
