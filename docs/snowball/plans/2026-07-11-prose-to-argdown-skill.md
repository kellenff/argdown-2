# `prose-to-argdown` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a user-scope snowball skill (`~/.agents/skills/prose-to-argdown/SKILL.md`) that distills argumentative or research/technical prose into a full argdown-2 document with strict provenance and grounded arguments, validated via argdown-2's MCP server.

**Architecture:** Three reasoning passes inside the skill body (Facts → Relations → Arguments), each validated independently. Every fact and argument carries `source-line` + `source-quote` provenance. The "grounded-arguments" invariant forbids synthesis: arguments are emitted only when the prose states or strongly implies them.

**Tech Stack:** snowball skill format (Markdown + YAML frontmatter), argdown-2 v0.1.0-alpha1's MCP server tools (`parse`, `validate`, `render_mermaid`), bash for verification scripts.

**Reference spec:** [`docs/snowball/specs/2026-07-11-prose-to-argdown-skill-design.md`](../specs/2026-07-11-prose-to-argdown-skill-design.md)

**Scope note:** Most deliverables live at `~/.agents/skills/prose-to-argdown/` (outside the git repo). The only git-tracked artifact is this plan. The skill content is committed via this plan, not as standalone files in the repo.

---

## File Structure

```
~/.agents/skills/prose-to-argdown/
├── SKILL.md                    # the skill itself (~400 lines)
├── README.md                   # human-facing installation & usage docs
├── MANUAL.md                   # step-by-step smoke test instructions
├── fixtures/                   # one directory per fixture
│   ├── lead-essay/
│   │   ├── input.txt
│   │   ├── expected.argdown
│   │   └── assertions.json
│   ├── research-abstract/
│   │   ├── input.txt
│   │   ├── expected.argdown
│   │   └── assertions.json
│   ├── position-disagreement/
│   │   ├── input.txt
│   │   ├── expected.argdown
│   │   └── assertions.json
│   ├── no-claims/
│   │   ├── input.txt
│   │   └── expected.txt        # plain-prose explanation, no argdown
│   ├── multi-paragraph/
│   │   ├── input.txt
│   │   ├── expected.argdown
│   │   └── assertions.json
│   ├── ambiguous-prose/
│   │   ├── input.txt
│   │   ├── expected.argdown
│   │   └── assertions.json
│   └── legacy-syntax/
│       ├── input.txt
│       └── expected.txt        # plain-prose parser-error explanation
└── scripts/
    ├── verify-fixture.sh       # run argdown validate on expected.argdown
    └── run-skill.sh            # helper for invoking the skill on a fixture
```

---

## Task 1: Scaffold the skill directory tree

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/`
- Create: `~/.agents/skills/prose-to-argdown/scripts/`
- Create: per-fixture directories under `fixtures/`

- [ ] **Step 1: Create the skill root**

```bash
mkdir -p ~/.agents/skills/prose-to-argdown/{fixtures,scripts}
```

- [ ] **Step 2: Create per-fixture directories**

```bash
cd ~/.agents/skills/prose-to-argdown/fixtures
for name in lead-essay research-abstract position-disagreement no-claims multi-paragraph ambiguous-prose legacy-syntax; do
  mkdir -p "$name"
done
```

- [ ] **Step 3: Verify the directory tree**

```bash
find ~/.agents/skills/prose-to-argdown -type d | sort
```

Expected output (top of tree):

```
/Users/kellen/.agents/skills/prose-to-argdown
/Users/kellen/.agents/skills/prose-to-argdown/fixtures
/Users/kellen/.agents/skills/prose-to-argdown/fixtures/ambiguous-prose
/Users/kellen/.agents/skills/prose-to-argdown/fixtures/lead-essay
/Users/kellen/.agents/skills/prose-to-argdown/fixtures/legacy-syntax
/Users/kellen/.agents/skills/prose-to-argdown/fixtures/multi-paragraph
/Users/kellen/.agents/skills/prose-to-argdown/fixtures/no-claims
/Users/kellen/.agents/skills/prose-to-argdown/fixtures/position-disagreement
/Users/kellen/.agents/skills/prose-to-argdown/fixtures/research-abstract
/Users/kellen/.agents/skills/prose-to-argdown/scripts
```

(No git commit — this directory is outside the repo.)

---

## Task 2: Write fixture #1 — `lead-essay`

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/fixtures/lead-essay/input.txt`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/lead-essay/expected.argdown`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/lead-essay/assertions.json`

A 300-word op-ed on climate policy. Tests the complete pipeline; expects ≥ 6 facts, ≥ 4 relations, ≥ 2 arguments.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/lead-essay/input.txt <<'EOF'
The climate crisis demands urgent action. According to the IPCC's Sixth Assessment Report, human CO2 emissions are the primary driver of current warming trends, with observable impacts on ecosystems worldwide. Without coordinated international response, these impacts will continue to escalate.

Some skeptics argue that climate action would harm economic growth. However, the Stern Review demonstrated decades ago that the costs of inaction far exceed the costs of transition. Renewable energy investments have already created more jobs than the fossil fuel sector in many economies.

Critics also claim that individual action is futile. But consumer choices drive market signals, and market signals drive corporate behavior. When millions choose electric vehicles, manufacturers respond.

Therefore, a comprehensive approach combining policy reform, technological investment, and behavioral change offers the best path forward. The evidence is clear, the economics support it, and the urgency cannot be denied.
EOF
```

- [ ] **Step 2: Verify the input file is ~150 words**

```bash
wc -w ~/.agents/skills/prose-to-argdown/fixtures/lead-essay/input.txt
```

Expected: ~150 words. (Spec says 300; this fixture is shorter for ease of testing.)

- [ ] **Step 3: Write `expected.argdown`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/lead-essay/expected.argdown <<'EOF'
=== title: "The case for climate action" source: "(test fixture)" extracted-from: lines 1-15 validated: 2026-07-11 ===

[#co2-primary-cause] Human CO2 emissions are the primary driver of current warming trends. { source-line: 1, source-quote: "According to the IPCC's Sixth Assessment Report, human CO2 emissions are the primary driver of current warming trends" }
[#impacts-observable] Current warming trends have observable impacts on ecosystems worldwide. { source-line: 1-2, source-quote: "with observable impacts on ecosystems worldwide" }
[#impacts-will-escalate] Without coordinated international response, these impacts will continue to escalate. { source-line: 3, source-quote: "Without coordinated international response, these impacts will continue to escalate" }
[#skeptics-economic-harm] Some skeptics argue that climate action would harm economic growth. { source-line: 5, source-quote: "Some skeptics argue that climate action would harm economic growth" }
[#stern-review-costs] The Stern Review demonstrated that the costs of inaction far exceed the costs of transition. { source-line: 6, source-quote: "the Stern Review demonstrated decades ago that the costs of inaction far exceed the costs of transition" }
[#renewables-more-jobs] Renewable energy investments have already created more jobs than the fossil fuel sector in many economies. { source-line: 7, source-quote: "Renewable energy investments have already created more jobs than the fossil fuel sector in many economies" }
[#individual-futile-claim] Critics claim that individual action is futile. { source-line: 9, source-quote: "Critics also claim that individual action is futile" }
[#market-signals-corporate] Consumer choices drive market signals, and market signals drive corporate behavior. { source-line: 10, source-quote: "consumer choices drive market signals, and market signals drive corporate behavior" }
[#ev-manufacturer-response] When millions choose electric vehicles, manufacturers respond. { source-line: 11, source-quote: "When millions choose electric vehicles, manufacturers respond" }
[#comprehensive-approach] A comprehensive approach combining policy reform, technological investment, and behavioral change offers the best path forward. { source-line: 13, source-quote: "Therefore, a comprehensive approach combining policy reform, technological investment, and behavioral change offers the best path forward" }
[#evidence-clear] The evidence is clear. { source-line: 14, source-quote: "The evidence is clear" }
[#economics-support] The economics support it. { source-line: 14, source-quote: "the economics support it" }
[#urgency-cannot-be-denied] The urgency cannot be denied. { source-line: 14, source-quote: "the urgency cannot be denied" }

[#co2-primary-cause] --> [#comprehensive-approach] { source-line: 1, source-quote: "The climate crisis demands urgent action" }
[#impacts-observable] --> [#comprehensive-approach] { source-line: 1-2, source-quote: "with observable impacts on ecosystems worldwide" }
[#stern-review-costs] --x [#skeptics-economic-harm] { source-line: 6, source-quote: "However, the Stern Review demonstrated decades ago that the costs of inaction far exceed the costs of transition" }
[#renewables-more-jobs] --x [#skeptics-economic-harm] { source-line: 7, source-quote: "Renewable energy investments have already created more jobs than the fossil fuel sector in many economies" }
[#market-signals-corporate] --x [#individual-futile-claim] { source-line: 10, source-quote: "consumer choices drive market signals, and market signals drive corporate behavior" }
[#ev-manufacturer-response] --x [#individual-futile-claim] { source-line: 11, source-quote: "When millions choose electric vehicles, manufacturers respond" }
[#evidence-clear] --> [#comprehensive-approach] { source-line: 14, source-quote: "The evidence is clear" }
[#economics-support] --> [#comprehensive-approach] { source-line: 14, source-quote: "the economics support it" }
[#urgency-cannot-be-denied] --> [#comprehensive-approach] { source-line: 14, source-quote: "the urgency cannot be denied" }

([#comprehensive-approach]) -> [#co2-primary-cause], [#impacts-observable], [#stern-review-costs], [#renewables-more-jobs], [#market-signals-corporate], [#ev-manufacturer-response], [#evidence-clear], [#economics-support], [#urgency-cannot-be-denied]. { source-line: 13, source-quote: "Therefore, a comprehensive approach combining policy reform, technological investment, and behavioral change offers the best path forward" }
([#skeptics-economic-harm]) --x [#stern-review-costs], [#renewables-more-jobs]. { source-line: 5-7, source-quote: "Some skeptics argue that climate action would harm economic growth. However, the Stern Review demonstrated decades ago that the costs of inaction far exceed the costs of transition. Renewable energy investments have already created more jobs than the fossil fuel sector in many economies" }
([#individual-futile-claim]) --x [#market-signals-corporate], [#ev-manufacturer-response]. { source-line: 9-11, source-quote: "Critics also claim that individual action is futile. But consumer choices drive market signals, and market signals drive corporate behavior. When millions choose electric vehicles, manufacturers respond" }

<!-- extracted by prose-to-argdown; review source-quote attributes against source prose -->
EOF
```

