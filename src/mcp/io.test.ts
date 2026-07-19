import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { emptyDocument } from "../builder/apply.js";
import { writeEdn } from "../edn-write.js";
import { type DocumentRef, loadDocumentRef, saveDocumentRef } from "./io.js";

describe("mcp io", () => {
  it("loads and saves path refs in place", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argdown-mcp-"));
    const path = join(dir, "doc.edn");
    await writeFile(path, writeEdn(emptyDocument()), "utf8");
    const loaded = await loadDocumentRef({ path });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const next = {
      ...loaded.document,
      elements: [
        {
          kind: "statement" as const,
          id: "a",
          text: "A",
          tags: [],
          extra: [],
        },
      ],
    };
    const saved = await saveDocumentRef({ path }, next);
    expect(saved.ok).toBe(true);
    const body = await readFile(path, "utf8");
    expect(body).toContain(":a");
  });

  it("loads text refs and save returns text without disk", async () => {
    const ref: DocumentRef = { text: writeEdn(emptyDocument()) };
    const loaded = await loadDocumentRef(ref);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const saved = await saveDocumentRef(ref, loaded.document);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect("text" in saved && saved.text).toContain("grounded");
  });

  it("errors when both path and text provided", async () => {
    const result = await loadDocumentRef(
      { path: "x", text: "y" } as unknown as DocumentRef,
    );
    expect(result.ok).toBe(false);
  });
});
