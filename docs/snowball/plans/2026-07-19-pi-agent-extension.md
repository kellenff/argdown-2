# Pi Agent Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a git-installable Pi package (`pi install git:github.com/kellenff/argdown-2`) with shared Claude skills and a custom MCP SDK bridge extension that registers the 11 argdown-2 tools in Pi.

**Architecture:** Thin root `package.json` declares `pi.skills` → `./plugins/argdown-2/skills` and `pi.extensions` → `./pi/extensions/argdown-2-mcp.ts`. A small resolve helper finds `scripts/argdown-2-mcp` from the extension module URL. The Pi entry connects on `session_start` (not in the factory — Pi forbids spawning processes there), bridges MCP tools via `@modelcontextprotocol/sdk`, and closes on `session_shutdown`.

**Tech Stack:** Pi package manifest (`package.json` + `pi` key), TypeScript extensions (jiti), `@modelcontextprotocol/sdk@1.29.0`, peer `typebox` + `@earendil-works/pi-coding-agent`, Deno tests, existing bash launcher.

**Spec:** `docs/snowball/specs/2026-07-19-pi-agent-extension-design.md`

**Lifecycle note (spec refinement):** Spec said “eager connect on extension load.” Pi docs require deferring process/socket startup until `session_start`. Implement eager-within-session: connect on `session_start`, close on `session_shutdown`. Same user-visible behavior; correct for Pi.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `package.json` | create | Pi package identity, deps, `pi` manifest, `files` |
| `package-lock.json` | create | Lock SDK for reproducible `pi install` / `npm install` |
| `pi/extensions/resolve-launcher.ts` | create | Resolve `scripts/argdown-2-mcp` from `import.meta.url` |
| `pi/extensions/mcp-bridge.ts` | create | MCP Client connect / listTools / callTool / close (Node+Deno testable) |
| `pi/extensions/argdown-2-mcp.ts` | create | Pi `ExtensionAPI` factory: session lifecycle + `registerTool` |
| `src/pi-package.test.ts` | create | Shape tests + launcher resolve + MCP round-trip via launcher |
| `deno.json` | modify | `publish.exclude` add `package.json`, `package-lock.json`, `pi`; fmt/lint include `pi` |
| `README.md` | modify | Pi install section (unix-only, extension bridge) |
| `AGENTS.md` | modify | Note Pi package next to Claude marketplace |
| `CHANGELOG.md` | modify | Unreleased: Pi package |

**Out of scope:** third-party Pi MCP clients, skill copies, Windows launcher, npm publish, prompts/themes, lazy `/mcp` UX.

**Dependency direction:**

```
package.json
  pi.skills ──────────────► plugins/argdown-2/skills/*
  pi.extensions ──────────► pi/extensions/argdown-2-mcp.ts
                              ├── resolve-launcher.ts ──► scripts/argdown-2-mcp
                              └── mcp-bridge.ts ──► @modelcontextprotocol/sdk
                                                    ──► bash scripts/argdown-2-mcp
```

---

### Task 1: Failing Pi package shape + launcher tests

**Files:**
- Create: `src/pi-package.test.ts`

- [ ] **Step 1: Write `src/pi-package.test.ts`**

