# First-Class Solver Components Design

**Date:** 2026-07-19
**Status:** Proposed
**Scope:** Replace bare solver-rooted vectors with a document map whose root is
an identified solver component. Solver components may nest, participate in
parent relations through a boundary output, and compose bottom-up.

**Formal companion:**
[`2026-07-19-first-class-solver-components-category-theory.md`](2026-07-19-first-class-solver-components-category-theory.md)

## 1. Context

The nested-solvers POC placed anonymous solver-tagged vectors among theory
elements and returned independent nested results. That exposed useful rough
edges, but it did not make nesting part of the represented argument:

- solvers had no IDs;
- parent relations could not address a child solver;
- result compatibility was implicit;
- recursive TypeScript shapes could admit states rejected only by EDN decoding;
- the wire format did not state how child results participate in parent
  semantics.

This design replaces that POC shape. Solver components become first-class,
identified nodes in the argument. A child solves its local graph, publishes a
common boundary confidence, and appears as an endpoint in its parent's graph.
Evaluation is strictly bottom-up: parent relations affect the child's boundary
proxy in the parent, never the child's internal solve.

## 2. Goals

- Make the document an identified, namespaced tagged map.
- Make every solver an identified component with an internal element scope.
- Preserve structural nesting in the authored representation.
- Make child solver IDs valid endpoints of parent relations.
- Preserve every solver's native result while exposing one common boundary
  shape.
- Support future weighted and multi-extension composition without changing the
  document or interface envelope.
- Give all relations stable IDs so parallel and relation-targeting edges are
  representable.
- Keep evaluation well-founded and suitable for formal review.

## 3. Non-goals

- A global solver registry in the authored EDN. Implementations may derive an
  index, but storage-oriented indexing does not belong in the representation.
- Feedback from a parent graph into a child's internal solve.
- One universal interpretation of confidence for every parent semantics.
- Multi-input aggregation in the first implementation.
- Treating attack/support paths as categorical composition.
- Claiming that arbitrary relation-on-relation edges form a 2-category.
- Restoring the old custom Argdown syntax.

## 4. Canonical document and solver shape

```edn
#casualtheorics.argdown2/document
{:id :policy-analysis

 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :main

  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :cost-analysis}]}}

  :elements
  [#casualtheorics.argdown2.solver/grounded
   {:id :cost-analysis

    :interface
    {:aggregate
     #casualtheorics.argdown2.aggregate/identity
     {:inputs [{:ref :costs-acceptable}]}}

    :elements
    [#casualtheorics.argdown2.argdown/statement
     {:id :costs-acceptable}

     #casualtheorics.argdown2.argdown/statement
     {:id :costs-excessive}

     #casualtheorics.argdown2.argdown/attack
     {:id :cost-objection
      :from :costs-excessive
      :to :costs-acceptable}]}

   #casualtheorics.argdown2.argdown/statement
   {:id :budget-objection}

   #casualtheorics.argdown2.argdown/attack
   {:id :budget-attacks-cost-analysis
    :from :budget-objection
    :to :cost-analysis}]}}
```

The document tag remains an unambiguous format discriminator. Its value is a
map rather than a solver value. The `:root` value is one inline solver
component; nested solver components occur where they belong in the represented
argument.

Vector order is documentary only. Identity and references do not depend on
declaration order.

## 5. Identity and lexical scopes

Each solver component owns one local scope formed by its direct `:elements`.
The local address space includes:

- statements;
- arguments;
- inferences;
- immediate child solver components;
- identified relations.

IDs must be unique across all addressable constructs in one scope. The same ID
may be reused in different solver scopes.

