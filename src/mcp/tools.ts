import { Effect } from "effect";

import { apply } from "../builder/apply.js";
import { parseCandidate } from "../builder/parse-candidate.js";
import type { BuilderError, DocumentEdit } from "../builder/types.js";
import { load, solve } from "../index.js";
import type {
  CandidateDocument,
  CandidateSolverComponent,
  ComponentSolveResult,
  Diagnostic,
  LoadError,
  RelationKind,
} from "../model.js";
import {
  GROUNDED_SOLVER_TAG,
  isEdnKeywordName,
  isSolverTag,
} from "../model.js";
import {
  createDocumentRefEffect as createDocumentRefEffectIO,
  type DocumentRef,
  loadDocumentSourceEffect,
  type McpIoError,
  saveDocumentRefEffect,
} from "./io.js";

type DocRefInput = { path?: string | undefined; source?: string | undefined };
type CreateResult = { readonly path: string } | { readonly text: string };

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

function savedToBody(saved: CreateResult): Record<string, unknown> {
  return "path" in saved ? { path: saved.path } : { source: saved.text };
}

function extractDiagnostics(
  err: {
    _tag: string;
    diagnostic?: Diagnostic;
    diagnostics?: readonly Diagnostic[];
  },
): readonly Diagnostic[] {
  if (err._tag === "RootCount" || err._tag === "ReadError") {
    return [err.diagnostic!];
  }
  return err.diagnostics ?? [];
}

function ioErrorResult(err: McpIoError): McpResult {
  return jsonResult(
    { ok: false, errors: [err.diagnostic] },
    err._tag === "Read" || err._tag === "Write",
  );
}

function loadErrorResult(err: LoadError): McpResult {
  return jsonResult({ ok: false, errors: extractDiagnostics(err) });
}

function builderErrorResult(err: BuilderError): McpResult {
  return jsonResult({
    ok: false,
    refused: { code: err.code, message: err.message },
    warnings: err.warnings,
    diff: [],
  });
}

function runMutation(
  ref: DocumentRef,
  edit: DocumentEdit,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const sourceResult = yield* loadDocumentSourceEffect(ref).pipe(
      Effect.match({
        onFailure: ioErrorResult,
        onSuccess: (source) => source,
      }),
    );
    if ("content" in sourceResult) return sourceResult;

    const parsed = yield* parseCandidate(sourceResult.source).pipe(
      Effect.match({
        onFailure: loadErrorResult,
        onSuccess: (document) => document,
      }),
    );
    if ("content" in parsed) return parsed;

    const applied = yield* apply(parsed, edit).pipe(
      Effect.match({
        onFailure: builderErrorResult,
        onSuccess: (value) => value,
      }),
    );
    if ("content" in applied) return applied;

    return yield* saveDocumentRefEffect(ref, applied.document).pipe(
      Effect.match({
        onFailure: ioErrorResult,
        onSuccess: (saved) =>
          jsonResult({
            ok: true,
            warnings: applied.warnings,
            diff: applied.diff,
            ...savedToBody(saved),
          }),
      }),
    );
  });
}

export function runMcpEffect(
  effect: Effect.Effect<McpResult, never>,
): Promise<McpResult> {
  return Effect.runPromise(effect);
}

type CreateDocumentArgs = DocRefInput & {
  solver?: string | undefined;
  documentId?: string | undefined;
  rootId?: string | undefined;
};

export function runCreateDocumentEffect(
  args: CreateDocumentArgs,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeCreateDocRef(args);
    if (!ref.ok) {
      return jsonResult({ ok: false, errors: ref.errors }, true);
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
    return yield* createDocumentRefEffectIO(
      ref.ref,
      solver,
      documentId,
      rootId,
    ).pipe(
      Effect.match({
        onFailure: ioErrorResult,
        onSuccess: (created) =>
          jsonResult({ ok: true, ...savedToBody(created) }),
      }),
    );
  });
}

