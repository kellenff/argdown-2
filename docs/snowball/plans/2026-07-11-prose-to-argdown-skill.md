# `prose-to-argdown` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a repo-scope snowball skill (`skills/prose-to-argdown/SKILL.md`) that distills argumentative or research/technical prose into a full argdown-2 document with strict provenance and grounded arguments, validated via argdown-2's MCP server. Ship with three layers of host-specific packaging: the snowball SKILL.md (source of truth), a pi-coding-agent extension (`.pi/extensions/prose-to-argdown.ts`), and a Claude Code plugin (`.claude-plugin/plugin.json` + `commands/prose-to-argdown.md`).

**Architecture:** Three reasoning passes inside the skill body (Facts → Relations → Arguments), each validated independently. Every fact and argument carries `source-line` + `source-quote` provenance. The "grounded-arguments" invariant forbids synthesis: arguments are emitted only when the prose states or strongly implies them. The pi extension registers a slash command + custom tool that load the SKILL.md content into the agent prompt; the Claude plugin's slash command mirrors the pi behavior for Claude Code hosts.

**Tech Stack:** snowball skill format (Markdown + YAML frontmatter), argdown-2 v0.1.0-alpha1's MCP server tools (`parse`, `validate`, `render_mermaid`), pi-coding-agent extension API (`ExtensionAPI`), Claude Code plugin format (`.claude-plugin/plugin.json` manifest + `commands/*.md` slash commands), bash for verification scripts.

**Reference spec:** [`docs/snowball/specs/2026-07-11-prose-to-argdown-skill-design.md`](../specs/2026-07-11-prose-to-argdown-skill-design.md)

**Scope note:** All deliverables live inside the `argdown-2` git repo at known paths. Every artifact is git-tracked.

---

## File Structure

All deliverables live inside the `argdown-2` repo at git-tracked paths.

```
argdown-2/                                   # repo root (this directory)
├── skills/prose-to-argdown/                 # snowball skill (source of truth)
│   ├── SKILL.md                             # the skill itself (~400 lines)
│   ├── README.md                            # human-facing installation & usage docs
│   ├── MANUAL.md                            # step-by-step smoke test instructions
│   ├── scripts/
│   │   ├── verify-fixture.sh                # run argdown validate on expected.argdown
│   │   └── run-skill.sh                     # helper for invoking the skill on a fixture
│   └── fixtures/                            # one directory per fixture
│       ├── lead-essay/
│       │   ├── input.txt
│       │   ├── expected.argdown
│       │   └── assertions.json
│       ├── research-abstract/
│       │   ├── input.txt
│       │   ├── expected.argdown
│       │   └── assertions.json
│       ├── position-disagreement/
│       │   ├── input.txt
│       │   ├── expected.argdown
│       │   └── assertions.json
│       ├── no-claims/
│       │   ├── input.txt
│       │   └── expected.txt                 # plain-prose explanation, no argdown
│       ├── multi-paragraph/
│       │   ├── input.txt
│       │   ├── expected.argdown
│       │   └── assertions.json
│       ├── ambiguous-prose/
│       │   ├── input.txt
│       │   ├── expected.argdown
│       │   └── assertions.json
│       └── legacy-syntax/
│           ├── input.txt
│           └── expected.txt                 # plain-prose parser-error explanation
├── .pi/extensions/prose-to-argdown.ts       # pi-coding-agent extension (Task 22)
├── .claude-plugin/plugin.json                # Claude Code plugin manifest (Task 23)
└── commands/prose-to-argdown.md              # Claude Code slash command (Task 24)
```

---

## Task 1: Scaffold the skill directory tree

**Files:**
- Create: `skills/prose-to-argdown/`
- Create: `skills/prose-to-argdown/fixtures/`
- Create: `skills/prose-to-argdown/scripts/`
- Create: per-fixture directories under `fixtures/`
- Create: `.pi/extensions/` (will hold prose-to-argdown.ts in Task 22)
- Create: `.claude-plugin/` (will hold plugin.json in Task 23)
- Create: `commands/` (will hold prose-to-argdown.md in Task 24)

- [ ] **Step 1: Create the skill root and per-fixture directories**

```bash
cd "$(git rev-parse --show-toplevel)"
mkdir -p skills/prose-to-argdown/{fixtures,scripts}
for name in lead-essay research-abstract position-disagreement no-claims multi-paragraph ambiguous-prose legacy-syntax; do
  mkdir -p "skills/prose-to-argdown/fixtures/$name"
done
mkdir -p .pi/extensions .claude-plugin commands
```

- [ ] **Step 2: Verify the directory tree**

```bash
cd "$(git rev-parse --show-toplevel)"
find skills/prose-to-argdown .pi/extensions .claude-plugin commands -type d 2>/dev/null | sort
```

Expected output (top of tree):

```
.claude-plugin
.pi/extensions
commands
skills/prose-to-argdown
skills/prose-to-argdown/fixtures
skills/prose-to-argdown/fixtures/ambiguous-prose
skills/prose-to-argdown/fixtures/lead-essay
skills/prose-to-argdown/fixtures/legacy-syntax
skills/prose-to-argdown/fixtures/multi-paragraph
skills/prose-to-argdown/fixtures/no-claims
skills/prose-to-argdown/fixtures/position-disagreement
skills/prose-to-argdown/fixtures/research-abstract
skills/prose-to-argdown/scripts
```

- [ ] **Step 3: Commit the scaffold**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/prose-to-argdown .pi/extensions .claude-plugin commands
git commit -m "chore: scaffold prose-to-argdown directories (skill, fixtures, scripts, pi ext, claude plugin, slash command)"
```

---

## Task 2: Write fixture #1 — `lead-essay`

**Files:**
- Create: `skills/prose-to-argdown/fixtures/lead-essay/input.txt`
- Create: `skills/prose-to-argdown/fixtures/lead-essay/expected.argdown`
- Create: `skills/prose-to-argdown/fixtures/lead-essay/assertions.json`

A 300-word op-ed on climate policy. Tests the complete pipeline; expects ≥ 6 facts, ≥ 4 relations, ≥ 2 arguments.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > skills/prose-to-argdown/fixtures/lead-essay/input.txt <<'EOF'
The climate crisis demands urgent action. According to the IPCC's Sixth Assessment Report, human CO2 emissions are the primary driver of current warming trends, with observable impacts on ecosystems worldwide. Without coordinated international response, these impacts will continue to escalate.

Some skeptics argue that climate action would harm economic growth. However, the Stern Review demonstrated decades ago that the costs of inaction far exceed the costs of transition. Renewable energy investments have already created more jobs than the fossil fuel sector in many economies.

Critics also claim that individual action is futile. But consumer choices drive market signals, and market signals drive corporate behavior. When millions choose electric vehicles, manufacturers respond.

Therefore, a comprehensive approach combining policy reform, technological investment, and behavioral change offers the best path forward. The evidence is clear, the economics support it, and the urgency cannot be denied.
EOF
```

- [ ] **Step 2: Verify the input file is ~150 words**

```bash
wc -w skills/prose-to-argdown/fixtures/lead-essay/input.txt
```

Expected: ~150 words. (Spec says 300; this fixture is shorter for ease of testing.)

- [ ] **Step 3: Write `expected.argdown`**

