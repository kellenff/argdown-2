import { Effect } from "effect";
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { readEdn } from "./edn.js";
import { decodeWire } from "./schema.js";
import { runLoad } from "./test-support.js";
import { validateCandidate } from "./validate.js";

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
    const result = runLoad(document(`
      ${stmt("a")}
      #casualtheorics.argdown2.argdown/attack
      {:id :a :from :a :to :a}
    `));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((error) => error.code === "semantic/duplicate-id"),
    ).toBe(true);
  });

  it("allows parallel relations with distinct ids", () => {
    const result = runLoad(document(`
      ${stmt("a")} ${stmt("b")}
      #casualtheorics.argdown2.argdown/attack
      {:id :attack-1 :from :a :to :b}
      #casualtheorics.argdown2.argdown/attack
      {:id :attack-2 :from :a :to :b}
    `));
    expect(result.ok).toBe(true);
  });

  it("separates addressability from native selectability", () => {
    const result = runLoad(document(
      `
      ${stmt("a")} ${stmt("b")}
      #casualtheorics.argdown2.argdown/attack
      {:id :edge :from :a :to :b}
    `,
      "edge",
    ));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((error) =>
        error.code === "semantic/non-selectable-endpoint"
      ),
    ).toBe(true);
  });

  it("rejects relation endpoints unsupported by grounded semantics", () => {
    const result = runLoad(document(`
      ${stmt("a")} ${stmt("b")}
      #casualtheorics.argdown2.argdown/attack
      {:id :edge :from :a :to :b}
      #casualtheorics.argdown2.argdown/attack
      {:id :edge-on-edge :from :a :to :edge}
    `));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((error) =>
        error.code === "semantic/unsupported-endpoint"
      ),
    ).toBe(true);
  });

  it("rejects relation kinds the solver does not consume", () => {
    const grounded = runLoad(document(`
      ${stmt("a")} ${stmt("b")}
      #casualtheorics.argdown2.argdown/support
      {:id :support-edge :from :a :to :b}
    `));
    expect(grounded.ok).toBe(false);
    if (grounded.ok) return;
    expect(
      grounded.errors.some((error) =>
        error.code === "semantic/unsupported-relation-kind"
      ),
    ).toBe(true);

    const bipolar = runLoad(`
      #casualtheorics.argdown2/document
      {:id :bipolar-undercut
       :root #casualtheorics.argdown2.solver/bipolar
       {:id :root ${identity("a")}
        :elements [
          ${stmt("a")}
          #casualtheorics.argdown2.argdown/argument
          {:id :arg :inferences [
            #casualtheorics.argdown2.argdown/inference
            {:id :inf :premises [:a] :conclusion :a}
          ]}
          #casualtheorics.argdown2.argdown/undercut
          {:id :u :from :a :to :inf}
        ]}}
    `);
    expect(bipolar.ok).toBe(false);
    if (bipolar.ok) return;
    expect(
      bipolar.errors.some((error) =>
        error.code === "semantic/unsupported-relation-kind"
      ),
    ).toBe(true);

    const bipolarSupport = runLoad(`
      #casualtheorics.argdown2/document
      {:id :bipolar-support
       :root #casualtheorics.argdown2.solver/bipolar
       {:id :root ${identity("a")}
        :elements [
          ${stmt("a")} ${stmt("b")}
          #casualtheorics.argdown2.argdown/support
          {:id :s :from :a :to :b}
        ]}}
    `);
    expect(bipolarSupport.ok).toBe(true);
  });

  it("requires multi-extension components to declare an observer", () => {
    const result = runLoad(`
      #casualtheorics.argdown2/document
      {:id :preferred-test
       :root #casualtheorics.argdown2.solver/preferred
       {:id :root ${identity("a")} :elements [${stmt("a")}]}}
    `);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((error) => error.code === "semantic/missing-observer"),
    ).toBe(true);
  });

  it("validates threshold bounds and immediate child import keys", () => {
    const result = runLoad(`
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

function candidateFrom(source: string) {
  const raw = Effect.runSync(
    Effect.match(readEdn(source), {
      onFailure: (e) => {
        throw new Error(`edn failed: ${e._tag}`);
      },
      onSuccess: (value) => value,
    }),
  );
  return Effect.runSync(
    Effect.match(decodeWire(raw), {
      onFailure: (e) => {
        throw new Error(`schema failed: ${e._tag}`);
      },
      onSuccess: (document) => document,
    }),
  );
}

function runValidate(source: string) {
  return Effect.runSync(
    Effect.match(validateCandidate(candidateFrom(source)), {
      onFailure: (err) => ({ ok: false as const, error: err }),
      onSuccess: (document) => ({ ok: true as const, document }),
    }),
  );
}

describe("validateCandidate Effect API", () => {
  it("returns Document on success", () => {
    const result = runValidate(document(`${stmt("a")}`));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.id).toBe("validation-test");
    expect(result.document.root.kind).toBe("solver");
  });

  it("returns Semantic ValidateError with diagnostics on duplicate id", () => {
    const result = runValidate(document(`
      ${stmt("a")}
      #casualtheorics.argdown2.argdown/attack
      {:id :a :from :a :to :a}
    `));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe("Semantic");
    expect(
      result.error.diagnostics.some((d) => d.code === "semantic/duplicate-id"),
    ).toBe(true);
  });
});
