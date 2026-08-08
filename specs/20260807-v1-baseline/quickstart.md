# Quickstart: argdown-2 v1 Baseline Validation

**Date**: 2026-08-07
**Branch**: `20260807-v1-baseline`
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

> This quickstart validates that the existing `argdown-2` codebase
> satisfies every FR / SC in the spec. Each step is a single shell
> command or a small Deno test invocation. **All steps MUST exit `0`**
> for v1.0.0 release gate.

## Prerequisites

| Prerequisite | How to verify |
|---|---|
| Deno `2.9.2` (per `scripts/deno-version`) | `deno --version \| head -n1 \| awk '{print $2}'` |
| Working tree clean | `git status --porcelain` is empty |
| On `20260807-v1-baseline` branch | `git rev-parse --abbrev-ref HEAD` |

> All commands below assume repo root as working directory.

## Setup

```bash
deno --version | head -n1
git status --porcelain
git rev-parse --abbrev-ref HEAD
```

Expected: `deno 2.9.2`, empty status, branch `20260807-v1-baseline`.

---

## Scenario 1 — Quality gate sweep (SC-007)

Runs every gate from `deno.json#tasks`. All must exit `0`.

```bash
deno task test
deno task lint
deno task fmt:check
deno task check
deno task check:cli-deno
deno task check:mcp-deno
deno task check:npm-allowlist
deno task publish:dry-run
```

Expected: 8 exits of `0`. CI runs the same set (see
`.github/workflows/ci.yml`).

---

## Scenario 2 — Library: load + validate + solve round-trip (SC-001)

Loads `examples/argdown1-censorship.edn`, validates, solves with
grounded, prints the per-component `native` labels.

```bash
deno run -A scripts/probe-library.ts examples/argdown1-censorship.edn
```

If the probe script does not exist, run inline:

```bash
deno run -A --no-lock - <<'EOF'
import { Effect } from "npm:effect";
import { load, solve } from "./src/index.ts";

const edn = await Deno.readTextFile("examples/argdown1-censorship.edn");
const result = Effect.runSync(
  Effect.match(load(edn), {
    onFailure: (err) => ({ ok: false as const, errors: err }),
    onSuccess: (doc) => ({ ok: true as const, document: doc }),
  }),
);
if (!result.ok) { console.error(result.errors); Deno.exit(1); }
const solved = Effect.runSync(solve(result.document));
console.log(JSON.stringify(solved.native, null, 2));
EOF
```

Expected: `kind: "labels"` (grounded) and labels matching the
Dung pure-attack reference set in `src/parity.test.ts`.

---

## Scenario 3 — Failure channel coverage (SC-002)

Confirms every tagged failure channel is reachable by a passing test.

```bash
deno test -A src/builder/apply.test.ts  # BuilderError codes
deno test -A src/edn.test.ts             # EdnError
deno test -A src/validate.test.ts        # ValidateError
deno test -A src/schema.test.ts          # SchemaError
deno test -A src/mcp/io.test.ts          # McpIoError.{Read,Write,Parse}
```

Expected: all tests pass; each suite contains at least one negative
test for every member of its tagged union.

---

## Scenario 4 — Hand-edit-EDN refused at validation (SC-003)

Confirms that bypassing the builder's `repairInterface` is refused.

```bash
cat > /tmp/hand-edited.edn <<'EOF'
#casualtheorics.argdown2/document
{:id :hand-edited
 :root
 #casualtheorics.argdown2.solver/grounded
 {:id :root
  :elements
  [#casualtheorics.argdown2.argdown/statement {:id :a :text "A"}
   #casualtheorics.argdown2.argdown/statement {:id :b :text "B"}
   #casualtheorics.argdown2.argdown/support
   {:id :s :from :a :to :b}]}}
EOF

deno run -A --no-lock - <<EOF
import { Effect } from "npm:effect";
import { load } from "./src/index.ts";
const edn = await Deno.readTextFile("/tmp/hand-edited.edn");
const result = Effect.runSync(
  Effect.match(load(edn), {
    onFailure: (err) => ({ ok: false as const, errors: err }),
    onSuccess: () => ({ ok: true as const }),
  }),
);
if (result.ok) {
  console.error("UNEXPECTED: hand-written support under grounded was accepted");
  Deno.exit(1);
}
console.log("EXPECTED refusal:", JSON.stringify(result.errors, null, 2));
EOF
```

