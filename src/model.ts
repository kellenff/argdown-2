export const DOCUMENT_TAG = "casualtheorics.argdown2/document" as const;
export const AGGREGATE_IDENTITY_TAG =
  "casualtheorics.argdown2.aggregate/identity" as const;
export const EXTENSION_PROPORTION_OBSERVER_TAG =
  "casualtheorics.argdown2.observer/extension-proportion" as const;
export const PROJECTION_THRESHOLD_TAG =
  "casualtheorics.argdown2.projection/threshold" as const;

export const GROUNDED_SOLVER_TAG =
  "casualtheorics.argdown2.solver/grounded" as const;
export const PREFERRED_SOLVER_TAG =
  "casualtheorics.argdown2.solver/preferred" as const;
export const STABLE_SOLVER_TAG =
  "casualtheorics.argdown2.solver/stable" as const;
export const COMPLETE_SOLVER_TAG =
  "casualtheorics.argdown2.solver/complete" as const;
export const BIPOLAR_SOLVER_TAG =
  "casualtheorics.argdown2.solver/bipolar" as const;
export const EVIDENTIAL_SOLVER_TAG =
  "casualtheorics.argdown2.solver/evidential" as const;

export const SOLVER_TAGS = [
  GROUNDED_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
  STABLE_SOLVER_TAG,
  COMPLETE_SOLVER_TAG,
  BIPOLAR_SOLVER_TAG,
  EVIDENTIAL_SOLVER_TAG,
] as const;

export type SolverTag = (typeof SOLVER_TAGS)[number];
export type LabelSolverTag =
  | typeof BIPOLAR_SOLVER_TAG
  | typeof EVIDENTIAL_SOLVER_TAG
  | typeof GROUNDED_SOLVER_TAG;
export type MultiExtensionSolverTag =
  | typeof COMPLETE_SOLVER_TAG
  | typeof PREFERRED_SOLVER_TAG
  | typeof STABLE_SOLVER_TAG;

export function isSolverTag(value: string): value is SolverTag {
  return (SOLVER_TAGS as readonly string[]).includes(value);
}

export function isEdnKeywordName(value: string): boolean {
  const segment = "[A-Za-z0-9.*+!_?$%&=<>|-]+";
  return new RegExp(`^${segment}(?:/${segment})?$`).test(value);
}

declare const entityIdBrand: unique symbol;
declare const inferenceIdBrand: unique symbol;

export type EntityId = string & { readonly [entityIdBrand]: true };
export type InferenceId = string & { readonly [inferenceIdBrand]: true };
export type Confidence = number | null;
export type Label = "in" | "out" | "undec";
export type DiagnosticPath = readonly (number | string)[];

export type Diagnostic = {
  code: string;
  message: string;
  path?: DiagnosticPath;
};

export type EdnError =
  | { readonly _tag: "RootCount"; readonly diagnostic: Diagnostic }
  | { readonly _tag: "ReadError"; readonly diagnostic: Diagnostic };

export type ExtraEntry = readonly [unknown, unknown];

export type CandidateInference = {
  kind: "inference";
  id: string;
  premises: readonly string[];
  conclusion: string;
  rules: readonly string[];
  metadata?: unknown;
  extra: readonly ExtraEntry[];
};

export type CandidateStatement = {
  kind: "statement";
  id: string;
  text?: string;
  tags: readonly string[];
  metadata?: unknown;
  extra: readonly ExtraEntry[];
};

export type CandidateArgument = {
  kind: "argument";
  id: string;
  description?: string;
  tags: readonly string[];
  metadata?: unknown;
  inferences: readonly CandidateInference[];
  extra: readonly ExtraEntry[];
};

export type RelationKind = "support" | "attack" | "contradiction" | "undercut";

