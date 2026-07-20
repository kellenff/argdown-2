# Categorical Foundations for First-Class Solver Components

**Date:** 2026-07-19
**Status:** Proposed formal companion
**Normative design:**
[`2026-07-19-first-class-solver-components-design.md`](2026-07-19-first-class-solver-components-design.md)

## 1. Purpose and claim boundary

This document gives mathematical terminology and review obligations for the
first-class solver component model. It is intentionally conservative.

The proposed data is **not itself a category** in the domain-semantic sense.
The most accurate description is:

> A finite rooted hierarchy of typed, attributed quivers with reified
> relations, scoped incidence maps, and bottom-up component semantics.

Several categorical constructions illuminate parts of this model:

- categorical database schemas describe its typed records and reference maps;
- a rooted tree supplies the well-founded component order;
- operadic language may describe typed N-ary aggregation once composition laws
  are specified;
- open-system formalisms become relevant only if explicit ports and wiring are
  introduced.

Ordinary categories, arrow categories, 2-categories, and enriched categories
must not be claimed without the additional laws those structures require.

The normative EDN and user-facing APIs remain in domain language. This
companion exists so internal representations and algorithms can be formally
reviewed without decorating the wire format with mathematical jargon.

## 2. Static model

Let a document contain a finite set of solver components \(S\) with a
distinguished root \(r\in S\).

For every non-root component there is exactly one structural parent:

\[
p:S\setminus\{r\}\rightarrow S
\]

Repeated application of \(p\) must reach \(r\). Thus \(p\) induces a finite
rooted tree, not an arbitrary graph.

For each component \(s\in S\), define finite, pairwise disjoint sets:

- \(A_s\): ordinary addressable elements owned by \(s\), including statements,
  arguments, and inferences;
- \(R_s\): identified relation records owned by \(s\);
- \(C_s\): immediate child solver components of \(s\).

Parent and child presentations must agree:

\[
C_s=\{c\in S\mid c\ne r\land p(c)=s\}
\]

The local endpoint universe is:

\[
X_s=A_s + R_s + C_s
\]

where \(+\) denotes disjoint union. A relation record is included in \(X_s\)
through reification: the record has identity and can therefore be addressed.
This does not turn it into a categorical morphism-object automatically.

Let \(I_s\) be the finite set of authored local IDs and:

\[
id_s:X_s\rightarrow I_s
\]

The map \(id_s\) must be injective. This expresses uniqueness across ordinary
elements, relations, and immediate child solvers in one local scope. The ID
sets for different components need not be disjoint.

Each local relation has incidence maps:

\[
source_s,target_s:R_s\rightarrow X_s
\]

and attributed classification:

\[
kind_s:R_s\rightarrow K
\]

for a set \(K\) of recognized relation kinds. Distinct members of \(R_s\) may
have equal source, target, and kind. Parallel relations remain distinct because
identity belongs to the relation record, not to its incidence tuple.

Element IDs denote members of one \(X_s\), not globally unique document
objects. In implementation terms, a resolved identity is equivalent to:

\[
(s,\ localId)
\]

The authored tree determines \(s\); no global registry is required in the
canonical data.

## 3. Quiver interpretation

Ignoring attributes, each local graph is a quiver:

\[
R_s
\mathrel{\substack{\xrightarrow{\ source_s\ }\\[-0.6ex]
\xrightarrow[\ target_s\ ]{}}}
X_s
\]

This interpretation correctly accounts for:

- directed relations;
- loops;
- parallel relations;
- stable relation identity;
- relation records used as endpoints after reification.

The implementation should preserve this incidence structure until a particular
solver semantics explicitly reduces it. In particular, it must not collapse
parallel relations into an adjacency set before proving that multiplicity and
identity are semantically irrelevant for that solver.

### 3.1 Why the free category is not the semantics

Every quiver generates a free category whose morphisms are finite paths.
Argdown must not interpret those generated paths as composed domain relations
by default.

For example:

```text
A attacks B
B attacks C
```

