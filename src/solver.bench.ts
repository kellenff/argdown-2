// src/solver.bench.ts
// Tinybench harness for solve() and solveBipolar() — both on cached ASTs and
// as end-to-end parse+solve. Mirrors src/parser.bench.ts pattern.
// Runner: `yarn bench:solver [--baseline|--check]` (uses tsx for .ts execution under PnP).

import { Bench } from 'tinybench';
import { readFile, writeFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';
import { parse } from './parser.js';
import { solve, solveBipolar } from './solver.js';
import type { Document } from './ast.js';

export const FIXTURES = [
  ['small-claim', 'src/parser.fixtures/small-claim.argdown'],
  ['small-rule', 'src/parser.fixtures/small-rule.argdown'],
  ['small-relation', 'src/parser.fixtures/small-relation.argdown'],
  ['medium-climate', 'src/parser.fixtures/medium-climate.argdown'],
  ['heavy-relations', 'src/parser.fixtures/heavy-relations.argdown'],
  ['deep-nesting', 'src/parser.fixtures/deep-nesting.argdown'],
  ['large-stress', 'src/parser.fixtures/large-stress.argdown'],
] as const;

export type FixtureName = (typeof FIXTURES)[number][0];

export const TASK_TYPES = [
  'solve',
  'solve-bipolar',
  'parse-solve',
  'parse-solve-bipolar',
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export type TaskName = `${TaskType}:${FixtureName}`;