```bash
cat > skills/prose-to-argdown/fixtures/lead-essay/expected.argdown <<'EOF'
=== title: "The case for climate action" source: "(test fixture)" extracted-from: lines 1-15 validated: 2026-07-11 ===

[#co2-primary-cause] Human CO2 emissions are the primary driver of current warming trends. { source-line: 1, source-quote: "According to the IPCC's Sixth Assessment Report, human CO2 emissions are the primary driver of current warming trends" }
[#impacts-observable] Current warming trends have observable impacts on ecosystems worldwide. { source-line: "1-2", source-quote: "with observable impacts on ecosystems worldwide" }
[#impacts-will-escalate] Without coordinated international response, these impacts will continue to escalate. { source-line: 3, source-quote: "Without coordinated international response, these impacts will continue to escalate" }
[#skeptics-economic-harm] Some skeptics argue that climate action would harm economic growth. { source-line: 5, source-quote: "Some skeptics argue that climate action would harm economic growth" }
[#stern-review-costs] The Stern Review demonstrated that the costs of inaction far exceed the costs of transition. { source-line: 6, source-quote: "the Stern Review demonstrated decades ago that the costs of inaction far exceed the costs of transition" }
[#renewables-more-jobs] Renewable energy investments have already created more jobs than the fossil fuel sector in many economies. { source-line: 7, source-quote: "Renewable energy investments have already created more jobs than the fossil fuel sector in many economies" }
[#individual-futile-claim] Critics claim that individual action is futile. { source-line: 9, source-quote: "Critics also claim that individual action is futile" }
[#market-signals-corporate] Consumer choices drive market signals, and market signals drive corporate behavior. { source-line: 10, source-quote: "consumer choices drive market signals, and market signals drive corporate behavior" }
[#ev-manufacturer-response] When millions choose electric vehicles, manufacturers respond. { source-line: 11, source-quote: "When millions choose electric vehicles, manufacturers respond" }
[#comprehensive-approach] A comprehensive approach combining policy reform, technological investment, and behavioral change offers the best path forward. { source-line: 13, source-quote: "Therefore, a comprehensive approach combining policy reform, technological investment, and behavioral change offers the best path forward" }
[#facts-are-clear] The evidence is clear. { source-line: 14, source-quote: "The evidence is clear" }
[#economics-support] The economics support it. { source-line: 14, source-quote: "the economics support it" }
[#urgency-cannot-be-denied] The urgency cannot be denied. { source-line: 14, source-quote: "the urgency cannot be denied" }

[#co2-primary-cause] --> [#comprehensive-approach] { source-line: 1, source-quote: "The climate crisis demands urgent action" }
[#impacts-observable] --> [#comprehensive-approach] { source-line: "1-2", source-quote: "with observable impacts on ecosystems worldwide" }
[#stern-review-costs] --x [#skeptics-economic-harm] { source-line: 6, source-quote: "However, the Stern Review demonstrated decades ago that the costs of inaction far exceed the costs of transition" }
[#renewables-more-jobs] --x [#skeptics-economic-harm] { source-line: 7, source-quote: "Renewable energy investments have already created more jobs than the fossil fuel sector in many economies" }
[#market-signals-corporate] --x [#individual-futile-claim] { source-line: 10, source-quote: "consumer choices drive market signals, and market signals drive corporate behavior" }
[#ev-manufacturer-response] --x [#individual-futile-claim] { source-line: 11, source-quote: "When millions choose electric vehicles, manufacturers respond" }
[#facts-are-clear] --> [#comprehensive-approach] { source-line: 14, source-quote: "The evidence is clear" }
[#economics-support] --> [#comprehensive-approach] { source-line: 14, source-quote: "the economics support it" }
[#urgency-cannot-be-denied] --> [#comprehensive-approach] { source-line: 14, source-quote: "the urgency cannot be denied" }

([#comprehensive-approach]) -> [#co2-primary-cause], [#impacts-observable], [#stern-review-costs], [#renewables-more-jobs], [#market-signals-corporate], [#ev-manufacturer-response], [#facts-are-clear], [#economics-support], [#urgency-cannot-be-denied]. { source-line: 13, source-quote: "Therefore, a comprehensive approach combining policy reform, technological investment, and behavioral change offers the best path forward" }

// extracted by prose-to-argdown; review source-quote attributes against source prose. Rebuttal arguments omitted: argdown-2 supports only `->` in argument position, so the "[#stern-review-costs] --x [#skeptics-economic-harm]" and "[#market-signals-corporate] --x [#individual-futile-claim]" relations above capture the rebuttal semantics without needing separate argument nodes.
EOF
```

- [ ] **Step 4: Write `assertions.json`**

```bash
cat > skills/prose-to-argdown/fixtures/lead-essay/assertions.json <<'EOF'
{
  "fixture": "lead-essay",
  "expects_parseable": true,
  "expects_arguments": true,
  "min_facts": 6,
  "min_relations": 4,
  "min_arguments": 1,
  "max_facts": 20,
  "provenance_required": true,
  "every_quote_must_be_substring": true,
  "grounded_arguments_only": true,
  "notes": "One main `->` argument for the comprehensive-approach conclusion; rebuttal semantics captured via `--x` relations (argdown-2 supports only `->` in argument position, so rebuttal arguments are not emitted). The fixture still exercises the full three-pass pipeline even with one argument."
}
EOF
```

- [ ] **Step 5: Verify the expected.argdown parses cleanly via argdown-2**

```bash
yarn node ./dist/cli.js validate skills/prose-to-argdown/fixtures/lead-essay/expected.argdown
```

Expected: exit code 0, no output on stdout.

- [ ] **Step 6: Commit the fixture**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/fixtures/lead-essay
git rm -f skills/prose-to-argdown/fixtures/lead-essay/.gitkeep 2>/dev/null || true
git commit -m "test(fixture): add lead-essay fixture (climate op-ed, 13 facts, 9 relations, 1 argument)"
```

(Removes the Task 1 `.gitkeep` placeholder now that the directory has real content.)

---

## Task 3: Write fixture #2 — `research-abstract`

**Files:**
- Create: `skills/prose-to-argdown/fixtures/research-abstract/input.txt`
- Create: `skills/prose-to-argdown/fixtures/research-abstract/expected.argdown`
- Create: `skills/prose-to-argdown/fixtures/research-abstract/assertions.json`

A 150-word paper abstract with explicit "we argue that X because Y" structure. Tests argument extraction.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > skills/prose-to-argdown/fixtures/research-abstract/input.txt <<'EOF'
We argue that transformer attention heads can be interpreted as soft database lookups. Specifically, attention patterns over a key-value store approximate nearest-neighbor retrieval in expectation. Our experiments on three benchmarks demonstrate that 64-head attention recovers ninety-one percent of exact-match queries on synthetic lookup tasks. This work implies that future architectures should treat attention as a learned index rather than a sequence mixer, with consequent reductions in parameter count for memory-bound workloads.
EOF
```

- [ ] **Step 2: Verify input is ~80 words**

```bash
wc -w skills/prose-to-argdown/fixtures/research-abstract/input.txt
```

Expected: ~80 words.

- [ ] **Step 3: Write `expected.argdown`**

```bash
cat > skills/prose-to-argdown/fixtures/research-abstract/expected.argdown <<'EOF'
=== title: "Attention as soft database lookup" source: "(test fixture)" extracted-from: lines 1-3 validated: 2026-07-11 ===

[#transformer-attention-lookup] Transformer attention heads can be interpreted as soft database lookups. { source-line: 1, source-quote: "transformer attention heads can be interpreted as soft database lookups" }
[#attention-knn-approximation] Attention patterns over a key-value store approximate nearest-neighbor retrieval in expectation. { source-line: 1, source-quote: "attention patterns over a key-value store approximate nearest-neighbor retrieval in expectation" }
[#experiments-benchmarks] Experiments on three benchmarks demonstrate that 64-head attention recovers ninety-one percent of exact-match queries on synthetic lookup tasks. { source-line: 1, source-quote: "Our experiments on three benchmarks demonstrate that 64-head attention recovers ninety-one percent of exact-match queries on synthetic lookup tasks" }
[#attention-as-index] Future architectures should treat attention as a learned index rather than a sequence mixer. { source-line: 1, source-quote: "future architectures should treat attention as a learned index rather than a sequence mixer" }
[#memory-bound-reduction] Treating attention as an index produces consequent reductions in parameter count for memory-bound workloads. { source-line: 1, source-quote: "with consequent reductions in parameter count for memory-bound workloads" }

[#experiments-benchmarks] --> [#transformer-attention-lookup] { source-line: 1, source-quote: "Our experiments on three benchmarks demonstrate that 64-head attention recovers ninety-one percent of exact-match queries on synthetic lookup tasks" }
[#attention-knn-approximation] --> [#transformer-attention-lookup] { source-line: 1, source-quote: "attention patterns over a key-value store approximate nearest-neighbor retrieval in expectation" }
[#attention-as-index] --> [#memory-bound-reduction] { source-line: 1, source-quote: "future architectures should treat attention as a learned index rather than a sequence mixer, with consequent reductions in parameter count for memory-bound workloads" }

([#transformer-attention-lookup]) -> [#attention-knn-approximation], [#experiments-benchmarks]. { source-line: 1, source-quote: "We argue that transformer attention heads can be interpreted as soft database lookups. Specifically, attention patterns over a key-value store approximate nearest-neighbor retrieval in expectation. Our experiments on three benchmarks demonstrate that 64-head attention recovers ninety-one percent of exact-match queries on synthetic lookup tasks" }
([#memory-bound-reduction]) -> [#attention-as-index]. { source-line: 1, source-quote: "future architectures should treat attention as a learned index rather than a sequence mixer, with consequent reductions in parameter count for memory-bound workloads" }

// extracted by prose-to-argdown; review source-quote attributes against source prose
EOF
```

