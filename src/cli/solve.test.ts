import { assertEquals } from "@std/assert";
import { runSolve } from "./solve.js";

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
  [#casualtheorics.argdown2.argdown/statement {:id :a :text "A"}
   #casualtheorics.argdown2.argdown/statement {:id :b :text "B"}
   #casualtheorics.argdown2.argdown/attack {:id :attack-a-b :from :a :to :b}]}}
`;

Deno.test("runSolve exits 0 for valid document", () => {
  const code = runSolve(VALID_EDN, { quiet: false, format: "table" });
  assertEquals(code, 0);
});

Deno.test("runSolve exits 1 for invalid document", () => {
  const code = runSolve("not valid edn (", { quiet: false, format: "table" });
  assertEquals(code, 1);
});
