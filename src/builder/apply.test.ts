import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { apply, emptyDocument } from "./apply.js";
import {
  BIPOLAR_SOLVER_TAG,
  EXTENSION_PROPORTION_OBSERVER_TAG,
  GROUNDED_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
} from "../model.js";

describe("emptyDocument", () => {
  it("returns a grounded candidate with no elements", () => {
    expect(emptyDocument()).toEqual({
      id: "document",
      root: {
        kind: "solver",
        solver: GROUNDED_SOLVER_TAG,
        id: "root",
        imports: [],
        elements: [],
        extra: [],
      },
      extra: [],
    });
  });
});

describe("apply statements and arguments", () => {
  it("bootstraps and repairs a preferred interface with its observer", () => {
    let result = apply(emptyDocument(PREFERRED_SOLVER_TAG), {
      type: "add_statement",
      id: "a",
    });
    expect(result.document.root.interface?.observer).toEqual({
      tag: EXTENSION_PROPORTION_OBSERVER_TAG,
    });
    result = apply(result.document, { type: "add_statement", id: "b" });
    result = apply(result.document, { type: "remove_element", id: "a" });
    expect(result.document.root.interface).toMatchObject({
      aggregate: { inputs: [{ ref: "b" }] },
      observer: { tag: EXTENSION_PROPORTION_OBSERVER_TAG },
    });
  });

  it("refuses ids that cannot be emitted as EDN keywords", () => {
    const result = apply(emptyDocument(), {
      type: "add_statement",
      id: "bad id",
    });
    expect(result.refused?.code).toBe("builder/invalid-id");
  });

  it("adds a statement", () => {
    const result = apply(emptyDocument(), {
      type: "add_statement",
      id: "censorship",
      text: "Censorship is not wrong in principle.",
    });
    expect(result.refused).toBeUndefined();
    expect(result.document.root.elements).toHaveLength(1);
    expect(result.document.root.elements[0]).toMatchObject({
      kind: "statement",
      id: "censorship",
      text: "Censorship is not wrong in principle.",
    });
    expect(result.diff).toContainEqual({
      op: "add",
      kind: "statement",
      id: "censorship",
    });
  });

  it("refuses duplicate statement id", () => {
    const once = apply(emptyDocument(), {
      type: "add_statement",
      id: "a",
      text: "one",
    });
    const twice = apply(once.document, {
      type: "add_statement",
      id: "a",
      text: "two",
    });
    expect(twice.refused?.code).toBe("builder/duplicate-id");
    expect(twice.document).toEqual(once.document);
    expect(twice.diff).toEqual([]);
  });

  it("updates statement text", () => {
    const base = apply(emptyDocument(), {
      type: "add_statement",
      id: "a",
      text: "old",
    });
    const updated = apply(base.document, {
      type: "update_statement",
      id: "a",
      text: "new",
    });
    expect(updated.refused).toBeUndefined();
    expect(updated.document.root.elements[0]).toMatchObject({ text: "new" });
  });

  it("adds argument and inference; soft-warns unresolved premise text", () => {
    const withArg = apply(emptyDocument(), {
      type: "add_argument",
      id: "freedom",
      description: "Freedom argument",
    });
    const withInf = apply(withArg.document, {
      type: "add_inference",
      argumentId: "freedom",
      id: "freedom-main",
      premises: ["Absolute freedom is a right"],
      conclusion: "Censorship is wrong",
    });
    expect(withInf.refused).toBeUndefined();
    expect(withInf.warnings.length).toBeGreaterThan(0);
    expect(withInf.warnings.every((w) => w.message.includes("stored as id")))
      .toBe(true);
    const arg = withInf.document.root.elements.find((e) =>
      e.kind === "argument"
    );
    expect(arg && arg.kind === "argument" && arg.inferences[0]?.premises[0])
      .toBe(
        "absolute-freedom-is-a-right",
      );
    expect(arg && arg.kind === "argument" && arg.inferences[0]?.conclusion)
      .toBe(
        "censorship-is-wrong",
      );
  });

  it("keeps already-valid keyword ids when resolution fails", () => {
    let doc = emptyDocument();
    doc = apply(doc, { type: "add_statement", id: "a", text: "A" }).document;
    const result = apply(doc, {
      type: "add_relation",
      id: "attack-missing",
      kind: "attack",
      from: "a",
      to: "missing-target",
    });
    expect(result.refused).toBeUndefined();
    const attack = result.document.root.elements.find((e) =>
      e.kind === "attack"
    );
    expect(attack && attack.kind === "attack" && attack.to).toBe(
      "missing-target",
    );
  });

  it("resolves premise refs to ids when statements exist", () => {
    let doc = emptyDocument();
    doc = apply(doc, {
      type: "add_statement",
      id: "p1",
      text: "Premise one",
    }).document;
    doc = apply(doc, {
      type: "add_statement",
      id: "c1",
      text: "Conclusion one",
    }).document;
    doc = apply(doc, {
      type: "add_argument",
      id: "arg",
      description: "A",
    }).document;
    const result = apply(doc, {
      type: "add_inference",
      argumentId: "arg",
      id: "inf1",
      premises: ["Premise one"],
      conclusion: "Conclusion one",
    });
    expect(result.warnings).toEqual([]);
    const arg = result.document.root.elements.find((e) =>
      e.kind === "argument"
    );
    expect(arg && arg.kind === "argument" && arg.inferences[0]).toMatchObject({
      premises: ["p1"],
      conclusion: "c1",
    });
  });
});

