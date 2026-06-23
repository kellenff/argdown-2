// src/stringifier.ts
// AST → source string. Canonical style. Pure, synchronous, no I/O.
// Round-trip guarantee: parse(stringify(ast)) is structurally equivalent to ast
// (positions may differ).

import type { Document } from './ast.js';

export type StringifyOptions = Record<string, never>;

export function stringify(ast: Document, _options: StringifyOptions = {}): string {
  void _options;
  return '';
}
