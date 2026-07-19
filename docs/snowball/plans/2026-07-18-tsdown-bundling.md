# tsdown Dual-Entry Bundling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `tsc`-emit `yarn build` with a single tsdown config that produces two ESM bundles (`dist/index.js` + dts, `dist/mcp/cli.js`) with all dependencies inlined, while keeping `yarn typecheck` as `tsc --noEmit`.

**Architecture:** One root `tsdown.config.ts` with named entries `index` and `mcp/cli`, `platform: 'node'`, `format: ['esm']`, and `deps.alwaysBundle: [/.*/]`. Package `exports` / `bin` paths stay unchanged. CI pack check gains a required `package/dist/mcp/cli.js`. Docs that say “tsc populates dist” are updated.

**Tech Stack:** tsdown (Rolldown), TypeScript 5.4 (`tsc --noEmit` only), Yarn 4 PnP, existing Vitest/CI workflows.

**Spec:** `docs/snowball/specs/2026-07-18-tsdown-bundling-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `tsdown.config.ts` | create | Dual-entry ESM build, always-bundle deps, dts |
| `package.json` | modify | `build: tsdown`; add `tsdown` devDependency |
| `yarn.lock` | modify | Lockfile after `yarn add -D tsdown` |
| `README.md` | modify | Development `yarn build` comment |
| `.github/workflows/release.yml` | modify | Comment: tsdown populates `dist/` |
| `.github/workflows/ci.yml` | modify | Require `package/dist/mcp/cli.js` in pack check |
| `src/build-artifacts.test.ts` | create | Contract tests for built outputs (skip if `dist/` missing) |

**Unchanged on purpose:** `tsconfig.json` (still used by typecheck), `src/**` app logic, `exports`/`bin`/`files`, runtime `dependencies` list, AGENTS.md (already path-based, not “tsc emit”).

**Dependency direction:**

```
tsdown.config.ts ──▶ src/index.ts, src/mcp/cli.ts
package.json build ──▶ tsdown
src/build-artifacts.test.ts ──▶ dist/* (read-only; skipIf missing)
```

---

### Task 1: Add failing build-artifact contract tests

**Files:**
- Create: `src/build-artifacts.test.ts`

These tests encode the pack/runtime contract. They skip when `dist/index.js` is absent so the CI `test` job (no build) stays green; after Task 3, run them locally post-`yarn build` to prove the contract.

- [ ] **Step 1: Write the contract test file**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexJs = 'dist/index.js';
const indexDts = 'dist/index.d.ts';
const cliJs = 'dist/mcp/cli.js';
const built = existsSync(indexJs);

describe.skipIf(!built)('build artifacts', () => {
  it('emits library JS, library dts, and MCP CLI', () => {
    expect(existsSync(indexJs)).toBe(true);
    expect(existsSync(indexDts)).toBe(true);
    expect(existsSync(cliJs)).toBe(true);
  });

  it('preserves the MCP CLI shebang', () => {
    const head = readFileSync(cliJs, 'utf8').slice(0, 32);
    expect(head.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('inlines app dependencies in the library bundle', () => {
    const source = readFileSync(indexJs, 'utf8');
    expect(source).not.toMatch(/\bfrom\s+['"]zod['"]/);
    expect(source).not.toMatch(/\bfrom\s+['"]edn-parser-js['"]/);
  });

  it('inlines app dependencies in the MCP CLI bundle', () => {
    const source = readFileSync(cliJs, 'utf8');
    expect(source).not.toMatch(/\bfrom\s+['"]@modelcontextprotocol\/sdk/);
    expect(source).not.toMatch(/\bfrom\s+['"]zod['"]/);
    expect(source).not.toMatch(/\bfrom\s+['"]edn-parser-js['"]/);
  });
});
```

- [ ] **Step 2: Run tests (no dist / or stale tsc dist)**

Run: `yarn test src/build-artifacts.test.ts`

Expected:
- If `dist/` is missing: suite skipped, exit 0 (`--passWithNoTests` / skipIf).
- If a **stale multi-file `tsc` dist** exists: at least one assertion may fail (e.g. shebang missing on a non-bundled emit path, or bare `from 'zod'` still present). That failure is the TDD red signal before switching the bundler. If current `tsc` dist already happens to satisfy some checks, still proceed — Task 3’s post-build run is the green gate.

- [ ] **Step 3: Commit**

```bash
git add src/build-artifacts.test.ts
git commit -m "$(cat <<'EOF'
test: add build-artifact contract checks for tsdown

EOF
)"
```

---

### Task 2: Install tsdown and wire `yarn build`

**Files:**
- Create: `tsdown.config.ts`
- Modify: `package.json`
- Modify: `yarn.lock` (via yarn)

- [ ] **Step 1: Add the tsdown config**

```ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'mcp/cli': 'src/mcp/cli.ts',
  },
  format: ['esm'],
  platform: 'node',
  dts: true,
  clean: true,
  deps: {
    alwaysBundle: [/.*/],
  },
});
```

- [ ] **Step 2: Install tsdown and switch the build script**

Run:

```bash
yarn add -D tsdown
```

Then set in `package.json`:

```json
"build": "tsdown"
```

Leave `"typecheck": "tsc --noEmit"` unchanged. Do not remove runtime `dependencies`.

- [ ] **Step 3: Build once and inspect outputs**

Run: `yarn build`

Expected: success; at least these paths exist:

- `dist/index.js`
- `dist/index.d.ts`
- `dist/mcp/cli.js`

If `dist/mcp/cli.js` lacks `#!/usr/bin/env node`, fix in this task by adding an explicit shebang option supported by the installed tsdown version (check `yarn tsdown --help` / docs). Prefer preserving the source shebang; only add config if passthrough fails. Re-run `yarn build` until the shebang is present.

