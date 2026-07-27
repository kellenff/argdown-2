import { Effect } from "effect";

import {
  AGGREGATE_IDENTITY_TAG,
  type CandidateArgument,
  type CandidateDocument,
  type CandidateElement,
  type CandidateInference,
  type CandidateRelation,
  type CandidateSolverComponent,
  type CandidateStatement,
  COMPLETE_SOLVER_TAG,
  EXTENSION_PROPORTION_OBSERVER_TAG,
  GROUNDED_SOLVER_TAG,
  isEdnKeywordName,
  isSolverTag,
  PREFERRED_SOLVER_TAG,
  PROJECTION_THRESHOLD_TAG,
  type SolverTag,
  STABLE_SOLVER_TAG,
  supportedRelationKinds,
} from "../model.js";
import { resolveInferenceRef, resolveRef } from "./resolve-ref.js";
import type {
  ApplyResult,
  BuilderCode,
  BuilderError,
  BuilderWarning,
  DocumentEdit,
} from "./types.js";

/**
 * Successful builder update. `document` is the post-edit candidate document,
 * `warnings` are non-fatal soft warnings (e.g., unresolved prose refs), and
 * `diff` describes the structural change for tooling consumers.
 */
export type AppliedEdit = {
  readonly document: CandidateDocument;
  readonly warnings: readonly BuilderWarning[];
  readonly diff: ReadonlyArray<unknown>;
};

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

function collectIds(component: CandidateSolverComponent): Set<string> {
  const ids = new Set<string>();
  for (const el of component.elements) {
    ids.add(el.id);
    if (el.kind === "argument") {
      for (const inf of el.inferences) ids.add(inf.id);
    }
  }
  return ids;
}

function refuse(
  _doc: CandidateDocument,
  code: BuilderCode,
  message: string,
  warnings: readonly BuilderWarning[] = [],
): BuilderError {
  return { _tag: "Builder", code, message, path: [], warnings };
}