```typescript
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { resolveLauncherPath } from "../pi/extensions/resolve-launcher.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath: string): unknown {
  return JSON.parse(
    Deno.readTextFileSync(join(root, relativePath)),
  );
}

function readText(relativePath: string): string {
  return Deno.readTextFileSync(join(root, relativePath));
}

const SKILLS = ["build-graph", "validate-debug", "interpret-solve"] as const;

const TOOL_NAMES = [
  "add_argument",
  "add_inference",
  "add_relation",
  "add_statement",
  "create_document",
  "list_elements",
  "remove_element",
  "remove_relation",
  "solve",
  "update_statement",
  "validate",
].sort();

describe("Pi package", () => {
  it("has a valid root package.json Pi manifest", () => {
    const pkg = readJson("package.json") as {
      name: string;
      version: string;
      keywords: string[];
      dependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
      files: string[];
      pi: { skills: string[]; extensions: string[] };
    };
    const denoVersion = (readJson("deno.json") as { version: string }).version;

    expect(pkg.name).toBe("argdown-2-pi");
    expect(pkg.version).toBe(denoVersion);
    expect(pkg.keywords).toContain("pi-package");
    expect(pkg.pi.skills).toEqual(["./plugins/argdown-2/skills"]);
    expect(pkg.pi.extensions).toEqual([
      "./pi/extensions/argdown-2-mcp.ts",
    ]);
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBe("1.29.0");
    expect(pkg.peerDependencies["@earendil-works/pi-coding-agent"]).toBe(
      "*",
    );
    expect(pkg.peerDependencies["typebox"]).toBe("*");
    expect(pkg.files).toEqual([
      "pi",
      "plugins/argdown-2/skills",
      "scripts",
      "package.json",
      "README.md",
    ]);

    for (const skill of SKILLS) {
      expect(
        existsSync(join(root, "plugins/argdown-2/skills", skill, "SKILL.md")),
      ).toBe(true);
    }
    expect(
      existsSync(join(root, "pi/extensions/argdown-2-mcp.ts")),
    ).toBe(true);
  });

  it("does not duplicate skills outside plugins/argdown-2/skills", () => {
    expect(existsSync(join(root, "pi/skills"))).toBe(false);
    expect(existsSync(join(root, "skills"))).toBe(false);
  });

  it("resolves the canonical launcher from the extension module URL", () => {
    const extensionUrl = new URL(
      "../pi/extensions/argdown-2-mcp.ts",
      import.meta.url,
    ).href;
    const launcher = resolveLauncherPath(extensionUrl);
    expect(launcher).toBe(join(root, "scripts/argdown-2-mcp"));
    expect(existsSync(launcher)).toBe(true);
  });

  it("extension entry default-exports a factory", () => {
    const source = readText("pi/extensions/argdown-2-mcp.ts");
    expect(source).toMatch(/export\s+default\s+async\s+function/);
  });

  it("bridges MCP over bash launcher (initialize + listTools)", async () => {
    const extensionUrl = new URL(
      "../pi/extensions/argdown-2-mcp.ts",
      import.meta.url,
    ).href;
    const launcher = resolveLauncherPath(extensionUrl);

    const client = new Client({
      name: "argdown-2-pi-package-test",
      version: "0.0.0",
    });
    const transport = new StdioClientTransport({
      command: "bash",
      args: [launcher],
      stderr: "inherit",
    });

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
    } finally {
      await client.close();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test -A --frozen src/pi-package.test.ts`

Expected: FAIL (missing `package.json` and/or `../pi/extensions/resolve-launcher.ts`)

- [ ] **Step 3: Commit the failing test**

```bash
git add src/pi-package.test.ts
git commit -m "$(cat <<'EOF'
test: add failing Pi package shape and bridge tests

EOF
)"
```

---

### Task 2: Root `package.json` + launcher resolver

**Files:**
- Create: `package.json`
- Create: `pi/extensions/resolve-launcher.ts`
- Create: `pi/extensions/argdown-2-mcp.ts` (minimal stub so path-existence assertions pass)
- Modify: `deno.json` (publish.exclude + fmt/lint paths)

- [ ] **Step 1: Create `pi/extensions/resolve-launcher.ts`**

```typescript
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve scripts/argdown-2-mcp from a file URL under pi/extensions/.
 * Layout: <packageRoot>/pi/extensions/<file> → <packageRoot>/scripts/argdown-2-mcp
 */
export function resolveLauncherPath(extensionModuleUrl: string): string {
  const extensionDir = dirname(fileURLToPath(extensionModuleUrl));
  const packageRoot = join(extensionDir, "..", "..");
  const launcher = join(packageRoot, "scripts", "argdown-2-mcp");
  if (!existsSync(launcher)) {
    throw new Error(
      `argdown-2 launcher not found at ${launcher}. ` +
        `Reinstall the Pi package so the git clone includes scripts/argdown-2-mcp.`,
    );
  }
  return launcher;
}
```

