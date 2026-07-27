import { evaluateComponent } from "./component-eval.js";
import type {
  ComponentSolveResult,
  Document,
  LoadError,
  SchemaError,
  SolveError,
  ValidateError,
} from "./model.js";
import { parseCandidate } from "./builder/parse-candidate.js";
import { decodeWire } from "./schema.js";
import { validateCandidate } from "./validate.js";

import { Effect } from "effect";

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
  EdnError,
  EntityId,
  ExtensionNativeResult,
  GroundedDocument,
  IdentityAggregate,
  Inference,
  InferenceId,
  Label,
  LabelNativeResult,
  LoadError,
  MultiSolveResult,
  Relation,
  SchemaError,
  SolveError,
  SolverComponent,
  SolveResult,
  SolverInterface,
  SolverTag,
  Statement,
  TheoryElement,
  ThresholdProjection,
  ValidateError,
} from "./model.js";
export type { ParseCandidateError } from "./builder/parse-candidate.js";
export type { BuilderCode, BuilderError } from "./builder/types.js";
export { apply, emptyDocument } from "./builder/apply.js";

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
  supportedRelationKinds,
} from "./model.js";
export { parseCandidate } from "./builder/parse-candidate.js";

export function validate(
  value: unknown,
): Effect.Effect<Document, SchemaError | ValidateError, never> {
  return Effect.gen(function* () {
    const candidate = yield* decodeWire(value);
    return yield* validateCandidate(candidate);
  });
}

export function load(
  source: string,
): Effect.Effect<Document, LoadError, never> {
  return Effect.gen(function* () {
    const candidate = yield* parseCandidate(source);
    return yield* validateCandidate(candidate);
  });
}

export function solve(
  document: Document,
): Effect.Effect<ComponentSolveResult, SolveError> {
  return Effect.sync(() => evaluateComponent(document.root));
}
