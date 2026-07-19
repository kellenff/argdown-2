import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import {
  defenseClosure,
  findCompleteExtensions,
  findPreferredExtensions,
  findStableExtensions,
  intersectExtensions,
  isAdmissible,
  isClosedUnderDefense,
  isConflictFree,
  isStable,
  stripAux,
} from "./multi-extension.js";
import type { EntityId } from "./model.js";

const id = (value: string) => value as EntityId;

function map(
  entries: readonly (readonly [string, readonly string[]])[],
): Map<EntityId, EntityId[]> {
  return new Map(
    entries.map(([target, attackers]) => [id(target), attackers.map(id)]),
  );
}

describe("multi-extension helpers", () => {
  it("detects conflict-free and admissible sets", () => {
    const attackMap = map([["A", ["B"]], ["B", ["A"]]]);
    expect(isConflictFree(new Set([id("A")]), attackMap)).toBe(true);
    expect(isAdmissible(new Set([id("A")]), attackMap)).toBe(true);
    expect(isAdmissible(new Set([id("A"), id("B")]), attackMap)).toBe(false);
  });

  it("computes defense closure and closed-under-defense", () => {
    const attackMap = map([["A", []], ["B", ["A"]], ["C", ["B"]]]);
    const closure = defenseClosure(new Set([id("A")]), attackMap);
    expect([...closure].sort()).toEqual(["A", "C"]);
    expect(isClosedUnderDefense(new Set([id("A"), id("C")]), attackMap)).toBe(
      true,
    );
  });

  it("checks stability", () => {
    const twoCycle = map([["A", ["B"]], ["B", ["A"]]]);
    expect(isStable(new Set([id("A")]), twoCycle)).toBe(true);
    const threeCycle = map([["A", ["C"]], ["B", ["A"]], ["C", ["B"]]]);
    expect(isStable(new Set([id("A")]), threeCycle)).toBe(false);
  });

  it("strips auxiliary keys", () => {
    const set = new Set([id("A"), id("sup:A->B"), id("nec:B->C"), id("B")]);
    expect([...stripAux(set)].sort()).toEqual(["A", "B"]);
  });
});

describe("findPreferredExtensions", () => {
  it("returns the empty preferred extension for an empty map", () => {
    expect(findPreferredExtensions(new Map()).length).toBe(1);
    expect(findPreferredExtensions(new Map())[0]!.size).toBe(0);
  });

  it("returns a singleton for an unattacked source", () => {
    const result = findPreferredExtensions(map([["A", []]]));
    expect(result.length).toBe(1);
    expect([...result[0]!]).toEqual(["A"]);
  });

  it("returns two preferred extensions for a 2-cycle", () => {
    const result = findPreferredExtensions(map([["A", ["B"]], ["B", ["A"]]]));
    expect(result.length).toBe(2);
  });

  it("returns only the empty set for a 3-cycle", () => {
    const result = findPreferredExtensions(
      map([["A", ["C"]], ["B", ["A"]], ["C", ["B"]]]),
    );
    expect(result.length).toBe(1);
    expect(result[0]!.size).toBe(0);
  });
});

describe("findStableExtensions", () => {
  it("returns no stable extensions for an empty map", () => {
    expect(findStableExtensions(new Map())).toEqual([]);
  });

  it("returns two stable extensions for a 2-cycle", () => {
    const result = findStableExtensions(map([["A", ["B"]], ["B", ["A"]]]));
    expect(result.length).toBe(2);
  });

  it("returns no stable extensions for a 3-cycle", () => {
    expect(
      findStableExtensions(
        map([["A", ["C"]], ["B", ["A"]], ["C", ["B"]]]),
      ),
    ).toEqual([]);
  });
});

describe("findCompleteExtensions", () => {
  it("returns the empty complete extension for a 3-cycle", () => {
    const result = findCompleteExtensions(
      map([["A", ["C"]], ["B", ["A"]], ["C", ["B"]]]),
    );
    expect(result.length).toBe(1);
    expect(result[0]!.size).toBe(0);
  });

  it("returns three complete extensions for a 2-cycle", () => {
    const result = findCompleteExtensions(map([["A", ["B"]], ["B", ["A"]]]));
    expect(result.length).toBe(3);
  });
});

describe("intersectExtensions", () => {
  it("intersects extension sets", () => {
    const extensions = [
      new Set([id("A"), id("B")]),
      new Set([id("A"), id("C")]),
    ];
    expect([...intersectExtensions(extensions)].sort()).toEqual(["A"]);
  });
});
