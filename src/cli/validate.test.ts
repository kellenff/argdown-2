import { assertEquals } from "@std/assert";
import { runValidate } from "./validate.js";

const VALID_EDN = `#casualtheorics.argdown2/document
{:id :test
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :a}]}}
  :elements
  [#casualtheorics.argdown2.argdown/statement {:id :a :text "A"}]}}
`;

Deno.test("runValidate exits 0 for valid document", () => {
  const code = runValidate(VALID_EDN, { quiet: false });
  assertEquals(code, 0);
});

Deno.test("runValidate exits 1 for invalid document", () => {
  // Missing required fields.
  const code = runValidate("{:id :test}", { quiet: false });
  assertEquals(code, 1);
});

Deno.test("runValidate with quiet suppresses stderr output", () => {
  let captured = "";
  const original = Deno.stderr.writeSync;
  // deno-lint-ignore no-explicit-any
  (Deno.stderr as any).writeSync = (data: Uint8Array) => {
    captured += new TextDecoder().decode(data);
    return data.length;
  };
  const code = runValidate(VALID_EDN, { quiet: true });
  // deno-lint-ignore no-explicit-any
  (Deno.stderr as any).writeSync = original;
  assertEquals(code, 0);
  assertEquals(captured, "");
});
