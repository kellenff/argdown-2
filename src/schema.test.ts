import { ednParseMulti } from "edn-parser-js";
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { decodeWire } from "./schema.js";

const raw = (source: string): unknown => ednParseMulti(source)[0];
const identity = (ref = "a"): string =>
  `:interface {:aggregate
    #casualtheorics.argdown2.aggregate/identity
    {:inputs [{:ref :${ref}}]}}`;
const document = (elements: string, interfaceBody = identity()): string =>
  `#casualtheorics.argdown2/document
   {:id :schema-test
    :root #casualtheorics.argdown2.solver/grounded
    {:id :root ${interfaceBody} :elements [${elements}]}}`;

describe("first-class wire schema", () => {
  it("decodes statement defaults and preserves unknown fields", () => {
    const result = decodeWire(raw(document(`
      #casualtheorics.argdown2.argdown/statement
      {:id :a :future/value 42}
    `)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const statement = result.document.root.elements[0];
    expect(statement).toMatchObject({
      kind: "statement",
      id: "a",
      tags: [],
    });
    expect(statement?.extra).toHaveLength(1);
  });

  it("decodes arguments and identified relations", () => {
    const result = decodeWire(raw(document(`
      #casualtheorics.argdown2.argdown/statement {:id :a}
      #casualtheorics.argdown2.argdown/argument
      {:id :arg
       :inferences [
        #casualtheorics.argdown2.argdown/inference
        {:id :inf :premises [:a] :conclusion :a}]}
      #casualtheorics.argdown2.argdown/attack
      {:id :attack-a-arg :from :a :to :arg}
    `)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.root.elements[1]).toMatchObject({
      kind: "argument",
      id: "arg",
      inferences: [{ id: "inf" }],
    });
    expect(result.document.root.elements[2]).toMatchObject({
      kind: "attack",
      id: "attack-a-arg",
    });
  });

  it("requires a document tag and relation id", () => {
    expect(decodeWire(raw(
      "#casualtheorics.argdown2.solver/grounded []",
    ))).toMatchObject({
      ok: false,
      errors: [{ code: "schema/missing-document-tag" }],
    });
    const result = decodeWire(raw(document(`
      #casualtheorics.argdown2.argdown/statement {:id :a}
      #casualtheorics.argdown2.argdown/attack {:from :a :to :a}
    `)));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((error) => error.code === "schema/missing-required"),
    ).toBe(true);
  });

  it("requires identity aggregates to have exactly one input", () => {
    const result = decodeWire(raw(document(
      "#casualtheorics.argdown2.argdown/statement {:id :a}",
      `:interface {:aggregate
       #casualtheorics.argdown2.aggregate/identity
       {:inputs []}}`,
    )));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe("schema/invalid-field");
  });

  it("rejects duplicate EDN map keys before decoding", () => {
    const result = decodeWire(raw(document(
      "#casualtheorics.argdown2.argdown/statement {:id :a :id :b}",
    )));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.code).toBe("schema/duplicate-map-key");
  });
});
