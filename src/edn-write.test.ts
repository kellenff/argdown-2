import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { apply, emptyDocument } from "./builder/apply.js";
import { parseCandidate } from "./builder/parse-candidate.js";
import type { DocumentEdit } from "./builder/types.js";
import { writeEdn } from "./edn-write.js";
import type { CandidateDocument } from "./model.js";
import { runLoad } from "./test-support.js";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "builder/fixtures",
);

function runParseCandidate(source: string) {
  return Effect.runSync(
    Effect.match(parseCandidate(source), {
      onFailure: (err) => ({ ok: false as const, error: err }),
      onSuccess: (document) => ({ ok: true as const, document }),
    }),
  );
}

function applyOk(
  doc: CandidateDocument,
  edit: DocumentEdit,
): CandidateDocument {
  const result = Effect.runSync(apply(doc, edit));
  return result.document;
}

describe("writeEdn", () => {
  it("round-trips a builder-built attack document through load", () => {
    let doc = emptyDocument();
    doc = applyOk(doc, { type: "add_statement", id: "a", text: "Alpha" });
    doc = applyOk(doc, { type: "add_statement", id: "b", text: "Beta" });
    doc = applyOk(doc, {
      type: "add_relation",
      id: "attack-a-b",
      kind: "attack",
      from: "a",
      to: "b",
    });
    const edn = writeEdn(doc);
    const loaded = runLoad(edn);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.document.root.elements).toHaveLength(3);
  });

  it("loads the hand fixture", () => {
    const source = readFileSync(
      join(fixtureDir, "two-statements-attack.edn"),
      "utf8",
    );
    expect(runLoad(source).ok).toBe(true);
  });

  it("round-trips unresolved prose refs through parseCandidate", () => {
    let doc = emptyDocument();
    doc = applyOk(doc, {
      type: "add_argument",
      id: "freedom",
      description: "Freedom argument",
    });
    doc = applyOk(doc, {
      type: "add_inference",
      argumentId: "freedom",
      id: "freedom-main",
      premises: ["Absolute freedom is a right"],
      conclusion: "Censorship is wrong",
    });
    const edn = writeEdn(doc);
    const parsed = runParseCandidate(edn);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const arg = parsed.document.root.elements.find((e) =>
      e.kind === "argument"
    );
    expect(arg?.kind).toBe("argument");
    if (arg?.kind !== "argument") return;
    expect(arg.inferences[0]).toMatchObject({
      premises: ["absolute-freedom-is-a-right"],
      conclusion: "censorship-is-wrong",
    });
  });

  it("round-trips an argument with inference through load", () => {
    let doc = emptyDocument();
    doc = applyOk(doc, {
      type: "add_statement",
      id: "premise-a",
      text: "Premise A",
    });
    doc = applyOk(doc, {
      type: "add_statement",
      id: "premise-b",
      text: "Premise B",
    });
    doc = applyOk(doc, {
      type: "add_statement",
      id: "conclusion",
      text: "Conclusion",
    });
    doc = applyOk(doc, {
      type: "add_argument",
      id: "main-argument",
      description: "A simple inference chain",
      tags: ["pro"],
    });
    doc = applyOk(doc, {
      type: "add_inference",
      argumentId: "main-argument",
      id: "main-inference",
      premises: ["premise-a", "premise-b"],
      conclusion: "conclusion",
      rules: ["modus-ponens"],
    });
    const edn = writeEdn(doc);
    const loaded = runLoad(edn);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.document.root.elements).toHaveLength(4);
    const arg = loaded.document.root.elements.find((e) =>
      e.kind === "argument"
    );
    expect(arg?.kind).toBe("argument");
    if (arg?.kind !== "argument") return;
    expect(arg.inferences).toHaveLength(1);
    expect(arg.inferences[0]).toMatchObject({
      id: "main-inference",
      premises: ["premise-a", "premise-b"],
      conclusion: "conclusion",
      rules: ["modus-ponens"],
    });
  });
});
