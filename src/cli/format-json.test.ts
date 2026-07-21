import { assertEquals, assertStringIncludes } from "@std/assert";
import { formatJson } from "./format-json.js";
import type { ComponentSolveResult } from "../model.js";

function makeResult(): ComponentSolveResult {
  return {
    native: { kind: "labels", values: new Map([["a", "in"], ["b", "out"]]) },
    aggregate: { kind: "label", value: "in" },
    boundary: { confidence: 1 },
    children: new Map(),
    warnings: [],
    solver: "casualtheorics.argdown2.solver/grounded",
    id: "root",
  } as unknown as ComponentSolveResult;
}

Deno.test("formatJson emits valid JSON object", () => {
  const out = formatJson(makeResult());
  const parsed = JSON.parse(out);
  assertEquals(typeof parsed, "object");
});

Deno.test("formatJson threads labels through structure", () => {
  const out = formatJson(makeResult());
  assertStringIncludes(out, '"labels"');
  assertStringIncludes(out, '"solver"');
  assertStringIncludes(out, 'grounded"');
});

Deno.test("formatJson includes diagnostics and warnings arrays", () => {
  const out = formatJson(makeResult());
  const parsed = JSON.parse(out);
  assertEquals(Array.isArray(parsed.diagnostics), true);
  assertEquals(Array.isArray(parsed.warnings), true);
});

Deno.test("formatJson emits empty labels for extensions branch", () => {
  const result = {
    native: { kind: "extensions", values: [new Set(["a"])] },
    aggregate: { kind: "extension-membership", value: [true] },
    boundary: { confidence: 1 },
    children: new Map(),
    warnings: [],
    solver: "casualtheorics.argdown2.solver/preferred",
    id: "root",
  } as unknown as ComponentSolveResult;
  const out = formatJson(result);
  const parsed = JSON.parse(out);
  assertEquals(parsed.root.labels, {});
  assertEquals(parsed.root.solver, "preferred"); // short form after prefix strip
});
