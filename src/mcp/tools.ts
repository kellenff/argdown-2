import { readFile } from "node:fs/promises";

import { apply } from "../builder/apply.js";
import type { DocumentEdit } from "../builder/types.js";
import { load, solve } from "../index.js";
import type {
  CandidateDocument,
  CandidateSolverComponent,
  ComponentSolveResult,
  Diagnostic,
  RelationKind,
} from "../model.js";
import {
  GROUNDED_SOLVER_TAG,
  isEdnKeywordName,
  isSolverTag,
} from "../model.js";
import {
  createDocumentRef,
  type DocumentRef,
  loadDocumentRef,
  saveDocumentRef,
} from "./io.js";

type DocRefInput = { path?: string | undefined; source?: string | undefined };

type McpResult = {
  content: [{ type: "text"; text: string }];
  isError?: boolean;
};

function jsonResult(body: unknown, isError = false): McpResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(body) }],
    ...(isError ? { isError: true } : {}),
  };
}

const INVALID_REF_ERROR: Diagnostic = {
  code: "mcp/invalid-ref",
  message: "Provide exactly one of path or source",
};

function toTextRef(source: string): DocumentRef {
  return { text: source };
}

function normalizeDocRef(
  input: DocRefInput,
): { ok: true; ref: DocumentRef } | {
  ok: false;
  errors: readonly Diagnostic[];
} {
  const hasPath = input.path !== undefined;
  const hasSource = input.source !== undefined;
  if (hasPath === hasSource) {
    return { ok: false, errors: [INVALID_REF_ERROR] };
  }
  if (hasPath) return { ok: true, ref: { path: input.path! } };
  return { ok: true, ref: toTextRef(input.source!) };
}

function normalizeStatementDocRef(
  input: DocRefInput & { text?: string | undefined },
):
  | { ok: true; ref: DocumentRef; statementText?: string }
  | { ok: false; errors: readonly Diagnostic[] } {
  const hasPath = input.path !== undefined;
  const hasSource = input.source !== undefined;
  if (hasPath === hasSource) {
    return { ok: false, errors: [INVALID_REF_ERROR] };
  }
  const ref: DocumentRef = hasPath
    ? { path: input.path! }
    : toTextRef(input.source!);
  return {
    ok: true,
    ref,
    ...(input.text !== undefined ? { statementText: input.text } : {}),
  };
}

function normalizeCreateDocRef(
  input: DocRefInput,
): { ok: true; ref: DocumentRef } | {
  ok: false;
  errors: readonly Diagnostic[];
} {
  const hasPath = input.path !== undefined;
  const hasSource = input.source !== undefined;
  if (hasPath && hasSource) {
    return { ok: false, errors: [INVALID_REF_ERROR] };
  }
  if (hasPath) return { ok: true, ref: { path: input.path! } };
  return { ok: true, ref: toTextRef(input.source ?? "") };
}

async function readSource(
  input: DocRefInput,
): Promise<
  { ok: true; source: string } | {
    ok: false;
    errors: readonly Diagnostic[];
    isError?: boolean;
  }
> {
  const refResult = normalizeDocRef(input);
  if (!refResult.ok) {
    return { ok: false, errors: refResult.errors, isError: true };
  }
  if ("path" in refResult.ref && refResult.ref.path !== undefined) {
    try {
      const source = await readFile(refResult.ref.path, "utf8");
      return { ok: true, source };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        isError: true,
        errors: [{ code: "mcp/io-error", message }],
      };
    }
  }
  return { ok: true, source: refResult.ref.text };
}

async function applyMutation(
  ref: DocumentRef,
  edit: DocumentEdit,
): Promise<McpResult> {
  const loaded = await loadDocumentRef(ref);
  if (!loaded.ok) {
    return jsonResult(
      { ok: false, errors: loaded.errors },
      loaded.isError ?? false,
    );
  }

  const applied = apply(loaded.document, edit);
  if (applied.refused) {
    return jsonResult({
      ok: false,
      refused: applied.refused,
      warnings: applied.warnings,
      diff: [],
    });
  }

  const saved = await saveDocumentRef(ref, applied.document);
  if (!saved.ok) {
    return jsonResult(
      { ok: false, errors: saved.errors },
      saved.isError ?? false,
    );
  }

  const body: Record<string, unknown> = {
    ok: true,
    warnings: applied.warnings,
    diff: applied.diff,
  };
  if ("path" in saved) body.path = saved.path;
  else body.source = saved.text;
  return jsonResult(body);
}

