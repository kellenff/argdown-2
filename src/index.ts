import { readEdn } from './edn.js';
import { groundedLabels } from './grounded.js';
import type { GroundedDocument, LoadResult, SolveResult, ValidationResult } from './model.js';
import { reduceToDung } from './reduce-dung.js';
import { decodeWire } from './schema.js';
import { validateCandidate } from './validate.js';

export type {
  Argument,
  Diagnostic,
  DungFramework,
  EntityId,
  GroundedDocument,
  Inference,
  InferenceId,
  Label,
  LoadResult,
  Relation,
  SolveResult,
  Statement,
  TheoryElement,
  ValidationResult,
} from './model.js';

export function validate(value: unknown): ValidationResult {
  const decoded = decodeWire(value);
  return decoded.ok ? validateCandidate(decoded.document) : decoded;
}

export function load(source: string): LoadResult {
  const read = readEdn(source);
  return read.ok ? validate(read.value) : read;
}

export function solve(document: GroundedDocument): SolveResult {
  const reduced = reduceToDung(document);
  return {
    labels: groundedLabels(reduced.framework),
    solver: document.solver,
    warnings: reduced.warnings,
  };
}