- [ ] **Step 4: Run contract tests against the new dist**

Run: `yarn test src/build-artifacts.test.ts`

Expected: all four tests PASS (not skipped).

- [ ] **Step 5: Commit**

```bash
git add tsdown.config.ts package.json yarn.lock
git commit -m "$(cat <<'EOF'
build: switch yarn build from tsc emit to tsdown

Dual ESM entries with deps.alwaysBundle; typecheck stays tsc --noEmit.

EOF
)"
```

---

### Task 3: Update docs and CI pack contract

**Files:**
- Modify: `README.md` (Development section ~line 166)
- Modify: `.github/workflows/release.yml` (~lines 93–96)
- Modify: `.github/workflows/ci.yml` (~line 247)

- [ ] **Step 1: README Development comment**

Change:

```bash
yarn build          # tsc to dist/
```

to:

```bash
yarn build          # tsdown → dist/ (library + MCP CLI, deps inlined)
```

- [ ] **Step 2: release.yml comment**

Change the Build step comment from:

```yaml
        # `tsc` populates dist/. The subsequent `npm pack` step relies on
        # dist/ existing on disk (the `files` field is `["dist"]`, and
        # npm pack uses the working tree, not git history).
```

to:

```yaml
        # `tsdown` populates dist/. The subsequent `npm pack` step relies on
        # dist/ existing on disk (the `files` field is `["dist"]`, and
        # npm pack uses the working tree, not git history).
```

- [ ] **Step 3: Require MCP CLI in CI pack check**

In `.github/workflows/ci.yml`, change:

```bash
REQUIRED=("package/package.json" "package/README.md" "package/dist/index.js" "package/dist/index.d.ts")
```

to:

```bash
REQUIRED=("package/package.json" "package/README.md" "package/dist/index.js" "package/dist/index.d.ts" "package/dist/mcp/cli.js")
```

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/release.yml .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
docs(ci): document tsdown build and require MCP CLI in pack

EOF
)"
```

---

### Task 4: Full verification gate

**Files:** none expected (fix-only unless knip/typecheck surfaces a config tweak)

- [ ] **Step 1: Clean rebuild**

Run:

```bash
rm -rf dist
yarn build
```

Expected: exit 0; `dist/index.js`, `dist/index.d.ts`, `dist/mcp/cli.js` present.

- [ ] **Step 2: Typecheck, lint, format, knip, tests**

Run:

```bash
yarn typecheck
yarn lint
yarn format:check
yarn knip
yarn test
```

Expected: all exit 0. If knip flags `tsdown` or `tsdown.config.ts`, add the config as a knip entry or adjust knip.json with the minimal fix — then re-run `yarn knip` and commit that fix in a follow-up commit in this task:

```bash
git add knip.json
git commit -m "$(cat <<'EOF'
chore(knip): recognize tsdown config entry

EOF
)"
```

- [ ] **Step 3: Smoke the MCP binary**

Run (stdio MCP; EOF should exit cleanly or after initialize failure is fine for “starts”):

```bash
yarn node ./dist/mcp/cli.js <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
EOF
```

Expected: process starts without `ERR_MODULE_NOT_FOUND` for `@modelcontextprotocol/sdk` / `zod` / `edn-parser-js`. A JSON-RPC initialize result (or protocol error after start) counts as success; a missing-module crash is failure.

Also confirm `yarn mcp` still points at `./dist/mcp/cli.js` (no script change required unless bare `node` now fails for a non-dep reason).

- [ ] **Step 4: Pack dry-run required files**

Run:

```bash
yarn build
TARBALL=$(npm pack --ignore-scripts --json | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j[0].filename)})")
TAR_LIST=$(tar -tzf "$TARBALL")
for f in package/package.json package/README.md package/dist/index.js package/dist/index.d.ts package/dist/mcp/cli.js; do
  echo "$TAR_LIST" | grep -qx "$f" && echo "OK $f" || { echo "MISSING $f"; exit 1; }
done
rm -f "$TARBALL"
```

Expected: each path prints `OK …`.

- [ ] **Step 5: Final commit only if Step 2 produced uncommitted fixes; otherwise done**

If the working tree is clean after Steps 1–4, no commit. If verification forced small fixes, commit them with an accurate message before handoff.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Dual named entries, preserve dist paths | Task 2 |
| ESM + node platform | Task 2 |
| `deps.alwaysBundle: [/.*/]` | Task 2 + Task 1 assertions |
| `dts: true` for library | Task 2 + Task 1 |
| Shebang preserved | Task 2 fix path + Task 1 |
| `typecheck` stays `tsc --noEmit` | Task 2 (explicit non-change) |
| Keep runtime deps declared | Task 2 |
| README / release comment | Task 3 |
| CI require `dist/mcp/cli.js` | Task 3 |
| Full verify (build, gates, smoke, pack) | Task 4 |
| Non-goals (no CJS/minify/SEA/API change) | Not implemented |

**Placeholder scan:** none remaining.  
**Type consistency:** entry keys `index` / `mcp/cli` match `exports` and `bin` paths throughout.
