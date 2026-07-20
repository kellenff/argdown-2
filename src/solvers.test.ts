import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { load, solve } from "./index.js";
import {
  BIPOLAR_SOLVER_TAG,
  COMPLETE_SOLVER_TAG,
  EVIDENTIAL_SOLVER_TAG,
  GROUNDED_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
  STABLE_SOLVER_TAG,
} from "./model.js";

const graph = (
  solver: string,
  relations: string,
  focus = "a",
): string => {
  const observer =
    ["preferred", "stable", "complete"].some((name) =>
        solver.endsWith(`/${name}`)
      )
      ? `:observer
       #casualtheorics.argdown2.observer/extension-proportion
       {:mode :proportion}`
      : "";
  return `#casualtheorics.argdown2/document
    {:id :solver-test
     :root #${solver}
     {:id :root
      :interface
      {:aggregate #casualtheorics.argdown2.aggregate/identity
       {:inputs [{:ref :${focus}}]}
       ${observer}}
      :elements [
       #casualtheorics.argdown2.argdown/statement {:id :a}
       #casualtheorics.argdown2.argdown/statement {:id :b}
       #casualtheorics.argdown2.argdown/statement {:id :c}
       ${relations}
      ]}}`;
};

const threeCycleRelations = `
  #casualtheorics.argdown2.argdown/attack
  {:id :attack-a-b :from :a :to :b}
  #casualtheorics.argdown2.argdown/attack
  {:id :attack-b-c :from :b :to :c}
  #casualtheorics.argdown2.argdown/attack
  {:id :attack-c-a :from :c :to :a}`;

describe("solver component dispatch", () => {
  for (
    const [solver, expected] of [
      [GROUNDED_SOLVER_TAG, { a: "out", b: "in", c: "in" }],
      [BIPOLAR_SOLVER_TAG, { a: "out", b: "in", c: "in" }],
      [EVIDENTIAL_SOLVER_TAG, { a: "out", b: "out", c: "in" }],
    ] as const
  ) {
    it(`solves ${solver}`, () => {
      const support = solver === GROUNDED_SOLVER_TAG
        ? ""
        : `#casualtheorics.argdown2.argdown/support
           {:id :support-a-b :from :a :to :b}`;
      const loaded = load(graph(
        solver,
        `${support}
         #casualtheorics.argdown2.argdown/attack
         {:id :attack-c-a :from :c :to :a}`,
      ));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const result = solve(loaded.document);
      expect(result.native.kind).toBe("labels");
      if (result.native.kind !== "labels") return;
      expect(Object.fromEntries(result.native.values)).toEqual(expected);
    });
  }

  it("solves preferred, stable, and complete leaf components", () => {
    const preferred = load(graph(PREFERRED_SOLVER_TAG, threeCycleRelations));
    const stable = load(graph(STABLE_SOLVER_TAG, threeCycleRelations));
    const complete = load(graph(COMPLETE_SOLVER_TAG, threeCycleRelations));
    expect(preferred.ok && stable.ok && complete.ok).toBe(true);
    if (!preferred.ok || !stable.ok || !complete.ok) return;

    const preferredResult = solve(preferred.document);
    const stableResult = solve(stable.document);
    const completeResult = solve(complete.document);
    expect(preferredResult.native).toMatchObject({
      kind: "extensions",
      values: [new Set()],
    });
    expect(stableResult.native).toEqual({ kind: "extensions", values: [] });
    expect(completeResult.native).toMatchObject({
      kind: "extensions",
      values: [new Set()],
    });
    expect(preferredResult.aggregate).toEqual({
      kind: "extension-membership",
      value: [false],
    });
    expect(stableResult.aggregate).toEqual({
      kind: "extension-membership",
      value: [],
    });
    expect(preferredResult.boundary.confidence).toBe(0);
    expect(stableResult.boundary.confidence).toBe(null);
  });

  it("rejects unsupported solver tags", () => {
    expect(load("#other/solver []")).toMatchObject({
      ok: false,
      errors: [{ code: "schema/missing-document-tag" }],
    });
  });
});