does not imply:

```text
A attacks C
```

Likewise, support and attack do not share an assumed universal composition
table. A solver may define a reduction that follows paths, but that is a
solver-specific operation over the quiver—not the free-category semantics of
the document.

Relation cycles would also generate infinitely many paths in the free
category. The source document remains finite and does not enumerate or endorse
those paths.

## 4. Reified relations are not higher morphisms

An identified relation may be the target or source of another relation:

```text
critique --undercuts--> attack-source
review --supports--> critique-undercut
```

The formal account is reification:

\[
R_s\hookrightarrow X_s
\]

It is not, without further structure:

- an object of an arrow category;
- a 2-cell in a 2-category;
- a generator in a globular polygraph.

In an arrow category, a morphism between arrows is a commuting square. An
arbitrary attack on an edge supplies no such square. In a 2-category, a
2-morphism normally relates parallel 1-morphisms and participates in vertical
and horizontal composition satisfying interchange. Arbitrary relation
endpoints satisfy none of those obligations.

If a future theory introduces dimension-graded relations with globular
boundaries and composition laws, a higher-categorical interpretation may be
reopened. The current structural model must not pretend those laws exist.

## 5. Containment as a well-founded index

The solver containment tree may be viewed as a thin category (equivalently,
the reachability preorder of the rooted tree), but this observation is
secondary. Its operational role is to provide a well-founded order.

Let \(height(s)\) be:

\[
height(s)=
\begin{cases}
0 & \text{if }C_s=\varnothing\\
1+\max\{height(c)\mid c\in C_s\} & \text{otherwise}
\end{cases}
\]

Because \(S\) is finite and parent links form a tree, height is defined for
every component. Evaluation proceeds by induction on height.

Containment acyclicity does not imply relation acyclicity. A local quiver may
contain self-attacks, mutual attacks, and relation-on-relation cycles. Those
cycles are handled or rejected by the owning solver semantics.

## 6. Native semantics and boundary observation

For each solver component \(s\), let:

- \(N_s\) be its native result domain;
- \(V_s\) be its aggregate result domain;
- \(C_\bot=[0,1]\sqcup\{\bot\}\) be the common boundary domain.

Here \(\bot\) corresponds to EDN `nil` and means **undetermined confidence**.
It does not mean failure, missing data, unevaluated state, or numeric zero.

The component supplies:

\[
solve_s:LocalGraph_s\times Imported_s\rightarrow N_s
\]

where imported values retain child identity:

\[
Imported_s=\prod_{c\in C_s}ImportedValue_{s,c}
\]

For each declared interface input \(i\in\{1,\ldots,n\}\), a typed selector:

\[
select_{s,i}:N_s\rightarrow T_{s,i}
\]

and an aggregate:

\[
aggregate_s:\prod_{i=1}^{n}T_{s,i}\rightarrow V_s
\]

\[
observe_s:V_s\rightarrow C_\bot
\]

and publishes:

\[
boundary_s=
observe_s\left(
aggregate_s(
select_{s,1}(native_s),\ldots,select_{s,n}(native_s)
)\right)
\]

The input references choose the selectors. Structural endpoints are selectable
only when the solver native result defines a typed value for them.

The initial identity aggregate is polymorphic over lifted selectable domains
\(T_\bot=T\sqcup\{\bot\}\) and has \(n=1\):

\[
identity_{T_\bot}:T_\bot\rightarrow T_\bot,\qquad
identity_{T_\bot}(x)=x
\]

including:

\[
identity_{T_\bot}(\bot)=\bot
\]

Grounded semantics has an observer:

\[
observe_{grounded}(label)=
\begin{cases}
1 & label=IN\\
0 & label=OUT\\
\bot & label=UNDEC
\end{cases}
\]

The observer is not the native semantics. Native labels, extensions, scores,
and diagnostics remain available independently of the scalar boundary.

## 7. Bottom-up evaluation as a fold

