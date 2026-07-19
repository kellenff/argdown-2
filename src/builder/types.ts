import type {
  CandidateDocument,
  CandidateElement,
  RelationKind,
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
    from: string;
    to: string;
  }
  | {
    op: "remove-relation";
    kind: RelationKind;
    from: string;
    to: string;
  };

export type ApplyResult = {
  document: CandidateDocument;
  warnings: readonly BuilderWarning[];
  refused?: BuilderWarning;
  diff: readonly DiffOp[];
};

export type DocumentEdit =
  | {
    type: "add_statement";
    id: string;
    text?: string;
    tags?: readonly string[];
  }
  | {
    type: "update_statement";
    id: string;
    text?: string;
    tags?: readonly string[];
  }
  | {
    type: "add_argument";
    id: string;
    description?: string;
    tags?: readonly string[];
  }
  | {
    type: "add_inference";
    argumentId: string;
    id: string;
    premises: readonly string[];
    conclusion: string;
    rules?: readonly string[];
  }
  | {
    type: "add_relation";
    kind: RelationKind;
    from: string;
    to: string;
  }
  | { type: "remove_element"; id: string }
  | {
    type: "remove_relation";
    kind: RelationKind;
    from: string;
    to: string;
  };
