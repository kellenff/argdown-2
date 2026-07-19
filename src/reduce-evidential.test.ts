import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import type { EntityId, GroundedDocument, TheoryElement } from "./model.js";
import {
  BIPOLAR_SOLVER_TAG,
  EVIDENTIAL_SOLVER_TAG,
  GROUNDED_SOLVER_TAG,
} from "./model.js";
import { reduceToBipolar } from "./reduce-bipolar.js";
import { reduceToDung } from "./reduce-dung.js";
import { reduceToEvidential } from "./reduce-evidential.js";
import { groundedLabels } from "./grounded.js";

const id = (value: string) => value as EntityId;

function document(...elements: readonly TheoryElement[]): GroundedDocument {
  return { solver: EVIDENTIAL_SOLVER_TAG, elements };
}

function labelsOf(doc: GroundedDocument) {
  return groundedLabels(reduceToEvidential(doc).framework);
}

describe("reduceToEvidential", () => {
  it("labels simple necessary support with auxiliary", () => {
    const doc = document(
      { kind: "statement", id: id("a"), tags: [], extra: [] },
      { kind: "statement", id: id("b"), tags: [], extra: [] },
      {
        kind: "support",
        from: id("a"),
        to: id("b"),
        extra: [],
      },
    );
    const labels = labelsOf(doc);
    expect(labels.get(id("a"))).toBe("in");
    expect(labels.get(id("b"))).toBe("in");
    expect(labels.get(id("nec:a->b"))).toBe("out");
  });

  it("propagates A's defeat to B via necessary support", () => {
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
    const reduced = reduceToEvidential(doc);
    const labels = groundedLabels(reduced.framework);
    expect(labels.get(id("a"))).toBe("out");
    expect(labels.get(id("b"))).toBe("out");
    expect(labels.get(id("c"))).toBe("in");
    expect(labels.get(id("nec:a->b"))).toBe("in");
    expect(reduced.warnings).toEqual([]);
  });

  it("contrasts with bipolar on the same support+attack graph", () => {
    const elements: TheoryElement[] = [
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
    ];
    const evidential = groundedLabels(
      reduceToEvidential({ solver: EVIDENTIAL_SOLVER_TAG, elements }).framework,
    );
    const bipolar = groundedLabels(
      reduceToBipolar({ solver: BIPOLAR_SOLVER_TAG, elements }).framework,
    );
    expect(evidential.get(id("a"))).toBe("out");
    expect(evidential.get(id("b"))).toBe("out");
    expect(evidential.get(id("c"))).toBe("in");
    expect(bipolar.get(id("a"))).toBe("out");
    expect(bipolar.get(id("b"))).toBe("in");
    expect(bipolar.get(id("c"))).toBe("in");
  });

  it("labels self-support undec", () => {
    const labels = labelsOf(document(
      { kind: "statement", id: id("a"), tags: [], extra: [] },
      {
        kind: "support",
        from: id("a"),
        to: id("a"),
        extra: [],
      },
    ));
    expect(labels.get(id("a"))).toBe("undec");
  });

  it("labels mutual necessary support undec", () => {
    const labels = labelsOf(document(
      { kind: "statement", id: id("a"), tags: [], extra: [] },
      { kind: "statement", id: id("b"), tags: [], extra: [] },
      {
        kind: "support",
        from: id("a"),
        to: id("b"),
        extra: [],
      },
      {
        kind: "support",
        from: id("b"),
        to: id("a"),
        extra: [],
      },
    ));
    expect(labels.get(id("a"))).toBe("undec");
    expect(labels.get(id("b"))).toBe("undec");
  });

  it("labels a support cycle undec", () => {
    const labels = labelsOf(document(
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
        kind: "support",
        from: id("b"),
        to: id("c"),
        extra: [],
      },
      {
        kind: "support",
        from: id("c"),
        to: id("a"),
        extra: [],
      },
    ));
    expect(labels.get(id("a"))).toBe("undec");
    expect(labels.get(id("b"))).toBe("undec");
    expect(labels.get(id("c"))).toBe("undec");
  });

  it("does not propagate B's defeat back to A", () => {
    const elements: TheoryElement[] = [
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
        to: id("b"),
        extra: [],
      },
    ];
    const evidential = groundedLabels(
      reduceToEvidential({ solver: EVIDENTIAL_SOLVER_TAG, elements }).framework,
    );
    const bipolar = groundedLabels(
      reduceToBipolar({ solver: BIPOLAR_SOLVER_TAG, elements }).framework,
    );
    // Direct attack on B: A stays in under evidential (nec is out, A unaffected).
    expect(evidential.get(id("a"))).toBe("in");
    expect(evidential.get(id("b"))).toBe("out");
    expect(evidential.get(id("c"))).toBe("in");
    expect(evidential.get(id("nec:a->b"))).toBe("out");
    // Bipolar propagates B's defeat to A via the deductive aux.
    expect(bipolar.get(id("a"))).toBe("out");
    expect(bipolar.get(id("b"))).toBe("out");
    expect(bipolar.get(id("c"))).toBe("in");
  });

  it("omits undercut with a warning", () => {
    const doc = document(
      { kind: "statement", id: id("a"), tags: [], extra: [] },
      {
        kind: "argument",
        id: id("arg1"),
        tags: [],
        extra: [],
        inferences: [{
          kind: "inference",
          id: "inf1" as never,
          premises: [id("a")],
          conclusion: id("a"),
          rules: [],
          extra: [],
        }],
      },
      {
        kind: "undercut",
        from: id("a"),
        to: "inf1" as never,
        extra: [],
      },
    );
    const reduced = reduceToEvidential(doc);
    expect(reduced.warnings).toEqual([{
      code: "reduce/undercut-omitted",
      message:
        "undercut is represented but omitted from evidential Dung reduction",
      path: [2],
    }]);
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
    const evidential = reduceToEvidential(doc);
    const dung = reduceToDung({ ...doc, solver: GROUNDED_SOLVER_TAG });
    expect(Object.fromEntries(groundedLabels(evidential.framework))).toEqual(
      Object.fromEntries(groundedLabels(dung.framework)),
    );
  });
});
