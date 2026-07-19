import {
  AGGREGATE_IDENTITY_TAG,
  type CandidateArgument,
  type CandidateDocument,
  type CandidateElement,
  type CandidateInference,
  type CandidateRelation,
  type CandidateSolverComponent,
  type CandidateStatement,
  EXTENSION_PROPORTION_OBSERVER_TAG,
  GROUNDED_SOLVER_TAG,
  isEdnKeywordName,
  PREFERRED_SOLVER_TAG,
  STABLE_SOLVER_TAG,
  COMPLETE_SOLVER_TAG,
  type SolverTag,
} from "../model.js";
import { resolveInferenceRef, resolveRef } from "./resolve-ref.js";
import type { ApplyResult, BuilderWarning, DocumentEdit } from "./types.js";

export function emptyDocument(
  solver: SolverTag = GROUNDED_SOLVER_TAG,
  documentId = "document",
  rootId = "root",
): CandidateDocument {
  return {
    id: documentId,
    root: {
      kind: "solver",
      solver,
      id: rootId,
      imports: [],
      elements: [],
      extra: [],
    },
    extra: [],
  };
}

function stripColon(id: string): string {
  return id.startsWith(":") ? id.slice(1) : id;
}

function softRefId(raw: string): string {
  const stripped = raw.startsWith(":") ? raw.slice(1) : raw.trim();
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(stripped)) return stripped;
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "unresolved";
}

function collectIds(doc: CandidateDocument): Set<string> {
  const ids = new Set<string>();
  for (const el of doc.root.elements) {
    ids.add(el.id);
    if (el.kind === "argument") {
      for (const inf of el.inferences) ids.add(inf.id);
    }
  }
  return ids;
}

function refused(
  doc: CandidateDocument,
  code: string,
  message: string,
): ApplyResult {
  return { document: doc, warnings: [], refused: { code, message }, diff: [] };
}

function withElements(
  doc: CandidateDocument,
  elements: readonly CandidateElement[],
): CandidateDocument {
  return { ...doc, root: { ...doc.root, elements } };
}

function interfaceFor(
  root: CandidateSolverComponent,
  ref: string,
): NonNullable<CandidateSolverComponent["interface"]> {
  const multi = root.solver === PREFERRED_SOLVER_TAG ||
    root.solver === STABLE_SOLVER_TAG ||
    root.solver === COMPLETE_SOLVER_TAG;
  return {
    aggregate: {
      tag: AGGREGATE_IDENTITY_TAG,
      inputs: [{ ref }],
    },
    ...(multi
      ? { observer: { tag: EXTENSION_PROPORTION_OBSERVER_TAG } }
      : {}),
  };
}

function withInitialInterface(
  root: CandidateSolverComponent,
  ref: string,
): CandidateSolverComponent {
  if (root.interface !== undefined) return root;
  return {
    ...root,
    interface: interfaceFor(root, ref),
  };
}

function repairInterface(
  root: CandidateSolverComponent,
): CandidateSolverComponent {
  const currentRef = root.interface?.aggregate.inputs[0].ref;
  if (
    currentRef !== undefined &&
    root.elements.some((element) =>
      (element.kind === "statement" ||
        element.kind === "argument" ||
        element.kind === "solver") && element.id === currentRef
    )
  ) {
    return root;
  }
  const first = root.elements.find((element) =>
    element.kind === "statement" ||
    element.kind === "argument" ||
    element.kind === "solver"
  );
  if (first === undefined) {
    const { interface: _removed, ...pending } = root;
    return pending;
  }
  return {
    ...root,
    interface: interfaceFor(root, first.id),
  };
}

function invalidId(
  doc: CandidateDocument,
  id: string,
): ApplyResult | undefined {
  return isEdnKeywordName(id)
    ? undefined
    : refused(doc, "builder/invalid-id", `"${id}" is not a valid EDN keyword`);
}

function invalidIdList(
  doc: CandidateDocument,
  ids: readonly string[] | undefined,
): ApplyResult | undefined {
  if (ids === undefined) return undefined;
  const invalid = ids.find((id) => !isEdnKeywordName(id));
  return invalid === undefined ? undefined : invalidId(doc, invalid);
}

function resolveRefOrRaw(
  doc: CandidateDocument,
  raw: string,
  warnings: BuilderWarning[],
): string {
  const resolution = resolveRef(doc, raw);
  if (resolution.ok) return resolution.id;
  const storedId = softRefId(raw);
  warnings.push({
    code: "builder/unresolved-ref",
    message: `${resolution.message}; stored as id "${storedId}"`,
  });
  return storedId;
}

function resolveInferenceRefOrRaw(
  doc: CandidateDocument,
  raw: string,
  warnings: BuilderWarning[],
): string {
  const resolution = resolveInferenceRef(doc, raw);
  if (resolution.ok) return resolution.id;
  const storedId = softRefId(raw);
  warnings.push({
    code: "builder/unresolved-ref",
    message: `${resolution.message}; stored as id "${storedId}"`,
  });
  return storedId;
}

