import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { softParse } from "./soft-parse.js";
import { writeEdn } from "../edn-write.js";
import { load } from "../index.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/two-statements-attack.edn",
);

describe("softParse", () => {
  it("decodes fixture without semantic validate", () => {
    const source = readFileSync(fixture, "utf8");
    const parsed = softParse(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.elements).toHaveLength(3);
  });

  it("round-trips fixture through writeEdn then load", () => {
    const source = readFileSync(fixture, "utf8");
    const parsed = softParse(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const written = writeEdn(parsed.document);
    expect(load(written).ok).toBe(true);
  });

  it("returns errors for empty input", () => {
    const parsed = softParse("");
    expect(parsed.ok).toBe(false);
  });
});