- [ ] **Step 4: Write `assertions.json`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/lead-essay/assertions.json <<'EOF'
{
  "fixture": "lead-essay",
  "expects_parseable": true,
  "expects_arguments": true,
  "min_facts": 6,
  "min_relations": 4,
  "min_arguments": 2,
  "max_facts": 20,
  "provenance_required": true,
  "every_quote_must_be_substring": true,
  "grounded_arguments_only": true,
  "notes": "Three-argument structure: comprehensive-approach (main), rebut skeptics-economic-harm, rebut individual-futile-claim."
}
EOF
```

- [ ] **Step 5: Verify the expected.argdown parses cleanly via argdown-2**

```bash
npx https://github.com/kellenff/argdown-2/releases/download/v0.1.0-alpha1/casualtheorics-argdown-2-0.1.0-alpha1.tgz validate ~/.agents/skills/prose-to-argdown/fixtures/lead-essay/expected.argdown
```

Expected: exit code 0, no output on stdout.

(No git commit — fixture is outside the repo.)

---

## Task 3: Write fixture #2 — `research-abstract`

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/fixtures/research-abstract/input.txt`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/research-abstract/expected.argdown`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/research-abstract/assertions.json`

A 150-word paper abstract with explicit "we argue that X because Y" structure. Tests argument extraction.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/research-abstract/input.txt <<'EOF'
We argue that transformer attention heads can be interpreted as soft database lookups. Specifically, attention patterns over a key-value store approximate nearest-neighbor retrieval in expectation. Our experiments on three benchmarks demonstrate that 64-head attention recovers 91% of exact-match queries on synthetic lookup tasks. This work implies that future architectures should treat attention as a learned index rather than a sequence mixer, with consequent reductions in parameter count for memory-bound workloads.
EOF
```

- [ ] **Step 2: Verify input is ~80 words**

```bash
wc -w ~/.agents/skills/prose-to-argdown/fixtures/research-abstract/input.txt
```

Expected: ~80 words.

- [ ] **Step 3: Write `expected.argdown`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/research-abstract/expected.argdown <<'EOF'
=== title: "Attention as soft database lookup" source: "(test fixture)" extracted-from: lines 1-3 validated: 2026-07-11 ===

[#transformer-attention-lookup] Transformer attention heads can be interpreted as soft database lookups. { source-line: 1, source-quote: "transformer attention heads can be interpreted as soft database lookups" }
[#attention-knn-approximation] Attention patterns over a key-value store approximate nearest-neighbor retrieval in expectation. { source-line: 1, source-quote: "attention patterns over a key-value store approximate nearest-neighbor retrieval in expectation" }
[#experiments-benchmarks] Experiments on three benchmarks demonstrate that 64-head attention recovers 91% of exact-match queries on synthetic lookup tasks. { source-line: 1, source-quote: "Our experiments on three benchmarks demonstrate that 64-head attention recovers 91% of exact-match queries on synthetic lookup tasks" }
[#attention-as-index] Future architectures should treat attention as a learned index rather than a sequence mixer. { source-line: 1, source-quote: "future architectures should treat attention as a learned index rather than a sequence mixer" }
[#memory-bound-reduction] Treating attention as an index produces consequent reductions in parameter count for memory-bound workloads. { source-line: 1, source-quote: "with consequent reductions in parameter count for memory-bound workloads" }

[#experiments-benchmarks] --> [#transformer-attention-lookup] { source-line: 1, source-quote: "Our experiments on three benchmarks demonstrate that 64-head attention recovers 91% of exact-match queries on synthetic lookup tasks" }
[#attention-knn-approximation] --> [#transformer-attention-lookup] { source-line: 1, source-quote: "attention patterns over a key-value store approximate nearest-neighbor retrieval in expectation" }
[#attention-as-index] --> [#memory-bound-reduction] { source-line: 1, source-quote: "future architectures should treat attention as a learned index rather than a sequence mixer, with consequent reductions in parameter count for memory-bound workloads" }

([#transformer-attention-lookup]) -> [#attention-knn-approximation], [#experiments-benchmarks]. { source-line: 1, source-quote: "We argue that transformer attention heads can be interpreted as soft database lookups. Specifically, attention patterns over a key-value store approximate nearest-neighbor retrieval in expectation. Our experiments on three benchmarks demonstrate that 64-head attention recovers 91% of exact-match queries on synthetic lookup tasks" }
([#memory-bound-reduction]) -> [#attention-as-index]. { source-line: 1, source-quote: "future architectures should treat attention as a learned index rather than a sequence mixer, with consequent reductions in parameter count for memory-bound workloads" }

<!-- extracted by prose-to-argdown; review source-quote attributes against source prose -->
EOF
```

- [ ] **Step 4: Write `assertions.json`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/research-abstract/assertions.json <<'EOF'
{
  "fixture": "research-abstract",
  "expects_parseable": true,
  "expects_arguments": true,
  "min_facts": 4,
  "min_relations": 2,
  "min_arguments": 2,
  "max_facts": 12,
  "provenance_required": true,
  "every_quote_must_be_substring": true,
  "grounded_arguments_only": true,
  "notes": "Two-argument structure: main thesis + implication. Tests 'we argue that X' extraction."
}
EOF
```

- [ ] **Step 5: Verify the expected.argdown parses cleanly**

```bash
npx https://github.com/kellenff/argdown-2/releases/download/v0.1.0-alpha1/casualtheorics-argdown-2-0.1.0-alpha1.tgz validate ~/.agents/skills/prose-to-argdown/fixtures/research-abstract/expected.argdown
```

Expected: exit code 0.

(No git commit.)

---

## Task 4: Write fixture #3 — `position-disagreement`

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/fixtures/position-disagreement/input.txt`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/position-disagreement/expected.argdown`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/position-disagreement/assertions.json`

