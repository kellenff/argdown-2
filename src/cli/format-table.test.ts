import { assertEquals, assertStringIncludes } from "@std/assert";
import { formatTable } from "./format-table.js";
import type { ComponentSolveResult, Label, SolverTag } from "../model.js";

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
