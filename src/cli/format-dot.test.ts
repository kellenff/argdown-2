import { assertStringIncludes } from "@std/assert";
import { formatDot } from "./format-dot.js";
import type { ComponentSolveResult } from "../model.js";

function makeResult(): ComponentSolveResult {
  return {
    native: { kind: "labels", values: new Map([["a", "in"]]) },
    aggregate: { kind: "label", value: "in" },
    boundary: { confidence: 1 },
    children: new Map(),
    warnings: [],
    solver: "casualtheorics.argdown2.solver/grounded",
    id: "root",
  } as unknown as ComponentSolveResult;
}

Deno.test("formatDot emits digraph header", () => {
  const out = formatDot(makeResult());
  assertStringIncludes(out, "digraph arguments");
});

Deno.test("formatDot colors in-labels green", () => {
  const out = formatDot(makeResult());
  assertStringIncludes(out, "color=green");
});

Deno.test("formatDot emits subgraph for each solver", () => {
  const child = {
    ...makeResult(),
    id: "inner",
    solver: "casualtheorics.argdown2.solver/bipolar",
  } as unknown as ComponentSolveResult;
  const parent = {
    ...makeResult(),
    children: new Map([["inner", child]]),
  } as unknown as ComponentSolveResult;
  const out = formatDot(parent);
  assertStringIncludes(out, "subgraph cluster_root");
  assertStringIncludes(out, "subgraph cluster_inner");
});