- [ ] **Step 2: Create stub `pi/extensions/argdown-2-mcp.ts`**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Stub — replaced in Task 4 with MCP bridge registration. */
export default async function (_pi: ExtensionAPI): Promise<void> {
  // no-op until mcp-bridge wiring
}
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "argdown-2-pi",
  "version": "0.2.0-alpha4",
  "private": true,
  "description": "Pi package: shared argdown-2 skills plus an MCP bridge extension for grounded EDN argument graphs. Unix only. Never hand-edit EDN; use builder MCP tools.",
  "keywords": [
    "pi-package",
    "argdown",
    "argdown-2",
    "mcp",
    "argumentation"
  ],
  "homepage": "https://github.com/kellenff/argdown-2",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/kellenff/argdown-2.git"
  },
  "license": "Unlicense",
  "type": "module",
  "files": [
    "pi",
    "plugins/argdown-2/skills",
    "scripts",
    "package.json",
    "README.md"
  ],
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.29.0"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  },
  "pi": {
    "skills": ["./plugins/argdown-2/skills"],
    "extensions": ["./pi/extensions/argdown-2-mcp.ts"]
  }
}
```

Keep `version` equal to `deno.json` `version` whenever either changes (tests enforce).

- [ ] **Step 4: Update `deno.json`**

In `publish.exclude`, add `"package.json"`, `"package-lock.json"`, and `"pi"` (keep existing entries).

Change tasks:

```json
"lint": "deno lint src scripts pi",
"fmt": "deno fmt src scripts pi",
"fmt:check": "deno fmt --check src scripts pi",
```

- [ ] **Step 5: Run shape tests (skip bridge test temporarily if stub blocks — do not skip; bridge test only needs launcher)**

Run: `deno test -A --frozen src/pi-package.test.ts`

Expected:
- Shape + resolve + default-export tests PASS
- Bridge test PASS if a release binary can be downloaded for this platform; FAIL with launcher/network error otherwise — in CI/dev with network, launcher should fetch the pinned binary and pass

If bridge fails only because binary is unavailable for the host, fix environment or document; do not weaken the assertion to “≥ 1 tool”.

- [ ] **Step 6: Commit**

```bash
git add package.json pi/extensions/resolve-launcher.ts pi/extensions/argdown-2-mcp.ts deno.json
git commit -m "$(cat <<'EOF'
feat: add Pi package.json and launcher path resolver

EOF
)"
```

---

### Task 3: MCP bridge module (connect / call / close)

**Files:**
- Create: `pi/extensions/mcp-bridge.ts`
- Modify: `src/pi-package.test.ts` (optional: import `connectArgdownMcp` instead of inlining Client — prefer reuse)

- [ ] **Step 1: Write `pi/extensions/mcp-bridge.ts`**

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { resolveLauncherPath } from "./resolve-launcher.ts";

export type McpToolSummary = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type ArgdownMcpSession = {
  client: Client;
  tools: McpToolSummary[];
  close: () => Promise<void>;
};

export async function connectArgdownMcp(
  extensionModuleUrl: string,
): Promise<ArgdownMcpSession> {
  const launcher = resolveLauncherPath(extensionModuleUrl);
  const client = new Client({
    name: "argdown-2-pi",
    version: "0.0.0",
  });
  const transport = new StdioClientTransport({
    command: "bash",
    args: [launcher],
    stderr: "pipe",
  });

  await client.connect(transport);
  const listed = await client.listTools();
  const tools: McpToolSummary[] = listed.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
  }));

  return {
    client,
    tools,
    close: async () => {
      await client.close();
    },
  };
}

export async function callArgdownTool(
  session: ArgdownMcpSession,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ text: string; isError: boolean }> {
  const result = await session.client.callTool(
    { name, arguments: args },
    undefined,
    signal ? { signal } : undefined,
  );
  const parts = (result.content ?? []) as Array<
    { type: string; text?: string }
  >;
  const text = parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("\n");
  return { text: text || JSON.stringify(result), isError: Boolean(result.isError) };
}
```

If `callTool`’s overload in SDK 1.29.0 differs, match the call style used in `scripts/probe-mcp-stdio.ts` / `src/mcp/server.test.ts` (arguments object only).

