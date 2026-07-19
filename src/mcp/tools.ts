import { readFile } from "node:fs/promises";

import { apply } from "../builder/apply.js";
import type { DocumentEdit } from "../builder/types.js";
import { load, solve } from "../index.js";
import type {
  CandidateDocument,
  Diagnostic,
  MultiSolveResult,
  RelationKind,
  SolveResult,
} from "../model.js";
import { GROUNDED_SOLVER_TAG, isSolverTag } from "../model.js";
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
  const elements: Record<string, unknown>[] = [];
  for (const el of doc.elements) {
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
    } else if (el.kind === "nested-solver") {
      elements.push({
        kind: "nested-solver",
        solver: el.document.solver,
        elements: listElementsFromDoc(el.document),
      });
    } else {
      elements.push({ kind: el.kind, from: el.from, to: el.to });
    }
  }
  return elements;
}

export async function runCreateDocument(
  args: DocRefInput & { solver?: string | undefined },
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
  const result = await createDocumentRef(refResult.ref, solver);
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
  };
  return applyMutation(refResult.ref, edit);
}

export async function runUpdateStatement(
  args: DocRefInput & {
    id: string;
    text?: string | undefined;
    tags?: readonly string[] | undefined;
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
  };
  return applyMutation(refResult.ref, edit);
}

export async function runAddArgument(
  args: DocRefInput & {
    id: string;
    description?: string | undefined;
    tags?: readonly string[] | undefined;
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
  };
  return applyMutation(refResult.ref, edit);
}

export async function runAddRelation(
  args: DocRefInput & {
    kind: RelationKind;
    from: string;
    to: string;
  },
): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const edit: DocumentEdit = {
    type: "add_relation",
    kind: args.kind,
    from: args.from,
    to: args.to,
  };
  return applyMutation(refResult.ref, edit);
}

export async function runRemoveElement(
  args: DocRefInput & { id: string },
): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  return applyMutation(refResult.ref, { type: "remove_element", id: args.id });
}

export async function runRemoveRelation(
  args: DocRefInput & {
    kind: RelationKind;
    from: string;
    to: string;
  },
): Promise<McpResult> {
  const refResult = normalizeDocRef(args);
  if (!refResult.ok) {
    return jsonResult({ ok: false, errors: refResult.errors }, true);
  }
  const edit: DocumentEdit = {
    type: "remove_relation",
    kind: args.kind,
    from: args.from,
    to: args.to,
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
  solved: MultiSolveResult | SolveResult,
): Record<string, unknown> {
  const nested = solved.nested.map(serializeSolveResult);
  if ("labels" in solved) {
    return {
      labels: Object.fromEntries(solved.labels),
      nested,
      solver: solved.solver,
      warnings: solved.warnings,
    };
  }
  return {
    extensions: solved.extensions.map((extension) => [...extension].sort()),
    nested,
    solver: solved.solver,
    warnings: solved.warnings,
  };
}