describe("apply relations and remove", () => {
  it("adds attack with resolved ids and warns on missing endpoint", () => {
    let doc = emptyDocument();
    doc = apply(doc, {
      type: "add_statement",
      id: "a",
      text: "A",
    }).document;
    const withWarn = apply(doc, {
      type: "add_relation",
      id: "attack-missing",
      kind: "attack",
      from: "a",
      to: "missing-target",
    });
    expect(withWarn.refused).toBeUndefined();
    expect(withWarn.warnings.some((w) => w.code === "builder/unresolved-ref"))
      .toBe(true);
    expect(
      withWarn.document.root.elements.some((e) => e.kind === "attack"),
    ).toBe(true);
  });

  it("adds undercut to inference id", () => {
    let doc = emptyDocument(BIPOLAR_SOLVER_TAG);
    // undercut is unsupported by every current solver — refused at builder
    doc = apply(doc, { type: "add_statement", id: "p", text: "P" }).document;
    doc = apply(doc, { type: "add_statement", id: "c", text: "C" }).document;
    doc = apply(doc, {
      type: "add_argument",
      id: "arg",
      description: "Arg",
    }).document;
    doc = apply(doc, {
      type: "add_inference",
      argumentId: "arg",
      id: "inf1",
      premises: ["p"],
      conclusion: "c",
    }).document;
    doc = apply(doc, {
      type: "add_statement",
      id: "attacker",
      text: "Attacker",
    }).document;
    const refused = apply(doc, {
      type: "add_relation",
      id: "undercut-inf1",
      kind: "undercut",
      from: "attacker",
      to: "inf1",
    });
    expect(refused.refused?.code).toBe("builder/unsupported-relation-kind");
  });

  it("refuses support under grounded and accepts it under bipolar", () => {
    const grounded = apply(
      apply(emptyDocument(), { type: "add_statement", id: "a", text: "A" })
        .document,
      {
        type: "add_relation",
        id: "s",
        kind: "support",
        from: "a",
        to: "a",
      },
    );
    expect(grounded.refused?.code).toBe("builder/unsupported-relation-kind");

    let bipolar = emptyDocument(BIPOLAR_SOLVER_TAG);
    bipolar = apply(bipolar, { type: "add_statement", id: "a", text: "A" })
      .document;
    bipolar = apply(bipolar, { type: "add_statement", id: "b", text: "B" })
      .document;
    const accepted = apply(bipolar, {
      type: "add_relation",
      id: "s",
      kind: "support",
      from: "a",
      to: "b",
    });
    expect(accepted.refused).toBeUndefined();
    expect(accepted.document.root.elements.at(-1)).toMatchObject({
      kind: "support",
      id: "s",
    });
  });

  it("removes statement by id", () => {
    const base = apply(emptyDocument(), {
      type: "add_statement",
      id: "a",
      text: "A",
    });
    const removed = apply(base.document, { type: "remove_element", id: "a" });
    expect(removed.document.root.elements).toEqual([]);
  });

  it("removes relation by id", () => {
    let doc = emptyDocument();
    doc = apply(doc, { type: "add_statement", id: "a", text: "A" }).document;
    doc = apply(doc, { type: "add_statement", id: "b", text: "B" }).document;
    doc = apply(doc, {
      type: "add_relation",
      id: "attack-a-b",
      kind: "attack",
      from: "a",
      to: "b",
    }).document;
    const removed = apply(doc, {
      type: "remove_relation",
      id: "attack-a-b",
    });
    expect(
      removed.document.root.elements.every((e) => e.kind !== "attack"),
    ).toBe(true);
  });

  it("refuses remove of unknown id", () => {
    const result = apply(emptyDocument(), {
      type: "remove_element",
      id: "nope",
    });
    expect(result.refused?.code).toBe("builder/missing-id");
  });
});