function listElementsFromDoc(
  doc: CandidateDocument,
): Record<string, unknown>[] {
  return listElementsFromComponent(doc.root);
}

function listElementsFromComponent(
  component: CandidateSolverComponent,
): Record<string, unknown>[] {
  const elements: Record<string, unknown>[] = [];
  for (const el of component.elements) {
    if (el.kind === "statement") {
      elements.push({
        kind: "statement",
        id: el.id,
        ...(el.text !== undefined ? { text: el.text } : {}),
      });
    } else if (el.kind === "argument") {
      elements.push({
        kind: "argument",
        id: el.id,
        ...(el.description !== undefined
          ? { description: el.description }
          : {}),
      });
      for (const inf of el.inferences) {
        elements.push({ kind: "inference", id: inf.id });
      }
    } else if (el.kind === "solver") {
      elements.push({
        kind: "solver",
        id: el.id,
        solver: el.solver,
        elements: listElementsFromComponent(el),
      });
    } else {
      elements.push({ kind: el.kind, id: el.id, from: el.from, to: el.to });
    }
  }
  return elements;
}

export async function runCreateDocument(
  args: DocRefInput & {
    solver?: string | undefined;
    documentId?: string | undefined;
    rootId?: string | undefined;
  },
): Promise<McpResult> {
  const refResult = normalizeCreateDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const solver = args.solver ?? GROUNDED_SOLVER_TAG;
  if (!isSolverTag(solver)) {
    return jsonResult({
      ok: false,
      errors: [{
        code: "mcp/invalid-solver",
        message: `Unsupported solver tag: ${solver}`,
      }],
    }, true);
  }
  const documentId = args.documentId ?? "document";
  const rootId = args.rootId ?? "root";
  const invalidId = [documentId, rootId].find((id) => !isEdnKeywordName(id));
  if (invalidId !== undefined) {
    return jsonResult({
      ok: false,
      errors: [{
        code: "mcp/invalid-id",
        message: `"${invalidId}" is not a valid EDN keyword`,
      }],
    }, true);
  }
  const result = await createDocumentRef(
    refResult.ref,
    solver,
    documentId,
    rootId,
  );
  if (!result.ok) {
    return jsonResult(
      { ok: false, errors: result.errors },
      result.isError ?? false,
    );
  }
  if ("path" in result) return jsonResult({ ok: true, path: result.path });
  return jsonResult({ ok: true, source: result.text });
}

export async function runAddStatement(
  args: DocRefInput & {
    id: string;
    text?: string | undefined;
    tags?: readonly string[] | undefined;
    parentId?: string | undefined;
  },
): Promise<McpResult> {
  const refResult = normalizeStatementDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const edit: DocumentEdit = {
    type: "add_statement",
    id: args.id,
    ...(refResult.statementText !== undefined
      ? { text: refResult.statementText }
      : {}),
    ...(args.tags !== undefined ? { tags: args.tags } : {}),
    ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
  };
  return applyMutation(refResult.ref, edit);
}

export async function runUpdateStatement(
  args: DocRefInput & {
    id: string;
    text?: string | undefined;
    tags?: readonly string[] | undefined;
    parentId?: string | undefined;
  },
): Promise<McpResult> {
  const refResult = normalizeStatementDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const edit: DocumentEdit = {
    type: "update_statement",
    id: args.id,
    ...(refResult.statementText !== undefined
      ? { text: refResult.statementText }
      : {}),
    ...(args.tags !== undefined ? { tags: args.tags } : {}),
    ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
  };
  return applyMutation(refResult.ref, edit);
}

export async function runAddArgument(
  args: DocRefInput & {
    id: string;
    description?: string | undefined;
    tags?: readonly string[] | undefined;
    parentId?: string | undefined;
  },
): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const edit: DocumentEdit = {
    type: "add_argument",
    id: args.id,
    ...(args.description !== undefined
      ? { description: args.description }
      : {}),
    ...(args.tags !== undefined ? { tags: args.tags } : {}),
    ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
  };
  return applyMutation(refResult.ref, edit);
}