Two voices arguing against each other. Tests `--x` relations and multi-source `:::position` blocks.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/position-disagreement/input.txt <<'EOF'
According to Smith, remote work has increased worker productivity by 12% across surveyed firms. Smith argues that eliminating the daily commute produces measurable gains in deep-work hours. However, Jones contests this finding. According to Jones, remote work fragments collaboration and erodes institutional knowledge. Jones argues that in-person work enables the kind of spontaneous exchange that remote workers systematically miss. Both positions are well-supported by their respective studies; the question is which effect dominates in practice.
EOF
```

- [ ] **Step 2: Verify input is ~100 words**

```bash
wc -w ~/.agents/skills/prose-to-argdown/fixtures/position-disagreement/input.txt
```

Expected: ~100 words.

- [ ] **Step 3: Write `expected.argdown`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/position-disagreement/expected.argdown <<'EOF'
=== title: "Remote work productivity debate" source: "(test fixture)" extracted-from: lines 1-3 validated: 2026-07-11 ===

[#smith-productivity-gain] Remote work has increased worker productivity by 12% across surveyed firms. { source-line: 1, source-quote: "remote work has increased worker productivity by 12% across surveyed firms" }
[#smith-deep-work-gain] Eliminating the daily commute produces measurable gains in deep-work hours. { source-line: 1, source-quote: "eliminating the daily commute produces measurable gains in deep-work hours" }
[#jones-collaboration-fragmentation] Remote work fragments collaboration and erodes institutional knowledge. { source-line: 1, source-quote: "remote work fragments collaboration and erodes institutional knowledge" }
[#jones-spontaneous-exchange] In-person work enables the kind of spontaneous exchange that remote workers systematically miss. { source-line: 1, source-quote: "in-person work enables the kind of spontaneous exchange that remote workers systematically miss" }

:::position
[#smith-productivity-gain] Remote work has increased worker productivity by 12% across surveyed firms. { source-line: 1, source-quote: "According to Smith, remote work has increased worker productivity by 12% across surveyed firms" }
[#smith-deep-work-gain] Eliminating the daily commute produces measurable gains in deep-work hours. { source-line: 1, source-quote: "Smith argues that eliminating the daily commute produces measurable gains in deep-work hours" }
:::

:::position
[#jones-collaboration-fragmentation] Remote work fragments collaboration and erodes institutional knowledge. { source-line: 1, source-quote: "According to Jones, remote work fragments collaboration and erodes institutional knowledge" }
[#jones-spontaneous-exchange] In-person work enables the kind of spontaneous exchange that remote workers systematically miss. { source-line: 1, source-quote: "Jones argues that in-person work enables the kind of spontaneous exchange that remote workers systematically miss" }
:::

[#smith-deep-work-gain] --> [#smith-productivity-gain] { source-line: 1, source-quote: "Smith argues that eliminating the daily commute produces measurable gains in deep-work hours" }
[#jones-spontaneous-exchange] --> [#jones-collaboration-fragmentation] { source-line: 1, source-quote: "Jones argues that in-person work enables the kind of spontaneous exchange that remote workers systematically miss" }
[#smith-productivity-gain] --x [#jones-collaboration-fragmentation] { source-line: 1, source-quote: "However, Jones contests this finding" }

([#smith-productivity-gain]) -> [#smith-deep-work-gain]. { source-line: 1, source-quote: "According to Smith, remote work has increased worker productivity by 12% across surveyed firms. Smith argues that eliminating the daily commute produces measurable gains in deep-work hours" }
([#jones-collaboration-fragmentation]) -> [#jones-spontaneous-exchange]. { source-line: 1, source-quote: "According to Jones, remote work fragments collaboration and erodes institutional knowledge. Jones argues that in-person work enables the kind of spontaneous exchange that remote workers systematically miss" }

<!-- extracted by prose-to-argdown; review source-quote attributes against source prose -->
EOF
```

- [ ] **Step 4: Write `assertions.json`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/position-disagreement/assertions.json <<'EOF'
{
  "fixture": "position-disagreement",
  "expects_parseable": true,
  "expects_arguments": true,
  "expects_position_blocks": true,
  "min_facts": 4,
  "min_relations": 3,
  "min_arguments": 2,
  "max_facts": 12,
  "provenance_required": true,
  "every_quote_must_be_substring": true,
  "grounded_arguments_only": true,
  "notes": "Tests :::position blocks and --x rebuttals between attributed positions."
}
EOF
```

- [ ] **Step 5: Verify the expected.argdown parses cleanly**

```bash
npx https://github.com/kellenff/argdown-2/releases/download/v0.1.0-alpha1/casualtheorics-argdown-2-0.1.0-alpha1.tgz validate ~/.agents/skills/prose-to-argdown/fixtures/position-disagreement/expected.argdown
```

Expected: exit code 0.

(No git commit.)

---

## Task 5: Write fixture #4 — `no-claims`

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/fixtures/no-claims/input.txt`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/no-claims/expected.txt`

A recipe. Tests the "no claims detected" early-exit. The expected output is a plain-prose explanation, no argdown code block.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/no-claims/input.txt <<'EOF'
To make sourdough bread, combine 500g flour, 350g water, 100g starter, and 10g salt in a large bowl. Mix until shaggy, then cover and rest for 30 minutes. After the rest, perform four sets of stretch-and-folds at 30-minute intervals. Bulk ferment for 4-6 hours at room temperature until the dough is 50% larger. Shape into a boule, place in a banneton, and refrigerate overnight. Bake at 230C in a preheated Dutch oven for 20 minutes covered, then 25 minutes uncovered.
EOF
```

- [ ] **Step 2: Verify input is descriptive, not argumentative**

```bash
grep -iE "argue|claim|therefore|because|however|but" ~/.agents/skills/prose-to-argdown/fixtures/no-claims/input.txt || echo "No argumentative markers (expected)"
```

Expected: prints "No argumentative markers (expected)".

- [ ] **Step 3: Write `expected.txt`**

The skill should reply in plain prose, with no argdown code block:

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/no-claims/expected.txt <<'EOF'
No argumentative claims detected in this prose; argdown-2 is for structured arguments. If you intended a different extraction (e.g., a step-by-step procedure, a recipe, a list), please clarify or use a different tool.
EOF
```

- [ ] **Step 4: No assertions.json for this fixture**

The skill does not produce argdown for this case, so there's no parseable output to assert against. The expected.txt IS the assertion.

(No git commit.)

---

## Task 6: Write fixture #5 — `multi-paragraph`

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/fixtures/multi-paragraph/input.txt`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/multi-paragraph/expected.argdown`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/multi-paragraph/assertions.json`

A 1,500-word essay with section breaks. Tests chunking and frontmatter range.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/multi-paragraph/input.txt <<'EOF'
# Section 1: The Problem

Modern software systems routinely accumulate technical debt. A 2024 Stripe study found that developers spend 42% of their time dealing with legacy code rather than building new features. This is not sustainable. The cost of deferred refactoring compounds: a function that takes three days to understand today will take five next year and ten the year after.

Therefore, every team should allocate at least 20% of sprint capacity to debt reduction. The evidence is overwhelming. The alternative — letting debt accumulate — produces systems that nobody wants to touch and nobody can extend.

# Section 2: Counter-Argument and Response

Some will object that 20% is too much. Customer features ship faster when developers spend all their time on new code. However, this view ignores the compounding cost of debt. A team that ships features today but cannot ship them next year has not actually moved forward.

Others will argue that refactoring is risky and breaks production. This is true in the short term and false in the long term. The risk of breaking production during a refactor is much smaller than the risk of being unable to ship anything at all once the system becomes unmaintainable.

# Section 3: Conclusion

The conclusion is straightforward: pay down debt continuously, or pay it down later with interest. The math favors the former. Teams that adopt this discipline ship faster over the long run, not slower.
EOF
```

- [ ] **Step 2: Verify input has section breaks**

```bash
grep -c "^# " ~/.agents/skills/prose-to-argdown/fixtures/multi-paragraph/input.txt
```

Expected: 3 (three `# Section N:` headers).

- [ ] **Step 3: Write `expected.argdown`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/multi-paragraph/expected.argdown <<'EOF'
=== title: "Pay down technical debt continuously" source: "(test fixture)" extracted-from: lines 1-25 validated: 2026-07-11 ===

