import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";

import {
  createDocumentRefEffect,
  loadDocumentRefEffect,
  loadDocumentSourceEffect,
  saveDocumentRefEffect,
} from "./io.js";

const VALID_SOURCE = `#casualtheorics.argdown2/document
{:id :test
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :elements
  [#casualtheorics.argdown2.argdown/statement
   {:id :a :text "A"}]}}
`;

function matchEffect<A, E>(eff: Effect.Effect<A, E>) {
  return Effect.match(eff, {
    onFailure: (error) => ({ ok: false as const, error }),
    onSuccess: (value) => ({ ok: true as const, value }),
  });
}

function runEffect<A, E>(eff: Effect.Effect<A, E>) {
  return Effect.runSync(matchEffect(eff));
}

function runEffectAsync<A, E>(eff: Effect.Effect<A, E>) {
  return Effect.runPromise(matchEffect(eff));
}

describe("mcp/io (Effect)", () => {
  it("loadDocumentSourceEffect reads a path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argdown-mcp-io-"));
    const path = join(dir, "doc.edn");
    await Deno.writeTextFile(path, VALID_SOURCE);
    const res = await runEffectAsync(loadDocumentSourceEffect({ path }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value._tag).toBe("Path");
      if (res.value._tag === "Path") {
        expect(res.value.source).toContain("argdown2.solver/grounded");
      }
    }
    await rm(dir, { recursive: true, force: true });
  });

  it("loadDocumentSourceEffect returns Text for a text ref", () => {
    const res = runEffect(loadDocumentSourceEffect({ text: "" }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value._tag).toBe("Text");
      if (res.value._tag === "Text") expect(res.value.source).toBe("");
    }
  });

  it("loadDocumentSourceEffect fails with Read on a missing path", async () => {
    const res = await runEffectAsync(
      loadDocumentSourceEffect({ path: "/does/not/exist.edn" }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error._tag).toBe("Read");
  });

  it("loadDocumentSourceEffect fails with Parse on an invalid ref", () => {
    const res = runEffect(
      loadDocumentSourceEffect(
        {} as unknown as Parameters<typeof loadDocumentSourceEffect>[0],
      ),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error._tag).toBe("Parse");
  });

  it("loadDocumentRefEffect parses a text ref into a CandidateDocument", () => {
    const res = runEffect(
      loadDocumentRefEffect({
        text: VALID_SOURCE,
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.document.root.elements.length).toBeGreaterThan(0);
      expect(res.value.ref.text).toBeDefined();
    }
  });

  it("saveDocumentRefEffect round-trips a text ref synchronously", () => {
    const res = runEffect(
      saveDocumentRefEffect(
        { text: "" },
        {
          id: "d",
          root: {
            kind: "solver",
            solver: "casualtheorics.argdown2.solver/grounded",
            id: "root",
            imports: [],
            elements: [],
            extra: [],
          },
          extra: [],
        },
      ),
    );
    expect(res.ok).toBe(true);
    if (res.ok && "text" in res.value) {
      expect(res.value.text).toContain(
        "casualtheorics.argdown2.solver/grounded",
      );
    }
  });

  it("saveDocumentRefEffect writes a path file via atomic rename", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argdown-mcp-io-"));
    const path = join(dir, "doc.edn");
    const res = await runEffectAsync(
      saveDocumentRefEffect(
        { path },
        {
          id: "d",
          root: {
            kind: "solver",
            solver: "casualtheorics.argdown2.solver/grounded",
            id: "root",
            imports: [],
            elements: [],
            extra: [],
          },
          extra: [],
        },
      ),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect("path" in res.value).toBe(true);
    const text = await Deno.readTextFile(path);
    expect(text).toContain("casualtheorics.argdown2.solver/grounded");
    await rm(dir, { recursive: true, force: true });
  });

  it("saveDocumentRefEffect fails with Write on a non-existent directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argdown-mcp-io-"));
    const path = join(dir, "no-such-subdir/doc.edn");
    const res = await runEffectAsync(
      saveDocumentRefEffect(
        { path },
        {
          id: "d",
          root: {
            kind: "solver",
            solver: "casualtheorics.argdown2.solver/grounded",
            id: "root",
            imports: [],
            elements: [],
            extra: [],
          },
          extra: [],
        },
      ),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error._tag).toBe("Write");
    await rm(dir, { recursive: true, force: true });
  });

  it("createDocumentRefEffect writes a path file with default content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "argdown-mcp-io-"));
    const path = join(dir, "doc.edn");
    const res = await runEffectAsync(createDocumentRefEffect({ path }));
    expect(res.ok).toBe(true);
    if (res.ok && "path" in res.value) expect(res.value.path).toBe(path);
    const text = await Deno.readTextFile(path);
    expect(text).toContain("casualtheorics.argdown2.solver/grounded");
    await rm(dir, { recursive: true, force: true });
  });
});