function findComponent(
  component: CandidateSolverComponent,
  id: string,
): CandidateSolverComponent | undefined {
  if (component.id === id) return component;
  for (const element of component.elements) {
    if (element.kind === "solver") {
      const found = findComponent(element, id);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function replaceComponent(
  component: CandidateSolverComponent,
  targetId: string,
  next: CandidateSolverComponent,
): CandidateSolverComponent {
  if (component.id === targetId) return next;
  return {
    ...component,
    elements: component.elements.map((element) =>
      element.kind === "solver"
        ? replaceComponent(element, targetId, next)
        : element
    ),
  };
}

type ComponentUpdate =
  | {
    ok: true;
    document: CandidateDocument;
    component: CandidateSolverComponent;
  }
  | { ok: false; error: BuilderError };

function withComponent(
  doc: CandidateDocument,
  parentId: string,
  update: (
    component: CandidateSolverComponent,
  ) =>
    | { ok: true; component: CandidateSolverComponent }
    | { ok: false; code: BuilderCode; message: string },
): ComponentUpdate {
  const component = findComponent(doc.root, parentId);
  if (component === undefined) {
    return {
      ok: false,
      error: refuse(
        doc,
        "builder/missing-id",
        `No solver component with id "${parentId}"`,
      ),
    };
  }
  const result = update(component);
  if (!result.ok) {
    return {
      ok: false,
      error: refuse(doc, result.code, result.message),
    };
  }
  return {
    ok: true,
    document: {
      ...doc,
      root: replaceComponent(doc.root, parentId, result.component),
    },
    component: result.component,
  };
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
    ...(multi ? { observer: { tag: EXTENSION_PROPORTION_OBSERVER_TAG } } : {}),
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
): BuilderError | undefined {
  return isEdnKeywordName(id)
    ? undefined
    : refuse(doc, "builder/invalid-id", `"${id}" is not a valid EDN keyword`);
}

function invalidIdList(
  doc: CandidateDocument,
  ids: readonly string[] | undefined,
): BuilderError | undefined {
  if (ids === undefined) return undefined;
  const invalid = ids.find((id) => !isEdnKeywordName(id));
  return invalid === undefined ? undefined : invalidId(doc, invalid);
}

function resolveRefOrRaw(
  doc: CandidateDocument,
  component: CandidateSolverComponent,
  raw: string,
  warnings: BuilderWarning[],
): string {
  const resolution = resolveRef(doc, raw, component);
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
  component: CandidateSolverComponent,
  raw: string,
  warnings: BuilderWarning[],
): string {
  const resolution = resolveInferenceRef(doc, raw, component);
  if (resolution.ok) return resolution.id;
  const storedId = softRefId(raw);
  warnings.push({
    code: "builder/unresolved-ref",
    message: `${resolution.message}; stored as id "${storedId}"`,
  });
  return storedId;
}

function parentIdOf(
  doc: CandidateDocument,
  edit: { parentId?: string },
): string {
  return edit.parentId === undefined ? doc.root.id : stripColon(edit.parentId);
}

export function apply(
  doc: CandidateDocument,
  edit: DocumentEdit,
): Effect.Effect<AppliedEdit, BuilderError> {
  const failed = (error: BuilderError) => Effect.fail(error);
  const succeed = (value: AppliedEdit) => Effect.succeed(value);
  const parentId = parentIdOf(doc, edit);

  switch (edit.type) {
    case "add_statement": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidIdList(doc, edit.tags) ??
        invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const scoped = withComponent(doc, parentId, (component) => {
        if (collectIds(component).has(id)) {
          return {
            ok: false,
            code: "builder/duplicate-id",
            message: `Duplicate id "${id}"`,
          };
        }
        const statement: CandidateStatement = {
          kind: "statement",
          id,
          tags: edit.tags ? [...edit.tags] : [],
          extra: [],
          ...(edit.text !== undefined ? { text: edit.text } : {}),
        };
        return {
          ok: true,
          component: withInitialInterface(
            { ...component, elements: [...component.elements, statement] },
            id,
          ),
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "add", kind: "statement", id }],
      });
    }
    case "update_statement": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidIdList(doc, edit.tags) ??
        invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const scoped = withComponent(doc, parentId, (component) => {
        const index = component.elements.findIndex((element) =>
          element.kind === "statement" && element.id === id
        );
        const existing = component.elements[index];
        if (existing === undefined || existing.kind !== "statement") {
          return {
            ok: false,
            code: "builder/missing-id",
            message: `No statement with id "${id}"`,
          };
        }
        const updated: CandidateStatement = {
          ...existing,
          ...(edit.text !== undefined ? { text: edit.text } : {}),
          ...(edit.tags !== undefined ? { tags: [...edit.tags] } : {}),
        };
        const next = [...component.elements];
        next[index] = updated;
        return { ok: true, component: { ...component, elements: next } };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "update", kind: "statement", id }],
      });
    }
    case "add_argument": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidIdList(doc, edit.tags) ??
        invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const scoped = withComponent(doc, parentId, (component) => {
        if (collectIds(component).has(id)) {
          return {
            ok: false,
            code: "builder/duplicate-id",
            message: `Duplicate id "${id}"`,
          };
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
        return {
          ok: true,
          component: withInitialInterface(
            { ...component, elements: [...component.elements, argument] },
            id,
          ),
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "add", kind: "argument", id }],
      });
    }
    case "add_inference": {
      const argumentId = stripColon(edit.argumentId);
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, argumentId) ?? invalidId(doc, id) ??
        invalidIdList(doc, edit.rules) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const warnings: BuilderWarning[] = [];
      const scoped = withComponent(doc, parentId, (component) => {
        if (collectIds(component).has(id)) {
          return {
            ok: false,
            code: "builder/duplicate-id",
            message: `Duplicate id "${id}"`,
          };
        }
        const index = component.elements.findIndex((element) =>
          element.kind === "argument" && element.id === argumentId
        );
        const argument = component.elements[index];
        if (argument === undefined || argument.kind !== "argument") {
          return {
            ok: false,
            code: "builder/missing-id",
            message: `No argument with id "${argumentId}"`,
          };
        }
        const inference: CandidateInference = {
          kind: "inference",
          id,
          premises: edit.premises.map((ref) =>
            resolveRefOrRaw(doc, component, ref, warnings)
          ),
          conclusion: resolveRefOrRaw(
            doc,
            component,
            edit.conclusion,
            warnings,
          ),
          rules: edit.rules ? [...edit.rules] : [],
          extra: [],
        };
        const updated: CandidateArgument = {
          ...argument,
          inferences: [...argument.inferences, inference],
        };
        const next = [...component.elements];
        next[index] = updated;
        return { ok: true, component: { ...component, elements: next } };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings,
        diff: [{ op: "add", kind: "inference", id }],
      });
    }
    case "add_relation": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const warnings: BuilderWarning[] = [];
      const scoped = withComponent(doc, parentId, (component) => {
        if (collectIds(component).has(id)) {
          return {
            ok: false,
            code: "builder/duplicate-id",
            message: `Duplicate id "${id}"`,
          };
        }
        if (!supportedRelationKinds(component.solver).has(edit.kind)) {
          return {
            ok: false,
            code: "builder/unsupported-relation-kind",
            message:
              `${component.solver} does not consume ${edit.kind} relations`,
          };
        }
        const relation: CandidateRelation = {
          kind: edit.kind,
          id,
          from: resolveRefOrRaw(doc, component, edit.from, warnings),
          to: edit.kind === "undercut"
            ? resolveInferenceRefOrRaw(doc, component, edit.to, warnings)
            : resolveRefOrRaw(doc, component, edit.to, warnings),
          extra: [],
        };
        return {
          ok: true,
          component: {
            ...component,
            elements: [...component.elements, relation],
          },
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings,
        diff: [{ op: "add-relation", kind: edit.kind, id }],
      });
    }
    case "add_solver": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      if (!isSolverTag(edit.solver)) {
        return failed(
          refuse(
            doc,
            "builder/unsupported-solver",
            `Unsupported solver tag "${edit.solver}"`,
          ),
        );
      }
      const scoped = withComponent(doc, parentId, (component) => {
        if (collectIds(component).has(id)) {
          return {
            ok: false,
            code: "builder/duplicate-id",
            message: `Duplicate id "${id}"`,
          };
        }
        const child: CandidateSolverComponent = {
          kind: "solver",
          solver: edit.solver,
          id,
          imports: [],
          elements: [],
          extra: [],
        };
        return {
          ok: true,
          component: withInitialInterface(
            { ...component, elements: [...component.elements, child] },
            id,
          ),
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "add", kind: "solver", id }],
      });
    }
    case "set_import": {
      const childId = stripColon(edit.childId);
      const invalid = invalidId(doc, childId) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const scoped = withComponent(doc, parentId, (component) => {
        const child = component.elements.find((element) =>
          element.kind === "solver" && element.id === childId
        );
        if (child === undefined) {
          return {
            ok: false,
            code: "builder/missing-id",
            message: `No child solver with id "${childId}"`,
          };
        }
        if (
          edit.outAtMost < 0 ||
          edit.inAtLeast > 1 ||
          edit.outAtMost >= edit.inAtLeast
        ) {
          return {
            ok: false,
            code: "builder/invalid-projection-bounds",
            message: "Threshold requires 0 <= outAtMost < inAtLeast <= 1",
          };
        }
        const projection = {
          tag: PROJECTION_THRESHOLD_TAG,
          outAtMost: edit.outAtMost,
          inAtLeast: edit.inAtLeast,
          otherwise: null,
        } as const;
        const imports = component.imports.filter(([id]) => id !== childId);
        return {
          ok: true,
          component: {
            ...component,
            imports: [...imports, [childId, projection] as const],
          },
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "set-import", parentId, childId }],
      });
    }
    case "remove_import": {
      const childId = stripColon(edit.childId);
      const invalid = invalidId(doc, childId) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      const scoped = withComponent(doc, parentId, (component) => {
        if (!component.imports.some(([id]) => id === childId)) {
          return {
            ok: false,
            code: "builder/missing-id",
            message: `No import for child "${childId}"`,
          };
        }
        return {
          ok: true,
          component: {
            ...component,
            imports: component.imports.filter(([id]) => id !== childId),
          },
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "remove-import", parentId, childId }],
      });
    }
    case "remove_element": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      let removedKind: CandidateElement["kind"] | "inference" | undefined;
      const scoped = withComponent(doc, parentId, (component) => {
        const index = component.elements.findIndex((element) =>
          element.id === id
        );
        if (index !== -1) {
          const removed = component.elements[index]!;
          removedKind = removed.kind;
          const elements = component.elements.filter((_, elementIndex) =>
            elementIndex !== index
          );
          const imports = removed.kind === "solver"
            ? component.imports.filter(([importId]) => importId !== id)
            : component.imports;
          return {
            ok: true,
            component: repairInterface({ ...component, elements, imports }),
          };
        }
        for (
          let elementIndex = 0;
          elementIndex < component.elements.length;
          elementIndex++
        ) {
          const element = component.elements[elementIndex];
          if (element === undefined || element.kind !== "argument") continue;
          if (!element.inferences.some((inference) => inference.id === id)) {
            continue;
          }
          removedKind = "inference";
          const next = [...component.elements];
          next[elementIndex] = {
            ...element,
            inferences: element.inferences.filter((inference) =>
              inference.id !== id
            ),
          };
          return { ok: true, component: { ...component, elements: next } };
        }
        return {
          ok: false,
          code: "builder/missing-id",
          message: `No element with id "${id}"`,
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      if (removedKind === undefined) {
        return failed(
          refuse(doc, "builder/missing-id", `No element with id "${id}"`),
        );
      }
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "remove", kind: removedKind, id }],
      });
    }
    case "remove_relation": {
      const id = stripColon(edit.id);
      const invalid = invalidId(doc, id) ?? invalidId(doc, parentId);
      if (invalid !== undefined) return failed(invalid);
      let relationKind: CandidateRelation["kind"] | undefined;
      const scoped = withComponent(doc, parentId, (component) => {
        const index = component.elements.findIndex((element) =>
          element.id === id &&
          element.kind !== "statement" &&
          element.kind !== "argument" &&
          element.kind !== "solver"
        );
        if (index === -1) {
          return {
            ok: false,
            code: "builder/missing-id",
            message: `No relation with id "${id}"`,
          };
        }
        const relation = component.elements[index] as CandidateRelation;
        relationKind = relation.kind;
        return {
          ok: true,
          component: {
            ...component,
            elements: component.elements.filter((_, elementIndex) =>
              elementIndex !== index
            ),
          },
        };
      });
      if (!scoped.ok) return failed(scoped.error);
      if (relationKind === undefined) {
        return failed(
          refuse(
            doc,
            "builder/missing-id",
            `No relation with id "${id}"`,
          ),
        );
      }
      return succeed({
        document: scoped.document,
        warnings: [],
        diff: [{ op: "remove-relation", kind: relationKind, id }],
      });
    }
  }
}

/**
 * Legacy `{ document, warnings, refused?, diff }` shape retained for any
 * third-party callers. `apply()` now returns an `Effect`; see `AppliedEdit`
 * for the success-shape and `BuilderError` for the failure-shape.
 */
export type { ApplyResult };
