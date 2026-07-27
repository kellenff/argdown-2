import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { Effect } from "effect";

import { solve } from "./index.js";
import { runLoad } from "./test-support.js";

const stmt = (id: string): string =>
  `#casualtheorics.argdown2.argdown/statement {:id :${id}}`;
const attack = (id: string, from: string, to: string): string =>
  `#casualtheorics.argdown2.argdown/attack
   {:id :${id} :from :${from} :to :${to}}`;
const identity = (ref: string): string =>
  `:interface
   {:aggregate
    #casualtheorics.argdown2.aggregate/identity
    {:inputs [{:ref :${ref}}]}}`;
const child = (elements: string): string =>
  `#casualtheorics.argdown2.solver/grounded
   {:id :child
    ${identity("child-claim")}
    :elements [${elements}]}`;
const document = (childElements: string, parentRelations = ""): string =>
  `#casualtheorics.argdown2/document
   {:id :nested-test
    :root
    #casualtheorics.argdown2.solver/grounded
    {:id :root
     ${identity("target")}
     :elements [
       ${stmt("source")}
       ${stmt("target")}
       ${child(childElements)}
       ${attack("child-attacks-target", "child", "target")}
       ${parentRelations}
     ]}}`;

describe("scoped first-class solver components", () => {
  it("makes a child solver id, but not its internals, visible to its parent", () => {
    const valid = runLoad(document(stmt("child-claim")));
    expect(valid.ok).toBe(true);

    const invalid = runLoad(document(
      stmt("child-claim"),
      attack("cross-scope", "source", "child-claim"),
    ));
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(
      invalid.errors.some((error) =>
        error.code === "semantic/missing-reference"
      ),
    ).toBe(true);
  });

  it("allows the same local id in sibling scopes", () => {
    const source = `#casualtheorics.argdown2/document
      {:id :siblings
       :root
       #casualtheorics.argdown2.solver/grounded
       {:id :root
        ${identity("left")}
        :elements [
          #casualtheorics.argdown2.solver/grounded
          {:id :left ${identity("claim")} :elements [${stmt("claim")}]}
          #casualtheorics.argdown2.solver/grounded
          {:id :right ${identity("claim")} :elements [${stmt("claim")}]}
        ]}}`;
    expect(runLoad(source).ok).toBe(true);
  });
});

describe("bottom-up grounded boundary import", () => {
  it("imports an IN child as an ordinary attacking proxy", () => {
    const loaded = runLoad(document(stmt("child-claim")));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = Effect.runSync(solve(loaded.document));

    expect(result.native.kind).toBe("labels");
    if (result.native.kind !== "labels") return;
    expect(result.native.values.get("child" as never)).toBe("in");
    expect(result.native.values.get("target" as never)).toBe("out");
    expect(result.children.get("child" as never)?.boundary.confidence).toBe(1);
  });

  it("imports an OUT child with a private blocker", () => {
    const loaded = runLoad(document(`
      ${stmt("child-claim")}
      ${stmt("child-objection")}
      ${attack("child-defeat", "child-objection", "child-claim")}
    `));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = Effect.runSync(solve(loaded.document));

    expect(result.native.kind).toBe("labels");
    if (result.native.kind !== "labels") return;
    expect(result.native.values.get("child" as never)).toBe("out");
    expect(result.native.values.get("target" as never)).toBe("in");
    expect(
      [...result.native.values.keys()].some((id) =>
        String(id).startsWith("\0argdown:")
      ),
    ).toBe(false);
  });

  it("imports an undecided child as an intrinsic self-attack", () => {
    const loaded = runLoad(document(`
      ${stmt("child-claim")}
      ${attack("child-cycle", "child-claim", "child-claim")}
    `));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = Effect.runSync(solve(loaded.document));

    expect(result.native.kind).toBe("labels");
    if (result.native.kind !== "labels") return;
    expect(result.native.values.get("child" as never)).toBe("undec");
    expect(result.native.values.get("target" as never)).toBe("undec");
    expect(result.children.get("child" as never)?.boundary.confidence).toBe(
      null,
    );
  });

  it("lets a parent IN attacker defeat an undecided child proxy", () => {
    const loaded = runLoad(document(
      `${stmt("child-claim")}
       ${attack("child-cycle", "child-claim", "child-claim")}`,
      attack("parent-defeat", "source", "child"),
    ));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = Effect.runSync(solve(loaded.document));

    expect(result.native.kind).toBe("labels");
    if (result.native.kind !== "labels") return;
    expect(result.native.values.get("child" as never)).toBe("out");
    expect(result.native.values.get("target" as never)).toBe("in");
    expect(result.children.get("child" as never)?.boundary.confidence).toBe(
      null,
    );
  });
});
