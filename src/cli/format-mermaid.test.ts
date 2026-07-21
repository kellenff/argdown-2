import { assertStringIncludes } from "@std/assert";
import { formatMermaid } from "./format-mermaid.js";
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

Deno.test("formatMermaid emits graph header", () => {
  const out = formatMermaid(makeResult());
  assertStringIncludes(out, "graph LR");
});

Deno.test("formatMermaid embeds label in node", () => {
  const out = formatMermaid(makeResult());
  assertStringIncludes(out, "a[in]");
});

Deno.test("formatMermaid emits subgraph per solver", () => {
  const child = {
    ...makeResult(),
    id: "inner",
    solver: "casualtheorics.argdown2.solver/bipolar",
  } as unknown as ComponentSolveResult;
  const parent = {
    ...makeResult(),
    children: new Map([["inner", child]]),
  } as unknown as ComponentSolveResult;
  const out = formatMermaid(parent);
  assertStringIncludes(out, "subgraph grounded");
  assertStringIncludes(out, "subgraph bipolar");
});