Expected: failure with `semantic/unsupported-relation-kind` and exit
non-zero from the inline probe (zero from the outer bash if the
inline script writes "EXPECTED refusal").

---

## Scenario 5 — MCP 14-tool parity (SC-004)

Confirms the source run (`deno task mcp`) and the host binary
expose the same 14 tool names.

```bash
deno task compile:mcp
HOST_BIN="$(ls -d dist/mcp-bin/argdown-2-mcp-*-$(uname -s | tr A-Z a-z) 2>/dev/null | head -n1)"
deno run -A scripts/probe-mcp-stdio.ts "$HOST_BIN"
```

Expected: probe reports a healthy handshake and lists all 14 tools
in canonical order (`create_document`, `add_statement`, ...,
`solve`).

If `dist/mcp-bin/...` is empty, run `deno task compile:mcp` first.

---

## Scenario 6 — Install paths (SC-005)

Validates the four distribution channels. Some checks are
non-executable in this environment (e.g. installing JSR); the
checks below are the **dry-run equivalents**.

### 6a. JSR slow-types dry-run

```bash
deno task publish:dry-run
```

Expected: exit `0`, no slow-types warnings.

### 6b. Launcher pin match

```bash
DENO_VERSION=$(deno task cli-deno --version 2>/dev/null || deno --version | head -n1)
diff <(grep -E '^[0-9]' scripts/argdown-2-mcp.version) <(deno eval 'console.log(JSON.parse(await Deno.readTextFile("deno.json")).version)') \
  && echo "launcher pin matches deno.json version" || echo "MISMATCH"
```

Expected: `launcher pin matches deno.json version`.

### 6c. Plugin copy equivalence (Claude Code + Pi)

```bash
diff scripts/argdown-2-mcp plugins/argdown-2/scripts/argdown-2-mcp && echo "launcher copies identical"
diff scripts/argdown-2-mcp.version plugins/argdown-2/scripts/argdown-2-mcp.version && echo "version pin copies identical"
```

Expected: two `identical` messages.

### 6d. Native binary compile (host target)

```bash
deno task compile:mcp
ls -la dist/mcp-bin/
```

Expected: one binary in `dist/mcp-bin/` matching the host triple.

### 6e. Cross-platform binary smoke (CI only)

This step runs in CI via `.github/workflows/release.yml`:

```yaml
- name: Probe host MCP binary
  run: deno task probe:mcp -- ./dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu
```

Local verification: skip unless you have the cross-compiled binary
checked out.

---

## Scenario 7 — Launcher refusal semantics (SC-006)

Confirms the launcher's refusal paths.

### 7a. Corrupted sha256

```bash
XDG_CACHE_HOME="$(mktemp -d)"
mkdir -p "$XDG_CACHE_HOME/argdown-2/mcp/0.2.0-alpha4/x86_64-unknown-linux-gnu/"
echo "corrupted" > "$XDG_CACHE_HOME/argdown-2/mcp/0.2.0-alpha4/x86_64-unknown-linux-gnu/sha256sums.txt"
echo "fake-binary" > "$XDG_CACHE_HOME/argdown-2/mcp/0.2.0-alpha4/x86_64-unknown-linux-gnu/argdown-2-mcp-x86_64-unknown-linux-gnu"
chmod +x "$XDG_CACHE_HOME/argdown-2/mcp/0.2.0-alpha4/x86_64-unknown-linux-gnu/argdown-2-mcp-x86_64-unknown-linux-gnu"

ARGDOWN2_MCP_BIN="$XDG_CACHE_HOME/argdown-2/mcp/0.2.0-alpha4/x86_64-unknown-linux-gnu/argdown-2-mcp-x86_64-unknown-linux-gnu" \
  bash scripts/argdown-2-mcp < /dev/null 2>&1 | head -n5 || echo "EXPECTED refusal"
```

