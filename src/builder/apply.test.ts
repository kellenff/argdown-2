import { Effect } from "effect";
import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";

import { apply, emptyDocument } from "./apply.js";

describe("apply (Effect)", () => {
  it("adds a statement and reports a single add diff", () => {
    const doc = emptyDocument();
    const result = Effect.runSync(apply(doc, {
      type: "add_statement",
      id: ":a",
      text: "A",
    }));
    expect(result.diff).toEqual([{ op: "add", kind: "statement", id: "a" }]);
    expect(result.warnings).toEqual([]);
    expect(result.document.root.elements).toHaveLength(1);
  });

  it("refuses a duplicate id and reports BuilderError with code", () => {
    const doc = emptyDocument();
    const first = Effect.runSync(apply(doc, {
      type: "add_statement",
      id: ":a",
      text: "A",
    }));
    const outcome = Effect.runSync(
      Effect.match(
        apply(first.document, {
          type: "add_statement",
          id: ":a",
          text: "B",
        }),
        {
          onFailure: (err) => ({ ok: false as const, err }),
          onSuccess: (value) => ({ ok: true as const, value }),
        },
      ),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.err._tag).toBe("Builder");
    expect(outcome.err.code).toBe("builder/duplicate-id");
  });

  it("refuses an invalid id with builder/invalid-id", () => {
    const doc = emptyDocument();
    const outcome = Effect.runSync(
      Effect.match(
        apply(doc, {
          type: "add_statement",
          id: "bad id",
        }),
        {
          onFailure: (err) => ({ ok: false as const, err }),
          onSuccess: (value) => ({ ok: true as const, value }),
        },
      ),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.err.code).toBe("builder/invalid-id");
  });
});