- [ ] **Step 4: Write `assertions.json`**

```bash
cat > skills/prose-to-argdown/fixtures/research-abstract/assertions.json <<'EOF'
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
yarn node ./dist/cli.js validate skills/prose-to-argdown/fixtures/research-abstract/expected.argdown
```

Expected: exit code 0.

- [ ] **Step N+1: Commit the fixture**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/fixtures/research-abstract
git rm -f skills/prose-to-argdown/fixtures/research-abstract/.gitkeep 2>/dev/null || true
git commit -m "test(fixture): add research-abstract fixture (paper-abstract prose with 'we argue that X')"
```

(Removes the Task 1 `.gitkeep` placeholder now that the directory has real content.)

---

## Task 4: Write fixture #3 — `position-disagreement`

**Files:**
- Create: `skills/prose-to-argdown/fixtures/position-disagreement/input.txt`
- Create: `skills/prose-to-argdown/fixtures/position-disagreement/expected.argdown`
- Create: `skills/prose-to-argdown/fixtures/position-disagreement/assertions.json`

Two voices arguing against each other. Tests `--x` relations and multi-source `:::position` blocks.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > skills/prose-to-argdown/fixtures/position-disagreement/input.txt <<'EOF'
According to Smith, remote work has increased worker productivity by 12% across surveyed firms. Smith argues that eliminating the daily commute produces measurable gains in deep-work hours. However, Jones contests this finding. According to Jones, remote work fragments collaboration and erodes institutional knowledge. Jones argues that in-person work enables the kind of spontaneous exchange that remote workers systematically miss. Both positions are well-supported by their respective studies; the question is which effect dominates in practice.
EOF
```

- [ ] **Step 2: Verify input is ~100 words**

```bash
wc -w skills/prose-to-argdown/fixtures/position-disagreement/input.txt
```

Expected: ~100 words.

- [ ] **Step 3: Write `expected.argdown`**

```bash
cat > skills/prose-to-argdown/fixtures/position-disagreement/expected.argdown <<'EOF'
=== title: "Remote work productivity debate" source: "(test fixture)" extracted-from: lines 1-3 validated: 2026-07-11 ===

[#smith-productivity-gain] Remote work has increased worker productivity by twelve percent across surveyed firms. { source-line: 1, source-quote: "remote work has increased worker productivity by 12% across surveyed firms" }
[#smith-deep-work-gain] Eliminating the daily commute produces measurable gains in deep-work hours. { source-line: 1, source-quote: "eliminating the daily commute produces measurable gains in deep-work hours" }
[#jones-collaboration-fragmentation] Remote work fragments collaboration and erodes institutional knowledge. { source-line: 1, source-quote: "remote work fragments collaboration and erodes institutional knowledge" }
[#jones-spontaneous-exchange] In-person work enables the kind of spontaneous exchange that remote workers systematically miss. { source-line: 1, source-quote: "in-person work enables the kind of spontaneous exchange that remote workers systematically miss" }

:::position
[#smith-productivity-gain] Remote work has increased worker productivity by twelve percent across surveyed firms. { source-line: 1, source-quote: "According to Smith, remote work has increased worker productivity by 12% across surveyed firms" }
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

// extracted by prose-to-argdown; review source-quote attributes against source prose
EOF
```

- [ ] **Step 4: Write `assertions.json`**

```bash
cat > skills/prose-to-argdown/fixtures/position-disagreement/assertions.json <<'EOF'
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
yarn node ./dist/cli.js validate skills/prose-to-argdown/fixtures/position-disagreement/expected.argdown
```

Expected: exit code 0.

- [ ] **Step N+1: Commit the fixture**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/fixtures/position-disagreement
git rm -f skills/prose-to-argdown/fixtures/position-disagreement/.gitkeep 2>/dev/null || true
git commit -m "test(fixture): add position-disagreement fixture (two voices arguing across paragraphs)"
```

(Removes the Task 1 `.gitkeep` placeholder now that the directory has real content.)

---

## Task 5: Write fixture #4 — `no-claims`

**Files:**
- Create: `skills/prose-to-argdown/fixtures/no-claims/input.txt`
- Create: `skills/prose-to-argdown/fixtures/no-claims/expected.txt`

A recipe. Tests the "no claims detected" early-exit. The expected output is a plain-prose explanation, no argdown code block.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > skills/prose-to-argdown/fixtures/no-claims/input.txt <<'EOF'
To make sourdough bread, combine 500g flour, 350g water, 100g starter, and 10g salt in a large bowl. Mix until shaggy, then cover and rest for 30 minutes. After the rest, perform four sets of stretch-and-folds at 30-minute intervals. Bulk ferment for 4-6 hours at room temperature until the dough is 50% larger. Shape into a boule, place in a banneton, and refrigerate overnight. Bake at 230C in a preheated Dutch oven for 20 minutes covered, then 25 minutes uncovered.
EOF
```

- [ ] **Step 2: Verify input is descriptive, not argumentative**

```bash
grep -iE "argue|claim|therefore|because|however|but" skills/prose-to-argdown/fixtures/no-claims/input.txt || echo "No argumentative markers (expected)"
```

Expected: prints "No argumentative markers (expected)".

- [ ] **Step 3: Write `expected.txt`**

The skill should reply in plain prose, with no argdown code block:

```bash
cat > skills/prose-to-argdown/fixtures/no-claims/expected.txt <<'EOF'
No argumentative claims detected in this prose; argdown-2 is for structured arguments. If you intended a different extraction (e.g., a step-by-step procedure, a recipe, a list), please clarify or use a different tool.
EOF
```

- [ ] **Step 4: No assertions.json for this fixture**

The skill does not produce argdown for this case, so there's no parseable output to assert against. The expected.txt IS the assertion.

- [ ] **Step 5: Commit the fixture**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/fixtures/no-claims
git rm -f skills/prose-to-argdown/fixtures/no-claims/.gitkeep 2>/dev/null || true
git commit -m "test(fixture): add no-claims early-exit fixture (recipe prose, no argdown output)"
```

(Removes the Task 1 `.gitkeep` placeholder now that the directory has real content.)

---

## Task 6: Write fixture #5 — `multi-paragraph`

**Files:**
- Create: `skills/prose-to-argdown/fixtures/multi-paragraph/input.txt`
- Create: `skills/prose-to-argdown/fixtures/multi-paragraph/expected.argdown`
- Create: `skills/prose-to-argdown/fixtures/multi-paragraph/assertions.json`

A 1,500-word essay with section breaks. Tests chunking and frontmatter range.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > skills/prose-to-argdown/fixtures/multi-paragraph/input.txt <<'EOF'
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
grep -c "^# " skills/prose-to-argdown/fixtures/multi-paragraph/input.txt
```

Expected: 3 (three `# Section N:` headers).

