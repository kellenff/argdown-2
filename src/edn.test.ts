import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { readEdn } from "./edn.js";

describe("readEdn", () => {
  it("preserves namespaced tags, keyword ids, maps, sets, and vectors", () => {
    const result = readEdn(
      "#casualtheorics.argdown2.solver/grounded [#casualtheorics.argdown2.argdown/statement {:id :a :tags #{:pro}}]",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      tag: { ns: "casualtheorics.argdown2.solver", symbol: "grounded" },
      value: [
        {
          tag: { ns: "casualtheorics.argdown2.argdown", symbol: "statement" },
          value: {
            map: [
              [{ keyword: "id" }, { keyword: "a" }],
              [{ keyword: "tags" }, { set: [{ keyword: "pro" }] }],
            ],
          },
        },
      ],
    });
  });

  for (
    const [name, source] of [
      ["unbalanced collection", "[1 2"],
      ["unterminated string", '"abc'],
      ["odd map arity", "{:id :x :orphan}"],
      ["orphan tag", "#example/tag"],
      ["invalid numeric token", "42.3.4"],
      ["unexpected trailing delimiter", "{:id :x})"],
    ] as const
  ) {
    it(`returns edn/read-error for ${name}`, () => {
      const result = readEdn(source);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]?.code).toBe("edn/read-error");
    });
  }

  for (
    const [name, source] of [
      ["zero roots", ""],
      ["multiple roots", "1 2"],
    ] as const
  ) {
    it(`returns edn/root-count for ${name}`, () => {
      const result = readEdn(source);
      expect(result).toEqual({
        ok: false,
        errors: [
          {
            code: "edn/root-count",
            message: "Expected exactly one top-level EDN value",
          },
        ],
      });
    });
  }
});
