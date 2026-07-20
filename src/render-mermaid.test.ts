import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { load, solve } from "./index.js";
import { renderMermaid } from "./render-mermaid.js";

const MINIMAL = `
#casualtheorics.argdown2/document
{:id :small-minimal
 :root
 #casualtheorics.argdown2.solver/bipolar
 {:id :root
  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :a}]}}
  :elements
  [#casualtheorics.argdown2.argdown/statement {:id :a :text "A"}
   #casualtheorics.argdown2.argdown/statement {:id :b :text "B"}
   #casualtheorics.argdown2.argdown/attack
   {:id :attack-a-b :from :a :to :b}
   #casualtheorics.argdown2.argdown/contradiction
   {:id :contradiction-a-c :from :a :to :c}
   #casualtheorics.argdown2.argdown/support
   {:id :support-a-d :from :a :to :d}
   #casualtheorics.argdown2.argdown/statement {:id :c :text "C"}
   #casualtheorics.argdown2.argdown/statement {:id :d :text "D"}]}}
`;

const NESTED = `
#casualtheorics.argdown2/document
{:id :nested
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :a}]}}
  :elements
  [#casualtheorics.argdown2.argdown/statement {:id :a :text "A"}
   #casualtheorics.argdown2.solver/grounded
   {:id :child
    :interface
    {:aggregate
     #casualtheorics.argdown2.aggregate/identity
     {:inputs [{:ref :c}]}}
    :elements
    [#casualtheorics.argdown2.argdown/statement {:id :c :text "C"}]}
   #casualtheorics.argdown2.argdown/attack
   {:id :attack-a-c :from :a :to :child}]}}
`;

const SCOPED_DUPLICATES = `
#casualtheorics.argdown2/document
{:id :scoped-duplicates
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :left}]}}
  :elements
  [#casualtheorics.argdown2.solver/grounded
   {:id :left
    :interface
    {:aggregate
     #casualtheorics.argdown2.aggregate/identity
     {:inputs [{:ref :claim}]}}
    :elements
    [#casualtheorics.argdown2.argdown/statement
     {:id :claim :text "Left claim"}]}
   #casualtheorics.argdown2.solver/grounded
   {:id :right
    :interface
    {:aggregate
     #casualtheorics.argdown2.aggregate/identity
     {:inputs [{:ref :claim}]}}
    :elements
    [#casualtheorics.argdown2.argdown/statement
     {:id :claim :text "Right claim"}]}]}}
`;

const ARGUMENT = `
#casualtheorics.argdown2/document
{:id :arg-doc
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :a}]}}
  :elements
  [#casualtheorics.argdown2.argdown/statement {:id :a :text "A"}
   #casualtheorics.argdown2.argdown/argument
   {:id :my-arg :description "A pro argument"}
   #casualtheorics.argdown2.argdown/attack
   {:id :attack :from :a :to :my-arg}]}}
`;

const COLLISION = `
#casualtheorics.argdown2/document
{:id :collision
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :weird_id}]}}
  :elements
  [#casualtheorics.argdown2.argdown/statement {:id :weird_id :text "First"}
   #casualtheorics.argdown2.argdown/statement {:id :weird/id :text "Second"}
   #casualtheorics.argdown2.argdown/statement {:id :weird-id :text "Third"}]}}
`;

const ESCAPE = `
#casualtheorics.argdown2/document
{:id :escape
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :s}]}}
  :elements
  [#casualtheorics.argdown2.argdown/statement
   {:id :s :text "Use & <angles>"}]}}
`;

const RESERVED_ID = `
#casualtheorics.argdown2/document
{:id :reserved-id
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :end}]}}
  :elements
  [#casualtheorics.argdown2.argdown/statement {:id :end :text "End"}]}}
`;

const EMPTY = `
#casualtheorics.argdown2/document
{:id :empty
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :nope}]}}
  :elements
  [#casualtheorics.argdown2.argdown/statement {:id :nope}]}}
`;

function loadDoc(src: string) {
  const r = load(src);
  if (!r.ok) throw new Error("load failed: " + JSON.stringify(r.errors));
  return r.document;
}

