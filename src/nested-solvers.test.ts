import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { softParse } from "./builder/soft-parse.js";
import { writeEdn } from "./edn-write.js";
import { load, solve } from "./index.js";
import { PREFERRED_SOLVER_TAG } from "./model.js";

const nestedGrounded = `
  #casualtheorics.argdown2.solver/grounded [
    #casualtheorics.argdown2.argdown/statement {:id :parent}

    #casualtheorics.argdown2.solver/grounded [
      #casualtheorics.argdown2.argdown/statement {:id :a}
      #casualtheorics.argdown2.argdown/statement {:id :b}
      #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
    ]
  ]
`;

describe("nested solvers POC", () => {
  it("loads and solves grounded-in-grounded independently", () => {
    const loaded = load(nestedGrounded);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const result = solve(loaded.document);
    expect("labels" in result).toBe(true);
    if (!("labels" in result)) return;

    expect(Object.fromEntries(result.labels)).toEqual({ parent: "in" });
    expect(result.nested).toHaveLength(1);
    const nest = result.nested[0]!;
    expect("labels" in nest).toBe(true);
    if (!("labels" in nest)) return;
    expect(Object.fromEntries(nest.labels)).toEqual({ a: "in", b: "out" });
    expect(nest.nested).toEqual([]);
  });

  it("rejects mismatched nested solver tags", () => {
    const result = load(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.solver/bipolar []
      ]
    `);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "schema/nested-solver-mismatch" }),
    ]);
  });

  it("rejects nested solvers deeper than depth 1", () => {
    const result = load(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.solver/grounded [
          #casualtheorics.argdown2.solver/grounded []
        ]
      ]
    `);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "schema/nested-solver-depth",
        path: [0, 0],
      }),
    ]);
  });

  it("allows duplicate ids across parent and nest scopes", () => {
    const loaded = load(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/statement {:id :a}
        #casualtheorics.argdown2.solver/grounded [
          #casualtheorics.argdown2.argdown/statement {:id :a}
        ]
      ]
    `);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = solve(loaded.document);
    expect("labels" in result).toBe(true);
    if (!("labels" in result)) return;
    expect(Object.fromEntries(result.labels)).toEqual({ a: "in" });
    expect(result.nested).toHaveLength(1);
    const nest = result.nested[0]!;
    expect("labels" in nest).toBe(true);
    if (!("labels" in nest)) return;
    expect(Object.fromEntries(nest.labels)).toEqual({ a: "in" });
  });

  it("still rejects duplicate ids inside one scope", () => {
    const result = load(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.solver/grounded [
          #casualtheorics.argdown2.argdown/statement {:id :a}
          #casualtheorics.argdown2.argdown/statement {:id :a}
        ]
      ]
    `);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "semantic/duplicate-id",
        path: [0, 1, ":id"],
      }),
    ]);
  });

  it("isolates cross-root references as missing", () => {
    const result = load(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/statement {:id :parent}
        #casualtheorics.argdown2.argdown/attack {:from :parent :to :nested-only}
        #casualtheorics.argdown2.solver/grounded [
          #casualtheorics.argdown2.argdown/statement {:id :nested-only}
        ]
      ]
    `);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "semantic/missing-reference",
        path: [1, ":to"],
      }),
    ]);
  });

  it("solves nested preferred with empty child nested array", () => {
    const loaded = load(`
      #casualtheorics.argdown2.solver/preferred [
        #casualtheorics.argdown2.argdown/statement {:id :p}
        #casualtheorics.argdown2.solver/preferred [
          #casualtheorics.argdown2.argdown/statement {:id :a}
          #casualtheorics.argdown2.argdown/statement {:id :b}
          #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
        ]
      ]
    `);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = solve(loaded.document);
    expect("extensions" in result).toBe(true);
    if (!("extensions" in result)) return;
    expect(result.solver).toBe(PREFERRED_SOLVER_TAG);
    expect(result.nested).toHaveLength(1);
    const nest = result.nested[0]!;
    expect("extensions" in nest).toBe(true);
    if (!("extensions" in nest)) return;
    expect(nest.nested).toEqual([]);
    expect(nest.extensions.length).toBeGreaterThan(0);
  });

  it("round-trips nested documents through writeEdn and load", () => {
    const parsed = softParse(nestedGrounded);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const written = writeEdn(parsed.document);
    const reloaded = load(written);
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    const original = load(nestedGrounded);
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    expect(solve(reloaded.document)).toEqual(solve(original.document));
  });
});