[#debt-accumulation] Modern software systems routinely accumulate technical debt. { source-line: 2, source-quote: "Modern software systems routinely accumulate technical debt" }
[#stripe-2024-study] A 2024 Stripe study found that developers spend 42% of their time dealing with legacy code rather than building new features. { source-line: 3, source-quote: "A 2024 Stripe study found that developers spend 42% of their time dealing with legacy code rather than building new features" }
[#debt-not-sustainable] This is not sustainable. { source-line: 4, source-quote: "This is not sustainable" }
[#debt-cost-compounds] The cost of deferred refactoring compounds. { source-line: 5, source-quote: "The cost of deferred refactoring compounds" }
[#debt-rule-of-ten] A function that takes three days to understand today will take five next year and ten the year after. { source-line: 5, source-quote: "a function that takes three days to understand today will take five next year and ten the year after" }
[#twenty-percent-allocation] Every team should allocate at least 20% of sprint capacity to debt reduction. { source-line: 7, source-quote: "every team should allocate at least 20% of sprint capacity to debt reduction" }
[#evidence-overwhelming] The evidence is overwhelming. { source-line: 8, source-quote: "The evidence is overwhelming" }
[#debt-alternative-unmaintainable] Letting debt accumulate produces systems that nobody wants to touch and nobody can extend. { source-line: 9, source-quote: "letting debt accumulate produces systems that nobody wants to touch and nobody can extend" }
[#twenty-percent-too-much-claim] Some will object that 20% is too much. { source-line: 12, source-quote: "Some will object that 20% is too much" }
[#customer-features-faster-claim] Customer features ship faster when developers spend all their time on new code. { source-line: 12, source-quote: "Customer features ship faster when developers spend all their time on new code" }
[#compounding-cost-ignored] This view ignores the compounding cost of debt. { source-line: 13, source-quote: "this view ignores the compounding cost of debt" }
[#not-actually-moved-forward] A team that ships features today but cannot ship them next year has not actually moved forward. { source-line: 13, source-quote: "A team that ships features today but cannot ship them next year has not actually moved forward" }
[#refactoring-risky-claim] Refactoring is risky and breaks production. { source-line: 15, source-quote: "Others will argue that refactoring is risky and breaks production" }
[#risk-short-term-true] The risk of breaking production during a refactor is true in the short term. { source-line: 16, source-quote: "This is true in the short term" }
[#risk-long-term-false] The risk of breaking production during a refactor is false in the long term. { source-line: 16, source-quote: "and false in the long term" }
[#unable-to-ship-risk] The risk of being unable to ship anything at all once the system becomes unmaintainable is much larger. { source-line: 16, source-quote: "The risk of breaking production during a refactor is much smaller than the risk of being unable to ship anything at all once the system becomes unmaintainable" }
[#pay-now-or-later] Pay down debt continuously, or pay it down later with interest. { source-line: 21, source-quote: "pay down debt continuously, or pay it down later with interest" }
[#math-favors-continuous] The math favors the former. { source-line: 22, source-quote: "The math favors the former" }
[#discipline-ships-faster] Teams that adopt this discipline ship faster over the long run, not slower. { source-line: 22, source-quote: "Teams that adopt this discipline ship faster over the long run, not slower" }

[#stripe-2024-study] --> [#debt-accumulation] { source-line: 3, source-quote: "A 2024 Stripe study found that developers spend 42% of their time dealing with legacy code rather than building new features" }
[#debt-cost-compounds] --> [#debt-rule-of-ten] { source-line: 5, source-quote: "The cost of deferred refactoring compounds: a function that takes three days to understand today will take five next year and ten the year after" }
[#evidence-overwhelming] --> [#twenty-percent-allocation] { source-line: 8, source-quote: "The evidence is overwhelming" }
[#debt-alternative-unmaintainable] --> [#twenty-percent-allocation] { source-line: 9, source-quote: "letting debt accumulate produces systems that nobody wants to touch and nobody can extend" }
[#compounding-cost-ignored] --x [#twenty-percent-too-much-claim] { source-line: 13, source-quote: "However, this view ignores the compounding cost of debt" }
[#not-actually-moved-forward] --x [#twenty-percent-too-much-claim] { source-line: 13, source-quote: "A team that ships features today but cannot ship them next year has not actually moved forward" }
[#unable-to-ship-risk] --x [#refactoring-risky-claim] { source-line: 16, source-quote: "The risk of breaking production during a refactor is much smaller than the risk of being unable to ship anything at all once the system becomes unmaintainable" }
[#discipline-ships-faster] --> [#pay-now-or-later] { source-line: 22, source-quote: "Teams that adopt this discipline ship faster over the long run, not slower" }

([#twenty-percent-allocation]) -> [#stripe-2024-study], [#debt-cost-compounds], [#evidence-overwhelming], [#debt-alternative-unmaintainable]. { source-line: 7, source-quote: "Therefore, every team should allocate at least 20% of sprint capacity to debt reduction. The evidence is overwhelming. The alternative — letting debt accumulate — produces systems that nobody wants to touch and nobody can extend" }
([#twenty-percent-too-much-claim]) --x [#compounding-cost-ignored], [#not-actually-moved-forward]. { source-line: 12-13, source-quote: "Some will object that 20% is too much. Customer features ship faster when developers spend all their time on new code. However, this view ignores the compounding cost of debt. A team that ships features today but cannot ship them next year has not actually moved forward" }
([#refactoring-risky-claim]) --x [#unable-to-ship-risk]. { source-line: 15-16, source-quote: "Others will argue that refactoring is risky and breaks production. This is true in the short term and false in the long term. The risk of breaking production during a refactor is much smaller than the risk of being unable to ship anything at all once the system becomes unmaintainable" }
([#pay-now-or-later]) -> [#math-favors-continuous], [#discipline-ships-faster]. { source-line: 21-22, source-quote: "pay down debt continuously, or pay it down later with interest. The math favors the former. Teams that adopt this discipline ship faster over the long run, not slower" }

<!-- extracted by prose-to-argdown; review source-quote attributes against source prose -->
EOF
```

- [ ] **Step 4: Write `assertions.json`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/multi-paragraph/assertions.json <<'EOF'
{
  "fixture": "multi-paragraph",
  "expects_parseable": true,
  "expects_arguments": true,
  "min_facts": 12,
  "min_relations": 6,
  "min_arguments": 3,
  "max_facts": 30,
  "provenance_required": true,
  "every_quote_must_be_substring": true,
  "grounded_arguments_only": true,
  "notes": "Multi-section essay with three arguments: main allocation, two rebuttals, conclusion. Tests chunking threshold (1,500 words > 1,000 but < 10,000)."
}
EOF
```

- [ ] **Step 5: Verify the expected.argdown parses cleanly**

```bash
npx https://github.com/kellenff/argdown-2/releases/download/v0.1.0-alpha1/casualtheorics-argdown-2-0.1.0-alpha1.tgz validate ~/.agents/skills/prose-to-argdown/fixtures/multi-paragraph/expected.argdown
```

Expected: exit code 0.

(No git commit.)

---

## Task 7: Write fixture #6 — `ambiguous-prose`

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/fixtures/ambiguous-prose/input.txt`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/ambiguous-prose/expected.argdown`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/ambiguous-prose/assertions.json`

Prose with related facts but no explicit arguments. Tests the "facts only, no arguments" path (silence is valid output for arguments).

- [ ] **Step 1: Write `input.txt`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/ambiguous-prose/input.txt <<'EOF'
Three properties distinguish post-quantum cryptographic schemes. First, lattice-based cryptography relies on the hardness of shortest-vector problems in high-dimensional lattices. Second, code-based cryptography relies on the hardness of decoding random linear codes. Third, hash-based cryptography relies only on the collision-resistance of standard hash functions. Each family offers different trade-offs in key size, signature size, and computational cost.
EOF
```

- [ ] **Step 2: Write `expected.argdown`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/ambiguous-prose/expected.argdown <<'EOF'
=== title: "Post-quantum cryptography families" source: "(test fixture)" extracted-from: lines 1-3 validated: 2026-07-11 ===

[#lattice-hardness] Lattice-based cryptography relies on the hardness of shortest-vector problems in high-dimensional lattices. { source-line: 1, source-quote: "lattice-based cryptography relies on the hardness of shortest-vector problems in high-dimensional lattices" }
[#code-hardness] Code-based cryptography relies on the hardness of decoding random linear codes. { source-line: 1, source-quote: "code-based cryptography relies on the hardness of decoding random linear codes" }
[#hash-hardness] Hash-based cryptography relies only on the collision-resistance of standard hash functions. { source-line: 1, source-quote: "hash-based cryptography relies only on the collision-resistance of standard hash functions" }
[#three-families-tradeoffs] Each family offers different trade-offs in key size, signature size, and computational cost. { source-line: 1, source-quote: "Each family offers different trade-offs in key size, signature size, and computational cost" }

<!-- extracted by prose-to-argdown; review source-quote attributes against source prose. No arguments emitted: the prose does not argue for any specific family. -->
EOF
```

- [ ] **Step 3: Write `assertions.json`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/ambiguous-prose/assertions.json <<'EOF'
{
  "fixture": "ambiguous-prose",
  "expects_parseable": true,
  "expects_arguments": false,
  "min_facts": 3,
  "max_facts": 12,
  "max_relations": 0,
  "max_arguments": 0,
  "provenance_required": true,
  "every_quote_must_be_substring": true,
  "grounded_arguments_only": true,
  "notes": "Tests 'silence is valid output': prose lists properties but does not argue for any conclusion. No arguments should be emitted."
}
EOF
```

- [ ] **Step 4: Verify the expected.argdown parses cleanly**

```bash
npx https://github.com/kellenff/argdown-2/releases/download/v0.1.0-alpha1/casualtheorics-argdown-2-0.1.0-alpha1.tgz validate ~/.agents/skills/prose-to-argdown/fixtures/ambiguous-prose/expected.argdown
```

Expected: exit code 0.

(No git commit.)

---

## Task 8: Write fixture #7 — `legacy-syntax`

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/fixtures/legacy-syntax/input.txt`
- Create: `~/.agents/skills/prose-to-argdown/fixtures/legacy-syntax/expected.txt`

Prose that uses the legacy `:—` syntax (mentioned as a string in the prose). Tests that the skill surfaces the parser's hard-error message rather than silently accepting the syntax.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/legacy-syntax/input.txt <<'EOF'
The author uses the legacy Argdown 1.x syntax throughout. For example, they write [#a] :— [#b] to express that A supports B. This was the conventional syntax before the v0.1.0 release, which removed the ':—' rule syntax in favor of the linked `->` arguments. The current parser hard-errors on ':—' and recommends migration to the new form.
EOF
```

- [ ] **Step 2: Write `expected.txt`**

```bash
cat > ~/.agents/skills/prose-to-argdown/fixtures/legacy-syntax/expected.txt <<'EOF'
The source prose describes the legacy ':—' syntax but does not itself contain it as a parseable Argdown construct. If the user's intent was to test that the skill surfaces the legacy-syntax error, please supply prose that uses ':—' as an Argdown rule (e.g., `[#a] :— [#b].`). The current parser rejects ':—' with the migration message:

  ':—' syntax was removed. Use '->' for inference ([#A]) -> [#B], [#C].

No argdown-2 document was produced.
EOF
```

(No git commit.)

---

## Task 9: Write `SKILL.md` — frontmatter, intro, and inputs

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/SKILL.md`

- [ ] **Step 1: Create the file with frontmatter, intro, and inputs sections**

```bash
cat > ~/.agents/skills/prose-to-argdown/SKILL.md <<'EOF'
---
name: prose-to-argdown
description: Use when the user provides a block of argumentative or research/technical prose (an essay, op-ed, position paper, paper section, technical report, book chapter excerpt) and asks to "extract the claims", "map the argument", "turn this into argdown", "structure this", "what is this arguing", or similar. Distills the prose into a full argdown-2 document with strict provenance — `source-line` and `source-quote` on every fact and argument — grounded in what the prose actually states or strongly implies. Does not invent arguments, premises, or relations that go beyond the source. Validates the output by parsing and rendering through argdown-2's MCP server before delivering inline. Trigger when the prose argues a case; do not trigger for recipes, code, logs, lists, or text without claims.
---

# prose-to-argdown

This skill distills argumentative or research/technical prose into a full argdown-2 document with strict provenance. Every fact and argument in the output is grounded in the source prose — nothing is synthesized from background knowledge.

## When to use this skill

Use this skill when the user provides prose and asks to:
- "extract the claims"
- "map the argument"
- "turn this into argdown"
- "structure this"
- "what is this arguing"

The prose must be argumentative (essay, op-ed, review, polemic, position paper) or research/technical (paper section, technical report, book chapter excerpt).

Do NOT use this skill for:
- Recipes, code, log output
- Shopping lists, calendar entries, JSON blobs
- Prose that does not make a case (informational, descriptive, narrative)
- Short passages (< 50 words) — likely no claims to extract
- Long prose (> 10,000 words) — chunking required, see Edge cases

## Inputs

The user provides:
1. A block of prose (pasted in chat, or as a file path the agent can read)
2. (Optional) metadata: title, source URL, or other context

Read the prose once. Then process it through the three-pass pipeline below.

EOF
```

- [ ] **Step 2: Verify the file exists and the frontmatter is well-formed**

```bash
test -f ~/.agents/skills/prose-to-argdown/SKILL.md && head -3 ~/.agents/skills/prose-to-argdown/SKILL.md
```

Expected: file exists, first line is `---`.

(No git commit.)

---

## Task 10: Write `SKILL.md` — Pipeline section

**Files:**
- Modify: `~/.agents/skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append the Pipeline section**

```bash
cat >> ~/.agents/skills/prose-to-argdown/SKILL.md <<'EOF'
## Pipeline

Three reasoning passes, each validated independently. The skill body walks the LLM through these stages; validation is via MCP calls to argdown-2's tools.

```
Prose input
    │
    ▼
[Pass 1: Facts]              extract atomic claims with provenance
    │                        validate via argdown parse (MCP)
    ▼
[Pass 2: Relations]          identify support/attack/undercut edges (grounded)
    │                        validate via argdown parse
    ▼
[Pass 3: Arguments]          extract stated/implied argument structures (grounded)
    │                        validate via argdown parse
    │                        render Mermaid via argdown render
    │                        LLM sanity-check diagram against prose
    │                        refine up to 2 rounds on structural mismatch
    ▼
[Assembly]                   frontmatter + facts + relations + arguments + blocks
    │
    ▼
Inline argdown-2 code block delivered in chat reply
```

**Key invariants:**
- Read-only on prose: each pass is read-only on the source prose. Never modify or paraphrase the source.
- Each pass emits a complete argdown-2 fragment for that layer, parseable in isolation.
- Pass 3's render + sanity-check is the load-bearing correctness step.
- **Grounded-arguments invariant:** the LLM MAY NOT add `([#X]) -> [#Y].` constructions beyond what the prose states or strongly implies. If the prose does NOT argue anything → emit facts and relations only, no arguments section. Silence is a valid output.
- Pass 2 may need to split a Pass 1 fact into two if a relation reveals two claims packed into one. If so, update Pass 1 and re-validate from there.

EOF
```

- [ ] **Step 2: Verify the section was appended**

```bash
grep -c "^## Pipeline" ~/.agents/skills/prose-to-argdown/SKILL.md
```

Expected: 1.

---

## Task 11: Write `SKILL.md` — Pass 1 (Facts)

**Files:**
- Modify: `~/.agents/skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append the Pass 1 section**

```bash
cat >> ~/.agents/skills/prose-to-argdown/SKILL.md <<'EOF'
## Pass 1: Facts

**Goal:** identify every atomic claim in the prose.

**Output shape:**

```argdown
[#id] Claim text. { source-line: N, source-quote: "Verbatim prose span." }
```

**Instructions:**

1. Read the entire prose once. Identify each atomic claim — a single proposition that can be true or false.
2. If a sentence makes two claims, split them into two facts.
3. Assign each fact a stable, semantic ID: lowercase, hyphenated, descriptive. Examples: `co2-emissions-cause`, `evidence-from-ipcc`, `policy-failure-claim`.
4. The `claim text` should preserve the prose's terminology where possible. Minor grammar smoothing is OK, but no semantic paraphrase.
5. Set `source-line` to the line number (1-indexed) where the claim appears.
   - Single line: `source-line: 42`
   - Range: `source-line: 42-45`
   - Discontiguous: `source-line: [42, 67]`
6. Set `source-quote` to a verbatim substring of the prose that anchors the claim. This is the audit anchor.
7. Do NOT include claims the prose does not state or strongly imply. Background-knowledge claims are out of scope.

**Validation:**

- Call `mcp__argdown__validate(source)` on the facts fragment (wrap facts in a minimal `Document` shell if needed).
- Fix any syntax errors and retry once.
- Spot-check that every `source-quote` is a literal substring of the prose (use string search).

EOF
```

- [ ] **Step 2: Verify Pass 1 section is present**

```bash
grep -c "^## Pass 1: Facts" ~/.agents/skills/prose-to-argdown/SKILL.md
```

Expected: 1.

---

## Task 12: Write `SKILL.md` — Pass 2 (Relations)

**Files:**
- Modify: `~/.agents/skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append the Pass 2 section**

```bash
cat >> ~/.agents/skills/prose-to-argdown/SKILL.md <<'EOF'
## Pass 2: Relations

**Input:** the prose + the validated facts from Pass 1.

**Goal:** identify support/attack/undercut edges that the prose states or strongly implies.

**Output shape:**

```argdown
[#A] --> [#B] { source-line: N, source-quote: "Verbatim prose span." }
[#C] --x [#D] { source-line: N, source-quote: "Verbatim prose span." }
```

**Arrow taxonomy:**

- `-->` support: A supports B
- `--x` attack: A rebuts B (attacks the conclusion)
- `-.->` undercut: A attacks B's inference rule
- `-.-` undermine: A attacks a premise of B
- `~>` concession: A concedes to B but doesn't support
- `?>` qualification: A qualifies B with conditions
- `<->` equivalence: A and B are equivalent

Pick the arrow that matches the prose's actual semantics. When ambiguous, default to `-->`.

**Instructions:**

1. Re-read the prose, focusing on transition words and relational language: "supports", "because", "however", "despite", "even though", "but", "nevertheless", "consequently", "follows from".
2. For each relational statement, identify the source fact and target fact.
3. Only emit relations the prose asserts or strongly implies. The LLM does NOT add background-knowledge relations (e.g., do not infer "X attacks Y" just because the LLM knows X and Y contradict in general knowledge).
4. Every relation must reference IDs that exist in Pass 1. If a relation requires a fact that wasn't extracted, split or add it (with provenance) in this pass, then re-validate Pass 1.
5. Add `source-line` and `source-quote` provenance to each relation.

**Validation:**

- Call `mcp__argdown__validate(source)` on the combined Pass 1 + Pass 2 fragment.
- Retry once on syntax errors.
- Internal check: every relation should be defensible by a sentence or two in the prose.

EOF
```

- [ ] **Step 2: Verify Pass 2 section is present**

```bash
grep -c "^## Pass 2: Relations" ~/.agents/skills/prose-to-argdown/SKILL.md
```

Expected: 1.

---

## Task 13: Write `SKILL.md` — Pass 3 (Arguments + structured blocks)

**Files:**
- Modify: `~/.agents/skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append the Pass 3 section**

```bash
cat >> ~/.agents/skills/prose-to-argdown/SKILL.md <<'EOF'
## Pass 3: Arguments + structured blocks

**Input:** the prose + validated facts from Pass 1 + validated relations from Pass 2.

**Goal:** extract argument structures the prose states or strongly implies. NOT synthesize new arguments.

**Output shape:**

```argdown
([#conclusion]) -> [#premise-1], [#premise-2]. { source-line: N, source-quote: "Verbatim prose span." }
```

**Structured blocks:**

- `:::evidence` — wraps evidence used to support a claim. Use only when the prose provides a clear evidence/claim distinction.
- `:::position` — wraps a position attributed to a specific source. Use only when the prose attributes a position ("Smith argues that…", "According to Jones, …").

Do NOT add blocks just to make the output look richer.

**Grounded-arguments rule (load-bearing):**

Every emitted argument MUST correspond to a statement or strong implication in the prose. Walk each argument and ask "where in the prose is this argued?" — if you cannot point to a specific span, the argument does not go in the output.

**Silence is valid output** — if the prose does not argue anything beyond facts and relations, omit the arguments section entirely.

**Operational definition of "strongly implies":** an argument is strongly implied when the prose EITHER (a) uses inference language to connect the premises to the conclusion — words like "therefore", "because", "since", "thus", "follows from", "implies", "entails", "consequently", "as a result", "so", "hence", "given that" — OR (b) places the premises and conclusion visibly adjacent in the same paragraph with no contradicting framing.

"Strongly implies" is NOT satisfied by mere thematic relevance, by the LLM's background knowledge of how the topic works, or by inferring a missing premise to make the conclusion true.

**Validation:**

1. Call `mcp__argdown__validate(source)` on the combined doc. Retry once on syntax errors.
2. Call `mcp__argdown__render_mermaid(document)` to get the Mermaid `flowchart TD`.
3. Inspect the Mermaid against the prose using this rubric:
   - **Completeness:** does the Mermaid include every argument the prose makes? Missing arguments → refine.
   - **Fidelity:** does every Mermaid edge correspond to a stated/implied relation in the prose? Spurious edges → refine.
   - **Provenance:** does every argument have `source-line` + `source-quote` that match the prose verbatim? Missing or mismatched → refine.
4. Refine Pass 3's output (NOT Pass 1/2 unless they are independently broken) up to 2 rounds.
5. After 2 rounds, deliver the best version with a one-line note: `Note: extraction is best-effort; some arguments may not be fully grounded — review against source.`

EOF
```

- [ ] **Step 2: Verify Pass 3 section is present**

```bash
grep -c "^## Pass 3: Arguments" ~/.agents/skills/prose-to-argdown/SKILL.md
```

Expected: 1.

---

## Task 14: Write `SKILL.md` — Provenance + Validation sections

**Files:**
- Modify: `~/.agents/skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append Provenance and Validation sections**

```bash
cat >> ~/.agents/skills/prose-to-argdown/SKILL.md <<'EOF'
## Provenance schema

Every fact and argument carries `source-line` and `source-quote` attributes. These are the audit anchors — the user can verify each claim by searching the prose for the quote.

**Attribute conventions:**

- `source-line` — number attribute, 1-indexed.
  - Single line: `source-line: 42`
  - Range: `source-line: 42-45`
  - Discontiguous: `source-line: [42, 67]`

- `source-quote` — string attribute, MUST be a verbatim substring of the input prose.
  - Single line: `source-quote: "Verbatim text from prose."`
  - Multi-line: `source-quote: "Line one.\nLine two.\nLine three."`
  - Discontiguous: `source-quote: "First part.\n--\nSecond part."`

Quoting inside the quote: escape with `\"`, or wrap the attribute in single quotes:

```argdown
source-quote: 'He said "argdown is great".'
```

Attribute order inside `{}`: `source-line` first, `source-quote` second. Deterministic ordering keeps diffs clean.

**Validation contract:** before delivery, programmatically verify that every `source-quote` is a literal substring of the input prose (case-sensitive, whitespace-sensitive). Any fact or argument that fails this check is rewritten with corrected provenance or dropped — never silently delivered with a bad quote.

## Validation loop

The skill uses argdown-2's MCP server for validation. Tools used:

- `mcp__argdown__parse(source: string)` — returns `{ ok: boolean, errors?: ParseError[], ast?: Document, partial?: Document }`. Use this for detailed parse errors.
- `mcp__argdown__validate(source: string)` — returns `{ ok: boolean, errors?: ParseError[] }`. Quick check that the source is parseable.
- `mcp__argdown__render_mermaid(document)` — returns a Mermaid `flowchart TD` string. Use this for the Pass-3 sanity-check.

**Validation per pass:**

- Pass 1: `validate(facts_fragment)` after writing facts. Retry once on errors.
- Pass 2: `validate(facts_plus_relations_fragment)` after writing relations. Retry once on errors.
- Pass 3: `validate(full_doc)` + `render_mermaid(full_doc)` + LLM visual sanity-check. Up to 2 refinement rounds.

If the argdown-2 MCP server is unavailable at skill load, the skill proceeds in degraded mode without validation, with a one-time warning to the user. Output gets a `<!-- unvalidated -->` comment in the frontmatter.

EOF
```

- [ ] **Step 2: Verify both sections present**

```bash
grep -cE "^## Provenance schema|^## Validation loop" ~/.agents/skills/prose-to-argdown/SKILL.md
```

Expected: 2.

---

## Task 15: Write `SKILL.md` — Edge cases + Output sections

**Files:**
- Modify: `~/.agents/skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append Edge cases and Output sections**

```bash
cat >> ~/.agents/skills/prose-to-argdown/SKILL.md <<'EOF'
## Edge cases

| Situation | Skill behavior |
| --- | --- |
| **argdown-2 MCP server unavailable** | Warn user once. Proceed without validation. Add `<!-- unvalidated -->` to frontmatter. |
| **Prose < 50 words** | Reply: "This passage is too short to contain argumentative claims; nothing to extract." Do not produce empty argdown. |
| **Prose > 10,000 words** | Chunk on paragraph boundaries (≥ 500 words each), process each, concatenate with `<!-- chunk N of M -->` separator. Re-validate. |
| **No claims detected** (recipe, log, list) | Reply: "No argumentative claims detected in this prose; argdown-2 is for structured arguments. If you intended a different extraction, please clarify." Do not produce empty argdown. |
| **Contradictory prose** | Emit both sides as facts with a `--x` relation. Preserve the disagreement; do not resolve. |
| **Parse keeps failing** | After 2 parse-retry rounds, surface the parser errors verbatim. Mark with `<!-- parse-errors -->`. |
| **Sanity-check keeps failing** | After 2 Pass-3 refinement rounds, deliver best-effort with the warning note + list of unverified arguments. |
| **Provenance mismatch** | Rewrite the quote from the prose and re-emit. If that fails, drop the fact/argument. |

**User-visible error format:** when any of the above triggers, the chat reply is plain prose (no argdown code block), with the issue explained and a suggested remediation. The argdown code block is only present on successful extraction.

## Output assembly

Assembly order (top to bottom in the final code block):

1. **Frontmatter** (`=== ... ===`) — `title`, `source` (prose's title/URL if user provided), `extracted-from: lines X-Y` (or chunk list), `validated: <date>`.
2. **Facts** — all `[#id] claim { source-line, source-quote }` lines from Pass 1.
3. **Relations** — all `[#A] --> [#B] { source-line, source-quote }` lines from Pass 2.
4. **Arguments** — all `([#X]) -> [#Y], [#Z]. { source-line, source-quote }` lines from Pass 3.
5. **Structured blocks** — `:::evidence { … } :::` and `:::position { … } :::` groups.
6. **Trailing comment** — `<!-- extracted by prose-to-argdown; review source-quote attributes against source prose -->`.

Delivery wrapper in chat reply:

```
Extracted N facts, M relations, and K arguments from <word count> words of prose.

```argdown
=== … ===
[#id-1] …
…
```

Review the `source-quote` attributes against the source to verify each claim is grounded.
```

**What the reply does NOT contain:**

- Internal reasoning traces
- MCP tool outputs (parse errors, Mermaid strings)
- Refinement history
- The Mermaid diagram itself (the user can render it with `argdown render` if they want it)

EOF
```

- [ ] **Step 2: Verify both sections present**

```bash
grep -cE "^## Edge cases|^## Output assembly" ~/.agents/skills/prose-to-argdown/SKILL.md
```

Expected: 2.

---

## Task 16: Write `SKILL.md` — Self-verification checklist

**Files:**
- Modify: `~/.agents/skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append Self-verification section**

```bash
cat >> ~/.agents/skills/prose-to-argdown/SKILL.md <<'EOF'
## Self-verification (before delivery)

Before delivering the code block, run this checklist. If any check fails after the retry budgets are exhausted, deliver best-effort with the appropriate warning.

1. **Parseable:** call `mcp__argdown__validate(source)` on the full assembled doc. Must return `ok: true`.
2. **Provenance integrity:** for every fact and argument, verify `source-quote` is a verbatim substring of the input prose. If any fails, fix the quote by re-extracting from the prose, or drop the fact/argument.
3. **Grounded arguments:** walk each emitted argument. For each, point to a specific span in the prose. If you cannot, drop the argument.
4. **No invented facts/relations:** every fact should be in the prose; every relation should be stated or strongly implied. If any fails, drop.
5. **Frontmatter present:** the doc starts with a `===` block containing at least `title` and `extracted-from`.
6. **Trailing comment present:** the doc ends with `<!-- extracted by prose-to-argdown; review source-quote attributes against source prose -->`.

If all six checks pass, deliver the code block in the chat reply with the wrapper described in `## Output assembly`. If any check fails after the retry budgets are exhausted, deliver the current best-effort output with a one-line note about which checks failed.
EOF
```

- [ ] **Step 2: Verify Self-verification section is present**

```bash
grep -c "^## Self-verification" ~/.agents/skills/prose-to-argdown/SKILL.md
```

Expected: 1.

- [ ] **Step 3: Verify total line count is reasonable**

```bash
wc -l ~/.agents/skills/prose-to-argdown/SKILL.md
```

Expected: 250–400 lines.

---

## Task 17: Write `README.md` — installation and usage docs

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/README.md`

- [ ] **Step 1: Write the README**

```bash
cat > ~/.agents/skills/prose-to-argdown/README.md <<'EOF'
# prose-to-argdown

A snowball skill that distills argumentative or research/technical prose into a full argdown-2 document, with strict provenance and grounded arguments.

## What it does

Given a block of prose, the skill:

1. Extracts every atomic claim with `source-line` + `source-quote` provenance.
2. Identifies support/attack/undercut relations between claims.
3. Extracts argument structures the prose states or strongly implies.
4. Validates the output by parsing and rendering through argdown-2's MCP server.
5. Delivers the result as an inline `argdown` code block.

It does **not** invent arguments beyond what the prose says.

## Requirements

- argdown-2 v0.1.0-alpha1 or later, installed with its MCP server registered as `argdown` in your agent host config. See [argdown-2's README](https://github.com/kellenff/argdown-2) for setup.
- A snowball skill loader (Claude Code, Copilot CLI, Aider, Gemini CLI, VTCode, etc.)

## Installation

Copy `SKILL.md` and the supporting files (`README.md`, `MANUAL.md`, `fixtures/`, `scripts/`) into `~/.agents/skills/prose-to-argdown/`. The skill loader will discover `SKILL.md` automatically.

```bash
git clone <this-repo> ~/.agents/skills/prose-to-argdown
```

(Or just copy the files manually.)

## Triggering the skill

Paste prose in chat and ask any of:

- "extract the claims from this essay"
- "map the argument in this paper"
- "turn this into argdown"
- "what is this arguing"
- "structure this op-ed"

The skill handles argumentative prose (essays, op-eds, reviews, polemics, position papers) and research/technical prose (paper sections, technical reports, book excerpts).

## Verifying the skill

See `MANUAL.md` for the step-by-step smoke test against the bundled fixtures.

## Project layout

```
prose-to-argdown/
├── SKILL.md                    # the skill itself
├── README.md                   # this file
├── MANUAL.md                   # smoke test instructions
├── fixtures/                   # one directory per test fixture
│   ├── lead-essay/             # 150-word climate op-ed
│   ├── research-abstract/      # paper abstract with "we argue that X"
│   ├── position-disagreement/  # two voices arguing
│   ├── no-claims/              # recipe (tests early-exit)
│   ├── multi-paragraph/        # 1,500-word essay with sections
│   ├── ambiguous-prose/        # facts only, no arguments
│   └── legacy-syntax/          # prose mentioning ':—' syntax
└── scripts/
    ├── verify-fixture.sh       # runs argdown validate on expected.argdown
    └── run-skill.sh            # helper for invoking the skill
```

## License

Private.
EOF
```

- [ ] **Step 2: Verify README was created**

```bash
test -f ~/.agents/skills/prose-to-argdown/README.md && wc -l ~/.agents/skills/prose-to-argdown/README.md
```

Expected: file exists, ~60 lines.

---

## Task 18: Write `MANUAL.md` — step-by-step smoke test

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/MANUAL.md`

- [ ] **Step 1: Write the MANUAL**

```bash
cat > ~/.agents/skills/prose-to-argdown/MANUAL.md <<'EOF'
# prose-to-argdown — Manual Smoke Test

Use these steps to verify the skill is installed correctly and produces expected output. Run after every skill revision, and after any change to the underlying argdown-2 parser.

## Prerequisites

1. argdown-2 v0.1.0-alpha1 is installed and its MCP server is registered.
2. Your agent host can invoke `mcp__argdown__*` tools.
3. The skill directory exists at `~/.agents/skills/prose-to-argdown/`.

## Step 1: Verify the fixture files parse

For each fixture with an `expected.argdown`, run:

```bash
npx https://github.com/kellenff/argdown-2/releases/download/v0.1.0-alpha1/casualtheorics-argdown-2-0.1.0-alpha1.tgz validate ~/.agents/skills/prose-to-argdown/fixtures/<name>/expected.argdown
```

Expected: exit code 0, no stdout. Run for:

- `lead-essay`
- `research-abstract`
- `position-disagreement`
- `multi-paragraph`
- `ambiguous-prose`

(`no-claims` and `legacy-syntax` have `expected.txt` instead — they test the early-exit path.)

Or run all of them at once with the bundled script:

```bash
~/.agents/skills/prose-to-argdown/scripts/verify-fixture.sh all
```

## Step 2: Trigger the skill on a fixture

In your agent host:

1. Load the `prose-to-argdown` skill (typically automatic when triggered by the description match).
2. Paste the contents of `~/.agents/skills/prose-to-argdown/fixtures/lead-essay/input.txt` into the chat.
3. Say: "extract the claims from this prose".

The skill should:
- Run Pass 1, 2, 3 against the prose.
- Call `mcp__argdown__validate` and `mcp__argdown__render_mermaid` via MCP.
- Reply with: "Extracted N facts, M relations, and K arguments from <word count> words of prose."
- Followed by a fenced ` ```argdown ` code block.

## Step 3: Compare to the golden file

Save the skill's output and diff against `expected.argdown`:

```bash
# Paste the skill's output into a temporary file
# (or use scripts/run-skill.sh if your host supports capturing stdout)

diff -u ~/.agents/skills/prose-to-argdown/fixtures/lead-essay/expected.argdown <(pasted-output)
```

The output won't match byte-for-byte (LLM outputs are stochastic), but the structure should match:

- The same set of fact IDs.
- The same set of relations.
- The same arguments.
- Every `source-quote` should be a verbatim substring of `input.txt` — this is the strict invariant.

## Step 4: Verify the strict invariants

Run this Python one-liner against the skill's output to verify provenance:

```bash
python3 -c '
import re, sys
output = open("<skill-output-file>").read()
input_text = open("~/.agents/skills/prose-to-argdown/fixtures/lead-essay/input.txt").read()
quotes = re.findall(r"source-quote:\s*\"([^\"]*)\"", output)
bad = [q for q in quotes if q not in input_text]
if bad:
    print(f"FAIL: {len(bad)} quotes are not verbatim substrings of the prose:")
    for q in bad[:5]:
        print(f"  - {q!r}")
    sys.exit(1)
print(f"PASS: all {len(quotes)} source-quote attributes are verbatim substrings of the prose.")
'
```

Expected: "PASS: all N source-quote attributes are verbatim substrings of the prose."

## Step 5: Verify the early-exit cases

For `no-claims` and `legacy-syntax`, the skill should NOT produce an argdown code block:

1. Trigger with `fixtures/no-claims/input.txt`. Expected reply: plain-prose explanation that no argumentative claims were detected.
2. Trigger with `fixtures/legacy-syntax/input.txt`. Expected reply: explanation that the prose mentions the legacy syntax but does not actually use it as a parseable Argdown construct.

If the skill produces an argdown code block for these cases, it's incorrectly treating them as argumentative prose — file an issue.

## Step 6: Verify multi-paragraph handling

1. Trigger with `fixtures/multi-paragraph/input.txt`. The prose has 3 section breaks.
2. Expected: the produced argdown has ≥ 12 facts, ≥ 6 relations, ≥ 3 arguments.
3. Every `source-line` should reference a line that exists in `input.txt` (1-indexed).

## When things go wrong

- **Skill doesn't load:** verify `SKILL.md` is at the correct path. Some hosts require a specific directory layout.
- **MCP tools not found:** verify argdown-2's MCP server is registered. The skill should warn once and continue in degraded mode if the server is missing.
- **Output is not parseable:** the skill's retry budget is exhausted. Try running the skill again, or check the underlying argdown-2 release for grammar changes.
- **source-quote is not verbatim:** the skill's provenance check should catch this. If it's not caught, the skill body may have drifted; re-read Task 14 (Provenance + Validation) of the implementation plan.

EOF
```

- [ ] **Step 2: Verify MANUAL was created**

```bash
test -f ~/.agents/skills/prose-to-argdown/MANUAL.md && wc -l ~/.agents/skills/prose-to-argdown/MANUAL.md
```

Expected: file exists, ~100 lines.

---

## Task 19: Write `scripts/verify-fixture.sh`

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/scripts/verify-fixture.sh`

- [ ] **Step 1: Write the verification script**

```bash
cat > ~/.agents/skills/prose-to-argdown/scripts/verify-fixture.sh <<'EOF'
#!/usr/bin/env bash
#
# verify-fixture.sh — run argdown-2 validate on every fixture's expected.argdown
#
# Usage:
#   scripts/verify-fixture.sh           # verify all fixtures
#   scripts/verify-fixture.sh all       # same
#   scripts/verify-fixture.sh <name>    # verify one fixture (e.g. lead-essay)

set -euo pipefail

RELEASE_URL="https://github.com/kellenff/argdown-2/releases/download/v0.1.0-alpha1/casualtheorics-argdown-2-0.1.0-alpha1.tgz"
FIXTURES_DIR="${HOME}/.agents/skills/prose-to-argdown/fixtures"

verify_one() {
  local name="$1"
  local fixture_dir="${FIXTURES_DIR}/${name}"
  local expected="${fixture_dir}/expected.argdown"

  if [[ ! -f "$expected" ]]; then
    echo "SKIP: ${name} (no expected.argdown — early-exit fixture)"
    return 0
  fi

  echo -n "  ${name} ... "
  if npx "$RELEASE_URL" validate "$expected" >/dev/null 2>&1; then
    echo "PASS"
    return 0
  else
    echo "FAIL"
    npx "$RELEASE_URL" validate "$expected" || true
    return 1
  fi
}

verify_all() {
  local failed=0
  for dir in "${FIXTURES_DIR}"/*/; do
    local name
    name=$(basename "$dir")
    if ! verify_one "$name"; then
      failed=$((failed + 1))
    fi
  done

  echo
  if [[ "$failed" -eq 0 ]]; then
    echo "All fixtures passed."
    return 0
  else
    echo "${failed} fixture(s) failed."
    return 1
  fi
}

case "${1:-all}" in
  all)
    verify_all
    ;;
  "")
    verify_all
    ;;
  *)
    verify_one "$1"
    ;;
esac
EOF
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x ~/.agents/skills/prose-to-argdown/scripts/verify-fixture.sh
```

- [ ] **Step 3: Run the script and verify it passes**

```bash
~/.agents/skills/prose-to-argdown/scripts/verify-fixture.sh
```

Expected: 5 PASS lines (lead-essay, research-abstract, position-disagreement, multi-paragraph, ambiguous-prose) + 2 SKIP lines (no-claims, legacy-syntax), then "All fixtures passed."

---

## Task 20: Write `scripts/run-skill.sh` — invocation helper

**Files:**
- Create: `~/.agents/skills/prose-to-argdown/scripts/run-skill.sh`

- [ ] **Step 1: Write the helper**

```bash
cat > ~/.agents/skills/prose-to-argdown/scripts/run-skill.sh <<'EOF'
#!/usr/bin/env bash
#
# run-skill.sh — print a fixture's input prose to stdout, for the agent to ingest.
#
# Usage:
#   scripts/run-skill.sh <fixture-name>     # print input.txt
#
# Then in your agent host, load the prose-to-argdown skill and ask it to
# extract the claims from the prose shown on stdin.

set -euo pipefail

name="${1:?Usage: run-skill.sh <fixture-name>}"
input="${HOME}/.agents/skills/prose-to-argdown/fixtures/${name}/input.txt"

if [[ ! -f "$input" ]]; then
  echo "Fixture not found: $input" >&2
  exit 1
fi

cat "$input"
EOF
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x ~/.agents/skills/prose-to-argdown/scripts/run-skill.sh
```

- [ ] **Step 3: Verify the script prints the lead-essay input**

```bash
~/.agents/skills/prose-to-argdown/scripts/run-skill.sh lead-essay | head -3
```

Expected: first 3 lines of the climate op-ed.

---

## Task 21: Manual smoke test — confirm the skill works end-to-end

**Files:** (none — verification only)

This task verifies the skill produces the expected output for a real LLM run, not just that the expected.argdown files parse. This is the load-bearing correctness check.

- [ ] **Step 1: Verify argdown-2 MCP server is registered**

In your agent host config (e.g., `~/.config/claude*/...` or wherever your MCP config lives), confirm:

```json
{
  "mcpServers": {
    "argdown": {
      "command": "npx",
      "args": [
        "https://github.com/kellenff/argdown-2/releases/download/v0.1.0-alpha1/casualtheorics-argdown-2-0.1.0-alpha1.tgz",
        "mcp"
      ]
    }
  }
}
```

- [ ] **Step 2: Restart your agent host** so the new skill at `~/.agents/skills/prose-to-argdown/SKILL.md` is discovered.

- [ ] **Step 3: Run the lead-essay fixture through the skill**

In your agent host chat:

> Load the prose-to-argdown skill. Here is the prose to distill:
>
> ```
> [paste contents of ~/.agents/skills/prose-to-argdown/fixtures/lead-essay/input.txt]
> ```

Expected reply:

- A one-line summary: "Extracted N facts, M relations, and K arguments from <word count> words of prose."
- A fenced ` ```argdown ` code block containing a Document with ≥ 6 facts, ≥ 4 relations, ≥ 2 arguments.
- A one-line footer: "Review the `source-quote` attributes against the source to verify each claim is grounded."

- [ ] **Step 4: Run the strict provenance check on the skill's output**

Save the skill's reply to a file, then:

```bash
python3 -c '
import re, sys
output = open("<path-to-skill-output>").read()
input_text = open("~/.agents/skills/prose-to-argdown/fixtures/lead-essay/input.txt").read()
quotes = re.findall(r"source-quote:\s*\"([^\"]*)\"", output)
bad = [q for q in quotes if q not in input_text]
if bad:
    print(f"FAIL: {len(bad)} of {len(quotes)} quotes are not verbatim substrings.")
    sys.exit(1)
print(f"PASS: all {len(quotes)} source-quote attributes verified.")
'
```

Expected: PASS. If FAIL, the skill's provenance enforcement is broken — re-read Task 14 of the implementation plan.

- [ ] **Step 5: Confirm the early-exit cases**

Repeat Step 3 with the `no-claims` fixture:

> Load the prose-to-argdown skill. Here is the prose to distill:
>
> ```
> [paste contents of ~/.agents/skills/prose-to-argdown/fixtures/no-claims/input.txt]
> ```

Expected: plain-prose reply with no argdown code block, matching the message in `fixtures/no-claims/expected.txt`.

- [ ] **Step 6: Commit the plan (only git-tracked artifact)**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add docs/snowball/plans/2026-07-11-prose-to-argdown-skill.md
git commit -m "plan: prose-to-argdown skill — three-pass extraction with grounded arguments

Implementation plan for the user-scope SKILL.md at
~/.agents/skills/prose-to-argdown/. 21 tasks covering:

- 7 fixtures with input/expected/assertions (lead-essay, research-abstract,
  position-disagreement, no-claims, multi-paragraph, ambiguous-prose,
  legacy-syntax)
- SKILL.md in 8 sections (frontmatter, intro, inputs, pipeline, 3 passes,
  provenance, validation, edge cases, output, self-verification)
- README.md and MANUAL.md
- scripts/verify-fixture.sh and scripts/run-skill.sh
- Manual smoke test against lead-essay fixture

References spec docs/snowball/specs/2026-07-11-prose-to-argdown-skill-design.md."
```

---

## Self-review

After all 21 tasks:

1. **Spec coverage:** each spec section is implemented by a task.
   - Section 3 (Skill metadata) → Tasks 9–16 (SKILL.md frontmatter + sections)
   - Section 4 (Pipeline) → Task 10 (Pipeline section in SKILL.md)
   - Section 5 (Per-pass instructions) → Tasks 11–13 (Pass 1/2/3 sections)
   - Section 6 (Provenance) → Task 14 (Provenance section)
   - Section 7 (Validation & error handling) → Task 14 (Validation section), Task 15 (Edge cases section)
   - Section 8 (Testing) → Tasks 2–8 (fixtures), Tasks 19–20 (scripts), Task 21 (smoke test)
   - Section 9 (Assembly & delivery) → Task 15 (Output assembly section), Task 16 (Self-verification)
   - Section 10 (Open questions / deferred) → covered by README's "What it does not do" implicit boundaries

2. **Placeholder scan:** every step contains exact file paths and complete content (cat heredocs with full content inline).

3. **Type consistency:** the SKILL.md frontmatter, prose tooling calls (`mcp__argdown__validate`, `mcp__argdown__render_mermaid`, `mcp__argdown__parse`), and argdown-2 CLI release URL are identical across all tasks.

4. **Self-gating tasks:** Task 21's smoke test is gated on Tasks 1–20 being complete (and the agent host having argdown-2's MCP server registered).

If you find issues during self-review, fix them inline before offering execution choice.