export function apply(doc: CandidateDocument, edit: DocumentEdit): ApplyResult {
  const elements = doc.root.elements;
  switch (edit.type) {
    case "add_statement": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidIdList(doc, edit.tags);
      if (invalid !== undefined) return invalid;
      if (collectIds(doc).has(id)) {
        return refused(doc, "builder/duplicate-id", `Duplicate id "${id}"`);
      }
      const statement: CandidateStatement = {
        kind: "statement",
        id,
        tags: edit.tags ? [...edit.tags] : [],
        extra: [],
        ...(edit.text !== undefined ? { text: edit.text } : {}),
      };
      const root = withInitialInterface(
        { ...doc.root, elements: [...elements, statement] },
        id,
      );
      return {
        document: { ...doc, root },
        warnings: [],
        diff: [{ op: "add", kind: "statement", id }],
      };
    }

    case "update_statement": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidIdList(doc, edit.tags);
      if (invalid !== undefined) return invalid;
      const index = elements.findIndex((element) =>
        element.kind === "statement" && element.id === id
      );
      const existing = elements[index];
      if (existing === undefined || existing.kind !== "statement") {
        return refused(
          doc,
          "builder/missing-id",
          `No statement with id "${id}"`,
        );
      }
      const updated: CandidateStatement = {
        ...existing,
        ...(edit.text !== undefined ? { text: edit.text } : {}),
        ...(edit.tags !== undefined ? { tags: [...edit.tags] } : {}),
      };
      const next = [...elements];
      next[index] = updated;
      return {
        document: withElements(doc, next),
        warnings: [],
        diff: [{ op: "update", kind: "statement", id }],
      };
    }

    case "add_argument": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidIdList(doc, edit.tags);
      if (invalid !== undefined) return invalid;
      if (collectIds(doc).has(id)) {
        return refused(doc, "builder/duplicate-id", `Duplicate id "${id}"`);
      }
      const argument: CandidateArgument = {
        kind: "argument",
        id,
        tags: edit.tags ? [...edit.tags] : [],
        inferences: [],
        extra: [],
        ...(edit.description !== undefined
          ? { description: edit.description }
          : {}),
      };
      const root = withInitialInterface(
        { ...doc.root, elements: [...elements, argument] },
        id,
      );
      return {
        document: { ...doc, root },
        warnings: [],
        diff: [{ op: "add", kind: "argument", id }],
      };
    }

    case "add_inference": {
      const argumentId = stripColon(edit.argumentId);
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, argumentId) ?? invalidId(doc, id) ??
        invalidIdList(doc, edit.rules);
      if (invalid !== undefined) return invalid;
      if (collectIds(doc).has(id)) {
        return refused(doc, "builder/duplicate-id", `Duplicate id "${id}"`);
      }
      const index = elements.findIndex((element) =>
        element.kind === "argument" && element.id === argumentId
      );
      const argument = elements[index];
      if (argument === undefined || argument.kind !== "argument") {
        return refused(
          doc,
          "builder/missing-id",
          `No argument with id "${argumentId}"`,
        );
      }
      const warnings: BuilderWarning[] = [];
      const inference: CandidateInference = {
        kind: "inference",
        id,
        premises: edit.premises.map((ref) =>
          resolveRefOrRaw(doc, ref, warnings)
        ),
        conclusion: resolveRefOrRaw(doc, edit.conclusion, warnings),
        rules: edit.rules ? [...edit.rules] : [],
        extra: [],
      };
      const updated: CandidateArgument = {
        ...argument,
        inferences: [...argument.inferences, inference],
      };
      const next = [...elements];
      next[index] = updated;
      return {
        document: withElements(doc, next),
        warnings,
        diff: [{ op: "add", kind: "inference", id }],
      };
    }

    case "add_relation": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id);
      if (invalid !== undefined) return invalid;
      if (collectIds(doc).has(id)) {
        return refused(doc, "builder/duplicate-id", `Duplicate id "${id}"`);
      }
      const warnings: BuilderWarning[] = [];
      const relation: CandidateRelation = {
        kind: edit.kind,
        id,
        from: resolveRefOrRaw(doc, edit.from, warnings),
        to: edit.kind === "undercut"
          ? resolveInferenceRefOrRaw(doc, edit.to, warnings)
          : resolveRefOrRaw(doc, edit.to, warnings),
        extra: [],
      };
      return {
        document: withElements(doc, [...elements, relation]),
        warnings,
        diff: [{ op: "add-relation", kind: edit.kind, id }],
      };
    }

    case "remove_element": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id);
      if (invalid !== undefined) return invalid;
      const index = elements.findIndex((element) => element.id === id);
      if (index !== -1) {
        const removed = elements[index]!;
        const root = repairInterface({
          ...doc.root,
          elements: elements.filter((_, elementIndex) =>
            elementIndex !== index
          ),
        });
        return {
          document: { ...doc, root },
          warnings: [],
          diff: [{ op: "remove", kind: removed.kind, id }],
        };
      }
      for (
        let elementIndex = 0;
        elementIndex < elements.length;
        elementIndex++
      ) {
        const element = elements[elementIndex];
        if (element === undefined || element.kind !== "argument") continue;
        if (!element.inferences.some((inference) => inference.id === id)) {
          continue;
        }
        const next = [...elements];
        next[elementIndex] = {
          ...element,
          inferences: element.inferences.filter((inference) =>
            inference.id !== id
          ),
        };
        return {
          document: withElements(doc, next),
          warnings: [],
          diff: [{ op: "remove", kind: "inference", id }],
        };
      }
      return refused(doc, "builder/missing-id", `No element with id "${id}"`);
    }

    case "remove_relation": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id);
      if (invalid !== undefined) return invalid;
      const index = elements.findIndex((element) =>
        element.id === id &&
        element.kind !== "statement" &&
        element.kind !== "argument" &&
        element.kind !== "solver"
      );
      if (index === -1) {
        return refused(
          doc,
          "builder/missing-id",
          `No relation with id "${id}"`,
        );
      }
      const relation = elements[index] as CandidateRelation;
      return {
        document: withElements(
          doc,
          elements.filter((_, elementIndex) => elementIndex !== index),
        ),
        warnings: [],
        diff: [{ op: "remove-relation", kind: relation.kind, id }],
      };
    }
  }
}
