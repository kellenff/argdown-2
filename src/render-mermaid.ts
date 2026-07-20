// src/render-mermaid.ts
// Pure renderer: validated argdown-2 Document → Mermaid `flowchart TD` source.

import type {
  Argument,
  Document,
  EntityId,
  Label,
  Relation,
  SolverComponent,
  Statement,
} from "./model.js";

export type RenderMermaidOptions = {
  /**
   * Optional label map (e.g. `solve(document).native.values` when
   * `native.kind === "labels"`). When provided, the renderer emits Mermaid
   * `classDef` blocks for `in`, `out`, and `undec` and assigns each labeled
   * node to the matching class.
   */
  labels?: ReadonlyMap<EntityId, Label>;
};

const ARROW_GLYPH: Record<Relation["kind"], string> = {
  attack: "-.->",
  contradiction: "==>",
  support: "-->",
  undercut: "-.->",
};

const PLACEHOLDER_EMPTY = 'empty["(no statements)"]';

function slugify(id: string): string {
  // Mermaid accepts A-Z, a-z, 0-9, and underscore. Replace any other
  // character (including `/`, `-`, `.`) with a single underscore, then
  // collapse runs of underscores and trim.
  const replaced = id.replace(/[^A-Za-z0-9_]+/g, "_");
  const collapsed = replaced.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return collapsed.length > 0 ? collapsed : "node";
}

function escapeLabel(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function allocateSlug(id: string, used: Set<string>): string {
  const base = slugify(id);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}_${n}`)) n++;
  const candidate = `${base}_${n}`;
  used.add(candidate);
  return candidate;
}

function statementLabel(s: Statement): string {
  return s.text !== undefined && s.text.length > 0 ? s.text : s.id;
}

function argumentLabel(a: Argument): string {
  const inner = a.description !== undefined && a.description.length > 0
    ? a.id + " - " + a.description
    : a.id;
  return `[Argument] ${inner}`;
}

function declaredIds(component: SolverComponent): Set<EntityId> {
  const ids = new Set<EntityId>();
  for (const el of component.elements) {
    if (
      el.kind === "statement" || el.kind === "argument" ||
      el.kind === "solver"
    ) {
      ids.add(el.id);
    }
  }
  return ids;
}

export function renderMermaid(
  document: Document,
  options: RenderMermaidOptions = {},
): string {
  const root = document.root;
  const usedSlugs = new Set<string>();
  const idToSlug = new Map<EntityId, string>();
  const nodes: string[] = [];
  const edges: string[] = [];
  const subgraphs: string[] = [];

  function declare(id: EntityId): string {
    const existing = idToSlug.get(id);
    if (existing !== undefined) return existing;
    const slug = allocateSlug(id, usedSlugs);
    idToSlug.set(id, slug);
    return slug;
  }

  function declareStatement(s: Statement): void {
    const slug = declare(s.id);
    nodes.push(`    ${slug}["${escapeLabel(statementLabel(s))}"]`);
  }

  function declareArgument(a: Argument): void {
    const slug = declare(a.id);
    nodes.push(`    ${slug}["${escapeLabel(argumentLabel(a))}"]`);
  }

  function declareSolver(child: SolverComponent): void {
    // Recurse one level only: child statements/arguments as subgraph nodes.
    // Documented limitation in CONTEXT.md - future work.
    const localSlugs: string[] = [];
    for (const el of child.elements) {
      if (el.kind === "statement") {
        declareStatement(el);
        localSlugs.push(idToSlug.get(el.id)!);
      } else if (el.kind === "argument") {
        declareArgument(el);
        localSlugs.push(idToSlug.get(el.id)!);
      }
    }
    const slug = allocateSlug(`sub_${child.id}`, usedSlugs);
    idToSlug.set(child.id, slug);
    subgraphs.push(`    subgraph ${slug}["${child.id} - ${child.solver}"]`);
    for (const s of localSlugs) {
      subgraphs.push(`        ${s}`);
    }
    subgraphs.push("    end");
  }

  // Pass 1: declare all nodes so edges can refer to slugs in any order.
  for (const el of root.elements) {
    if (el.kind === "statement") declareStatement(el);
    else if (el.kind === "argument") declareArgument(el);
    else if (el.kind === "solver") declareSolver(el);
  }

  // Pass 2: emit relation edges. Drop edges whose endpoints are not
  // declared at the root level - they are out-of-scope for the first
  // diagram and would otherwise reference unknown Mermaid ids.
  const scope = declaredIds(root);
  for (const el of root.elements) {
    if (
      el.kind === "statement" || el.kind === "argument" || el.kind === "solver"
    ) {
      continue;
    }
    if (!scope.has(el.from) || !scope.has(el.to)) continue;
    const fromSlug = idToSlug.get(el.from)!;
    const toSlug = idToSlug.get(el.to)!;
    const glyph = ARROW_GLYPH[el.kind];
    edges.push(`    ${fromSlug} ${glyph}|"${el.kind}"| ${toSlug}`);
  }

  let body: string[];
  if (nodes.length === 0 && subgraphs.length === 0) {
    body = [`    ${PLACEHOLDER_EMPTY}`];
  } else {
    body = [...nodes, ...edges, ...subgraphs];
  }

  // Optional classDef + class assignments.
  if (options.labels && options.labels.size > 0) {
    body.push("    classDef in    fill:#d4f4dd,stroke:#1a7f37,color:#1a7f37");
    body.push("    classDef out   fill:#ffe0e0,stroke:#cf222e,color:#cf222e");
    body.push("    classDef undec fill:#f0f0f0,stroke:#999,color:#666");
    const groups: Record<Label, string[]> = { in: [], out: [], undec: [] };
    for (const [id, label] of options.labels) {
      const slug = idToSlug.get(id);
      if (slug === undefined) continue;
      groups[label].push(slug);
    }
    for (const v of ["in", "out", "undec"] as const) {
      groups[v].sort();
      if (groups[v].length > 0) {
        body.push(`    class ${groups[v].join(",")} ${v}`);
      }
    }
  }

  return ["flowchart TD", ...body, ""].join("\n");
}
