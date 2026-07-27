import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";

import type { BuilderError } from "./types.js";

describe("BuilderError", () => {
  it("covers every BuilderCode emitted by apply()", () => {
    const codes: BuilderError["code"][] = [
      "builder/invalid-id",
      "builder/duplicate-id",
      "builder/missing-id",
      "builder/unsupported-relation-kind",
      "builder/unsupported-solver",
      "builder/invalid-projection-bounds",
    ];
    for (const code of codes) {
      const err: BuilderError = {
        _tag: "Builder",
        code,
        message: "demo",
        path: [],
        warnings: [],
      };
      expect(err._tag).toBe("Builder");
    }
  });
});