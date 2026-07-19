# Claude Code Plugin Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cursor one-click packaging with an in-repo Claude Code marketplace and nested `argdown-2` plugin (MCP + three skills + soft no-hand-edit-EDN rule), keeping generic root `mcp.json`.

**Architecture:** Marketplace catalog at `.claude-plugin/marketplace.json` points at `./plugins/argdown-2`. That plugin root ships `.mcp.json` (launcher via `${CLAUDE_PLUGIN_ROOT}`), a **copy** of the binary launcher + version pin, and three skills. Delete `.cursor-plugin/` and `.cursor/`. Tests assert manifests, MCP paths, launcher sync, and skill EDN rule text.

**Tech Stack:** Claude Code plugin/marketplace manifests, Deno tests (`@std/testing/bdd`, `@std/expect`), existing `scripts/argdown-2-mcp` launcher, Markdown skills.

**Spec:** `docs/snowball/specs/2026-07-19-claude-code-plugin-marketplace-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `.claude-plugin/marketplace.json` | create | In-repo marketplace catalog |
| `plugins/argdown-2/.claude-plugin/plugin.json` | create | Plugin identity/metadata |
| `plugins/argdown-2/.mcp.json` | create | Plugin MCP server (CLAUDE_PLUGIN_ROOT launcher) |
| `plugins/argdown-2/scripts/argdown-2-mcp` | create (copy) | Self-contained launcher for cached installs |
| `plugins/argdown-2/scripts/argdown-2-mcp.version` | create (copy) | Version pin matching canonical scripts/ |
| `plugins/argdown-2/skills/build-graph/SKILL.md` | create | Build graph via MCP tools |
| `plugins/argdown-2/skills/validate-debug/SKILL.md` | create | Validate/repair via MCP |
| `plugins/argdown-2/skills/interpret-solve/SKILL.md` | create | Solve + interpret labels |
| `src/claude-plugin.test.ts` | create | Manifest / MCP / launcher / skill assertions |
| `src/cursor-plugin.test.ts` | delete | Cursor packaging tests |
| `.cursor-plugin/` | delete | Cursor marketplace + plugin |
| `.cursor/` | delete | Cursor local MCP config |
| `mcp.json` | keep | Generic client launcher (unchanged) |
| `deno.json` | modify | `publish.exclude`: drop `.cursor*`, add `.claude-plugin` + `plugins` |
| `README.md` | modify | Claude Code install; remove Cursor/deeplink |
| `CHANGELOG.md` | modify | Unreleased notes for cutover |
| `AGENTS.md` | modify | Note Claude Code marketplace (no Cursor plugin) |

**Out of scope:** hooks, commands, agents, plugin logo, hard EDN write-deny, separate marketplace repo.

**Dependency direction:**

```
.claude-plugin/marketplace.json ──source──► plugins/argdown-2/
                                                ├── .mcp.json ──► ${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp
                                                └── skills/*
mcp.json ──► scripts/argdown-2-mcp  (canonical; unchanged)
```

**Note:** The launcher computes `ROOT="$(cd "$(dirname "$0")/.." && pwd)"` and reads `$ROOT/scripts/argdown-2-mcp.version`. A copy under `plugins/argdown-2/scripts/` therefore resolves the plugin-local version file correctly when Claude Code caches the plugin tree. Do **not** symlink to `../../scripts` (outside the copied plugin root).

---

### Task 1: Failing Claude Code packaging tests

**Files:**
- Create: `src/claude-plugin.test.ts`
- Delete: `src/cursor-plugin.test.ts` (at end of this task, after new file exists — or delete in Task 4; prefer delete here so Cursor tests don't keep passing against doomed paths)

- [ ] **Step 1: Write `src/claude-plugin.test.ts`**

```typescript
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const SKILLS = ["build-graph", "validate-debug", "interpret-solve"] as const;

describe("Claude Code plugin MCP config", () => {
  it("has a valid marketplace manifest for local install", () => {
    const marketplace = readJson(".claude-plugin/marketplace.json") as {
      name: string;
      owner: { name: string };
      plugins: Array<{ name: string; source: string; description: string }>;
    };
    const manifest = readJson(
      "plugins/argdown-2/.claude-plugin/plugin.json",
    ) as { name: string };
    expect(marketplace.name).toBe("argdown-2");
    expect(marketplace.owner.name).toBeTruthy();
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0]?.name).toBe(manifest.name);
    expect(marketplace.plugins[0]?.source).toBe("./plugins/argdown-2");
    expect(marketplace.plugins[0]?.description.length).toBeGreaterThan(10);
  });

  it("has a valid plugin manifest", () => {
    const manifest = readJson(
      "plugins/argdown-2/.claude-plugin/plugin.json",
    ) as {
      name: string;
      version: string;
      description: string;
    };
    const denoVersion = (readJson("deno.json") as { version: string }).version;
    expect(manifest.name).toBe("argdown-2");
    expect(manifest.version).toBe(denoVersion);
    expect(manifest.description.length).toBeGreaterThan(10);
  });

  it("exposes argdown-2 via CLAUDE_PLUGIN_ROOT launcher in plugin .mcp.json", () => {
    const mcp = readJson("plugins/argdown-2/.mcp.json") as {
      mcpServers: {
        "argdown-2": { command: string; args: string[] };
      };
    };
    const server = mcp.mcpServers["argdown-2"];
    expect(server.command).toBe("bash");
    expect(server.args).toEqual([
      "${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp",
    ]);
  });

  it("keeps root mcp.json on the Deno binary launcher", () => {
    const mcp = readJson("mcp.json") as {
      mcpServers: {
        "argdown-2": { command: string; args: string[] };
      };
    };
    const server = mcp.mcpServers["argdown-2"];
    expect(server.command).toBe("bash");
    expect(server.args).toEqual(["scripts/argdown-2-mcp"]);

    const denoVersion = (readJson("deno.json") as { version: string }).version;
    const launcherVersion = readText("scripts/argdown-2-mcp.version").trim();
    expect(launcherVersion).toBe(denoVersion);
  });

  it("keeps plugin launcher copy in sync with canonical scripts/", () => {
    expect(readText("plugins/argdown-2/scripts/argdown-2-mcp")).toBe(
      readText("scripts/argdown-2-mcp"),
    );
    expect(readText("plugins/argdown-2/scripts/argdown-2-mcp.version").trim())
      .toBe(readText("scripts/argdown-2-mcp.version").trim());
  });

  it("ships skills that forbid hand-editing EDN", () => {
    for (const name of SKILLS) {
      const body = readText(
        `plugins/argdown-2/skills/${name}/SKILL.md`,
      );
      expect(body.length).toBeGreaterThan(50);
      expect(body.toLowerCase()).toMatch(/hand-?edit|never edit|do not edit/);
      expect(body.toLowerCase()).toMatch(/edn/);
      expect(body.toLowerCase()).toMatch(/mcp/);
    }
  });
});
```

- [ ] **Step 2: Delete Cursor plugin tests**

```bash
rm src/cursor-plugin.test.ts
```

- [ ] **Step 3: Run tests — expect FAIL (missing Claude packaging files)**

```bash
deno task test
```

Expected: FAIL on `src/claude-plugin.test.ts` with file-not-found / read errors for `.claude-plugin/marketplace.json` and/or `plugins/argdown-2/...`.

- [ ] **Step 4: Commit**

```bash
git add src/claude-plugin.test.ts
git rm src/cursor-plugin.test.ts
git commit -m "$(cat <<'EOF'
test: replace Cursor plugin tests with Claude Code packaging asserts

EOF
)"
```

---

### Task 2: Marketplace, plugin manifest, MCP config, launcher copy

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `plugins/argdown-2/.claude-plugin/plugin.json`
- Create: `plugins/argdown-2/.mcp.json`
- Create: `plugins/argdown-2/scripts/argdown-2-mcp`
- Create: `plugins/argdown-2/scripts/argdown-2-mcp.version`

- [ ] **Step 1: Create marketplace catalog**

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "argdown-2",
  "owner": {
    "name": "kellenff"
  },
  "metadata": {
    "description": "One-click MCP server for loading, validating, and solving EDN argument graphs with grounded Dung semantics. Prefer builder MCP tools; never hand-edit EDN."
  },
  "plugins": [
    {
      "name": "argdown-2",
      "source": "./plugins/argdown-2",
      "description": "One-click MCP server for loading, validating, and solving EDN argument graphs with grounded Dung semantics. Prefer builder MCP tools; never hand-edit EDN."
    }
  ]
}
```

- [ ] **Step 2: Create plugin manifest**

Create `plugins/argdown-2/.claude-plugin/plugin.json` (version must match `deno.json`; currently `0.2.0-alpha4` — read `deno.json` at implement time and use that string):

```json
{
  "name": "argdown-2",
  "displayName": "argdown-2",
  "version": "0.2.0-alpha4",
  "description": "MCP server plus skills for loading, validating, and solving EDN argument graphs with grounded Dung semantics. Never hand-edit EDN; use builder MCP tools only.",
  "author": {
    "name": "kellenff"
  },
  "homepage": "https://github.com/kellenff/argdown-2",
  "repository": "https://github.com/kellenff/argdown-2",
  "keywords": [
    "argdown",
    "argdown-2",
    "argumentation",
    "mcp",
    "dung",
    "edn"
  ]
}
```

- [ ] **Step 3: Create plugin MCP config**

Create `plugins/argdown-2/.mcp.json`:

```json
{
  "mcpServers": {
    "argdown-2": {
      "command": "bash",
      "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp"]
    }
  }
}
```

- [ ] **Step 4: Copy launcher into plugin**

```bash
mkdir -p plugins/argdown-2/scripts
cp scripts/argdown-2-mcp plugins/argdown-2/scripts/argdown-2-mcp
cp scripts/argdown-2-mcp.version plugins/argdown-2/scripts/argdown-2-mcp.version
chmod +x plugins/argdown-2/scripts/argdown-2-mcp
```

- [ ] **Step 5: Run packaging tests — expect FAIL only on skills**

```bash
deno test -A --frozen src/claude-plugin.test.ts
```

Expected: marketplace / manifest / MCP / launcher sync PASS; skills test FAIL (missing `SKILL.md` files).

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin/marketplace.json \
  plugins/argdown-2/.claude-plugin/plugin.json \
  plugins/argdown-2/.mcp.json \
  plugins/argdown-2/scripts/argdown-2-mcp \
  plugins/argdown-2/scripts/argdown-2-mcp.version
git commit -m "$(cat <<'EOF'
feat: add Claude Code marketplace and nested argdown-2 plugin MCP

EOF
)"
```

---

### Task 3: Three skills (with soft EDN rule)

**Files:**
- Create: `plugins/argdown-2/skills/build-graph/SKILL.md`
- Create: `plugins/argdown-2/skills/validate-debug/SKILL.md`
- Create: `plugins/argdown-2/skills/interpret-solve/SKILL.md`

- [ ] **Step 1: Write `build-graph` skill**

Create `plugins/argdown-2/skills/build-graph/SKILL.md`:

```markdown
---
name: build-graph
description: Build an argdown-2 grounded argument graph via MCP tools (create_document, statements, arguments, inferences, relations). Use when authoring or extending an EDN argument document.
---

# Build graph

Use the **argdown-2** MCP builder tools only. **Never hand-edit EDN** files (no Write/Edit of `*.edn`). Document state lives in the MCP session.

## Flow

1. `create_document` — empty grounded document (if starting fresh)
2. `add_statement` / `update_statement` — claims with ids
3. `add_argument` / `add_inference` — arguments and premise/conclusion structure
4. `add_relation` — `support`, `attack`, `contradiction`, or `undercut`
5. Prefer `list_elements` to inspect current graph state before further edits

## Rules

- Do **not** Write or Edit `*.edn` by hand. Prefer builder MCP tools for every mutation.
- Use `remove_element` / `remove_relation` instead of deleting text from files.
- After structural changes, suggest validating before solving (see validate-debug).
```

- [ ] **Step 2: Write `validate-debug` skill**

Create `plugins/argdown-2/skills/validate-debug/SKILL.md`:

```markdown
---
name: validate-debug
description: Validate an argdown-2 MCP document and repair semantic diagnostics using builder tools. Use when validate fails or the graph needs debugging.
---

# Validate and debug

Call MCP `validate` on the current document. Interpret diagnostics and fix problems **only** through builder MCP tools.

## Rules

- **Never hand-edit EDN.** Do not Write/Edit `*.edn` to “fix” validation errors.
- Repair with `update_statement`, `add_*`, `remove_element`, `remove_relation`, etc.
- Re-run `validate` after each repair batch until clean (or until remaining issues are intentional).

## Flow

1. `list_elements` if you need orientation
2. `validate` — read semantic path diagnostics
3. Mutate via MCP tools only
4. `validate` again
```

- [ ] **Step 3: Write `interpret-solve` skill**

Create `plugins/argdown-2/skills/interpret-solve/SKILL.md`:

```markdown
---
name: interpret-solve
description: Solve an argdown-2 grounded document and explain labels / acceptance. Use when the user wants grounded Dung outcomes from the MCP session graph.
---

# Interpret solve results

## Rules

- **Never hand-edit EDN.** Solving reads MCP session state built by builder tools, not hand-written files.
- Prefer `validate` before `solve` when the graph may be incomplete or recently edited.

## Flow

1. Optional: `validate` — stop and repair (validate-debug) if diagnostics block confidence
2. `solve` — grounded labels
3. Explain accepted / rejected / undecided (or equivalent labels returned by the tool) in plain language
4. If the user wants changes, return to build-graph / validate-debug via MCP tools — still no hand-edited EDN
```

- [ ] **Step 4: Run packaging tests — expect PASS**

```bash
deno test -A --frozen src/claude-plugin.test.ts
```

Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add plugins/argdown-2/skills
git commit -m "$(cat <<'EOF'
feat: add Claude Code skills for build, validate, and solve

EOF
)"
```

---

### Task 4: Remove Cursor packaging + update publish exclude

**Files:**
- Delete: `.cursor-plugin/marketplace.json`
- Delete: `.cursor-plugin/plugin.json`
- Delete: `.cursor/mcp.json` (and empty `.cursor/` / `.cursor-plugin/` dirs)
- Modify: `deno.json` (`publish.exclude`)

- [ ] **Step 1: Delete Cursor paths**

```bash
rm -rf .cursor-plugin .cursor
```

- [ ] **Step 2: Update `deno.json` publish.exclude**

In `deno.json`, under `publish.exclude`, **remove** `".cursor"` and `".cursor-plugin"` and **add** `".claude-plugin"` and `"plugins"` so JSR publish stays library-only:

```json
"publish": {
  "exclude": [
    ".github",
    ".claude-plugin",
    "plugins",
    ".yarn",
    "docs",
    "examples",
    "scripts",
    "assets",
    "**/*.test.ts",
    "dist",
    "node_modules"
  ]
}
```

Keep every other existing exclude entry that is still relevant; only swap the Cursor entries for Claude packaging dirs as shown.

- [ ] **Step 3: Full test suite**

```bash
deno task test
```

Expected: PASS. No references to `.cursor` / `.cursor-plugin` in failing tests.

- [ ] **Step 4: Commit**

```bash
git add -A .cursor-plugin .cursor deno.json
git status
# ensure deletions are staged
git commit -m "$(cat <<'EOF'
chore: remove Cursor plugin packaging from the repo