Let `eval(s)` return the full native, aggregate, and boundary result for
component \(s\). Evaluation is defined recursively:

\[
eval(s)=F_s\left(LocalGraph_s,
(c\mapsto boundary_c)_{c\in C_s}\right)
\]

where every \(eval(c)\) is computed before \(F_s\).

The child-boundary argument is an ID-indexed family, not a set. Equal
confidence values do not collapse, and parent relation endpoints remain
associated with the correct child IDs.

This is a post-order fold (catamorphism in the broad recursion-scheme sense)
over the finite solver tree:

1. evaluate leaves;
2. replace each immediate child in its parent graph with an immutable boundary
   proxy;
3. evaluate the parent using its own semantics;
4. continue to the root.

The word “catamorphism” should be used only for the structural recursion. It
does not imply that all solver semantics form one shared algebra.

### 7.1 No feedback law

A parent relation whose endpoint is child \(c\) refers to the proxy containing
\(boundary_c\). It does not alter \(LocalGraph_c\), call `solve_c` again, or
send a value downward.

Therefore dependency edges between components follow the reverse of the
containment relation and are acyclic. Evaluation is total whenever every local
solver, selector, aggregate, observer, projection, and import is total over
validated input.

If parent effects were allowed to feed into children, the tree fold would no
longer suffice. The model would require simultaneous equations, a fixed-point
operator, traced composition, or another explicit feedback semantics. Those
structures are outside the design.

## 8. Parent semantics and typed compatibility

The boundary carrier \(C_\bot\) is common, but its interpretation is not.
Every parent solver defines an import interpretation:

\[
import_{s,c}:D_s\rightarrow ImportedValue_{s,c},\qquad D_s\subseteq C_\bot
\]

Every child solver family declares an attainable boundary range
\(B_c\subseteq C_\bot\). For an immediate child \(c\):

\[
B_c\subseteq D_s
\]

permits an implicit identity import. Otherwise, the parent must declare a
total projection:

\[
project_{s,c}:B_c\rightarrow D_s
\]

The authored projection is stored in parent component \(s\), keyed by child
ID \(c\). Compatibility is checked from declared ranges before solving, not
from one observed runtime value. Validation checks totality and codomain
compatibility. Implementations must not silently threshold or round fractional
confidence.

### 8.1 Grounded-parent interpretation

The initial grounded adapter uses:

\[
D_{grounded}=\{0,1,\bot\}
\]

It compiles a child proxy \(c\) into the local Dung framework:

- \(1\): an ordinary proxy with no intrinsic attacker;
- \(0\): a proxy attacked by a fresh, private, unattacked blocker;
- \(\bot\): a proxy with a private intrinsic self-attack.

Synthetic nodes and edges are outside the authored local ID set and are
removed from public results. Parent-authored attacks still operate on the
proxy. The construction prevents an OUT or UNDEC child from acting as an IN
attacker while permitting parent attacks to defeat an IN or UNDEC proxy.

This interpretation is specific to grounded semantics. Preferred, stable, and
complete composition require separate adapter definitions; in particular, a
self-attacking uncertainty proxy can alter stable-extension existence.

This design deliberately rejects a universal confidence algebra for all
relations. Attack, support, contradiction, and future kinds retain
solver-specific interpretations.

## 9. Aggregation and operadic discipline

An N-ary aggregate has the shape:

\[
\alpha:(V_1,\ldots,V_n)\rightarrow V
\]

Typed N-ary aggregate expressions may eventually admit a colored-operad
interpretation:

- colors correspond to input and output result types;
- operations correspond to aggregate policies;
- unary identity is the unit;
- aggregate-expression substitution corresponds to operadic substitution.

Solver containment itself is not operadic substitution: it also crosses a
boundary observer, parent-owned import, and parent relation semantics. To claim
an operad for a future aggregate-expression language, that subsystem must
specify and test:

1. closure under substitution;
2. identity/unit laws;
3. associativity of substitution;
4. input ordering or symmetric-group action;
5. type/color compatibility.

