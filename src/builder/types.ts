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