EOF
)"
```

---

### Task 5: README, CHANGELOG, AGENTS

**Files:**
- Modify: `README.md` (One-click install section ~lines 83–107)
- Modify: `CHANGELOG.md` (`## [Unreleased]`)
- Modify: `AGENTS.md` (brief Claude Code marketplace note)

- [ ] **Step 1: Replace README one-click install section**

Replace the `### One-click install (Cursor plugin)` section through the Claude Desktop / manual config block (through “Call `validate` before `solve`…”) with the following content. Remove the Cursor deeplink entirely. Keep surrounding README structure intact.

````markdown
### One-click install (Claude Code plugin)

This repo is a Claude Code marketplace. Installing the `argdown-2` plugin registers the MCP server and ships skills for build / validate / solve.

1. In Claude Code: `/plugin marketplace add kellenff/argdown-2` (or add a local checkout path).
2. `/plugin install argdown-2@argdown-2`
3. Enable the plugin if prompted. MCP starts via the checked-in binary launcher.

**Never hand-edit EDN** while using the plugin — mutate graphs only through the builder MCP tools (`create_document`, `add_statement`, …).

Optional checks after changing plugin files:

```bash
claude plugin validate .
claude plugin validate ./plugins/argdown-2
```

The plugin launches the server with `bash ${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp` (launcher + version pin are copied under `plugins/argdown-2/scripts/`). The version is pinned in [`scripts/argdown-2-mcp.version`](scripts/argdown-2-mcp.version). From a source clone of this repo, run `deno task mcp` for stdio MCP from TypeScript.