export async function runAddInference(
  args: DocRefInput & {
    argumentId: string;
    id: string;
    premises: readonly string[];
    conclusion: string;
    rules?: readonly string[] | undefined;
    parentId?: string | undefined;
  },
): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const edit: DocumentEdit = {
    type: "add_inference",
    argumentId: args.argumentId,
    id: args.id,
    premises: args.premises,
    conclusion: args.conclusion,
    ...(args.rules !== undefined ? { rules: args.rules } : {}),
    ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
  };
  return applyMutation(refResult.ref, edit);
}

export async function runAddRelation(
  args: DocRefInput & {
    id: string;
    kind: RelationKind;
    from: string;
    to: string;
    parentId?: string | undefined;
  },
): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const edit: DocumentEdit = {
    type: "add_relation",
    id: args.id,
    kind: args.kind,
    from: args.from,
    to: args.to,
    ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
  };
  return applyMutation(refResult.ref, edit);
}

export async function runAddSolver(
  args: DocRefInput & {
    id: string;
    solver: string;
    parentId?: string | undefined;
  },
): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  if (!isSolverTag(args.solver)) {
    return jsonResult({
      ok: false,
      refused: {
        code: "builder/unsupported-solver",
        message: `Unsupported solver tag "${args.solver}"`,
      },
      warnings: [],
      diff: [],
    });
  }
  const edit: DocumentEdit = {
    type: "add_solver",
    id: args.id,
    solver: args.solver,
    ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
  };
  return applyMutation(refResult.ref, edit);
}

export async function runSetImport(
  args: DocRefInput & {
    childId: string;
    outAtMost: number;
    inAtLeast: number;
    parentId?: string | undefined;
  },
): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const edit: DocumentEdit = {
    type: "set_import",
    childId: args.childId,
    outAtMost: args.outAtMost,
    inAtLeast: args.inAtLeast,
    ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
  };
  return applyMutation(refResult.ref, edit);
}

export async function runRemoveImport(
  args: DocRefInput & {
    childId: string;
    parentId?: string | undefined;
  },
): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const edit: DocumentEdit = {
    type: "remove_import",
    childId: args.childId,
    ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
  };
  return applyMutation(refResult.ref, edit);
}

export async function runRemoveElement(
  args: DocRefInput & { id: string; parentId?: string | undefined },
): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  return applyMutation(refResult.ref, {
    type: "remove_element",
    id: args.id,
    ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
  });
}

export async function runRemoveRelation(
  args: DocRefInput & { id: string; parentId?: string | undefined },
): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const edit: DocumentEdit = {
    type: "remove_relation",
    id: args.id,
    ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
  };
  return applyMutation(refResult.ref, edit);
}

export async function runListElements(args: DocRefInput): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const loaded = await loadDocumentRef(refResult.ref);
  if (!loaded.ok) {
    return jsonResult(
      { ok: false, errors: loaded.errors },
      loaded.isError ?? false,
    );
  }
  return jsonResult({
    ok: true,
    elements: listElementsFromDoc(loaded.document),
  });
}

export async function runValidate(args: DocRefInput): Promise<McpResult> {
  const sourceResult = await readSource(args);
  if (!sourceResult.ok) {
    return jsonResult(
      { ok: false, errors: sourceResult.errors },
      sourceResult.isError ?? false,
    );
  }
  const result = load(sourceResult.source);
  if (!result.ok) {
    return jsonResult({ ok: false, errors: result.errors });
  }
  return jsonResult({ ok: true });
}

export async function runSolve(args: DocRefInput): Promise<McpResult> {
  const sourceResult = await readSource(args);
  if (!sourceResult.ok) {
    return jsonResult(
      { ok: false, errors: sourceResult.errors },
      sourceResult.isError ?? false,
    );
  }
  const result = load(sourceResult.source);
  if (!result.ok) {
    return jsonResult({ ok: false, errors: result.errors });
  }
  return jsonResult({
    ok: true,
    ...serializeSolveResult(solve(result.document)),
  });
}

function serializeSolveResult(
  solved: ComponentSolveResult,
): Record<string, unknown> {
  const children = Object.fromEntries(
    [...solved.children].map(([id, child]) => [
      id,
      serializeSolveResult(child),
    ]),
  );
  return {
    id: solved.id,
    solver: solved.solver,
    native: solved.native.kind === "labels"
      ? { kind: "labels", values: Object.fromEntries(solved.native.values) }
      : {
        kind: "extensions",
        values: solved.native.values.map((extension) => [...extension].sort()),
      },
    aggregate: solved.aggregate,
    boundary: solved.boundary,
    children,
    warnings: solved.warnings,
  };
}