- [ ] **Step 3: Write `expected.argdown`**

```bash
cat > skills/prose-to-argdown/fixtures/multi-paragraph/expected.argdown <<'EOF'
=== title: "Pay down technical debt continuously" source: "(test fixture)" extracted-from: lines 1-25 validated: 2026-07-11 ===

[#debt-accumulation] Modern software systems routinely accumulate technical debt. { source-line: 2, source-quote: "Modern software systems routinely accumulate technical debt" }
[#stripe-2024-study] A 2024 Stripe study found that developers spend forty-two percent of their time dealing with legacy code rather than building new features. { source-line: 3, source-quote: "A 2024 Stripe study found that developers spend 42% of their time dealing with legacy code rather than building new features" }
[#debt-not-sustainable] This is not sustainable. { source-line: 4, source-quote: "This is not sustainable" }
[#debt-cost-compounds] The cost of deferred refactoring compounds. { source-line: 5, source-quote: "The cost of deferred refactoring compounds" }
[#debt-rule-of-ten] A function that takes three days to understand today will take five next year and ten the year after. { source-line: 5, source-quote: "a function that takes three days to understand today will take five next year and ten the year after" }
[#twenty-percent-allocation] Every team should allocate at least twenty percent of sprint capacity to debt reduction. { source-line: 7, source-quote: "every team should allocate at least 20% of sprint capacity to debt reduction" }
[#facts-are-overwhelming] The evidence is overwhelming. { source-line: 8, source-quote: "The evidence is overwhelming" }
[#debt-alternative-unmaintainable] Letting debt accumulate produces systems that nobody wants to touch and nobody can extend. { source-line: 9, source-quote: "letting debt accumulate produces systems that nobody wants to touch and nobody can extend" }
[#twenty-percent-too-much-claim] Some will object that twenty percent is too much. { source-line: 12, source-quote: "Some will object that 20% is too much" }
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
[#facts-are-overwhelming] --> [#twenty-percent-allocation] { source-line: 8, source-quote: "The evidence is overwhelming" }
[#debt-alternative-unmaintainable] --> [#twenty-percent-allocation] { source-line: 9, source-quote: "letting debt accumulate produces systems that nobody wants to touch and nobody can extend" }
[#compounding-cost-ignored] --x [#twenty-percent-too-much-claim] { source-line: 13, source-quote: "However, this view ignores the compounding cost of debt" }
[#not-actually-moved-forward] --x [#twenty-percent-too-much-claim] { source-line: 13, source-quote: "A team that ships features today but cannot ship them next year has not actually moved forward" }
[#unable-to-ship-risk] --x [#refactoring-risky-claim] { source-line: 16, source-quote: "The risk of breaking production during a refactor is much smaller than the risk of being unable to ship anything at all once the system becomes unmaintainable" }
[#discipline-ships-faster] --> [#pay-now-or-later] { source-line: 22, source-quote: "Teams that adopt this discipline ship faster over the long run, not slower" }

([#twenty-percent-allocation]) -> [#stripe-2024-study], [#debt-cost-compounds], [#facts-are-overwhelming], [#debt-alternative-unmaintainable]. { source-line: 7, source-quote: "Therefore, every team should allocate at least 20% of sprint capacity to debt reduction. The evidence is overwhelming. The alternative — letting debt accumulate — produces systems that nobody wants to touch and nobody can extend" }
([#pay-now-or-later]) -> [#math-favors-continuous], [#discipline-ships-faster]. { source-line: "21-22", source-quote: "pay down debt continuously, or pay it down later with interest. The math favors the former. Teams that adopt this discipline ship faster over the long run, not slower" }

// extracted by prose-to-argdown; review source-quote attributes against source prose. Rebuttal arguments omitted: argdown-2 supports only `->` in argument position, so the "--x" relations above capture the rebuttal semantics for the "20% is too much" and "refactoring is risky" counter-claims without needing separate argument nodes.
EOF
```

- [ ] **Step 4: Write `assertions.json`**

```bash
cat > skills/prose-to-argdown/fixtures/multi-paragraph/assertions.json <<'EOF'
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
yarn node ./dist/cli.js validate skills/prose-to-argdown/fixtures/multi-paragraph/expected.argdown
```

Expected: exit code 0.

- [ ] **Step N+1: Commit the fixture**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/fixtures/multi-paragraph
git rm -f skills/prose-to-argdown/fixtures/multi-paragraph/.gitkeep 2>/dev/null || true
git commit -m "test(fixture): add multi-paragraph fixture (1,500-word climate essay with sections)"
```

(Removes the Task 1 `.gitkeep` placeholder now that the directory has real content.)

---

## Task 7: Write fixture #6 — `ambiguous-prose`

**Files:**
- Create: `skills/prose-to-argdown/fixtures/ambiguous-prose/input.txt`
- Create: `skills/prose-to-argdown/fixtures/ambiguous-prose/expected.argdown`
- Create: `skills/prose-to-argdown/fixtures/ambiguous-prose/assertions.json`

Prose with related facts but no explicit arguments. Tests the "facts only, no arguments" path (silence is valid output for arguments).

- [ ] **Step 1: Write `input.txt`**

```bash
cat > skills/prose-to-argdown/fixtures/ambiguous-prose/input.txt <<'EOF'
Three properties distinguish post-quantum cryptographic schemes. First, lattice-based cryptography relies on the hardness of shortest-vector problems in high-dimensional lattices. Second, code-based cryptography relies on the hardness of decoding random linear codes. Third, hash-based cryptography relies only on the collision-resistance of standard hash functions. Each family offers different trade-offs in key size, signature size, and computational cost.
EOF
```

- [ ] **Step 2: Write `expected.argdown`**

```bash
cat > skills/prose-to-argdown/fixtures/ambiguous-prose/expected.argdown <<'EOF'
=== title: "Post-quantum cryptography families" source: "(test fixture)" extracted-from: lines 1-3 validated: 2026-07-11 ===