describe("apply nested solver components", () => {
  it("adds a child solver and scoped statements under parentId", () => {
    let doc = emptyDocument();
    doc = apply(doc, { type: "add_statement", id: "target", text: "Target" })
      .document;
    const child = apply(doc, {
      type: "add_solver",
      id: "child",
      solver: GROUNDED_SOLVER_TAG,
    });
    expect(child.refused).toBeUndefined();
    doc = child.document;
    const claim = apply(doc, {
      type: "add_statement",
      id: "claim",
      text: "Child claim",
      parentId: "child",
    });
    expect(claim.refused).toBeUndefined();
    const nested = claim.document.root.elements.find((element) =>
      element.kind === "solver" && element.id === "child"
    );
    expect(nested).toMatchObject({
      kind: "solver",
      id: "child",
      interface: {
        aggregate: { inputs: [{ ref: "claim" }] },
      },
      elements: [{ kind: "statement", id: "claim" }],
    });
  });

  it("sets and removes import projections for immediate children", () => {
    let doc = emptyDocument();
    doc = apply(doc, {
      type: "add_solver",
      id: "child",
      solver: PREFERRED_SOLVER_TAG,
    }).document;
    doc = apply(doc, {
      type: "add_statement",
      id: "claim",
      parentId: "child",
    }).document;
    const set = apply(doc, {
      type: "set_import",
      childId: "child",
      outAtMost: 0.2,
      inAtLeast: 0.8,
    });
    expect(set.refused).toBeUndefined();
    expect(set.document.root.imports).toEqual([
      [
        "child",
        {
          tag: "casualtheorics.argdown2.projection/threshold",
          outAtMost: 0.2,
          inAtLeast: 0.8,
          otherwise: null,
        },
      ],
    ]);
    const removed = apply(set.document, {
      type: "remove_import",
      childId: "child",
    });
    expect(removed.refused).toBeUndefined();
    expect(removed.document.root.imports).toEqual([]);
  });

  it("clears imports when a child solver is removed", () => {
    let doc = emptyDocument();
    doc = apply(doc, {
      type: "add_solver",
      id: "child",
      solver: GROUNDED_SOLVER_TAG,
    }).document;
    doc = apply(doc, {
      type: "set_import",
      childId: "child",
      outAtMost: 0,
      inAtLeast: 1,
    }).document;
    const removed = apply(doc, { type: "remove_element", id: "child" });
    expect(removed.refused).toBeUndefined();
    expect(removed.document.root.imports).toEqual([]);
    expect(removed.document.root.elements).toEqual([]);
  });

  it("allows the same local id in sibling child scopes", () => {
    let doc = emptyDocument();
    doc = apply(doc, {
      type: "add_solver",
      id: "left",
      solver: GROUNDED_SOLVER_TAG,
    }).document;
    doc = apply(doc, {
      type: "add_solver",
      id: "right",
      solver: GROUNDED_SOLVER_TAG,
    }).document;
    const left = apply(doc, {
      type: "add_statement",
      id: "claim",
      parentId: "left",
    });
    const right = apply(left.document, {
      type: "add_statement",
      id: "claim",
      parentId: "right",
    });
    expect(left.refused).toBeUndefined();
    expect(right.refused).toBeUndefined();
  });
});