export function supportedRelationKinds(
  solver: SolverTag,
): ReadonlySet<RelationKind> {
  switch (solver) {
    case BIPOLAR_SOLVER_TAG:
    case EVIDENTIAL_SOLVER_TAG:
      return new Set(["attack", "contradiction", "support"]);
    case GROUNDED_SOLVER_TAG:
    case PREFERRED_SOLVER_TAG:
    case STABLE_SOLVER_TAG:
    case COMPLETE_SOLVER_TAG:
      return new Set(["attack", "contradiction"]);
  }
}

export type CandidateRelation = {
  kind: RelationKind;
  id: string;
  from: string;
  to: string;
  extra: readonly ExtraEntry[];
};

export type AggregateInput = { ref: string };

export type IdentityAggregate = {
  tag: typeof AGGREGATE_IDENTITY_TAG;
  inputs: readonly [AggregateInput];
};

export type ExtensionProportionObserver = {
  tag: typeof EXTENSION_PROPORTION_OBSERVER_TAG;
};

export type SolverInterface = {
  aggregate: IdentityAggregate;
  observer?: ExtensionProportionObserver;
};

export type ThresholdProjection = {
  tag: typeof PROJECTION_THRESHOLD_TAG;
  outAtMost: number;
  inAtLeast: number;
  otherwise: null;
};

export type CandidateSolverComponent = {
  kind: "solver";
  solver: SolverTag;
  id: string;
  interface?: SolverInterface;
  imports: readonly (readonly [string, ThresholdProjection])[];
  elements: readonly CandidateElement[];
  extra: readonly ExtraEntry[];
};

export type CandidateElement =
  | CandidateArgument
  | CandidateRelation
  | CandidateSolverComponent
  | CandidateStatement;

export type CandidateDocument = {
  id: string;
  root: CandidateSolverComponent;
  extra: readonly ExtraEntry[];
};

export type Inference =
  & Omit<CandidateInference, "conclusion" | "id" | "premises">
  & {
    id: InferenceId;
    premises: readonly EntityId[];
    conclusion: EntityId;
  };

export type Statement = Omit<CandidateStatement, "id"> & { id: EntityId };

export type Argument = Omit<CandidateArgument, "id" | "inferences"> & {
  id: EntityId;
  inferences: readonly Inference[];
};

export type Relation = Omit<CandidateRelation, "from" | "id" | "to"> & {
  id: EntityId;
  from: EntityId;
  to: EntityId;
};

export type SolverComponent = {
  kind: "solver";
  solver: SolverTag;
  id: EntityId;
  interface: SolverInterface;
  imports: ReadonlyMap<EntityId, ThresholdProjection>;
  elements: readonly TheoryElement[];
  extra: readonly ExtraEntry[];
};

export type TheoryElement =
  | Argument
  | Relation
  | SolverComponent
  | Statement;

export type Document = {
  id: string;
  root: SolverComponent;
  extra: readonly ExtraEntry[];
};

// Compatibility alias retained for callers while the pre-1.0 API migrates.
export type GroundedDocument = Document;

export type DungFramework = {
  nodes: ReadonlySet<EntityId>;
  attackersByTarget: ReadonlyMap<EntityId, ReadonlySet<EntityId>>;
};

export type ValidationResult =
  | { ok: true; document: Document }
  | { ok: false; errors: readonly Diagnostic[] };

export type LoadResult = ValidationResult;

export type LabelNativeResult = {
  kind: "labels";
  values: ReadonlyMap<EntityId, Label>;
};

export type ExtensionNativeResult = {
  kind: "extensions";
  values: readonly ReadonlySet<EntityId>[];
};

export type AggregateResult =
  | { kind: "label"; value: Label }
  | { kind: "extension-membership"; value: readonly boolean[] };

export type ComponentSolveResult = {
  id: EntityId;
  solver: SolverTag;
  native: LabelNativeResult | ExtensionNativeResult;
  aggregate: AggregateResult;
  boundary: { confidence: Confidence };
  children: ReadonlyMap<EntityId, ComponentSolveResult>;
  warnings: readonly Diagnostic[];
};

export type SolveResult = ComponentSolveResult;
export type MultiSolveResult = ComponentSolveResult;
