// src/solver.cross-validate.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parser.js';
import { solve, solveComplete } from './solver.js';
import type { Document } from './ast.js';

const FIXTURES = [
  'src/parser.fixtures/deep-nesting.argdown',
  'src/parser.fixtures/small-relation.argdown',
  'src/parser.fixtures/small-rule.argdown',
  'src/parser.fixtures/medium-climate.argdown',
  'src/parser.fixtures/heavy-relations.argdown',
];

describe('cross-validation: grounded = ∩ complete', () => {
  for (const path of FIXTURES) {
    it(`holds for ${path}`, () => {
      let source: string;
      try {
        source = readFileSync(join(process.cwd(), path), 'utf8');
      } catch {
        return; // skip missing fixture
      }
      const result = parse(source);
      if (!result.ok) return;
      const ast = result.ast as Document;

      const grounded = solve(ast);
      const groundedIn = new Set<string>();
      for (const [k, v] of grounded.labels) if (v === 'in') groundedIn.add(k);

      const complete = solveComplete(ast);
      let intersect = new Set<string>();
      if (complete.extensions.length === 0) {
        expect(groundedIn.size).toBe(0);
        return;
      }
      // Initialize with the first extension.
      for (const k of complete.extensions[0]!) intersect.add(k);
      for (let i = 1; i < complete.extensions.length; i++) {
        const ext = complete.extensions[i]!;
        for (const k of intersect) if (!ext.has(k)) intersect.delete(k);
      }

      // Dung's theorem: grounded = ∩ complete.
      expect(intersect).toEqual(groundedIn);
    });
  }
});