The initial unary identity operation satisfies only the local unit equation.
It does not, by itself, justify calling the whole system an operad.

### 9.1 Nil strictness

For aggregate input domains lifted with an explicit undetermined value
\(T_\bot=T\sqcup\{\bot\}\), the default aggregate policy is strict:

\[
\alpha(x_1,\ldots,\bot,\ldots,x_n)=\bot
\]

An aggregate that ignores, replaces, or reweights \(\bot\) is a distinct
operation whose law must be declared explicitly. Parent import handling of
\(\bot\) is a separate solver-adapter obligation.

### 9.2 Weighted means and regrouping

A scalar weighted mean is not naively associative under hierarchical
regrouping. To make regrouping invariant, composition must preserve sufficient
statistics such as:

\[
(weightedSum,totalWeight)
\]

with associative combination:

\[
(s_1,w_1)\oplus(s_2,w_2)=(s_1+s_2,w_1+w_2)
\]

and final observation:

\[
confidence=
\begin{cases}
s/w & w>0\\
\bot & w=0
\end{cases}
\]

Alternatively, the authored hierarchy may intentionally affect weighting. In
that case regrouping is not an equivalence and the aggregate specification
must say so.

Formal review of a new aggregate must include its behavior under nesting, not
only its pointwise formula.

## 10. Why confidence is not enrichment

A category enriched over a monoidal preorder or quantale \(V\) assigns a
hom-value \(C(x,y)\in V\) and satisfies identity and composition inequalities.
The proposed confidence is attached to a component boundary, not to every
hom-object:

\[
boundary:S\rightarrow C_\bot
\]

Therefore the current model is not a \([0,1]\)-enriched category.

If future semantics assigns values to every relation and defines lawful path
composition using a tensor, unit, and joins, quantale enrichment may become
relevant. Until then, the correct term is an attributed or weighted quiver.

## 11. Categorical database interpretation

The static schema can be read as a category whose objects are record sorts and
whose arrows are total reference fields. A simplified schema includes:

```text
Document --root--> Solver
Nesting --parent--> Solver
Nesting --child--> Solver
Element --owner--> Solver
Relation --owner--> Solver
Endpoint --owner--> Solver
ElementEndpoint --endpoint--> Endpoint
ElementEndpoint --element--> Element
RelationEndpoint --endpoint--> Endpoint
RelationEndpoint --relation--> Relation
Nesting --endpoint--> Endpoint
Relation --source--> Endpoint
Relation --target--> Endpoint
InterfaceInput --owner--> Solver
InterfaceInput --ref--> Endpoint
```

`ElementEndpoint`, `RelationEndpoint`, and the endpoint attached to `Nesting`
represent the three inclusions into the disjoint local endpoint universe.
Every endpoint has exactly one such representation. Coherence constraints
require:

- an element endpoint's owner equals the element's owner;
- a relation endpoint's owner equals the relation's owner;
- a nesting endpoint's owner equals the nesting parent;
- a nesting endpoint denotes the nesting child as the represented solver
  component;
- relation source and target endpoints have the same owner as the relation;
- an interface input endpoint has the same owner as the interface input.

A concrete document is then similar to a Set-valued functor from this schema
to `Set`. This viewpoint is useful for:

- deriving internal indexes;
- checking reference totality;
- expressing ownership;
- querying all relations incident to an endpoint;
- preserving parallel records.

Not every invariant follows from functoriality. The following remain explicit
constraints:

- exactly one root;
- each non-root solver occurs as the child of exactly one nesting record;
- the nesting relation is acyclic, reachable from root, and coherent with the
  authored containment tree;
- disjoint local ID uniqueness;
- confidence range;
- semantic endpoint compatibility;
- aggregate cardinality and typing.

The categorical database interpretation is an internal modeling aid, not a
requirement to store canonical EDN as normalized tables.

## 12. Open systems and cospans: deferred

Decorated cospans and related open-system formalisms model components with
explicit input/output interfaces and composition by gluing compatible ports.
The current design has:

