import { evaluateComponent } from "./component-eval.js";
import { readEdn } from "./edn.js";
import type {
  ComponentSolveResult,
  Document,
  LoadResult,
  ValidationResult,
} from "./model.js";
import { decodeWire } from "./schema.js";
import { validateCandidate } from "./validate.js";

export type {
  AggregateResult,
  Argument,
  CandidateDocument,
  CandidateSolverComponent,
  ComponentSolveResult,
  Confidence,
  Diagnostic,
  Document,
  DungFramework,
  EntityId,
  ExtensionNativeResult,
  GroundedDocument,
  IdentityAggregate,
  Inference,
  InferenceId,
  Label,
  LabelNativeResult,
  LoadResult,
  MultiSolveResult,
  Relation,
  SolveResult,
  SolverComponent,
  SolverInterface,
  SolverTag,
  Statement,
  TheoryElement,
  ThresholdProjection,
  ValidationResult,
} from "./model.js";

export {
  AGGREGATE_IDENTITY_TAG,
  BIPOLAR_SOLVER_TAG,
  COMPLETE_SOLVER_TAG,
  DOCUMENT_TAG,
  EVIDENTIAL_SOLVER_TAG,
  EXTENSION_PROPORTION_OBSERVER_TAG,
  GROUNDED_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
  PROJECTION_THRESHOLD_TAG,
  SOLVER_TAGS,
  STABLE_SOLVER_TAG,
} from "./model.js";

export function validate(value: unknown): ValidationResult {
  const decoded = decodeWire(value);
  return decoded.ok ? validateCandidate(decoded.document) : decoded;
}

export function load(source: string): LoadResult {
  const read = readEdn(source);
  return read.ok ? validate(read.value) : read;
}

export function solve(document: Document): ComponentSolveResult {
  return evaluateComponent(document.root);
}