export const runCreateDocument = (args: CreateDocumentArgs) =>
  runMcpEffect(runCreateDocumentEffect(args));

type StatementArgs = DocRefInput & {
  id: string;
  text?: string | undefined;
  tags?: readonly string[] | undefined;
  parentId?: string | undefined;
};

export function runAddStatementEffect(
  args: StatementArgs,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeStatementDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "add_statement",
      id: args.id,
      ...(ref.statementText !== undefined ? { text: ref.statementText } : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  });
}

export const runAddStatement = (args: StatementArgs) =>
  runMcpEffect(runAddStatementEffect(args));

export function runUpdateStatementEffect(
  args: StatementArgs,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeStatementDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "update_statement",
      id: args.id,
      ...(ref.statementText !== undefined ? { text: ref.statementText } : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  });
}

export const runUpdateStatement = (args: StatementArgs) =>
  runMcpEffect(runUpdateStatementEffect(args));

type AddArgumentArgs = DocRefInput & {
  id: string;
  description?: string | undefined;
  tags?: readonly string[] | undefined;
  parentId?: string | undefined;
};

export function runAddArgumentEffect(
  args: AddArgumentArgs,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "add_argument",
      id: args.id,
      ...(args.description !== undefined
        ? { description: args.description }
        : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  });
}

export const runAddArgument = (args: AddArgumentArgs) =>
  runMcpEffect(runAddArgumentEffect(args));

type AddInferenceArgs = DocRefInput & {
  argumentId: string;
  id: string;
  premises: readonly string[];
  conclusion: string;
  rules?: readonly string[] | undefined;
  parentId?: string | undefined;
};

export function runAddInferenceEffect(
  args: AddInferenceArgs,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "add_inference",
      argumentId: args.argumentId,
      id: args.id,
      premises: args.premises,
      conclusion: args.conclusion,
      ...(args.rules !== undefined ? { rules: args.rules } : {}),
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  });
}

export const runAddInference = (args: AddInferenceArgs) =>
  runMcpEffect(runAddInferenceEffect(args));

type AddRelationArgs = DocRefInput & {
  id: string;
  kind: RelationKind;
  from: string;
  to: string;
  parentId?: string | undefined;
};

export function runAddRelationEffect(
  args: AddRelationArgs,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "add_relation",
      id: args.id,
      kind: args.kind,
      from: args.from,
      to: args.to,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  });
}

export const runAddRelation = (args: AddRelationArgs) =>
  runMcpEffect(runAddRelationEffect(args));

type AddSolverArgs = DocRefInput & {
  id: string;
  solver: string;
  parentId?: string | undefined;
};

export function runAddSolverEffect(
  args: AddSolverArgs,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
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
    return yield* runMutation(ref.ref, {
      type: "add_solver",
      id: args.id,
      solver: args.solver,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  });
}

export const runAddSolver = (args: AddSolverArgs) =>
  runMcpEffect(runAddSolverEffect(args));

type SetImportArgs = DocRefInput & {
  childId: string;
  outAtMost: number;
  inAtLeast: number;
  parentId?: string | undefined;
};

export function runSetImportEffect(
  args: SetImportArgs,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "set_import",
      childId: args.childId,
      outAtMost: args.outAtMost,
      inAtLeast: args.inAtLeast,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  });
}

export const runSetImport = (args: SetImportArgs) =>
  runMcpEffect(runSetImportEffect(args));

type RemoveImportArgs = DocRefInput & {
  childId: string;
  parentId?: string | undefined;
};

export function runRemoveImportEffect(
  args: RemoveImportArgs,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "remove_import",
      childId: args.childId,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  });
}

export const runRemoveImport = (args: RemoveImportArgs) =>
  runMcpEffect(runRemoveImportEffect(args));

type RemoveArgs = DocRefInput & {
  id: string;
  parentId?: string | undefined;
};

