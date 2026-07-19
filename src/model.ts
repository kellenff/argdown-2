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

declare const entityIdBrand: unique symbol;
declare const inferenceIdBrand: unique symbol;

export type EntityId = string & { readonly [entityIdBrand]: true };
export type InferenceId = string & { readonly [inferenceIdBrand]: true };
export type Label = "in" | "out" | "undec";
export type DiagnosticPath = readonly (number | string)[];

export type Diagnostic = {
  code: string;
  message: string;
  path?: DiagnosticPath;
};

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

export type CandidateRelation = {
  kind: RelationKind;
  from: string;
  to: string;
  extra: readonly ExtraEntry[];
};

export type CandidateNestedSolver = {
  kind: "nested-solver";
  document: CandidateDocument;
};

export type CandidateElement =
  | CandidateArgument
  | CandidateNestedSolver
  | CandidateRelation
  | CandidateStatement;

export type CandidateDocument = {
  solver: SolverTag;
  elements: readonly CandidateElement[];
};

export type NestedSolver = {
  kind: "nested-solver";
  document: GroundedDocument;
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

export type NodeRelation = Omit<CandidateRelation, "from" | "kind" | "to"> & {
  kind: "attack" | "contradiction" | "support";
  from: EntityId;
  to: EntityId;
};

export type UndercutRelation =
  & Omit<CandidateRelation, "from" | "kind" | "to">
  & {
    kind: "undercut";
    from: EntityId;
    to: InferenceId;
  };

export type Relation = NodeRelation | UndercutRelation;

export type TheoryElement = Argument | NestedSolver | Relation | Statement;

export type GroundedDocument = {
  solver: SolverTag;
  elements: readonly TheoryElement[];
};

export type DungFramework = {
  nodes: ReadonlySet<EntityId>;
  attackersByTarget: ReadonlyMap<EntityId, ReadonlySet<EntityId>>;
};

export type ReadResult =
  | { ok: true; value: unknown }
  | { ok: false; errors: readonly Diagnostic[] };

export type ValidationResult =
  | { ok: true; document: GroundedDocument }
  | { ok: false; errors: readonly Diagnostic[] };

export type LoadResult = ValidationResult;

export type SolveResult = {
  solver: LabelSolverTag;
  labels: ReadonlyMap<EntityId, Label>;
  warnings: readonly Diagnostic[];
  nested: readonly (MultiSolveResult | SolveResult)[];
};

export type MultiSolveResult = {
  solver: MultiExtensionSolverTag;
  extensions: readonly ReadonlySet<EntityId>[];
  warnings: readonly Diagnostic[];
  nested: readonly (MultiSolveResult | SolveResult)[];
};
