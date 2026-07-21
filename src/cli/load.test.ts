import { assertEquals, assertStringIncludes } from "@std/assert";

import { loadAndReport } from "./load.js";

const VALID_EDN = `#casualtheorics.argdown2/document
{:id :test
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :interface {:aggregate
    #casualtheorics.argdown2.aggregate/identity
    {:inputs [{:ref :a}]}}
  :elements [
    #casualtheorics.argdown2.argdown/statement {:id :a}
  ]}}
`;

Deno.test("loadAndReport returns ok for valid EDN", () => {
  const result = loadAndReport(VALID_EDN, { quiet: false });
  assertEquals(result.ok, true);
  assertEquals(result.diagnostics.length, 0);
});

Deno.test("loadAndReport returns diagnostics for invalid EDN", () => {
  const result = loadAndReport("not valid edn (", { quiet: false });
  assertEquals(result.ok, false);
  assertEquals(result.diagnostics.length > 0, true);
  assertStringIncludes(result.diagnostics[0].code, "edn/");
});

Deno.test("loadAndReport with quiet=true suppresses stderr", () => {
  let captured = "";
  const original = Deno.stderr.writeSync;
  // deno-lint-ignore no-explicit-any
  (Deno.stderr as any).writeSync = (data: Uint8Array) => {
    captured += new TextDecoder().decode(data);
    return data.length;
  };
  const result = loadAndReport("not valid edn (", { quiet: true });
  // deno-lint-ignore no-explicit-any
  (Deno.stderr as any).writeSync = original;
  assertEquals(result.ok, false);
  assertEquals(captured, "");
});