Expected: refusal message; no execution of the fake binary.

### 7b. Unsupported OS

The launcher refuses on `uname` values outside the four host triples.
This is exercised by `scripts/argdown-2-mcp.test.sh` in CI; locally
it can be verified by reading the host-triple mapping in
`scripts/argdown-2-mcp` and confirming `windows*` is not in the list.

```bash
grep -E '^(.*darwin|.*linux)' scripts/argdown-2-mcp | head -n10
```

Expected: exactly four triples; no `windows` entries.

---

## Scenario 8 — Test discipline (SC-008)

Confirms that any change to solver / reduce / eval code triggers a
fixture update (via test review; not automated).

```bash
ls src/bench.fixtures/
```

Expected: 8 files:

- `small-minimal`
- `small-relations`
- `small-argument`
- `medium-censorship`
- `heavy-attacks`
- `deep-arguments`
- `large-stress`
- `mixed-semantics`

```bash
deno test -A src/bench.fixtures/ # if such a suite exists
```

If a `bench.fixtures/` test driver does not exist, the eight fixtures
are exercised by `src/{grounded,multi-extension,reduce-*,component-eval,validate}.test.ts`.

---

## Scenario 9 — Constitution cross-reference audit (advisory)

Walk the spec's Constitution Cross-Reference appendix and confirm
each FR anchors to a real source location. This is a static
audit; the per-FR coverage table is in
[research.md §FR-by-FR Coverage Audit](./research.md).

```bash
grep -n "FR-001" specs/20260807-v1-baseline/spec.md src/index.ts
grep -n "FR-007" specs/20260807-v1-baseline/spec.md src/mcp/tools.ts
grep -n "FR-011" specs/20260807-v1-baseline/spec.md deno.json .claude-plugin/marketplace.json package.json .github/workflows/release.yml
```

Expected: each grep finds references on both sides (spec and
implementation).

---

## All-clear summary

When all scenarios exit `0` (or expected-refusal), the v1.0.0 baseline
is satisfied. Record a release-ready audit summary:

```bash
deno task test      && echo "✓ test"
deno task lint      && echo "✓ lint"
deno task fmt:check && echo "✓ fmt"
deno task check     && echo "✓ check"
deno task check:mcp-deno && echo "✓ check:mcp-deno"
deno task compile:mcp && echo "✓ compile:mcp"
deno task probe:mcp -- ./dist/mcp-bin/argdown-2-mcp-*-$(uname -s | tr A-Z a-z) && echo "✓ probe:mcp"
deno task check:npm-allowlist && echo "✓ check:npm-allowlist"
deno task publish:dry-run && echo "✓ publish:dry-run"
```

Expected: 9 `✓` lines.

---

## Out of scope (not validated here)

- **GUI / web service**: constitution header declares there is none.
- **Cross-platform binary probe** (Linux + macOS + Windows ARM):
  runs in CI/release; local verification skipped.
- **ASPIC+ / CLS 2013 full evidential**: out of scope for v1.
- **`undercut` support**: out of scope; refused by every solver.
- **JSR actual publish**: requires a `deno.json#version` bump; out
  of scope for this baseline.

## Failure escalation

If any scenario fails:

1. **Identify the failing FR**: cross-reference the spec's
   Constitution Cross-Reference appendix.
2. **Locate the implementation**: per the FR-by-FR coverage audit
   in `research.md`.
3. **Diagnose**: run the relevant gate suite in isolation
   (`deno task <task>`).
4. **Fix**: address the underlying cause; do NOT weaken a test,
   snapshot, lint rule, or typecheck to make a gate pass (constitution
   Principle III + Compliance Review).
5. **Re-run**: from `git clean -fdx` if the fix touched a snapshot.

If a scenario's failure indicates a missing implementation (FR
uncovered), record it in `research.md` as a v1 release blocker and
either ship the implementation in the same PR or carry a
`TODO(<PRINCIPLE>): explanation` follow-up (per constitution
Amendment Procedure §4).
