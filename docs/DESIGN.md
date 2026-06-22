# Argdown Extended: Datalog-lite Design Specification

## 1. Design Principles

1. **Unambiguous Parsing**: Every construct has a clear, deterministic grammar.
2. **Unified Attributes**: Metadata, modality, and annotations use a single curly-brace `{}` syntax.
3. **Formal Logic**: Complex derivations use Datalog-style rules (`:-`) to eliminate keyword ambiguity.
4. **Visual Relationships**: Core arrows (`-->`, `--x`) remain intuitive for graph visualization.
5. **Progressive Disclosure**: Simple cases stay simple; complexity is opt-in via attributes and rules.

---

## 2. Core Syntax

### 2.1 Facts (Arguments and Claims)
Claims are declared as **Facts**. They consist of an optional unique identifier, the claim text, and an optional attribute block.

```argdown
# Fact with ID and attributes
[#human-caused] Human CO2 emissions are the primary cause of global warming {
  author: "Dr. Jane Smith",
  confidence: 0.95,
  tags: ["climate", "policy"]
}

# Simple fact without ID
[Sea levels are rising] { source: "@NASA-2024" }
```

### 2.2 Attribute Blocks
Attributes use a unified `{}` syntax with `key: value` pairs. This replaces all previous inline modifiers, parenthetical notes, and overloaded bracket prefixes.

```argdown
[#claim] Content {
  certainty: 0.85,
  status: "accepted",
  scheme: "expert_opinion",
  source: "@Citations2024"
}
```

### 2.3 Rules (Logic and Derivations)
Logical relationships and premises are defined using the `:-` (if) operator and `,` (and) separator.

```argdown
# Linked Argument (Conjunctive)
# The conclusion holds if ALL premises are true.
[#mitigation] :- [#co2], [#impacts], [#coord].

# Convergent Argument (Disjunctive)
# Multiple rules for the same conclusion provide alternative paths.
[#mitigation] :- [#moral-imperative].
[#mitigation] :- [#economic-opportunity].
```

### 2.4 Relations (Graph Edges)
Relations define connections between facts or rules. Modifiers for relationships are also placed in attribute blocks.

```argdown
# Direct support and attack
[#A] --> [#B] { strength: "strong" }
[#C] --x [#B]

# Undercut: Attacking a derivation rule
[#Evidence-flaw] --x ([#mitigation] :- [#gradual]) {
  reason: "impacts negate the sufficiency of gradualism"
}
```

---

## 3. Relationship Taxonomy

| Arrow | Meaning | Description |
| :--- | :--- | :--- |
| `-->` | Support | Premise supports conclusion |
| `--x` | Attack | Counter-claim or rebuttal |
| `-.->` | Undercut | Attacks the inferential link (the Rule) |
| `-.-` | Undermine | Attacks a premise |
| `~>` | Concession | Partial surrender or acknowledgment |
| `?>` | Qualification| Scope narrowing or exception |
| `<->` | Equivalence | Bidirectional support or restatement |

---

## 4. Advanced Features

### 4.1 Evidence and Citations
Citations can be handled via the `source` attribute or structured `:::evidence` blocks.

```argdown
[Sea levels are rising] { source: ["@NASA-2024", "@NOAA-2024"] }

:::evidence[Satellite Data]
type: empirical
method: satellite_measurement
confidence: 0.95
:::
```

### 4.2 Modal Expressions
Modality (certainty, confidence, scope) is expressed through attributes rather than bracket prefixes.

```argdown
[Vaccines are safe] { certainty: 0.85, scope: "general" }
[Breakthrough achieved] { confidence: "low", probability: 0.30 }
```

### 4.3 Stakeholders and Attribution
Attribution is managed via the `author` or `stakeholders` attributes.

```argdown
[Policy recommendation] { author: "senator_smith", interests: "disclosed" }

:::stakeholder[fauci]
name: Dr. Anthony Fauci
role: public_health_expert
affiliation: NIAID
:::
```

### 4.4 Lifecycle and Status
The status of a claim or argument is tracked in its attribute block.

```argdown
[Historical claim] { status: "superseded", valid: "1800-1900" }
[Contemporary claim] { status: "accepted", updated: "2024-06-21" }
```

---

## 5. Formal Grammar (EBNF)

```ebnf
(* Top-level Structure *)
Document        ::= Frontmatter? Element*
Frontmatter     ::= "===" YAML_Content "==="
Element         ::= Heading | Fact | Rule | Relation | Block | Comment | Newline

(* Fact: Claims with optional attributes *)
Fact            ::= "[" ("#" Identifier)? Text? "]" AttributeBlock?
AttributeBlock  ::= "{" (YAML_Line | KeyValue) ("," (YAML_Line | KeyValue))* "}"

(* Rule: Logic Derivation *)
Rule            ::= FactRef ":-" FactRef ("," FactRef)* "."
FactRef         ::= "[" "#" Identifier "]" | Fact

(* Relation: Graph edges *)
Relation        ::= (FactRef | RuleExpr) Arrow (FactRef | RuleExpr) AttributeBlock?
RuleExpr        ::= "(" FactRef ":-" FactRef ("," FactRef)* ")"
Arrow           ::= "-->" | "--x" | "-.->" | "-.-" | "~>" | "?>" | "<->"

(* Structured Blocks *)
Block           ::= ":::" BlockType Title? Newline BlockBody Newline ":::"
BlockType       ::= "meta" | "evidence" | "position" | "stakeholder" | "domain"
Title           ::= "[" Text "]"
BlockBody       ::= (YAML_Line | ListItem | Element)*

(* Terminals *)
Identifier      ::= [a-zA-Z0-9_-]+
KeyValue        ::= Identifier ":" Value
ListItem        ::= "- " Fact
```

---

## 6. Complete Example

```argdown
===
title: Climate Policy Analysis
author: Research Team
version: 2.1
===

# Position: Aggressive Mitigation

[#co2] Human CO2 emissions are the primary cause {
  source: "@IPCC-AR6",
  confidence: 0.95,
  scheme: "expert_consensus"
}

[#impacts] Current warming trends threaten critical systems {
  certainty: 0.60,
  tags: ["urgent", "biosphere"]
}

[#coord] International coordination is achieved

# Derivation of the main position
[#mitigation] :- [#co2], [#impacts], [#coord].

# Alternative justification
[#mitigation] :- [#moral-imperative].

# Counter-positions
[#gradual] Gradual transition is sufficient { author: "Industry Group A" }

# Relations
[#impacts] --x [#gradual] { type: "undercut" }
[#gradual] --x ([#mitigation] :- [#co2], [#impacts], [#coord])

:::stakeholder[ipcc]
name: Intergovernmental Panel on Climate Change
type: scientific_body
credibility: high
:::
```
