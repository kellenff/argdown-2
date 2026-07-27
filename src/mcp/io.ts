import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Effect } from "effect";

import { emptyDocument } from "../builder/apply.js";
import { parseCandidate } from "../builder/parse-candidate.js";
import { writeEdn } from "../edn-write.js";
import type { CandidateDocument, Diagnostic, SolverTag } from "../model.js";
import { GROUNDED_SOLVER_TAG } from "../model.js";

/** Source of a document, with the original location preserved. */
export type DocumentSource =
  | { readonly _tag: "Path"; readonly path: string; readonly source: string }
  | { readonly _tag: "Text"; readonly source: string };

/** Tagged union of all filesystem-level failures from the MCP I/O layer. */
export type McpIoError =
  | { readonly _tag: "Read"; readonly diagnostic: Diagnostic }
  | { readonly _tag: "Write"; readonly diagnostic: Diagnostic }
  | { readonly _tag: "Parse"; readonly diagnostic: Diagnostic };

export type DocumentRef = { path: string; text?: undefined } | {
  text: string;
  path?: undefined;
};

export type LoadDocResult =
  | { ok: true; document: CandidateDocument; ref: DocumentRef }
  | { ok: false; errors: readonly Diagnostic[]; isError?: boolean };

export type SaveDocResult =
  | { ok: true; path: string }
  | { ok: true; text: string }
  | { ok: false; errors: readonly Diagnostic[]; isError?: boolean };

function isPathRef(ref: DocumentRef): ref is { path: string } {
  return (
    typeof (ref as { path?: string }).path === "string" &&
    (ref as { text?: string }).text === undefined
  );
}

function isTextRef(ref: DocumentRef): ref is { text: string } {
  return (
    typeof (ref as { text?: string }).text === "string" &&
    (ref as { path?: string }).path === undefined
  );
}

function ioErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Effect-based parser: read source text → CandidateDocument. */
function parseDocumentSourceEffect(
  source: string,
): Effect.Effect<CandidateDocument, McpIoError> {
  return parseCandidate(source).pipe(
    Effect.mapError((err): McpIoError => {
      if (err._tag === "Schema") {
        return {
          _tag: "Parse",
          diagnostic: {
            code: "mcp/schema",
            message: err.diagnostics.map((d) => d.message).join("; "),
          },
        };
      }
      return { _tag: "Parse", diagnostic: err.diagnostic };
    }),
  );
}

/** Effect-based read of a document source. Path refs use filesystem I/O. */
export function loadDocumentSourceEffect(
  ref: DocumentRef,
): Effect.Effect<DocumentSource, McpIoError> {
  if (isPathRef(ref)) {
    return Effect.tryPromise({
      try: async () => {
        const source = await readFile(ref.path, "utf8");
        return { _tag: "Path" as const, path: ref.path, source };
      },
      catch: (error) => ({
        _tag: "Read" as const,
        diagnostic: {
          code: "mcp/io-error",
          message: ioErrorMessage(error),
        },
      }),
    });
  }
  if (isTextRef(ref)) {
    return Effect.succeed({ _tag: "Text" as const, source: ref.text });
  }
  return Effect.fail({
    _tag: "Parse" as const,
    diagnostic: {
      code: "mcp/invalid-ref",
      message: "Provide exactly one of path or text",
    },
  });
}

/** Combined read+parse for `loadDocumentRef`. */
export function loadDocumentRefEffect(
  ref: DocumentRef,
): Effect.Effect<
  { readonly document: CandidateDocument; readonly ref: DocumentRef },
  McpIoError
> {
  return Effect.gen(function* () {
    const source: DocumentSource = yield* loadDocumentSourceEffect(ref);
    const document = yield* parseDocumentSourceEffect(source.source);
    return { document, ref };
  });
}

export function saveDocumentRefEffect(
  ref: DocumentRef,
  document: CandidateDocument,
): Effect.Effect<
  { readonly path: string } | { readonly text: string },
  McpIoError
> {
  const edn = writeEdn(document);
  if (isTextRef(ref)) return Effect.succeed({ text: edn });
  if (!isPathRef(ref)) {
    return Effect.fail({
      _tag: "Write",
      diagnostic: {
        code: "mcp/invalid-ref",
        message: "Provide exactly one of path or text",
      },
    });
  }
  return Effect.tryPromise({
    try: async () => {
      const tmp = join(dirname(ref.path), `.${Date.now()}.argdown-2.tmp`);
      await writeFile(tmp, edn, "utf8");
      await rename(tmp, ref.path);
      return { path: ref.path };
    },
    catch: (error) => ({
      _tag: "Write" as const,
      diagnostic: {
        code: "mcp/io-error",
        message: ioErrorMessage(error),
      },
    }),
  });
}

export function createDocumentRefEffect(
  ref: DocumentRef,
  solver: SolverTag = GROUNDED_SOLVER_TAG,
  documentId = "document",
  rootId = "root",
): Effect.Effect<
  { readonly path: string } | { readonly text: string },
  McpIoError
> {
  return saveDocumentRefEffect(
    ref,
    emptyDocument(solver, documentId, rootId),
  );
}

function saveOutcomeToSaveDocResult(
  outcome:
    | { ok: true; value: { readonly path: string } | { readonly text: string } }
    | { ok: false; err: McpIoError },
): SaveDocResult {
  if (!outcome.ok) {
    return {
      ok: false,
      errors: [outcome.err.diagnostic],
      isError: outcome.err._tag === "Write",
    };
  }
  if ("text" in outcome.value) return { ok: true, text: outcome.value.text };
  return { ok: true, path: outcome.value.path };
}

/**
 * Legacy Promise wrapper that re-routes through the new Effect helpers.
 * Preserves the existing `LoadDocResult` / `SaveDocResult` shape so
 * `src/mcp/tools.ts` keeps compiling until Task 7 deletes it.
 */
export async function loadDocumentRef(
  ref: DocumentRef,
): Promise<LoadDocResult> {
  const outcome = await Effect.runPromise(
    Effect.match(loadDocumentRefEffect(ref), {
      onFailure: (err) => ({ ok: false as const, err }),
      onSuccess: (value) => ({ ok: true as const, value }),
    }),
  );
  if (!outcome.ok) {
    return {
      ok: false,
      errors: [outcome.err.diagnostic],
      isError: outcome.err._tag === "Read",
    };
  }
  return { ok: true, document: outcome.value.document, ref: outcome.value.ref };
}

export async function saveDocumentRef(
  ref: DocumentRef,
  document: CandidateDocument,
): Promise<SaveDocResult> {
  const outcome = await Effect.runPromise(
    Effect.match(saveDocumentRefEffect(ref, document), {
      onFailure: (err) => ({ ok: false as const, err }),
      onSuccess: (value) => ({ ok: true as const, value }),
    }),
  );
  return saveOutcomeToSaveDocResult(outcome);
}

/** Create a new empty file for path refs, or return empty EDN text. */
export async function createDocumentRef(
  ref: DocumentRef,
  solver: SolverTag = GROUNDED_SOLVER_TAG,
  documentId = "document",
  rootId = "root",
): Promise<SaveDocResult> {
  const outcome = await Effect.runPromise(
    Effect.match(
      createDocumentRefEffect(ref, solver, documentId, rootId),
      {
        onFailure: (err) => ({ ok: false as const, err }),
        onSuccess: (value) => ({ ok: true as const, value }),
      },
    ),
  );
  return saveOutcomeToSaveDocResult(outcome);
}