Release binaries are compiled directly from [`src/mcp/cli.ts`](src/mcp/cli.ts) with `deno task compile:mcp` / [`scripts/compile-mcp.sh`](scripts/compile-mcp.sh); there is no separate MCP bundler.

**Claude Desktop** (`claude_desktop_config.json`) or other MCP clients via root [`mcp.json`](mcp.json):

```json
{
  "mcpServers": {
    "argdown-2": {
      "command": "bash",
      "args": ["scripts/argdown-2-mcp"]
    }
  }
}
```

Call `validate` before `solve` when you need a hard gate on incremental authoring.
````

- [ ] **Step 2: Update CHANGELOG Unreleased**

Under `## [Unreleased]`, add:

```markdown
### Added

- Claude Code in-repo marketplace (`.claude-plugin/marketplace.json`) and nested
  plugin (`plugins/argdown-2`) with MCP, three skills, and a soft rule to never
  hand-edit EDN.

### Removed

- Cursor plugin / marketplace (`.cursor-plugin/`) and project-local
  `.cursor/mcp.json` one-click install path.
```

- [ ] **Step 3: Update AGENTS.md**

After the “MCP binary launcher and release tooling” section (or at the end of that section), add:

```markdown
### Claude Code marketplace

One-click install for Claude Code uses `.claude-plugin/marketplace.json` and
`plugins/argdown-2/` (MCP via `${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp`,
plus skills). Keep the plugin launcher copy in sync with canonical
`scripts/argdown-2-mcp` and `scripts/argdown-2-mcp.version` (enforced by
`src/claude-plugin.test.ts`). There is no Cursor plugin packaging in this repo.
```

Do not remove the existing Deno/MCP smoke-test guidance.

- [ ] **Step 4: Grep for leftover Cursor install guidance in active docs**

```bash
rg -n 'cursor-plugin|\.cursor/mcp|cursor://anysphere|One-click install \(Cursor' README.md AGENTS.md CHANGELOG.md src deno.json || true
```

Expected: no hits in README/AGENTS/src/deno.json (CHANGELOG historical entries under old versions may still mention Cursor — leave those alone).

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md AGENTS.md
git commit -m "$(cat <<'EOF'
docs: switch one-click install docs to Claude Code marketplace

EOF
)"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full quality gates**

