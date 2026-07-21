import { assertEquals } from "@std/assert";
import { formatResult } from "./format.js";

const FAKE_RESULT = {
  native: { kind: "labels", values: new Map([["a", "in"]]) },
  aggregate: { kind: "labels", values: new Map() },
  boundary: { kind: "labels", values: new Map() },
  children: new Map(),
  warnings: [],
} as unknown as Parameters<typeof formatResult>[0];

Deno.test("formatResult dispatches to table formatter", () => {
  const out = formatResult(FAKE_RESULT, "table");
  assertEquals(typeof out.text, "string");
  assertEquals(out.text.length > 0, true);
});

Deno.test("formatResult dispatches to json formatter", () => {
  const out = formatResult(FAKE_RESULT, "json");
  assertEquals(typeof out.text, "string");
  assertEquals(out.text.startsWith("{"), true);
});

Deno.test("formatResult dispatches to dot formatter", () => {
  const out = formatResult(FAKE_RESULT, "dot");
  assertEquals(out.text.startsWith("digraph"), true);
});

Deno.test("formatResult dispatches to mermaid formatter", () => {
  const out = formatResult(FAKE_RESULT, "mermaid");
  assertEquals(out.text.startsWith("graph"), true);
});