- [ ] **Step 2: Refactor the bridge test in `src/pi-package.test.ts` to use `connectArgdownMcp`**

Replace the inline Client block with:

```typescript
import { connectArgdownMcp } from "../pi/extensions/mcp-bridge.ts";

// inside the it(...):
const extensionUrl = new URL(
  "../pi/extensions/argdown-2-mcp.ts",
  import.meta.url,
).href;
const session = await connectArgdownMcp(extensionUrl);
try {
  expect(session.tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
} finally {
  await session.close();
}
```

- [ ] **Step 3: Run tests**

Run: `deno test -A --frozen src/pi-package.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi/extensions/mcp-bridge.ts src/pi-package.test.ts
git commit -m "$(cat <<'EOF'
feat: add MCP stdio bridge helper for the Pi extension

EOF
)"
```

---

### Task 4: Pi extension — register tools on `session_start`

**Files:**
- Modify: `pi/extensions/argdown-2-mcp.ts`

- [ ] **Step 1: Implement the full extension**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  callArgdownTool,
  connectArgdownMcp,
  type ArgdownMcpSession,
} from "./mcp-bridge.ts";

function parametersFromInputSchema(
  inputSchema: Record<string, unknown> | undefined,
) {
  if (inputSchema && typeof inputSchema === "object") {
    return Type.Unsafe(inputSchema);
  }
  return Type.Object({});
}

export default async function (pi: ExtensionAPI): Promise<void> {
  let session: ArgdownMcpSession | null = null;
  let connecting: Promise<void> | null = null;

  async function ensureConnected(ctx: {
    ui: { notify: (message: string, level?: string) => void };
  }): Promise<ArgdownMcpSession | null> {
    if (session) return session;
    if (!connecting) {
      connecting = (async () => {
        try {
          session = await connectArgdownMcp(import.meta.url);
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : String(error);
          ctx.ui.notify(
            `argdown-2 MCP failed to start: ${message}`,
            "error",
          );
          session = null;
        } finally {
          connecting = null;
        }
      })();
    }
    await connecting;
    return session;
  }

  pi.on("session_start", async (_event, ctx) => {
    await ensureConnected(ctx);
    if (!session) return;

    for (const tool of session.tools) {
      pi.registerTool({
        name: tool.name,
        label: tool.name,
        description: tool.description ?? tool.name,
        parameters: parametersFromInputSchema(tool.inputSchema),
        async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
          const active = session;
          if (!active) {
            return {
              content: [{
                type: "text",
                text: "argdown-2 MCP disconnected — try /reload",
              }],
              details: {},
            };
          }
          try {
            const result = await callArgdownTool(
              active,
              tool.name,
              params as Record<string, unknown>,
              signal,
            );
            return {
              content: [{ type: "text", text: result.text }],
              details: { isError: result.isError },
            };
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : String(error);
            return {
              content: [{
                type: "text",
                text: `argdown-2 MCP error: ${message}. Try /reload`,
              }],
              details: {},
            };
          }
        },
      });
    }
  });

  pi.on("session_shutdown", async () => {
    if (session) {
      await session.close();
      session = null;
    }
  });
}
```

Notes for the implementer:
- Confirm `Type.Unsafe` exists on the `typebox` peer Pi ships; if not, use the equivalent JSON-Schema wrap from that package’s docs, or `Type.Object({}, { additionalProperties: true })` as a last resort (still register all 11 tools by name/description).
- Confirm `registerTool` / `execute` signatures against `@earendil-works/pi-coding-agent` types if the installed Pi version differs slightly; keep return shape `{ content: [{ type: "text", text }], details }`.
- Do **not** start the MCP subprocess in the factory body — only in `session_start` via `ensureConnected`.

- [ ] **Step 2: Run package tests + full suite**

Run:

```bash
deno test -A --frozen src/pi-package.test.ts
deno task test
deno task fmt:check
deno task lint
```

Expected: all PASS (fmt/lint clean; fix with `deno task fmt` if needed)

- [ ] **Step 3: Commit**

```bash
git add pi/extensions/argdown-2-mcp.ts
git commit -m "$(cat <<'EOF'
feat: register argdown-2 MCP tools in the Pi extension