```edn
#casualtheorics.argdown2.solver/grounded
{:id :main
 :interface
 {:aggregate
  #casualtheorics.argdown2.aggregate/identity
  {:inputs [{:ref :claim}]}}
 :elements
 [#casualtheorics.argdown2.argdown/statement {:id :claim}

  #casualtheorics.argdown2.solver/grounded
  {:id :sub
   :interface
   {:aggregate
    #casualtheorics.argdown2.aggregate/identity
    {:inputs [{:ref :claim}]}}
   :elements
   [#casualtheorics.argdown2.argdown/statement {:id :claim}]}

  #casualtheorics.argdown2.argdown/attack
  {:id :attack-sub
   :from :claim
   :to :sub}]}
```

The parent attack resolves `:claim` to the parent's statement and `:sub` to the
child solver's boundary proxy. The child's interface resolves its own `:claim`
inside the child scope.

References do not cross scope boundaries:

- a parent cannot address a child's internal elements;
- a child cannot address its parent or sibling internals;
- a parent can address an immediate child solver by the child's ID;
- the document addresses its root solver through `:root`, not through a
  cross-scope element reference.

Implementations may derive maps from `(owner solver, local ID)` to runtime
objects. Such registries are indexes, not canonical document data.

## 6. First-class relations

Every relation has a required `:id`.

```edn
#casualtheorics.argdown2.argdown/attack
{:id :attack-legal
 :from :opposition
 :to :policy
 :metadata {:basis :legal}}

#casualtheorics.argdown2.argdown/attack
{:id :attack-economic
 :from :opposition
 :to :policy
 :metadata {:basis :economic}}
```

Distinct IDs preserve multiple edges with the same kind and endpoints.
Relation identity is never derived from `(kind, from, to)`.

Relations are addressable local constructs, so a relation may reference
another relation structurally:

```edn
#casualtheorics.argdown2.argdown/attack
{:id :attack-source
 :from :opposition
 :to :policy}

#casualtheorics.argdown2.argdown/undercut
{:id :challenge-source
 :from :source-critique
 :to :attack-source}

#casualtheorics.argdown2.argdown/support
{:id :corroborate-critique
 :from :independent-review
 :to :challenge-source}
```

The structural model permits either endpoint to name any addressable local
construct. A solver implementation declares which relation kinds and endpoint
combinations it understands. Unsupported combinations are semantic
diagnostics, not malformed EDN.

Relation graphs may contain cycles. Structural containment may not.

## 7. Solver interface

Every solver component declares how one or more internal results become its
boundary output:

```edn
:interface
{:aggregate
 #casualtheorics.argdown2.aggregate/identity
 {:inputs [{:ref :costs-acceptable}]}}
```

The initial implementation supports only
`#casualtheorics.argdown2.aggregate/identity` and requires exactly one input.
It rejects:

- zero inputs;
- more than one input;
- an unresolved input;
- an input type the identity operator cannot preserve;
- an unsupported aggregate tag.

An aggregate input is not merely any structural endpoint. Each solver family
defines a **selectable result universe**: the local constructs for which its
native result contains a typed value. For grounded semantics, statements,
arguments, and child boundary proxies are selectable because they receive
labels. A relation is selectable only when that solver's native semantics
produces a result for relation records. Structural addressability and result
selectability are related but distinct capabilities.

The aggregate envelope is intentionally N-ary even though the first operator
is unary. Future operators are additive:

```edn
:interface
{:aggregate
 #casualtheorics.argdown2.aggregate/weighted-mean
 {:inputs
  [{:ref :financially-viable :weight 0.5}
   {:ref :technically-viable :weight 0.3}
   {:ref :legally-viable :weight 0.2}]}}
```

Adding an operator requires specifying its accepted input types, cardinality,
ordering, duplicate handling, `nil` behavior, output type, and algebraic laws.
Merely lifting the identity operator's cardinality restriction is invalid.

## 8. Native, aggregate, and boundary results

A solver result has three conceptually separate layers:

```edn
{:solver :cost-analysis

 :native
 {:kind :labels
  :values {:costs-acceptable :in
           :costs-excessive :out}}

 :aggregate
 {:kind :label
  :value :in}

 :boundary
 {:confidence 1.0}}
```

