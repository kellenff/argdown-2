import type {
  CandidateDocument,
  CandidateElement,
  RelationKind,
  SolverTag,
} from "../model.js";

export type BuilderWarning = {
  code: string;
  message: string;
};

export type RefResolution =
  | { ok: true; id: string; via: "id" | "text" }
  | { ok: false; reason: "missing" | "ambiguous"; message: string };

export type DiffOp =
  | { op: "add"; kind: CandidateElement["kind"] | "inference"; id: string }
  | { op: "update"; kind: CandidateElement["kind"] | "inference"; id: string }
  | {
    op: "remove";
    kind: CandidateElement["kind"] | "inference" | "relation";
    id: string;
  }
  | {
    op: "add-relation";
    kind: RelationKind;
    id: string;
  }
  | {
    op: "remove-relation";
    kind: RelationKind;
    id: string;
  }
  | { op: "set-import"; parentId: string; childId: string }
  | { op: "remove-import"; parentId: string; childId: string };

export type ApplyResult = {
  document: CandidateDocument;
  warnings: readonly BuilderWarning[];
  refused?: BuilderWarning;
  diff: readonly DiffOp[];
};

/**
 * Stable refusal codes from `apply`. Each maps 1:1 to a branch in
 * `apply()` that previously set `ApplyResult.refused`.
 */
export type BuilderCode =
  | "builder/invalid-id"
  | "builder/duplicate-id"
  | "builder/missing-id"
  | "builder/unsupported-relation-kind"
  | "builder/unsupported-solver"
  | "builder/invalid-projection-bounds";

/**
 * Typed failure for `apply()` and `applyMutation()`. Mirrors the
 * shape previously embedded in `ApplyResult.refused` so the MCP
 * JSON response stays byte-compatible.
 */
export type BuilderError = {
  readonly _tag: "Builder";
  readonly code: BuilderCode;
  readonly message: string;
  readonly path: ReadonlyArray<string | number>;
  readonly warnings: readonly BuilderWarning[];
};

type Scoped = { parentId?: string };

export type DocumentEdit =
  | {
    type: "add_statement";
    id: string;
    text?: string;
    tags?: readonly string[];
  } & Scoped
  | {
    type: "update_statement";
    id: string;
    text?: string;
    tags?: readonly string[];
  } & Scoped
  | {
    type: "add_argument";
    id: string;
    description?: string;
    tags?: readonly string[];
  } & Scoped
  | {
    type: "add_inference";
    argumentId: string;
    id: string;
    premises: readonly string[];
    conclusion: string;
    rules?: readonly string[];
  } & Scoped
  | {
    type: "add_relation";
    kind: RelationKind;
    id: string;
    from: string;
    to: string;
  } & Scoped
  | ({ type: "remove_element"; id: string } & Scoped)
  | ({ type: "remove_relation"; id: string } & Scoped)
  | {
    type: "add_solver";
    id: string;
    solver: SolverTag;
  } & Scoped
  | {
    type: "set_import";
    childId: string;
    outAtMost: number;
    inAtLeast: number;
  } & Scoped
  | ({ type: "remove_import"; childId: string } & Scoped);