```bash
deno task test
deno task check
deno task lint
deno task fmt:check
```

Expected: all PASS. If `fmt:check` fails only on files you touched, run `deno task fmt` on `src/` and re-check (do not reformat unrelated trees).

- [ ] **Step 2: Optional Claude validate (if `claude` is on PATH)**

```bash
claude plugin validate .
claude plugin validate ./plugins/argdown-2
```

Expected: exit 0 / no schema errors. If `claude` is missing, skip and note in the PR/summary; README already documents the commands.

- [ ] **Step 3: Confirm Cursor paths are gone**

```bash
test ! -e .cursor-plugin && test ! -e .cursor && test ! -e src/cursor-plugin.test.ts
ls plugins/argdown-2/.claude-plugin/plugin.json \
  plugins/argdown-2/.mcp.json \
  plugins/argdown-2/skills/build-graph/SKILL.md \
  .claude-plugin/marketplace.json
```

Expected: first line succeeds (paths absent); `ls` lists the Claude packaging files.

- [ ] **Step 4: Final commit only if Step 1 produced fixes**

If fmt or small fixes landed:

```bash
git add -u
git commit -m "$(cat <<'EOF'
chore: tidy Claude Code plugin packaging after verification

EOF
)"
```

Otherwise leave the tree clean.

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Nested `plugins/argdown-2/` + marketplace `source` | Task 2 |
| `.mcp.json` with `${CLAUDE_PLUGIN_ROOT}` | Task 2 |
| Launcher **copy** + sync test | Tasks 1–2 |
| Three skills + soft EDN rule | Tasks 1, 3 |
| Keep root `mcp.json` | Task 1 (assert) / unchanged file |
| Delete `.cursor-plugin/` + `.cursor/` | Task 4 |
| Replace Cursor tests | Task 1 |
| README / CHANGELOG / AGENTS | Task 5 |
| `claude plugin validate` documented | Task 5; optional run Task 6 |
| No hooks / hard deny / logo | Out of scope (not in tasks) |

## Version bump note

When `deno.json` / `scripts/argdown-2-mcp.version` bump on a future release, also bump `plugins/argdown-2/.claude-plugin/plugin.json` `version` and refresh the plugin launcher copy (tests will fail until synced). Not part of this plan’s commits unless a release is cut in the same PR.
