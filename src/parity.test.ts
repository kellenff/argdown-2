import { readFileSync } from "node:fs";

import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { solve } from "./index.js";
import type { EntityId } from "./model.js";
import { runLoad } from "./test-support.js";

const id = (value: string) => value as EntityId;

const source = readFileSync(
  new URL("../examples/argdown1-censorship.edn", import.meta.url),
  "utf8",
);

describe("Argdown 1.x censorship parity", () => {
  it("loads the canonical example", () => {
    expect(runLoad(source).ok).toBe(true);
  });

  it("preserves the reconstructed argument and metadata", () => {
    const loaded = runLoad(source);
    if (!loaded.ok) throw new Error("fixture did not load");
    const freedom = loaded.document.root.elements.find(
      (element) =>
        element.kind === "argument" && element.id === "freedom-of-speech",
    );
    expect(freedom).toMatchObject({
      kind: "argument",
      tags: ["con"],
      metadata: { map: [[{ keyword: "source" }, "C1a"]] },
    });
    if (freedom?.kind !== "argument") return;
    expect(freedom.inferences).toHaveLength(1);
    expect(freedom.inferences[0]?.rules).toEqual([
      "specification",
      "modus-ponens",
    ]);
  });

  it("matches the pure-attack grounded labels", () => {
    const loaded = runLoad(source);
    if (!loaded.ok) throw new Error("fixture did not load");
    const result = solve(loaded.document);
    expect(result.native.kind).toBe("labels");
    if (result.native.kind !== "labels") return;
    expect(result.native.values.get(id("inclusive-debate"))).toBe("in");
    expect(result.native.values.get(id("racial-hatred"))).toBe("out");
    expect(result.native.values.get(id("causal-link-questionable"))).toBe("in");
    expect(result.native.values.get(id("excessive-sex-violence"))).toBe("out");
    expect(result.native.values.get(id("no-harm-trumps-freedom"))).toBe("in");
    expect(result.native.values.get(id("absolute-freedom"))).toBe("out");
    expect(result.native.values.get(id("freedom-of-speech"))).toBe("in");
    expect(result.native.values.get(id("censorship"))).toBe("out");
    expect(result.native.values.get(id("censorship-wrong"))).toBe("in");
    expect(result.warnings).toEqual([]);
  });
});