describe("renderMermaid", () => {
  it("emits a flowchart TD with relation-kind glyphs", () => {
    const doc = loadDoc(MINIMAL);
    const out = renderMermaid(doc);
    expect(out.startsWith("flowchart TD\n")).toBe(true);
    expect(out).toContain('-.->|"attack"|');
    expect(out).toContain('==>|"contradiction"|');
    expect(out).toContain('-->|"support"|');
    expect(out).toContain('["A"]');
    expect(out).toContain('["B"]');
    expect(out).toContain('["C"]');
    expect(out).toContain('["D"]');
  });

  it("renders contradiction as reciprocal thick edges", () => {
    const doc = loadDoc(MINIMAL);
    const edges = renderMermaid(doc).split("\n").filter((line) =>
      line.includes('==>|"contradiction"|')
    );
    expect(edges).toHaveLength(2);
    const first = edges[0]?.match(/^\s*(\w+) ==>\|"contradiction"\| (\w+)$/);
    const second = edges[1]?.match(/^\s*(\w+) ==>\|"contradiction"\| (\w+)$/);
    expect(first?.slice(1)).toEqual(second?.slice(1).reverse());
  });

  it("renders a child solver as a subgraph", () => {
    const doc = loadDoc(NESTED);
    const out = renderMermaid(doc);
    expect(out).toContain("subgraph ");
    expect(out).toContain("end");
    expect(out).toMatch(/subgraph sub_child/);
    expect(out).not.toContain("undefined");
    expect(out).toMatch(/[a-z_]+ -\.->\|"attack"\| sub_child/);
  });

  it("keeps repeated ids distinct across child solver scopes", () => {
    const doc = loadDoc(SCOPED_DUPLICATES);
    const out = renderMermaid(doc);
    const leftSlug = out.match(/^ {4}([a-z0-9_]+)\["Left claim"\]$/m)?.[1];
    const rightSlug = out.match(/^ {4}([a-z0-9_]+)\["Right claim"\]$/m)?.[1];
    expect(leftSlug).toBeDefined();
    expect(rightSlug).toBeDefined();
    expect(leftSlug).not.toBe(rightSlug);
  });

  it("renders an argument as a single labelled node", () => {
    const doc = loadDoc(ARGUMENT);
    const out = renderMermaid(doc);
    expect(out).toContain("[Argument] my-arg");
    expect(out).toContain("A pro argument");
  });

  it("emits classDef lines when labels are provided", () => {
    const doc = loadDoc(MINIMAL);
    const solved = solve(doc);
    if (solved.native.kind !== "labels") throw new Error("expected labels");
    const out = renderMermaid(doc, { labels: solved.native.values });
    expect(out).toContain("classDef in");
    expect(out).toContain("classDef out");
    expect(out).toContain("classDef undec");
    // Some class assignment line should appear (in or undec in this graph).
    expect(out).toMatch(/^ {4}class [a-z_,]+ (in|out|undec)/m);
  });

  it("does not add classDef lines when labels are omitted", () => {
    const doc = loadDoc(MINIMAL);
    const out = renderMermaid(doc);
    expect(out).not.toContain("classDef");
    expect(out).not.toMatch(/^ {4}class /m);
  });

  it("handles id slug collisions by appending _2, _3", () => {
    const doc = loadDoc(COLLISION);
    const out = renderMermaid(doc);
    expect(out).toContain('weird_id["First"]');
    expect(out).toContain('weird_id_2["Second"]');
    expect(out).toContain('weird_id_3["Third"]');
  });

  it("falls back to the empty-doc placeholder when no elements", () => {
    const doc = loadDoc(EMPTY);
    const synthetic = { ...doc, root: { ...doc.root, elements: [] } };
    const out = renderMermaid(synthetic);
    expect(out).toContain("(no statements)");
  });

  it("escapes special characters in labels", () => {
    const doc = loadDoc(ESCAPE);
    const out = renderMermaid(doc);
    expect(out).toContain("&amp;");
    expect(out).toContain("&lt;angles&gt;");
  });

  it("prefixes node ids that collide with Mermaid keywords", () => {
    const doc = loadDoc(RESERVED_ID);
    const out = renderMermaid(doc);
    expect(out).toContain('node_end["End"]');
    expect(out).not.toMatch(/^ {4}end\[/m);
  });
});
