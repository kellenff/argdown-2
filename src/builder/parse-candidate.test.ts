import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { writeEdn } from "../edn-write.js";
import { runLoad } from "../test-support.js";
import { parseCandidate } from "./parse-candidate.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/two-statements-attack.edn",
);

function runParseCandidate(source: string) {
  return Effect.runSync(
    Effect.match(parseCandidate(source), {
      onFailure: (err) => ({ ok: false as const, error: err }),
      onSuccess: (document) => ({ ok: true as const, document }),
    }),
  );
}

describe("parseCandidate", () => {
  it("decodes fixture without semantic validate", () => {
    const source = readFileSync(fixture, "utf8");
    const parsed = runParseCandidate(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.root.elements).toHaveLength(3);
  });

  it("round-trips fixture through writeEdn then load", () => {
    const source = readFileSync(fixture, "utf8");
    const parsed = runParseCandidate(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const written = writeEdn(parsed.document);
    expect(runLoad(written).ok).toBe(true);
  });

  it("fails for empty input", () => {
    const parsed = runParseCandidate("");
    expect(parsed.ok).toBe(false);
  });
});
