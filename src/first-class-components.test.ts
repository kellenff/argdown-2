import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { evaluateComponent } from "./component-eval.js";
import { load, solve } from "./index.js";
import type { EntityId, SolverComponent } from "./model.js";
import { AGGREGATE_IDENTITY_TAG, GROUNDED_SOLVER_TAG } from "./model.js";

const statement = (id: string): string =>
  `#casualtheorics.argdown2.argdown/statement {:id :${id}}`;

const identity = (ref: string): string => `
  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :${ref}}]}}`;

const document = (
  elements: string,
  interfaceRef = "claim",
  solver = "grounded",
): string => `
  #casualtheorics.argdown2/document
  {:id :test-document
   :root
   #casualtheorics.argdown2.solver/${solver}
   {:id :root
    ${identity(interfaceRef)}
    :elements [${elements}]}}
`;

describe("first-class solver component wire", () => {
  it("loads an identified document and root solver map", () => {
    const result = load(document(statement("claim")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const value = result.document as unknown as {
      id: string;
      root: { id: string; solver: string };
    };
    expect(value.id).toBe("test-document");
    expect(value.root.id).toBe("root");
    expect(value.root.solver).toBe(
      "casualtheorics.argdown2.solver/grounded",
    );
  });

  it("rejects the legacy bare solver-vector root", () => {
    const result = load(`
      #casualtheorics.argdown2.solver/grounded [
        ${statement("claim")}
      ]
    `);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe("schema/missing-document-tag");
  });

  it("requires relation ids", () => {
    const result = load(document(
      `
      ${statement("a")}
      ${statement("b")}
      #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
    `,
      "a",
    ));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((error) => error.code === "schema/missing-required"),
    )
      .toBe(true);
  });

  it("accepts an identified mixed-semantics child solver", () => {
    const result = load(document(`
      ${statement("claim")}
      #casualtheorics.argdown2.solver/bipolar
      {:id :child
       ${identity("child-claim")}
       :elements [${statement("child-claim")}]}
      #casualtheorics.argdown2.argdown/attack
      {:id :attack-child :from :claim :to :child}
    `));
    expect(result.ok).toBe(true);
  });
});

describe("first-class component solve result", () => {
  it("rejects cyclic manually constructed component objects", () => {
    const component: SolverComponent = {
      kind: "solver",
      solver: GROUNDED_SOLVER_TAG,
      id: "root" as EntityId,
      interface: {
        aggregate: {
          tag: AGGREGATE_IDENTITY_TAG,
          inputs: [{ ref: "root" }],
        },
      },
      imports: new Map(),
      elements: [],
      extra: [],
    };
    (component as unknown as { elements: SolverComponent[] }).elements = [
      component,
    ];
    expect(() => evaluateComponent(component)).toThrow(
      "Component containment cycle at :root",
    );
  });

  it("returns native, aggregate, and boundary layers", () => {
    const loaded = load(document(statement("claim")));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const solved = solve(loaded.document) as unknown as {
      id: string;
      native: { kind: string; values: ReadonlyMap<string, string> };
      aggregate: { kind: string; value: string };
      boundary: { confidence: number | null };
    };
    expect(solved.id).toBe("root");
    expect(solved.native.kind).toBe("labels");
    expect(Object.fromEntries(solved.native.values)).toEqual({ claim: "in" });
    expect(solved.aggregate).toEqual({ kind: "label", value: "in" });
    expect(solved.boundary).toEqual({ confidence: 1 });
  });
});
