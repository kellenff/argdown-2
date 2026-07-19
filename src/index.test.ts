import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { load, solve, validate } from "./index.js";

const source = `
  #casualtheorics.argdown2.solver/grounded [
    #casualtheorics.argdown2.argdown/statement {:id :a}
    #casualtheorics.argdown2.argdown/statement {:id :b}
    #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
  ]
`;

describe("public API", () => {
  it("loads and solves a valid EDN document", () => {
    const loaded = load(source);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = solve(loaded.document);
    expect("labels" in result).toBe(true);
    if (!("labels" in result)) return;
    expect(Object.fromEntries(result.labels)).toEqual({ a: "in", b: "out" });
    expect(result.solver).toBe("casualtheorics.argdown2.solver/grounded");
    expect(result.warnings).toEqual([]);
  });

  it("returns reader diagnostics without throwing", () => {
    expect(load("{:broken")).toMatchObject({
      ok: false,
      errors: [{ code: "edn/read-error" }],
    });
  });

  it("returns schema diagnostics without throwing", () => {
    expect(load("#other/solver []")).toMatchObject({
      ok: false,
      errors: [{ code: "edn/unsupported-tag" }],
    });
  });

  it("returns semantic diagnostics without a partial document", () => {
    const result = load(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/attack {:from :a :to :missing}
      ]
    `);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toEqual([
      "semantic/missing-reference",
      "semantic/missing-reference",
    ]);
    expect("document" in result).toBe(false);
  });

  it("validates a pre-parsed raw EDN value", async () => {
    const { ednParseMulti } = await import("edn-parser-js");
    const raw = ednParseMulti(source)[0];
    expect(validate(raw).ok).toBe(true);
  });
});