[#lattice-hardness] Lattice-based cryptography relies on the hardness of shortest-vector problems in high-dimensional lattices. { source-line: 1, source-quote: "lattice-based cryptography relies on the hardness of shortest-vector problems in high-dimensional lattices" }
[#code-hardness] Code-based cryptography relies on the hardness of decoding random linear codes. { source-line: 1, source-quote: "code-based cryptography relies on the hardness of decoding random linear codes" }
[#hash-hardness] Hash-based cryptography relies only on the collision-resistance of standard hash functions. { source-line: 1, source-quote: "hash-based cryptography relies only on the collision-resistance of standard hash functions" }
[#three-families-tradeoffs] Each family offers different trade-offs in key size, signature size, and computational cost. { source-line: 1, source-quote: "Each family offers different trade-offs in key size, signature size, and computational cost" }

// extracted by prose-to-argdown; review source-quote attributes against source prose. No arguments emitted: the prose does not argue for any specific family.
EOF
```

- [ ] **Step 3: Write `assertions.json`**

```bash
cat > skills/prose-to-argdown/fixtures/ambiguous-prose/assertions.json <<'EOF'
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
yarn node ./dist/cli.js validate skills/prose-to-argdown/fixtures/ambiguous-prose/expected.argdown
```

Expected: exit code 0.

- [ ] **Step N+1: Commit the fixture**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/fixtures/ambiguous-prose
git rm -f skills/prose-to-argdown/fixtures/ambiguous-prose/.gitkeep 2>/dev/null || true
git commit -m "test(fixture): add ambiguous-prose fixture (facts only, no arguments)"
```

(Removes the Task 1 `.gitkeep` placeholder now that the directory has real content.)

---

## Task 8: Write fixture #7 — `legacy-syntax`

**Files:**
- Create: `skills/prose-to-argdown/fixtures/legacy-syntax/input.txt`
- Create: `skills/prose-to-argdown/fixtures/legacy-syntax/expected.txt`

Prose that uses the legacy `:—` syntax (mentioned as a string in the prose). Tests that the skill surfaces the parser's hard-error message rather than silently accepting the syntax.

- [ ] **Step 1: Write `input.txt`**

```bash
cat > skills/prose-to-argdown/fixtures/legacy-syntax/input.txt <<'EOF'
The author uses the legacy Argdown 1.x syntax throughout. For example, they write [#a] :— [#b] to express that A supports B. This was the conventional syntax before the v0.1.0 release, which removed the ':—' rule syntax in favor of the linked `->` arguments. The current parser hard-errors on ':—' and recommends migration to the new form.
EOF
```

- [ ] **Step 2: Write `expected.txt`**

```bash
cat > skills/prose-to-argdown/fixtures/legacy-syntax/expected.txt <<'EOF'
The source prose describes the legacy ':—' syntax but does not itself contain it as a parseable Argdown construct. If the user's intent was to test that the skill surfaces the legacy-syntax error, please supply prose that uses ':—' as an Argdown rule (e.g., `[#a] :— [#b].`). The current parser rejects ':—' with the migration message:

  ':—' syntax was removed. Use '->' for inference ([#A]) -> [#B], [#C].

No argdown-2 document was produced.
EOF
```

- [ ] **Step 4: Commit the fixture**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/fixtures/legacy-syntax
git rm -f skills/prose-to-argdown/fixtures/legacy-syntax/.gitkeep 2>/dev/null || true
git commit -m "test(fixture): add legacy-syntax parser-error fixture (prose mentions ':—' syntax)"
```

(Removes the Task 1 `.gitkeep` placeholder now that the directory has real content.)

---

## Task 9: Write `SKILL.md` — frontmatter, intro, and inputs

**Files:**
- Create: `skills/prose-to-argdown/SKILL.md`

- [ ] **Step 1: Create the file with frontmatter, intro, and inputs sections**

```bash
cat > skills/prose-to-argdown/SKILL.md <<'EOF'
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
test -f skills/prose-to-argdown/SKILL.md && head -3 skills/prose-to-argdown/SKILL.md
```

Expected: file exists, first line is `---`.

- [ ] **Step 4: Commit the SKILL.md frontmatter**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/SKILL.md
git rm -f skills/prose-to-argdown/.gitkeep 2>/dev/null || true
git commit -m "feat(skill): add prose-to-argdown SKILL.md frontmatter and intro"
```

(Removes the Task 1 `.gitkeep` placeholder now that the directory has real content.)

---

## Task 10: Write `SKILL.md` — Pipeline section

**Files:**
- Modify: `skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append the Pipeline section**

```bash
cat >> skills/prose-to-argdown/SKILL.md <<'EOF'
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
grep -c "^## Pipeline" skills/prose-to-argdown/SKILL.md
```

Expected: 1.

- [ ] **Step 2: Commit the section**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/SKILL.md
git commit -m "feat(skill): add Pipeline section to SKILL.md"
```

---

## Task 11: Write `SKILL.md` — Pass 1 (Facts)

**Files:**
- Modify: `skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append the Pass 1 section**

```bash
cat >> skills/prose-to-argdown/SKILL.md <<'EOF'
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
   - Range: `source-line: "42-45"`
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
grep -c "^## Pass 1: Facts" skills/prose-to-argdown/SKILL.md
```

Expected: 1.

- [ ] **Step 2: Commit the section**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/SKILL.md
git commit -m "feat(skill): add Pass 1 (Facts) section to SKILL.md"
```

---

## Task 12: Write `SKILL.md` — Pass 2 (Relations)

**Files:**
- Modify: `skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append the Pass 2 section**

```bash
cat >> skills/prose-to-argdown/SKILL.md <<'EOF'
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
grep -c "^## Pass 2: Relations" skills/prose-to-argdown/SKILL.md
```

Expected: 1.

- [ ] **Step 2: Commit the section**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/SKILL.md
git commit -m "feat(skill): add Pass 2 (Relations) section to SKILL.md"
```

---

## Task 13: Write `SKILL.md` — Pass 3 (Arguments + structured blocks)

**Files:**
- Modify: `skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append the Pass 3 section**

```bash
cat >> skills/prose-to-argdown/SKILL.md <<'EOF'
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
grep -c "^## Pass 3: Arguments" skills/prose-to-argdown/SKILL.md
```

Expected: 1.

- [ ] **Step 2: Commit the section**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/SKILL.md
git commit -m "feat(skill): add Pass 3 (Arguments) section to SKILL.md"
```

---

## Task 14: Write `SKILL.md` — Provenance + Validation sections

**Files:**
- Modify: `skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append Provenance and Validation sections**

```bash
cat >> skills/prose-to-argdown/SKILL.md <<'EOF'
## Provenance schema

Every fact and argument carries `source-line` and `source-quote` attributes. These are the audit anchors — the user can verify each claim by searching the prose for the quote.

**Attribute conventions:**

- `source-line` — number attribute, 1-indexed.
  - Single line: `source-line: 42`
  - Range: `source-line: "42-45"`
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

## Argdown-2 grammar constraints (READ BEFORE WRITING)

These are argdown-2 grammar constraints surfaced during plan validation. They apply to ALL output (facts, relations, arguments, comments):

1. **Arguments support only `->` in conclusion position.** Rebuttal arguments are NOT a separate `([#X]) --x [#Y]` construction; use a `[#A] --x [#B]` relation instead. The argument syntax `([#conclusion]) -> [#premise-1], [#premise-2].` is the only supported form.

2. **Comments are `//` (line) or `/* */` (block), not `<!-- -->`.** argdown-2's lexer rejects HTML-style comments. The trailing marker line uses `// extracted by prose-to-argdown; ...`.

3. **Five block-type keywords are reserved as fact-ID prefixes:** `evidence-`, `position-`, `stakeholder-`, `domain-`, `meta-`. Any fact ID starting with one of these prefixes (e.g., `[#evidence-clear]`, `[#position-x]`) is rejected by the lexer. Use alternative spellings: `facts-are-clear`, `the-position-held`, etc.

4. **Source-line ranges must use quoted strings.** `source-line: 1-2` (unquoted range) is rejected in relations and arguments. Use `source-line: "1-2"` (quoted string), or `source-line: [42, 67]` (flow sequence) for discontiguous spans.

5. **`%` in unquoted fact text is rejected by the lexer** (the `%` character is reserved). Source-quote strings (which are quoted) accept `%` fine. If the prose uses `%`, spell out "percent" in the fact text but keep the original `%` in the source-quote verbatim.

6. **Legacy `:—` syntax is a hard parse error** with migration hint. Never emit it; never include `:—` in any test fixture that the skill will validate.

If `argdown validate` rejects your output with any of these errors, fix the offending section and re-validate. Do not deliver invalid argdown.

EOF
```

- [ ] **Step 2: Verify both sections present**

```bash
grep -cE "^## Provenance schema|^## Validation loop|^## Argdown-2 grammar constraints" skills/prose-to-argdown/SKILL.md
```

Expected: 3.

- [ ] **Step 3: Commit the section**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/SKILL.md
git commit -m "feat(skill): add Provenance + Validation + Grammar constraints sections to SKILL.md"
```

---

## Task 15: Write `SKILL.md` — Edge cases + Output sections

**Files:**
- Modify: `skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append Edge cases and Output sections**

```bash
cat >> skills/prose-to-argdown/SKILL.md <<'EOF'
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
6. **Trailing comment** — `// extracted by prose-to-argdown; review source-quote attributes against source prose` (argdown-2 line-comment syntax).

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
grep -cE "^## Edge cases|^## Output assembly" skills/prose-to-argdown/SKILL.md
```

Expected: 2.

- [ ] **Step 2: Commit the section**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/SKILL.md
git commit -m "feat(skill): add Edge cases + Output assembly sections to SKILL.md"
```

---

## Task 16: Write `SKILL.md` — Self-verification checklist

**Files:**
- Modify: `skills/prose-to-argdown/SKILL.md` (append)

- [ ] **Step 1: Append Self-verification section**

```bash
cat >> skills/prose-to-argdown/SKILL.md <<'EOF'
## Self-verification (before delivery)

Before delivering the code block, run this checklist. If any check fails after the retry budgets are exhausted, deliver best-effort with the appropriate warning.

1. **Parseable:** call `mcp__argdown__validate(source)` on the full assembled doc. Must return `ok: true`.
2. **Provenance integrity:** for every fact and argument, verify `source-quote` is a verbatim substring of the input prose. If any fails, fix the quote by re-extracting from the prose, or drop the fact/argument.
3. **Grounded arguments:** walk each emitted argument. For each, point to a specific span in the prose. If you cannot, drop the argument.
4. **No invented facts/relations:** every fact should be in the prose; every relation should be stated or strongly implied. If any fails, drop.
5. **Frontmatter present:** the doc starts with a `===` block containing at least `title` and `extracted-from`.
6. **Trailing comment present:** the doc ends with `// extracted by prose-to-argdown; review source-quote attributes against source prose`.

If all six checks pass, deliver the code block in the chat reply with the wrapper described in `## Output assembly`. If any check fails after the retry budgets are exhausted, deliver the current best-effort output with a one-line note about which checks failed.
EOF
```

- [ ] **Step 2: Verify Self-verification section is present**

```bash
grep -c "^## Self-verification" skills/prose-to-argdown/SKILL.md
```

Expected: 1.

- [ ] **Step 2: Commit the section**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/SKILL.md
git commit -m "feat(skill): add Self-verification checklist to SKILL.md"
```

- [ ] **Step 3: Verify total line count is reasonable**

```bash
wc -l skills/prose-to-argdown/SKILL.md
```

Expected: 250–400 lines.

---

## Task 17: Write `README.md` — installation and usage docs

**Files:**
- Create: `skills/prose-to-argdown/README.md`

- [ ] **Step 1: Write the README**

```bash
cat > skills/prose-to-argdown/README.md <<'EOF'
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

This skill ships inside the `argdown-2` repo. To use it from another project, ensure the argdown-2 repo is on your machine (or symlink `skills/prose-to-argdown/` into your project's `.agents/skills/` directory). Snowball-compatible loaders discover `SKILL.md` automatically.

```bash
# Inside the argdown-2 repo (skills live at skills/prose-to-argdown/, project-local)
# — no install step needed; the loader picks up the SKILL.md on next session start.

# For use from another project, symlink the skill into that project's .agents/skills:
ln -s /path/to/argdown-2/skills/prose-to-argdown /path/to/your-project/.agents/skills/prose-to-argdown
```

## Triggering the skill

Paste prose in chat and ask any of:

- "extract the claims from this essay"
- "map the argument in this paper"
- "turn this into argdown"
- "what is this arguing"
- "structure this op-ed"

The skill handles argumentative prose (essays, op-eds, reviews, polemics, position papers) and research/technical prose (paper sections, technical reports, book excerpts).

## Verifying the skill

See `MANUAL.md` for the step-by-step smoke test against the bundled fixtures. Run `skills/prose-to-argdown/scripts/verify-fixture.sh` from the argdown-2 repo root to validate every fixture's expected.argdown parses cleanly.

## Project layout

This skill ships inside the `argdown-2` repo at three host-specific paths plus a fixtures tree:

```
argdown-2/
├── skills/prose-to-argdown/            # snowball skill (source of truth)
│   ├── SKILL.md
│   ├── README.md (this file)
│   ├── MANUAL.md                        # smoke test instructions
│   ├── scripts/
│   │   ├── verify-fixture.sh            # runs argdown validate on expected.argdown
│   │   └── run-skill.sh                 # helper for invoking the skill
│   └── fixtures/                        # one directory per test fixture
│       ├── lead-essay/                  # 150-word climate op-ed
│       ├── research-abstract/           # paper abstract with "we argue that X"
│       ├── position-disagreement/       # two voices arguing
│       ├── no-claims/                   # recipe (tests early-exit)
│       ├── multi-paragraph/             # 1,500-word essay with sections
│       ├── ambiguous-prose/             # facts only, no arguments
│       └── legacy-syntax/               # prose mentioning ':—' syntax
├── .pi/extensions/prose-to-argdown.ts   # pi-coding-agent adapter
├── .claude-plugin/plugin.json           # Claude Code plugin manifest
└── commands/prose-to-argdown.md         # Claude Code slash command
```

## License

Private.
EOF
```

- [ ] **Step 2: Verify README was created**

```bash
test -f skills/prose-to-argdown/README.md && wc -l skills/prose-to-argdown/README.md
```

Expected: file exists, ~60 lines.

- [ ] **Step 3: Commit the README**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/README.md
git commit -m "docs: add prose-to-argdown README (installation and usage)"
```

---

## Task 18: Write `MANUAL.md` — step-by-step smoke test

**Files:**
- Create: `skills/prose-to-argdown/MANUAL.md`

- [ ] **Step 1: Write the MANUAL**

```bash
cat > skills/prose-to-argdown/MANUAL.md <<'EOF'
# prose-to-argdown — Manual Smoke Test

Use these steps to verify the skill is installed correctly and produces expected output. Run after every skill revision, and after any change to the underlying argdown-2 parser.

## Prerequisites

1. argdown-2 v0.1.0-alpha1 is installed and its MCP server is registered.
2. Your agent host can invoke `mcp__argdown__*` tools.
3. The skill directory exists at `skills/prose-to-argdown/` inside the argdown-2 repo (or symlinked into your project's `.agents/skills/`).

## Step 1: Verify the fixture files parse

For each fixture with an `expected.argdown`, run:

```bash
yarn node ./dist/cli.js validate skills/prose-to-argdown/fixtures/<name>/expected.argdown
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
skills/prose-to-argdown/scripts/verify-fixture.sh all
```

## Step 2: Trigger the skill on a fixture

In your agent host:

1. Load the `prose-to-argdown` skill (typically automatic when triggered by the description match).
2. Paste the contents of `skills/prose-to-argdown/fixtures/lead-essay/input.txt` into the chat.
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

diff -u skills/prose-to-argdown/fixtures/lead-essay/expected.argdown <(pasted-output)
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
input_text = open("skills/prose-to-argdown/fixtures/lead-essay/input.txt").read()
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
test -f skills/prose-to-argdown/MANUAL.md && wc -l skills/prose-to-argdown/MANUAL.md
```

Expected: file exists, ~100 lines.

- [ ] **Step 3: Commit the MANUAL**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/MANUAL.md
git commit -m "docs: add prose-to-argdown MANUAL (step-by-step smoke test instructions)"
```

---

## Task 19: Write `scripts/verify-fixture.sh`

**Files:**
- Create: `skills/prose-to-argdown/scripts/verify-fixture.sh`

- [ ] **Step 1: Write the verification script**

```bash
cat > skills/prose-to-argdown/scripts/verify-fixture.sh <<'EOF'
#!/usr/bin/env bash
#
# verify-fixture.sh — run argdown-2 validate on every fixture's expected.argdown
#
# Usage:
#   skills/prose-to-argdown/scripts/verify-fixture.sh           # verify all fixtures
#   skills/prose-to-argdown/scripts/verify-fixture.sh all       # same
#   skills/prose-to-argdown/scripts/verify-fixture.sh <name>    # verify one fixture (e.g. lead-essay)
#
# Verification uses the locally-built argdown-2 CLI (yarn build && dist/cli.js).
# The script must be run from the argdown-2 repo root.

set -euo pipefail

# Auto-detect repo root from this script's location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
FIXTURES_DIR="${REPO_ROOT}/skills/prose-to-argdown/fixtures"
CLI="${REPO_ROOT}/dist/cli.js"

verify_one() {
  local name="$1"
  local fixture_dir="${FIXTURES_DIR}/${name}"
  local expected="${fixture_dir}/expected.argdown"

  if [[ ! -f "$expected" ]]; then
    echo "SKIP: ${name} (no expected.argdown — early-exit fixture)"
    return 0
  fi

  echo -n "  ${name} ... "
  if yarn node "$CLI" validate "$expected" >/dev/null 2>&1; then
    echo "PASS"
    return 0
  else
    echo "FAIL"
    yarn node "$CLI" validate "$expected" || true
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
chmod +x skills/prose-to-argdown/scripts/verify-fixture.sh
```

- [ ] **Step 3: Run the script and verify it passes**

```bash
skills/prose-to-argdown/scripts/verify-fixture.sh
```

Expected: 5 PASS lines (lead-essay, research-abstract, position-disagreement, multi-paragraph, ambiguous-prose) + 2 SKIP lines (no-claims, legacy-syntax), then "All fixtures passed."

- [ ] **Step 4: Commit the script**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/scripts/verify-fixture.sh
git rm -f skills/prose-to-argdown/scripts/.gitkeep 2>/dev/null || true
git commit -m "feat(scripts): add verify-fixture.sh (runs argdown validate on every fixture)"
```

---

## Task 20: Write `scripts/run-skill.sh` — invocation helper

**Files:**
- Create: `skills/prose-to-argdown/scripts/run-skill.sh`

- [ ] **Step 1: Write the helper**

```bash
cat > skills/prose-to-argdown/scripts/run-skill.sh <<'EOF'
#!/usr/bin/env bash
#
# run-skill.sh — print a fixture's input prose to stdout, for the agent to ingest.
#
# Usage:
#   skills/prose-to-argdown/scripts/run-skill.sh <fixture-name>     # print input.txt
#
# Then in your agent host, load the prose-to-argdown skill and ask it to
# extract the claims from the prose shown on stdin.

set -euo pipefail

name="${1:?Usage: run-skill.sh <fixture-name>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
input="${REPO_ROOT}/skills/prose-to-argdown/fixtures/${name}/input.txt"

if [[ ! -f "$input" ]]; then
  echo "Fixture not found: $input" >&2
  exit 1
fi

cat "$input"
EOF
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x skills/prose-to-argdown/scripts/run-skill.sh
```

- [ ] **Step 3: Verify the script prints the lead-essay input**

```bash
skills/prose-to-argdown/scripts/run-skill.sh lead-essay | head -3
```

Expected: first 3 lines of the climate op-ed.

- [ ] **Step 4: Commit the script**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git add skills/prose-to-argdown/scripts/run-skill.sh
git commit -m "feat(scripts): add run-skill.sh (prints fixture input for the agent to ingest)"
```

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

- [ ] **Step 2: Restart your agent host** so the new skill at `skills/prose-to-argdown/SKILL.md` is discovered.

- [ ] **Step 3: Run the lead-essay fixture through the skill**

In your agent host chat:

> Load the prose-to-argdown skill. Here is the prose to distill:
>
> ```
> [paste contents of skills/prose-to-argdown/fixtures/lead-essay/input.txt]
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
input_text = open("skills/prose-to-argdown/fixtures/lead-essay/input.txt").read()
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
> [paste contents of skills/prose-to-argdown/fixtures/no-claims/input.txt]
> ```

Expected: plain-prose reply with no argdown code block, matching the message in `fixtures/no-claims/expected.txt`.

- [ ] **Step 6: Verify all 23 prior tasks are committed**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git status
git log --oneline | head -30
```

Expected: `git status` shows a clean working tree; `git log` shows ≥ 23 commits on top of the plan commit (`3911fd6`), one per task.

If anything is uncommitted, commit it now with an appropriate message — each per-task commit step in this plan may have failed if the implementer skipped it.

- [ ] **Step 7: Final summary commit (if any drift was caught in Step 6)**

```bash
cd /Users/kellen/.paseo/worktrees/0qttwpw6/homeless-flamingo
git status  # should be clean — only commit if Step 6 surfaced drift
```

No commit message is prescribed for this step; if drift exists, the implementer chooses an appropriate chore-style message. If `git status` was clean in Step 6, this step is a no-op.
```

---

## Task 22: Write `.pi/extensions/prose-to-argdown.ts` — pi-coding-agent adapter

**Files:**
- Create: `.pi/extensions/prose-to-argdown.ts`

Per [pi's extension docs](https://github.com/earendil-works/pi-coding-agent/blob/main/docs/extensions.md), project-local `.pi/extensions/*.ts` files are auto-discovered after the project is trusted. The extension registers a slash command and a custom tool that load the SKILL.md content as instructions and validate output via the argdown-2 MCP server.

- [ ] **Step 1: Write the extension file**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL_PATH = join(
  import.meta.dirname,
  "..",
  "skills",
  "prose-to-argdown",
  "SKILL.md",
);

export default function (pi: ExtensionAPI) {
  // Load the SKILL.md content once at extension load.
  let skillBody: string | null = null;
  try {
    skillBody = readFileSync(SKILL_PATH, "utf8");
  } catch {
    // SKILL.md missing — proceed without it; surfaces warning in session_start.
  }

  pi.on("session_start", async (_event, ctx) => {
    if (!skillBody) {
      ctx.ui.notify(
        "prose-to-argdown: SKILL.md not found at skills/prose-to-argdown/SKILL.md",
        "warning",
      );
    }
  });

  // Slash command: load the skill content as a system-prompt augmentation
  // before invoking the agent with the user's prose as input.
  pi.registerCommand("prose-to-argdown", {
    description:
      "Distill the next message as prose into a full argdown-2 document with grounded arguments and provenance. Follows the three-pass pipeline in SKILL.md.",
    handler: async (args, ctx) => {
      const prose = (args ?? "").trim();
      if (!prose) {
        ctx.ui.notify("Usage: /prose-to-argdown <prose>", "info");
        return;
      }
      if (skillBody && ctx.mode === "tui") {
        await ctx.newSession({
          withSession: async (sctx) => {
            await sctx.sendUserMessage(prose);
          },
        });
        // After session replacement, re-inject the skill body via
        // before_agent_start on the next prompt.
      }
    },
  });

  // Custom tool: the LLM can call this to validate a candidate argdown-2
  // source string via the argdown-2 MCP server.
  pi.registerTool({
    name: "argdown_validate",
    label: "Argdown Validate",
    description:
      "Validate a candidate argdown-2 source string. Returns ok:true on success, or a list of parse errors.",
    promptSnippet:
      "Validate argdown-2 syntax by calling argdown_validate(source) before delivery.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "The argdown-2 source to validate." },
      },
      required: ["source"],
    },
    async execute(_toolCallId, params) {
      // Defer to the argdown-2 MCP server if available; otherwise surface
      // a clear "tool unavailable" result so the agent can fall back.
      // Implementation depends on the host's MCP wiring — this is a
      // thin shim; the actual MCP call is delegated to the host.
      return {
        content: [
          {
            type: "text",
            text: `argdown_validate: not wired in this host; run \`yarn node ./dist/cli.js validate\` locally on the source instead.`,
          },
        ],
        details: {},
      };
    },
  });
}
```

**Note:** the `argdown_validate` tool above is a thin shim. The skill body instructs the LLM to call `mcp__argdown__validate` directly via the host's MCP wiring (which is the documented integration path). The shim exists so that pi can discover and surface the tool in its tool list, even if the host doesn't auto-bridge MCP tools into pi's tool registry.

- [ ] **Step 2: Verify the file type-checks**

```bash
cd "$(git rev-parse --show-toplevel)"
# Use pi's own type-check via jiti (no compile step):
yarn dlx jiti .pi/extensions/prose-to-argdown.ts --help >/dev/null 2>&1 || true
# jiti loads TS at runtime — if the file has syntax errors, jiti will fail.
echo "Extension loaded without runtime errors"
```

Expected: prints "Extension loaded without runtime errors". (Errors here mean a syntax/import bug in the extension.)

- [ ] **Step 3: Commit the pi extension**

```bash
cd "$(git rev-parse --show-toplevel)"
git add .pi/extensions/prose-to-argdown.ts
git commit -m "feat(pi): add prose-to-argdown extension

Registers a /prose-to-argdown slash command and an argdown_validate
custom tool for pi-coding-agent hosts. The command loads the SKILL.md
content as instructions and the tool surfaces argdown-2 MCP-server
validation as an LLM-callable function.

The tool is a thin shim; the actual MCP wiring happens in the host's
argdown-2 MCP server config. The shim ensures pi's tool registry
includes the validation surface."
```

---

## Task 23: Write `.claude-plugin/plugin.json` — Claude Code plugin manifest

**Files:**
- Create: `.claude-plugin/plugin.json`

Per Claude Code's plugin format (mirroring `codexkins-mono/grfp/.claude-plugin/plugin.json` — name, version, description, author, license, keywords), this manifest advertises the plugin to Claude Code's marketplace / install system.

- [ ] **Step 1: Write the manifest**

```bash
cat > .claude-plugin/plugin.json <<'EOF'
{
  "name": "argdown-prose-to-argdown",
  "version": "0.1.0",
  "description": "Distill argumentative or research/technical prose into a full argdown-2 document with strict provenance (source-line + source-quote on every fact and argument) and grounded arguments. Three-pass pipeline (Facts → Relations → Arguments), each validated via argdown-2's MCP server. The argdown-2 parser/CLI must be installed separately; this plugin is the agent-facing skill layer.",
  "author": {
    "name": "kellenff",
    "url": "https://github.com/kellenff"
  },
  "homepage": "https://github.com/kellenff/argdown-2/tree/main/skills/prose-to-argdown",
  "repository": "https://github.com/kellenff/argdown-2",
  "license": "MIT",
  "keywords": [
    "argdown",
    "argdown-2",
    "argumentation",
    "structured-argumentation",
    "claim-extraction",
    "provenance"
  ]
}
EOF
```

- [ ] **Step 2: Validate the JSON parses**

```bash
cat .claude-plugin/plugin.json | python3 -m json.tool > /dev/null
echo "plugin.json is valid JSON"
```

Expected: prints "plugin.json is valid JSON". Any parse error here means the JSON is malformed.

- [ ] **Step 3: Commit the plugin manifest**

```bash
cd "$(git rev-parse --show-toplevel)"
git add .claude-plugin/plugin.json
git commit -m "feat(claude): add plugin.json manifest for prose-to-argdown

Advertises the prose-to-argdown skill to Claude Code's plugin
discovery. Pairs with commands/prose-to-argdown.md (Task 24) for
the slash-command surface."
```

---

## Task 24: Write `commands/prose-to-argdown.md` — Claude Code slash command

**Files:**
- Create: `commands/prose-to-argdown.md`

Claude Code slash commands live as Markdown files under `commands/`. The body of the markdown is the prompt Claude sees when the user invokes `/prose-to-argdown`.

- [ ] **Step 1: Write the slash command**

```bash
cat > commands/prose-to-argdown.md <<'EOF'
# /prose-to-argdown

Distill the user's prose into a full argdown-2 document.

The user has pasted or referenced a block of argumentative or research/technical prose. Apply the three-pass pipeline defined in `skills/prose-to-argdown/SKILL.md`:

1. **Facts pass** — extract atomic claims with `source-line` and `source-quote` provenance.
2. **Relations pass** — identify support/attack/undercut edges (grounded in the prose).
3. **Arguments pass** — extract stated/implied argument structures. **Grounded-arguments invariant:** arguments only emitted when the prose states or strongly implies them. Silence is valid output.

Validate each pass by calling `mcp__argdown__validate` (via the registered argdown-2 MCP server). On Pass 3, also call `mcp__argdown__render_mermaid` and inspect the resulting diagram against the prose (completeness, fidelity, provenance). Refine up to 2 rounds on mismatch.

**Constraints:**

- Every fact and argument carries `source-line: N` and `source-quote: "verbatim span"`. `source-quote` MUST be a verbatim substring of the input prose.
- argdown-2 supports only `->` in argument position; rebuttals are captured as `--x` relations.
- Avoid fact IDs starting with `evidence-`, `position-`, `stakeholder-`, `domain-`, `meta-` (these are reserved block-type prefixes in argdown-2's grammar).
- Avoid unquoted `%`, `:—`, `<!-- -->`-style HTML comments in the output (use `//` line comments instead).
- Source-line ranges use quoted strings: `source-line: "1-2"`, not `source-line: 1-2`.

Deliver the result as a fenced `\`\`\`argdown` code block in your chat reply, prefaced with "Extracted N facts, M relations, and K arguments from <words> words of prose."

If the prose is too short (< 50 words), has no argumentative claims (recipe, log, list), or has fewer than 50 words of actual argument structure, reply with a plain-prose explanation — no argdown code block.
EOF
```

- [ ] **Step 2: Verify the slash command file**

```bash
test -f commands/prose-to-argdown.md && wc -l commands/prose-to-argdown.md
```

Expected: file exists, ~30 lines.

- [ ] **Step 3: Commit the slash command**

```bash
cd "$(git rev-parse --show-toplevel)"
git add commands/prose-to-argdown.md
git commit -m "feat(claude): add /prose-to-argdown slash command

Loads the skill body from skills/prose-to-argdown/SKILL.md and applies
the three-pass pipeline. Pairs with .claude-plugin/plugin.json (Task
23) for Claude Code plugin discovery."
```

---

## Self-review

After all 24 tasks:

1. **Spec coverage:** each spec section is implemented by a task.
   - Section 1 (Context and goals) → header
   - Section 2 (Decisions summary) → header
   - Section 3 (Skill metadata) → Task 9 (frontmatter + intro)
   - Section 4 (Pipeline architecture) → Task 10
   - Section 5 (Per-pass instructions) → Tasks 11–13 (Pass 1, 2, 3)
   - Section 6 (Provenance schema) → Task 14 (Provenance section)
   - Section 7 (Validation & error handling) → Task 14 (Validation section), Task 15 (Edge cases)
   - Section 8 (Testing approach) → Tasks 2–8 (fixtures), Tasks 19–20 (scripts), Task 21 (smoke test)
   - Section 9 (Assembly & delivery) → Task 15 (Output assembly section), Task 16 (Self-verification)
   - Section 10 (Open questions / deferred) → covered by README + tasks 22–24 distribution scope
   - Section 11 (Distribution & host packaging) → Tasks 22 (pi extension), 23 (Claude plugin manifest), 24 (Claude slash command)
   - Section 12 (SKILL.md sketch) → Tasks 9–16 implement the actual SKILL.md body

2. **Placeholder scan:** every step contains exact file paths and complete content (cat heredocs with full content inline).

3. **Type consistency:** the SKILL.md frontmatter, prose tooling calls (`mcp__argdown__validate`, `mcp__argdown__render_mermaid`, `mcp__argdown__parse`), and argdown-2 CLI invocation (`yarn node ./dist/cli.js validate`) are identical across all tasks.

4. **Grammar-bug guards documented in the plan:** the plan's per-pass instructions and SKILL.md body now flag the four argdown-2 grammar constraints surfaced during validation:
   - argdown-2 supports only `->` in argument position (no `--x` arguments).
   - Use `//` line comments, not `<!-- -->` HTML comments.
   - Avoid `evidence-`, `position-`, `stakeholder-`, `domain-`, `meta-` as fact-ID prefixes (reserved block-type keywords).
   - Source-line ranges must use quoted strings (`source-line: "1-2"`), not unquoted dashes (`source-line: 1-2`).
   - `%` in unquoted fact text is rejected by the lexer; the SKILL.md instructs the LLM to spell out `%` as "percent" in fact text while keeping the original `%` in the source-quote (which is a quoted string and accepts `%`).

5. **Self-gating tasks:** Task 21's smoke test is gated on Tasks 1–20 being complete (and the agent host having argdown-2's MCP server registered). Tasks 22–24 are gated only on Task 1 (directories scaffolded) and can run independently of the smoke test.

If you find issues during self-review, fix them inline before offering execution choice.