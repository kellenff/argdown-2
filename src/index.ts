import { evaluateComponent } from "./component-eval.js";
import { readEdn } from "./edn.js";
import type {
  CandidateDocument,
  ComponentSolveResult,
  Document,
  LoadError,
  LoadResult,
  SchemaError,
  ValidationResult,
} from "./model.js";
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
  EntityId,
  ExtensionNativeResult,
  GroundedDocument,
  IdentityAggregate,
  Inference,
  InferenceId,
  Label,
  LabelNativeResult,
  LoadError,
  LoadResult,
  MultiSolveResult,
  Relation,
  SchemaError,
  SolverComponent,
  SolveResult,
  SolverInterface,
  SolverTag,
  Statement,
  TheoryElement,
  ThresholdProjection,
  ValidateError,
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
  supportedRelationKinds,
} from "./model.js";

function decodeWireEffect(
  value: unknown,
): Effect.Effect<CandidateDocument, SchemaError, never> {
  const decoded = decodeWire(value);
  if (!decoded.ok) {
    return Effect.fail({
      _tag: "Schema" as const,
      diagnostics: decoded.errors,
    });
  }
  return Effect.succeed(decoded.document);
}

export function loadEffect(
  source: string,
): Effect.Effect<Document, LoadError, never> {
  return Effect.gen(function* () {
    const raw = yield* readEdn(source);
    const candidate = yield* decodeWireEffect(raw);
    return yield* validateCandidate(candidate);
  });
}

export function validate(value: unknown): ValidationResult {
  return Effect.runSync(
    Effect.match(
      Effect.gen(function* () {
        const candidate = yield* decodeWireEffect(value);
        return yield* validateCandidate(candidate);
      }),
      {
        onFailure: (err) => ({ ok: false, errors: err.diagnostics }),
        onSuccess: (document) => ({ ok: true, document }),
      },
    ),
  );
}

export function load(source: string): LoadResult {
  return Effect.runSync(
    Effect.match(loadEffect(source), {
      onFailure: (err) => ({
        ok: false,
        errors: err._tag === "RootCount" || err._tag === "ReadError"
          ? [err.diagnostic]
          : err.diagnostics,
      }),
      onSuccess: (document) => ({ ok: true, document }),
    }),
  );
}

export function solve(document: Document): ComponentSolveResult {
  return evaluateComponent(document.root);
}
