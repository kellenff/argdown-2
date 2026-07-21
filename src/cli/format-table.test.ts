import { assertEquals, assertStringIncludes } from "@std/assert";
import { formatTable } from "./format-table.js";
import type {
  ComponentSolveResult,
  EntityId,
  Label,
  SolverTag,
} from "../model.js";

function makeResult(
  labels: Record<string, Label>,
  solver: SolverTag = "casualtheorics.argdown2.solver/grounded",
): ComponentSolveResult {
  return {
    id: "root",
    solver,
    native: { kind: "labels", values: new Map(Object.entries(labels)) },
    aggregate: { kind: "label", value: "in" },
    boundary: { confidence: null },
    children: new Map(),
    warnings: [],
  } as unknown as ComponentSolveResult;
}

Deno.test("formatTable emits ## IN section", () => {
  const out = formatTable(makeResult({ a: "in" }));
  assertStringIncludes(out, "## IN");
});

Deno.test("formatTable emits ## OUT section", () => {
  const out = formatTable(makeResult({ a: "out" }));
  assertStringIncludes(out, "## OUT");
});

Deno.test("formatTable emits ## UNDETERMINED section", () => {
  const out = formatTable(makeResult({ a: "undec" }));
  assertStringIncludes(out, "## UNDETERMINED");
});

Deno.test("formatTable omits empty sections", () => {
  const out = formatTable(makeResult({ a: "in" }));
  assertEquals(out.includes("## OUT"), false);
  assertEquals(out.includes("## UNDETERMINED"), false);
});

Deno.test("formatTable emits per-solver heading for mixed semantics", () => {
  const child = makeResult(
    { x: "undec" },
    "casualtheorics.argdown2.solver/bipolar",
  );
  const parent = {
    ...makeResult({ a: "in" }, "casualtheorics.argdown2.solver/grounded"),
    children: new Map([["inner", child]]),
  } as unknown as ComponentSolveResult;
  const out = formatTable(parent);
  assertStringIncludes(out, "## solver/grounded");
  assertStringIncludes(out, "## solver/bipolar");
});

Deno.test("formatTable includes statement text when lookup is provided", () => {
  const textLookup = new Map<EntityId, string>([
    ["a" as EntityId, "Statement A text"],
    ["b" as EntityId, "Statement B text"],
  ]);
  const out = formatTable(makeResult({ a: "in", b: "out" }), textLookup);
  assertStringIncludes(out, "- [#a] Statement A text");
  assertStringIncludes(out, "- [#b] Statement B text");
});

Deno.test("formatTable falls back to bare id when text is missing", () => {
  const textLookup = new Map<EntityId, string>([
    ["a" as EntityId, "Statement A text"],
  ]);
  const out = formatTable(makeResult({ a: "in", b: "out" }), textLookup);
  assertStringIncludes(out, "- [#a] Statement A text");
  assertStringIncludes(out, "- [#b]");
});

Deno.test("formatTable works without textLookup (backward compatible)", () => {
  const out = formatTable(makeResult({ a: "in" }));
  assertStringIncludes(out, "- [#a]");
});
