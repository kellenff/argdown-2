import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { load } from "./index.js";

const stmt = (id: string): string =>
  `#casualtheorics.argdown2.argdown/statement {:id :${id}}`;
const identity = (ref: string): string =>
  `:interface {:aggregate
    #casualtheorics.argdown2.aggregate/identity
    {:inputs [{:ref :${ref}}]}}`;
const document = (elements: string, ref = "a"): string =>
  `#casualtheorics.argdown2/document
   {:id :validation-test
    :root #casualtheorics.argdown2.solver/grounded
    {:id :root ${identity(ref)} :elements [${elements}]}}`;

describe("component semantic validation", () => {
  it("rejects duplicate ids across local endpoint kinds", () => {
    const result = load(document(`
      ${stmt("a")}
      #casualtheorics.argdown2.argdown/attack
      {:id :a :from :a :to :a}
    `));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) =>
      error.code === "semantic/duplicate-id"
    )).toBe(true);
  });

  it("allows parallel relations with distinct ids", () => {
    const result = load(document(`
      ${stmt("a")} ${stmt("b")}
      #casualtheorics.argdown2.argdown/attack
      {:id :attack-1 :from :a :to :b}
      #casualtheorics.argdown2.argdown/attack
      {:id :attack-2 :from :a :to :b}
    `));
    expect(result.ok).toBe(true);
  });

  it("separates addressability from native selectability", () => {
    const result = load(document(`
      ${stmt("a")} ${stmt("b")}
      #casualtheorics.argdown2.argdown/attack
      {:id :edge :from :a :to :b}
    `, "edge"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) =>
      error.code === "semantic/non-selectable-endpoint"
    )).toBe(true);
  });

  it("rejects relation endpoints unsupported by grounded semantics", () => {
    const result = load(document(`
      ${stmt("a")} ${stmt("b")}
      #casualtheorics.argdown2.argdown/attack
      {:id :edge :from :a :to :b}
      #casualtheorics.argdown2.argdown/attack
      {:id :edge-on-edge :from :a :to :edge}
    `));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) =>
      error.code === "semantic/unsupported-endpoint"
    )).toBe(true);
  });

  it("requires multi-extension components to declare an observer", () => {
    const result = load(`
      #casualtheorics.argdown2/document
      {:id :preferred-test
       :root #casualtheorics.argdown2.solver/preferred
       {:id :root ${identity("a")} :elements [${stmt("a")}]}}
    `);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) =>
      error.code === "semantic/missing-observer"
    )).toBe(true);
  });

  it("validates threshold bounds and immediate child import keys", () => {
    const result = load(`
      #casualtheorics.argdown2/document
      {:id :imports-test
       :root #casualtheorics.argdown2.solver/grounded
       {:id :root
        ${identity("child")}
        :imports
        {:missing #casualtheorics.argdown2.projection/threshold
          {:out-at-most 0.8 :in-at-least 0.2 :otherwise nil}}
        :elements [
          #casualtheorics.argdown2.solver/grounded
          {:id :child ${identity("a")} :elements [${stmt("a")}]}
        ]}}
    `);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toContain(
      "semantic/invalid-import-key",
    );
    expect(result.errors.map((error) => error.code)).toContain(
      "semantic/invalid-projection-bounds",
    );
  });
});
