# EDN Canonical Representation Design

**Date:** 2026-07-17  
**Status:** Approved in discussion; pending review of this written specification  
**Scope:** Replace the custom Argdown Extended syntax and source-oriented AST with an EDN-only, solver-rooted data model. The first cycle supports Argdown 1.x-shaped argument maps evaluated with grounded Dung semantics through a library API.

## 1. Context

The current package owns a custom `.argdown` language: a roughly 620-line BNF, a Chevrotain lexer, a hand-written recursive-descent parser, a source-positioned AST, visitors, a stringifier, a CLI, a Mermaid renderer, and several solver adapters coupled to that AST.

This cycle is a deliberate reset. EDN becomes the only authoring and interchange representation. There is no retained surface syntax, sugar layer, or dual-format path. The mathematical solver semantics remain the long-term contract, but the typed representation and data model are redesigned around portable tagged data instead of source syntax.

The first cycle is intentionally narrower than the current package:

- one solver and one theory per document;
- a grounded solver at the document root;
- an Argdown 1.x-shaped ontology for statements, arguments, inferences, and dialectical relations;
- a pure-attack reduction to a Dung argumentation framework;
- library APIs only.

Original Argdown 1.x examples, especially [A first example](https://argdown.org/guide/a-first-example.html), are the parity target.

## 2. Goals

- Make every source document valid standard EDN.
- Put the solver at the document root so the document declares how its argumentation is evaluated.
- Give every semantic form a collision-resistant, namespaced EDN tag.
- Represent the entities and premise-conclusion structures used by the canonical Argdown 1.x examples.
- Separate EDN reading, structural decoding, reference validation, mathematical reduction, and solving.
- Reuse the existing grounded-labeling mathematics behind a new internal Dung framework.
- Produce typed, validated domain data before any solver runs.
- Make future solver and theory families additive through new namespaced tags.

## 3. Non-goals

- Retaining or compiling from the current `.argdown` syntax.
- YAML or a second canonical representation.
- Multiple semantic theories or solver roots in one document.
- Preferred, stable, complete, bipolar, ASPIC+, or evidential solvers.
- A CLI, Mermaid renderer, formatter, EDN writer, or migration tool.
- Source ranges or editor-oriented partial recovery.
- Inferring dialectical relations implicitly from premise-conclusion structures.
- Giving support or undercut relations new Dung semantics.

## 4. Decisions summary

| Concern | Decision |
|---|---|
| Canonical format | EDN only |
| Root | One `#casualtheorics.argdown2.solver/grounded` tagged value |
| Root value | Vector of tagged theory elements |
| Theory vocabulary | Argdown 1.x-shaped statements, arguments, inferences, and relations |
| Tag namespace | Reverse-DNS-style `casualtheorics.argdown2.*` |
| Identity | Unique EDN keyword IDs |
| Reader | `edn-data`, using its default full-fidelity representation |
| Structural validation | Zod over the raw `edn-data` value |
| Semantic validation | Explicit identity and reference-resolution pass |
| Internal solver input | Reduced Dung framework |
| Grounded behavior | Attack edges retained; contradiction becomes mutual attack; support and undercut omitted with warnings |
| Compatibility | Intentional pre-1.0 breaking reset; no compatibility shim |
| Parity target | Official Argdown 1.x examples |

## 5. Canonical document shape

A file contains exactly one top-level tagged value. The root tag selects the solver, and its value is a vector of tagged theory elements:

```edn
#casualtheorics.argdown2.solver/grounded
[
  #casualtheorics.argdown2.argdown/statement
  {:id :censorship
   :text "Censorship is not wrong in principle."}

  #casualtheorics.argdown2.argdown/argument
  {:id :racial-hatred
   :description "Legislation against incitement to racial hatred is permissible."
   :tags #{:pro}
   :metadata {:source "P1b"}}

  #casualtheorics.argdown2.argdown/support
  {:from :racial-hatred
   :to :censorship}

  #casualtheorics.argdown2.argdown/argument
  {:id :inclusive-debate
   :description "Censorship drives racists underground."
   :tags #{:con}}

  #casualtheorics.argdown2.argdown/attack
  {:from :inclusive-debate
   :to :racial-hatred}
]
```

Vector order is documentary only. Identity and references use EDN keywords and do not depend on declaration order.

All examples use ordinary EDN maps, vectors, sets, keywords, strings, numbers, booleans, and `nil`. No custom reader macro or non-EDN syntax is permitted.

## 6. Namespaced tag vocabulary

### 6.1 Solver root

`#casualtheorics.argdown2.solver/grounded`

- Must be the sole top-level value.
- Its tagged value must be a vector.
- Selects the grounded Dung reduction and solver without a separate API or CLI semantics option.

### 6.2 Theory entities

`#casualtheorics.argdown2.argdown/statement`

- Required: `:id`.
- Optional: `:text`, `:tags`, `:metadata`.
- Becomes a node in the internal Dung framework.

`#casualtheorics.argdown2.argdown/argument`

- Required: `:id`.
- Optional: `:description`, `:tags`, `:metadata`, `:inferences`.
- `:inferences`, when present, is a vector of tagged inference values.
- Becomes a node in the internal Dung framework.

`#casualtheorics.argdown2.argdown/inference`

- Required: `:id`, `:premises`, `:conclusion`.
- `:premises` is a non-empty vector of statement IDs.
- `:conclusion` is one statement ID.
- Optional: `:rules`, `:metadata`.
- `:rules` is a vector of EDN keywords.
- An inference is internal logical structure, not a Dung node in this cycle.

An Argdown 1.x premise-conclusion structure is represented without positional syntax:

```edn
#casualtheorics.argdown2.argdown/argument
{:id :freedom-of-speech
 :description "Censorship is wrong in principle."
 :inferences
 [#casualtheorics.argdown2.argdown/inference
  {:id :freedom-of-speech-main-inference
   :premises [:absolute-freedom
              :censorship-violates-freedom
              :absolute-rights-rule]
   :conclusion :censorship-is-wrong
   :rules [:specification :modus-ponens]}]}
```

All premise and conclusion IDs refer to root-level statement declarations. Multi-step arguments contain multiple inference values.

### 6.3 Relations

Each relation is a tagged map with required `:from` and `:to` keyword references:

- `#casualtheorics.argdown2.argdown/support`
- `#casualtheorics.argdown2.argdown/attack`
- `#casualtheorics.argdown2.argdown/contradiction`
- `#casualtheorics.argdown2.argdown/undercut`

Support, attack, and contradiction endpoints refer to statement or argument IDs. An undercut source refers to a statement or argument ID, while its target refers to an inference ID.

IDs are unique across statements, arguments, and inferences so every reference is unambiguous. Relations do not require identities in the first cycle.

### 6.4 Extensibility rules

- Unknown tags are errors.
- Missing required keys, duplicate IDs, dangling references, invalid endpoint kinds, and incorrect value types are errors.
- Unknown keys inside recognized tagged maps are preserved.
- `:metadata` may contain any standard EDN value but never affects solver behavior.
- Additive fields may be introduced compatibly.
- A breaking change to a tag's meaning requires a new namespaced tag; an existing tag is never silently reinterpreted.

## 7. `edn-data` reader contract

This contract was checked against `edn-data` 1.2.1. Implementation installs the latest release and reruns the reader characterization suite before relying on these behaviors.

The reader adapter uses `edn-data`'s default, lossless, JSON-compatible representation:

| EDN value | `edn-data` representation |
|---|---|
| Tagged value | `{ tag: string, val: EDNVal }` |
| Map | `{ map: [EDNVal, EDNVal][] }` |
| Keyword | `{ key: string }` |
| Set | `{ set: EDNVal[] }` |
| Vector | `EDNVal[]` |

The adapter does not use `mapAs: 'object'` or `keywordAs: 'string'`. Those conveniences can coerce rich keys or erase distinctions needed for arbitrary EDN metadata.

The adapter does not register `tagHandlers`. Unknown tagged values are naturally retained as `{ tag, val }`, allowing one validation path to recognize supported tags and reject unsupported tags.

`parseEDNString()` returns the first top-level form. To enforce the one-root contract without writing a lexer, the adapter encloses the source in a vector, reads that vector, and requires exactly one member:

```ts
const forms = parseEDNString(`[${source}\n]`);

if (!Array.isArray(forms) || forms.length !== 1) {
  return readFailure('Expected exactly one top-level EDN value');
}
```

If output generation is added later, it should use `toEDNString()` with the same full-fidelity representation. A custom EDN stringifier is out of scope.

### 7.1 Reader limitations

`edn-data` does not expose source positions or structured parser errors, and its parser is permissive around some malformed input. The package therefore cannot promise line or column diagnostics.

Before depending on the reader, characterization tests must cover at least:

- unbalanced collections;
- unterminated strings;
- odd map arity;
- multiple top-level forms;
- orphan tags;
- invalid numeric tokens;
- unexpected trailing delimiters.

If the reader silently accepts a malformed case that cannot be identified from the returned value, the implementation must reopen EDN reader selection. It must not compensate by creating a custom lexer, because doing so would undermine the goal of relying on a standard format and reader.

## 8. Validation and transformation

Validation has two layers after EDN reading.

### 8.1 Zod wire validation

Zod validates the raw `edn-data` representation and transforms it into ergonomic domain data:

- the exact solver root tag;
- one vector as the root value;
- recognized child tags;
- map entry shape;
- required keyword keys;
- keyword IDs and references;
- vectors, sets, scalar fields, and metadata values;
- per-tag required fields and field types.

Schemas preserve unrecognized fields on recognized tagged maps. They do not assign semantic meaning to those fields.

Zod is not a lexer. It sees only the value returned by `edn-data` and cannot detect source text that the reader has already discarded or normalized.

### 8.2 Semantic validation

A focused resolution pass validates constraints that span tagged values:

- global uniqueness of statement, argument, and inference IDs;
- existence of every relation endpoint;
- existence of every premise and conclusion;
- statement-only premise and conclusion references;
- statement-or-argument endpoints for support, attack, and contradiction;
- inference targets for undercuts.

Only this pass can construct a `GroundedDocument`. The solver accepts that validated type, never raw EDN or partially decoded data.

## 9. Domain model

The new model is semantic data, not a source AST. It has no token nodes, CST shape, source locations, comments-as-nodes, or formatting trivia.

Representative types:

```ts
type EntityId = string & { readonly __brand: 'EntityId' };
type InferenceId = string & { readonly __brand: 'InferenceId' };

type GroundedDocument = {
  solver: 'casualtheorics.argdown2.solver/grounded';
  elements: readonly TheoryElement[];
};

type Statement = {
  kind: 'statement';
  id: EntityId;
  text?: string;
  tags?: ReadonlySet<string>;
  metadata?: EdnValue;
  extra: ReadonlyMap<EdnValue, EdnValue>;
};
```

The exact internal TypeScript spelling may be refined during implementation, but these invariants are fixed:

- all public documents are validated;
- solver and element kinds are discriminated;
- identity is independent of vector order;
- unknown recognized-map fields and metadata remain lossless EDN values;
- solver code does not depend on the raw `edn-data` representation.

## 10. Dung reduction and grounded solving

The validated document reduces to a small internal Dung framework:

```ts
type DungFramework = {
  nodes: ReadonlySet<EntityId>;
  attackersByTarget: ReadonlyMap<EntityId, ReadonlySet<EntityId>>;
};
```

Reduction rules:

1. Every statement and argument ID becomes a Dung node.
2. An attack relation creates one directed attack from `:from` to `:to`.
3. A contradiction creates directed attacks in both directions.
4. Support is retained in the domain document but omitted from the Dung framework with an explicit warning.
5. Undercut is retained in the domain document but omitted with an explicit warning.
6. Inferences do not become Dung nodes.
7. No relation is derived implicitly from an argument's premises or conclusion.

The existing grounded fixpoint mathematics is retained behind this framework. Its implementation no longer imports the old source AST.

This reduction intentionally matches the current solver's pure-attack boundary. The cycle does not invent a bipolar interpretation of support or an ASPIC+ interpretation of inference and undercut.

## 11. Public API

```ts
function load(source: string): LoadResult;
function validate(value: unknown): ValidationResult;
function solve(document: GroundedDocument): SolveResult;
```

`load()` reads EDN and delegates to `validate()`.

`validate()` accepts the raw full-fidelity value produced by `edn-data`, applies Zod decoding, resolves references, and returns a validated document.

`solve()` dispatches from the document's root solver tag. Callers do not supply a separate semantics option.

Representative results:

```ts
type Diagnostic = {
  code: string;
  message: string;
  path?: readonly (string | number)[];
};

type LoadResult =
  | { ok: true; document: GroundedDocument }
  | { ok: false; errors: readonly Diagnostic[] };

type SolveResult = {
  solver: 'casualtheorics.argdown2.solver/grounded';
  labels: ReadonlyMap<EntityId, 'in' | 'out' | 'undec'>;
  warnings: readonly Diagnostic[];
};
```

Diagnostics use semantic paths such as `[3, ':to']`. Source positions are not part of the contract. There is no partial document: malformed or unresolved data cannot be solved safely.

## 12. Components

The implementation should preserve the repository's responsibility-based module boundaries:

```text
src/
  edn.ts                 # edn-data adapter; one-root enforcement
  schema.ts              # Zod wire schemas and transformations
  model.ts               # domain and result types
  validate.ts            # cross-element identity/reference validation
  reduce-dung.ts         # GroundedDocument -> DungFramework
  grounded.ts            # generic grounded-labeling fixpoint
  index.ts               # public exports
```

Tests remain co-located by responsibility. Modules should remain under the repository's existing line and complexity limits.

## 13. Error behavior

- EDN reader failure: one `edn/read-error` diagnostic using the reader's message when available.
- Wrong number of roots: one `edn/root-count` diagnostic.
- Zod failure: stable domain-specific codes and paths translated from schema issues.
- Identity or reference failure: collect all discoverable errors in one validation pass.
- Unsupported tag: `edn/unsupported-tag`.
- Unsupported-but-valid reduction feature: warning, not error, because the source remains representable.
- Solver functions never throw for validated domain input.

## 14. Argdown 1.x parity

Parity is representational and mathematical, not textual:

- statements and arguments from the selected official examples exist with stable IDs and content;
- tags and metadata are preserved;
- premise-conclusion structures become explicit nested inferences;
- dialectical support, attack, contradiction, and undercut relations are representable;
- relations that Argdown 1.x previously inferred implicitly are materialized explicitly in EDN;
- the expected pure-attack Dung graph and grounded labels are asserted.

Checked-in EDN fixtures should cite their corresponding official example and keep a small mapping note for any relation that was implicit in the original.

## 15. Testing strategy

1. **Reader characterization:** establish precisely which malformed forms `edn-data` accepts or rejects.
2. **Wire-schema tests:** one valid and invalid case for every tag, field, and raw EDN representation.
3. **Semantic-validation tests:** duplicate IDs, missing references, endpoint-kind errors, and multi-error collection.
4. **Reduction tests:** nodes, directed attacks, mutual contradiction attacks, and warnings for omitted support/undercut.
5. **Grounded-kernel tests:** retain direct mathematical fixpoint cases independent of EDN.
6. **Parity fixtures:** convert the official Argdown 1.x censorship examples and snapshot the domain model, reduction, and labels.
7. **Integration tests:** EDN source through `load()` and `solve()`.
8. **Property tests where useful:** vector order does not change identity, reduction, or labels.

No custom lexer, parser, AST-stringifier, CLI, or renderer tests remain.

## 16. Repository transition

This is a full replacement:

- delete the custom lexer, parser, parser helpers, visitors, source AST, stringifier, CLI, Mermaid renderer, and `.argdown` fixtures;
- remove Chevrotain, binary packaging, parser benchmarks, obsolete baselines, and their configuration;
- add the latest `edn-data` and Zod versions through the package manager;
- adapt only the generic grounded-labeling kernel to the new internal framework;
- delete old AST-coupled advanced solver modules and tests from the active source tree; git history remains the reference when those mathematical implementations are ported later;
- rewrite package exports and documentation around the EDN library API;
- retain historical design and plan documents as project history, while clearly marking the old grammar documentation obsolete or removing it from user-facing navigation.

There is no backward-compatibility shim. This is an intentionally breaking pre-1.0 reset.

## 17. Future extension path

Future semantics add solver-root and theory tags without changing existing meanings, for example:

- `#casualtheorics.argdown2.solver/preferred`
- `#casualtheorics.argdown2.dung/argument`
- `#casualtheorics.argdown2.aspic/preference`
- `#casualtheorics.argdown2.evidential/support`

Multiple semantic subgraphs or multiple evaluation lenses may later require a composition root above solver values. That shape is deliberately not pre-built in this cycle. V1 has exactly one solver-rooted document.