- `:native` preserves the complete solver-specific result.
- `:aggregate` preserves the typed result selected or combined by the declared
  aggregate.
- `:boundary` is the common parent-facing output.

Boundary confidence is:

```ts
type Confidence = number | null; // EDN number in [0, 1], or nil
```

`nil` means **undetermined confidence**. It does not mean missing, not yet
evaluated, invalid, or failed; those states use separate diagnostics or result
variants.

Grounded labels have a canonical boundary mapping:

| Native label | Boundary confidence |
|---|---:|
| `in` | `1.0` |
| `out` | `0.0` |
| `undec` | `nil` |

Weighted solvers preserve normalized values in `[0, 1]`. Multi-extension
solvers must declare an observer—such as skeptical membership, credulous
membership, or extension proportion—before they can expose confidence. The
native extensions remain available and are never replaced by the scalar.

## 9. Nil and aggregation

Aggregates are strict with respect to `nil` by default:

```text
aggregate(1.0, nil, 0.7) = nil
```

An operator that skips unknown inputs, substitutes a value, or renormalizes
weights must declare that policy explicitly. No implementation may silently
coerce `nil` to `0`, `0.5`, or any other number.

## 10. Parent imports and compatibility

The child determines its boundary confidence. The parent semantics determines
how that confidence participates in the parent's graph.

Parent-owned imports perform any conversion required by the parent. Identity
import is implicit when the child solver's **declared boundary range** is a
subset of the parent's accepted domain. A lossy conversion is explicit in the
parent solver:

```edn
#casualtheorics.argdown2.solver/grounded
{:id :main

 :imports
 {:risk-analysis
  #casualtheorics.argdown2.projection/threshold
  {:out-at-most 0.3
   :in-at-least 0.7
   :otherwise nil}}

 :interface ...
 :elements
 [#casualtheorics.argdown2.solver/weighted
  {:id :risk-analysis
   :interface ...
   :elements [...]}]}
```

The threshold is total: values `<= 0.3` map to `0.0`, values `>= 0.7` map to
`1.0`, intermediate values map to `nil`, and `nil` remains `nil`. Threshold
bounds must be finite, lie in `[0, 1]`, and not overlap.

The `:imports` keys must identify immediate child solvers. They do not create
an authored solver registry. They configure how this parent imports specific
child boundaries.

Each parent solver adapter declares:

- accepted boundary values and types;
- interpretation of imported confidence;
- behavior for imported `nil`;
- supported relation and endpoint combinations;
- its own native result and boundary observer.

There is no universal attack/support arithmetic across solver families.

### 10.1 Initial grounded-parent import

The initial grounded adapter accepts only `0.0`, `1.0`, and `nil` after any
parent-owned projection. It translates each child boundary proxy into a local
Dung graph as follows:

| Imported confidence | Grounded proxy construction |
|---|---|
| `1.0` | ordinary proxy node with no intrinsic attacker |
| `0.0` | proxy attacked by a private, unattacked blocker |
| `nil` | proxy with a private intrinsic self-attack |

Private synthetic constructs cannot be referenced by document IDs and are
removed from public native results.

This construction gives the intended bottom-up gate:

- an internally accepted child participates normally but parent attacks may
  defeat it;
- an internally rejected child remains OUT and its outgoing attacks do not
  defeat parent nodes;
- an internally undecided child is UNDEC in the absence of a decisive parent
  attacker and cannot defeat parent nodes as an IN attacker;
- a parent IN attacker may still make an undecided proxy OUT.

Grounded reduction otherwise applies its ordinary relation rules. A fractional
child range without an explicit parent import projection is rejected before
reduction, even if one particular runtime result happens to be `0.0`, `1.0`,
or `nil`.

Preferred, stable, and complete parent imports require separate adapter
specifications because the grounded proxy construction—especially the
self-attacking `nil` proxy—does not preserve all extension semantics. They are
unsupported as composite parents until those specifications exist. A future
weighted parent may accept all values in `[0, 1]` plus `nil`, but its relation
arithmetic belongs to the weighted solver specification rather than this
common component model.