- structural nesting;
- local scoped graphs;
- one parent-facing boundary output;
- no child-facing input ports;
- no general wiring or gluing operation;
- an explicit no-feedback rule.

It is therefore not yet a decorated-cospan system. If future solver components
gain named input ports and can be composed independently of containment, open
systems become a serious candidate. At that point the design must specify:

- port identity and typing;
- pushout/gluing behavior;
- name collision behavior;
- whether composition preserves solver semantics;
- feedback or trace behavior.

No current implementation should import cospan machinery speculatively.

## 13. Formal review obligations

### 13.1 Static representation

- Check the exact document/solver/aggregate tags, map shapes, required fields,
  and field types.
- Prove or test that authored containment decodes to a finite rooted tree.
- Check \(C_s=\{c\mid p(c)=s\}\) after decoding.
- Check injectivity of every local ID map \(id_s\).
- Prove or test that every resolved reference belongs to the permitted local
  endpoint universe.
- Distinguish structural endpoint addressability from typed result
  selectability.
- Preserve relation identity and multiplicity.
- Keep containment edges distinct from argument relations.
- Ensure relation reification does not accidentally create global visibility.
- Reject cyclic runtime object representations even if constructed outside the
  EDN decoder.

### 13.2 Evaluation

- Implement evaluation as a post-order fold.
- Demonstrate that parent evaluation never invokes a child with parent-derived
  input.
- Keep boundary proxies immutable.
- Separate failures from \(\bot\).
- Specify imported-\(\bot\) behavior for every parent adapter.
- Check that projections and imports are total over their declared domains.
- Check boundary-range inclusion before selecting identity import.
- Demonstrate deterministic results for deterministic local solvers.

### 13.3 Solver adapters

For each solver family, document:

- native result domain \(N_s\);
- selector domains \(T_{s,i}\);
- aggregate domains and accepted operators;
- boundary observer;
- accepted imported-confidence subset;
- interpretation of child proxies;
- supported relation kinds and endpoint sorts;
- behavior on local relation cycles.

### 13.4 Aggregate operators

For each aggregate, document and test:

- arity/cardinality;
- input/output types;
- selector typing and selectable endpoint kinds;
- input order and duplicates;
- behavior on \(\bot\);
- totality and range;
- unit, associativity, commutativity, and regrouping properties where claimed;
- numerical stability for weighted operators.

### 13.5 Property tests

Useful law-oriented tests include:

- identity aggregate returns its sole input, including `nil`;
- child evaluation is invariant under unrelated parent edits;
- parent evaluation depends only on child boundary, not child representation,
  when the parent semantics claims boundary abstraction;
- relation IDs preserve distinct parallel relations;
- permutation invariance only for aggregates that declare symmetry;
- regrouping invariance only for aggregates that declare it;
- no projection emits values outside its declared codomain.
- identity aggregates reject cardinality other than one;
- observers, projections, and imports preserve their declared ranges.

## 14. Implementation vocabulary

Recommended internal and public terms:

- `Document`
- `SolverComponent`
- `Element`
- `Endpoint`
- `Relation`
- `LocalScope`
- `BoundaryResult`
- `Confidence`
- `Aggregate`
- `Projection`
- `postOrderFold`

Terms that should remain in formal documentation unless their laws are
actually implemented:

- morphism;
- 2-cell;
- operad;
- cospan;
- enrichment;
- trace.

The implementation is mathematically grounded when it preserves the stated
sets, maps, scopes, fold order, and operator laws—not when categorical names
appear in class or function names.

## 15. Summary

The formal core is:

\[
\boxed{
\text{rooted component tree}
\;+\;
\text{local attributed quivers}
\;+\;
\text{reified relation identity}
\;+\;
\text{typed boundary observers}
\;+\;
\text{bottom-up fold}
}
\]

Operadic aggregation and open-system composition are principled future
directions, contingent on their respective laws and interfaces. They are not
assumed by the initial model.
