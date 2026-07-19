import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import type { EntityId, GroundedDocument, TheoryElement } from "./model.js";
import { BIPOLAR_SOLVER_TAG, GROUNDED_SOLVER_TAG } from "./model.js";
import { reduceToBipolar } from "./reduce-bipolar.js";
import { reduceToDung } from "./reduce-dung.js";
import { groundedLabels } from "./grounded.js";

const id = (value: string) => value as EntityId;

function document(...elements: readonly TheoryElement[]): GroundedDocument {
  return { solver: BIPOLAR_SOLVER_TAG, elements };
}

describe("reduceToBipolar", () => {
  it("reduces support via auxiliary nodes and omits undercut", () => {
    const doc = document(
      { kind: "statement", id: id("a"), tags: [], extra: [] },
      { kind: "statement", id: id("b"), tags: [], extra: [] },
      { kind: "statement", id: id("c"), tags: [], extra: [] },
      {
        kind: "support",
        from: id("a"),
        to: id("b"),
        extra: [],
      },
      {
        kind: "attack",
        from: id("c"),
        to: id("a"),
        extra: [],
      },
    );
    const reduced = reduceToBipolar(doc);
    const labels = groundedLabels(reduced.framework);
    const aux = id("sup:a->b");
    expect(labels.get(id("a"))).toBe("out");
    expect(labels.get(id("b"))).toBe("in");
    expect(labels.get(id("c"))).toBe("in");
    expect(labels.get(aux)).toBe("out");
    expect(reduced.warnings).toEqual([]);
  });

  it("still reduces attacks and contradictions like Dung", () => {
    const doc = document(
      { kind: "statement", id: id("a"), tags: [], extra: [] },
      { kind: "statement", id: id("b"), tags: [], extra: [] },
      {
        kind: "attack",
        from: id("a"),
        to: id("b"),
        extra: [],
      },
    );
    const bipolar = reduceToBipolar(doc);
    const dung = reduceToDung({ ...doc, solver: GROUNDED_SOLVER_TAG });
    expect(Object.fromEntries(groundedLabels(bipolar.framework))).toEqual(
      Object.fromEntries(groundedLabels(dung.framework)),
    );
  });
});