## 11. Bottom-up evaluation

Evaluation is a fold over the solver containment tree:

1. Solve every immediate child from its internal elements only.
2. Compute each child's native, aggregate, and boundary results.
3. Expose each child in the parent as a boundary proxy carrying its confidence.
4. Solve the parent's local graph using the parent semantics.
5. Aggregate and publish the parent's boundary.
6. Continue until the root result is produced.

A parent relation targeting a child solver targets only the boundary proxy:

```edn
#casualtheorics.argdown2.argdown/attack
{:id :attack-cost-analysis
 :from :budget-objection
 :to :cost-analysis}
```

It does not mutate, invalidate, or re-run `:cost-analysis` internally. Parent
relations may affect the child's representation in the parent result according
to parent semantics, but information never flows from parent to child.

This rule makes evaluation well-founded. Allowing feedback would require
simultaneous fixed-point or traced/open-system semantics and is outside this
design.

## 12. Weighted composition caution

A weighted mean is not automatically invariant under tree regrouping.
Averaging child averages differs from averaging all leaves unless sufficient
weight information is preserved.

If regrouping must preserve meaning, weighted components may need to expose:

```edn
{:confidence 0.82
 :weight 5.0}
```

or retain an internal sufficient statistic:

```edn
{:weighted-sum 4.1
 :total-weight 5.0}
```

Every aggregate specification must state whether regrouping is semantically
significant and which composition laws it satisfies. The initial unary
identity operator is neutral on this question.

## 13. Validation invariants

1. The top-level value has the exact document tag and a map value.
2. The document has a unique keyword `:id` and exactly one `:root`.
3. Every solver has an ID, interface, and elements vector.
4. Structural nesting forms a finite rooted tree by construction.
5. IDs are unique within one solver scope across all addressable constructs.
6. Relation IDs are mandatory; parallel edges remain distinct.
7. References resolve only within the owner solver's local endpoint scope.
8. Parent relations see immediate child solver IDs, not child internals.
9. Interface inputs resolve to selectable typed results inside the owning
   solver.
10. Parent import keys resolve to immediate child solver IDs.
11. Projections are total over their declared domain and preserve `nil` unless
    they explicitly declare another strict policy.
12. Confidence is `nil` or a finite number in `[0, 1]`.
13. Unsupported semantic combinations fail before solving.
14. Solve failures are not represented as `confidence nil`.

## 14. Internal implementation principles

The implementation plan must preserve these boundaries:

- Parse the nested authored representation first; derive indexes afterward.
- Keep containment and relation topology as separate structures.
- Represent validated solver components with a type that cannot contain parent
  pointers or arbitrary object cycles.
- Resolve IDs with an explicit per-component scope.
- Reify relations individually; never collapse parallel edges before solver
  semantics permits it.
- Evaluate components with a post-order fold over the containment tree.
- Expose child results through immutable boundary proxies.
- Keep native results separate from boundary confidence.
- Make selectors, aggregate operators, parent imports, and projections typed,
  registered operations with documented laws.
- Reject unsupported endpoint and confidence combinations explicitly.

The formal companion gives review criteria and mathematical terminology for
these principles. Public APIs and diagnostics should continue to use domain
language rather than categorical jargon.

## 15. Migration from the POC

The depth-1 same-semantics POC remains useful evidence but is not the target
wire format. Migration is intentionally breaking:

```edn
;; POC
#casualtheorics.argdown2.solver/grounded
[
  #casualtheorics.argdown2.solver/grounded [...]
]

;; Target
#casualtheorics.argdown2/document
{:id :document
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :interface
  {:aggregate
   #casualtheorics.argdown2.aggregate/identity
   {:inputs [{:ref :root-claim}]}}
  :elements
  [#casualtheorics.argdown2.solver/grounded
   {:id :child
    :interface ...
    :elements [...]}]}}
```

No compatibility shim is required before 1.0.
