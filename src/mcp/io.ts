import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { emptyDocument } from "../builder/apply.js";
import { softParse } from "../builder/soft-parse.js";
import { writeEdn } from "../edn-write.js";
import type { CandidateDocument, Diagnostic } from "../model.js";

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

export async function loadDocumentRef(
  ref: DocumentRef,
): Promise<LoadDocResult> {
  if (isPathRef(ref)) {
    try {
      const source = await readFile(ref.path, "utf8");
      const parsed = softParse(source);
      if (!parsed.ok) return parsed;
      return { ok: true, document: parsed.document, ref };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        isError: true,
        errors: [{ code: "mcp/io-error", message }],
      };
    }
  }
  if (isTextRef(ref)) {
    const parsed = softParse(ref.text);
    if (!parsed.ok) return parsed;
    return { ok: true, document: parsed.document, ref };
  }
  return {
    ok: false,
    isError: true,
    errors: [
      {
        code: "mcp/invalid-ref",
        message: "Provide exactly one of path or text",
      },
    ],
  };
}

export async function saveDocumentRef(
  ref: DocumentRef,
  document: CandidateDocument,
): Promise<SaveDocResult> {
  const edn = writeEdn(document);
  if (isTextRef(ref)) return { ok: true, text: edn };
  if (!isPathRef(ref)) {
    return {
      ok: false,
      isError: true,
      errors: [
        {
          code: "mcp/invalid-ref",
          message: "Provide exactly one of path or text",
        },
      ],
    };
  }
  try {
    const tmp = join(dirname(ref.path), `.${Date.now()}.argdown-2.tmp`);
    await writeFile(tmp, edn, "utf8");
    await rename(tmp, ref.path);
    return { ok: true, path: ref.path };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      isError: true,
      errors: [{ code: "mcp/io-error", message }],
    };
  }
}

/** Create a new empty file for path refs, or return empty EDN text. */
export async function createDocumentRef(
  ref: DocumentRef,
): Promise<SaveDocResult> {
  return saveDocumentRef(ref, emptyDocument());
}
