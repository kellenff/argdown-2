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
