export const GROUNDED_SOLVER_TAG =
  "casualtheorics.argdown2.solver/grounded" as const;

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

export type CandidateElement =
  | CandidateArgument
  | CandidateRelation
  | CandidateStatement;

export type CandidateDocument = {
  solver: typeof GROUNDED_SOLVER_TAG;
  elements: readonly CandidateElement[];
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

export type TheoryElement = Argument | Relation | Statement;

export type GroundedDocument = {
  solver: typeof GROUNDED_SOLVER_TAG;
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
  solver: typeof GROUNDED_SOLVER_TAG;
  labels: ReadonlyMap<EntityId, Label>;
  warnings: readonly Diagnostic[];
};