export function runRemoveElementEffect(
  args: RemoveArgs,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "remove_element",
      id: args.id,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  });
}

export const runRemoveElement = (args: RemoveArgs) =>
  runMcpEffect(runRemoveElementEffect(args));

export function runRemoveRelationEffect(
  args: RemoveArgs,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    return yield* runMutation(ref.ref, {
      type: "remove_relation",
      id: args.id,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
    });
  });
}

export const runRemoveRelation = (args: RemoveArgs) =>
  runMcpEffect(runRemoveRelationEffect(args));

export function runListElementsEffect(
  args: DocRefInput,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    const sourceResult = yield* loadDocumentSourceEffect(ref.ref).pipe(
      Effect.match({
        onFailure: ioErrorResult,
        onSuccess: (source) => source,
      }),
    );
    if ("content" in sourceResult) return sourceResult;
    const parsed = yield* parseCandidate(sourceResult.source).pipe(
      Effect.match({
        onFailure: loadErrorResult,
        onSuccess: (document) => document,
      }),
    );
    if ("content" in parsed) return parsed;
    return jsonResult({ ok: true, elements: listElementsFromDoc(parsed) });
  });
}

export const runListElements = (args: DocRefInput) =>
  runMcpEffect(runListElementsEffect(args));

export function runValidateEffect(
  args: DocRefInput,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    const sourceResult = yield* loadDocumentSourceEffect(ref.ref).pipe(
      Effect.match({
        onFailure: ioErrorResult,
        onSuccess: (source) => source,
      }),
    );
    if ("content" in sourceResult) return sourceResult;
    return yield* load(sourceResult.source).pipe(
      Effect.match({
        onFailure: loadErrorResult,
        onSuccess: () => jsonResult({ ok: true }),
      }),
    );
  });
}

export const runValidate = (args: DocRefInput) =>
  runMcpEffect(runValidateEffect(args));

export function runSolveEffect(
  args: DocRefInput,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeDocRef(args);
    if (!ref.ok) return jsonResult({ ok: false, errors: ref.errors }, true);
    const sourceResult = yield* loadDocumentSourceEffect(ref.ref).pipe(
      Effect.match({
        onFailure: ioErrorResult,
        onSuccess: (source) => source,
      }),
    );
    if ("content" in sourceResult) return sourceResult;
    const loaded = yield* load(sourceResult.source).pipe(
      Effect.match({
        onFailure: loadErrorResult,
        onSuccess: (document) => document,
      }),
    );
    if ("content" in loaded) return loaded;
    const solved = yield* solve(loaded);
    return jsonResult({ ok: true, ...serializeSolveResult(solved) });
  });
}

export const runSolve = (args: DocRefInput) =>
  runMcpEffect(runSolveEffect(args));

function listElementsFromDoc(
  doc: CandidateDocument,
): Record<string, unknown>[] {
  return listElementsFromComponent(doc.root);
}

function listElementsFromComponent(
  component: CandidateSolverComponent,
): Record<string, unknown>[] {
  const elements: Record<string, unknown>[] = [];
  for (const element of component.elements) {
    if (element.kind === "statement") {
      elements.push({
        kind: "statement",
        id: element.id,
        ...(element.text !== undefined ? { text: element.text } : {}),
      });
    } else if (element.kind === "argument") {
      elements.push({
        kind: "argument",
        id: element.id,
        ...(element.description !== undefined
          ? { description: element.description }
          : {}),
      });
      for (const inference of element.inferences) {
        elements.push({ kind: "inference", id: inference.id });
      }
    } else if (element.kind === "solver") {
      elements.push({
        kind: "solver",
        id: element.id,
        solver: element.solver,
        elements: listElementsFromComponent(element),
      });
    } else {
      elements.push({
        kind: element.kind,
        id: element.id,
        from: element.from,
        to: element.to,
      });
    }
  }
  return elements;
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
