import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import {
  BIPOLAR_SOLVER_TAG,
  COMPLETE_SOLVER_TAG,
  EVIDENTIAL_SOLVER_TAG,
  GROUNDED_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
  STABLE_SOLVER_TAG,
} from "./model.js";
import { load, solve } from "./index.js";
import { groundedLabels } from "./grounded.js";
import { intersectExtensions } from "./multi-extension.js";
import { reduceToDung } from "./reduce-dung.js";
import { frameworkToAttackMap } from "./multi-extension.js";

const threeCycle = `
  #casualtheorics.argdown2.solver/grounded [
    #casualtheorics.argdown2.argdown/statement {:id :a}
    #casualtheorics.argdown2.argdown/statement {:id :b}
    #casualtheorics.argdown2.argdown/statement {:id :c}
    #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
    #casualtheorics.argdown2.argdown/attack {:from :b :to :c}
    #casualtheorics.argdown2.argdown/attack {:from :c :to :a}
  ]
`;

function withSolver(source: string, solver: string): string {
  return source.replace(
    "#casualtheorics.argdown2.solver/grounded",
    `#${solver}`,
  );
}

describe("solver tags", () => {
  it("loads and solves grounded documents", () => {
    const loaded = load(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/statement {:id :a}
        #casualtheorics.argdown2.argdown/statement {:id :b}
        #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
      ]
    `);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = solve(loaded.document);
    expect("labels" in result).toBe(true);
    if (!("labels" in result)) return;
    expect(Object.fromEntries(result.labels)).toEqual({ a: "in", b: "out" });
    expect(result.solver).toBe(GROUNDED_SOLVER_TAG);
  });

  it("solves bipolar documents with support reduction", () => {
    const loaded = load(`
      #casualtheorics.argdown2.solver/bipolar [
        #casualtheorics.argdown2.argdown/statement {:id :a}
        #casualtheorics.argdown2.argdown/statement {:id :b}
        #casualtheorics.argdown2.argdown/statement {:id :c}
        #casualtheorics.argdown2.argdown/support {:from :a :to :b}
        #casualtheorics.argdown2.argdown/attack {:from :c :to :a}
      ]
    `);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = solve(loaded.document);
    expect("labels" in result).toBe(true);
    if (!("labels" in result)) return;
    expect(result.solver).toBe(BIPOLAR_SOLVER_TAG);
    expect(result.labels.get("a" as never)).toBe("out");
    expect(result.labels.get("b" as never)).toBe("in");
    expect(result.labels.get("c" as never)).toBe("in");
  });

  it("solves evidential documents with necessary-support reduction", () => {
    const loaded = load(`
      #casualtheorics.argdown2.solver/evidential [
        #casualtheorics.argdown2.argdown/statement {:id :a}
        #casualtheorics.argdown2.argdown/statement {:id :b}
        #casualtheorics.argdown2.argdown/statement {:id :c}
        #casualtheorics.argdown2.argdown/support {:from :a :to :b}
        #casualtheorics.argdown2.argdown/attack {:from :c :to :a}
      ]
    `);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = solve(loaded.document);
    expect("labels" in result).toBe(true);
    if (!("labels" in result)) return;
    expect(result.solver).toBe(EVIDENTIAL_SOLVER_TAG);
    expect(result.labels.get("a" as never)).toBe("out");
    expect(result.labels.get("b" as never)).toBe("out");
    expect(result.labels.get("c" as never)).toBe("in");
  });

  it("solves preferred documents with extensions", () => {
    const loaded = load(
      withSolver(threeCycle, "casualtheorics.argdown2.solver/preferred"),
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = solve(loaded.document);
    expect("extensions" in result).toBe(true);
    if (!("extensions" in result)) return;
    expect(result.solver).toBe(PREFERRED_SOLVER_TAG);
    expect(result.extensions.length).toBe(1);
    expect(result.extensions[0]!.size).toBe(0);
  });

  it("solves stable documents with no extensions on a 3-cycle", () => {
    const loaded = load(
      withSolver(threeCycle, "casualtheorics.argdown2.solver/stable"),
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = solve(loaded.document);
    expect("extensions" in result).toBe(true);
    if (!("extensions" in result)) return;
    expect(result.solver).toBe(STABLE_SOLVER_TAG);
    expect(result.extensions).toEqual([]);
  });

  it("solves complete documents and matches grounded intersection", () => {
    const loaded = load(
      withSolver(threeCycle, "casualtheorics.argdown2.solver/complete"),
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = solve(loaded.document);
    expect("extensions" in result).toBe(true);
    if (!("extensions" in result)) return;
    expect(result.solver).toBe(COMPLETE_SOLVER_TAG);
    expect(result.extensions.length).toBe(1);

    const groundedLoaded = load(threeCycle);
    expect(groundedLoaded.ok).toBe(true);
    if (!groundedLoaded.ok) return;
    const grounded = solve(groundedLoaded.document);
    expect("labels" in grounded).toBe(true);
    if (!("labels" in grounded)) return;
    const groundedIn = new Set(
      [...grounded.labels.entries()]
        .filter(([, label]) => label === "in")
        .map(([node]) => node),
    );
    expect(intersectExtensions(result.extensions)).toEqual(groundedIn);
  });

  it("rejects unsupported solver tags", () => {
    expect(load("#other/solver []")).toMatchObject({
      ok: false,
      errors: [{ code: "edn/unsupported-tag" }],
    });
  });
});

describe("cross-validation invariant", () => {
  it("keeps grounded labels equal to the intersection of complete extensions", () => {
    const loaded = load(`
      #casualtheorics.argdown2.solver/complete [
        #casualtheorics.argdown2.argdown/statement {:id :a}
        #casualtheorics.argdown2.argdown/statement {:id :b}
        #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
      ]
    `);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const reduced = reduceToDung(loaded.document);
    const attackMap = frameworkToAttackMap(reduced.framework);
    const groundedIn = new Set(
      [...groundedLabels(reduced.framework).entries()]
        .filter(([, label]) => label === "in")
        .map(([node]) => node),
    );
    const complete = solve(loaded.document);
    expect("extensions" in complete).toBe(true);
    if (!("extensions" in complete)) return;
    expect(intersectExtensions(complete.extensions)).toEqual(groundedIn);
    expect(attackMap.size).toBeGreaterThan(0);
  });
});