EOF
)"
```

---

### Task 5: Lockfile for reproducible `npm install`

**Files:**
- Create: `package-lock.json`

- [ ] **Step 1: Generate the lockfile**

Run from repo root:

```bash
npm install --package-lock-only
```

Expected: `package-lock.json` created locking `@modelcontextprotocol/sdk@1.29.0`.

- [ ] **Step 2: Sanity-check install**

```bash
npm ci --omit=dev
node -e "require.resolve('@modelcontextprotocol/sdk/package.json')"
```

Expected: resolves without error. (`node_modules/` stays gitignored.)

- [ ] **Step 3: Commit**

```bash
git add package-lock.json
git commit -m "$(cat <<'EOF'
chore: lock Pi package npm dependencies

EOF
)"
```

---

### Task 6: Docs (README, AGENTS, CHANGELOG)

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add a Pi install subsection to README**

After the Claude Code plugin section (around the “One-click install” block), add:

```markdown
### Pi coding agent

Install from git (unix only — the launcher is bash):

```bash
pi install git:github.com/kellenff/argdown-2
```

Or from a local clone: `pi install /absolute/path/to/argdown-2`.

This loads the shared skills under `plugins/argdown-2/skills` and a Pi extension that bridges the stdio MCP server (same `scripts/argdown-2-mcp` binary launcher). No `pi-mcp-adapter` / `.mcp.json` is required for argdown-2 tools.

**Never hand-edit EDN** — use the builder MCP tools only.
```

Keep the Claude Code section; do not remove generic `mcp.json` docs.

- [ ] **Step 2: Update `AGENTS.md`**

After the Claude Code marketplace subsection, add:

```markdown
### Pi coding agent package

Root `package.json` is a thin Pi package manifest (`pi install git:…`).
Skills are shared with Claude Code at `plugins/argdown-2/skills/`. The
extension under `pi/extensions/` bridges MCP via `@modelcontextprotocol/sdk`
and the canonical `scripts/argdown-2-mcp` launcher. Shape and bridge tests
live in `src/pi-package.test.ts`.
```

- [ ] **Step 3: Update `CHANGELOG.md` Unreleased → Added**

```markdown
- Pi coding-agent package: root `package.json` + `pi/extensions` MCP bridge
  over the existing launcher; shares Claude Code skills (unix only).
```

- [ ] **Step 4: Format and test**

```bash
deno task fmt
deno task test
deno task lint
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: document Pi package install and packaging layout

EOF
)"
```

---

### Task 7: Manual smoke (optional but recommended)

**Files:** none (operator verification)

- [ ] **Step 1: Local path install into Pi**

```bash
pi install /Users/kellen/Projects/argdown-2
# or: pi -e ./pi/extensions/argdown-2-mcp.ts  (extension-only quick check)
```

- [ ] **Step 2: In a Pi session, confirm tools**

Invoke `create_document` (via the model or whatever tool-listing command Pi exposes). Expected: tool present; call returns `ok: true` JSON text.

- [ ] **Step 3: If anything fails, fix and add a regression assertion in `src/pi-package.test.ts`, then commit**

Do not weaken tests to match a broken bridge.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Thin root `package.json` with `pi` key / `pi-package` | Task 2 |
| Shared skills path `plugins/argdown-2/skills` | Task 2 (manifest) + Task 1 (assert) |
| Custom MCP SDK bridge extension | Tasks 3–4 |
| Launcher via `import.meta` resolve, not PATH | Task 2 `resolve-launcher.ts` |
| No third-party Pi MCP client | All tasks (never added) |
| Deno publish exclude npm/Pi paths | Task 2 `deno.json` |
| Shape + install-verification tests | Tasks 1, 3 |
| README + AGENTS unix-only / extension docs | Task 6 |
| Eager connect refined to `session_start` | Task 4 |
| `package-lock.json` for npm install | Task 5 |

No TBD placeholders. Tool names match `src/mcp/server.test.ts` (`TOOL_NAMES`, 11 tools).
