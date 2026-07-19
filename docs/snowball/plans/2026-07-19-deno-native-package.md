# Deno-Native Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut over argdown-2 from Yarn/Node to a Deno-native package: JSR library publishes (stable + every-merge `*-dev.*`), Deno-only contributor gates, and CI-built native MCP binaries on GitHub Releases (no npm tarball).

**Architecture:** `deno.json` + `deno.lock` become the package of record. Tests run under `deno test` with `@std/testing/bdd` + `@std/expect`. Narrow `npm:` allowlist for `zod` and `@modelcontextprotocol/sdk`; `edn-parser-js` stays vendored. CI uses pinned Deno only; release workflow publishes JSR via OIDC `deno publish` and attaches MCP binaries on version bumps.

**Tech Stack:** Deno 2.4.5 (pinned in `scripts/deno-version`), JSR, `@std/assert` / `@std/expect` / `@std/testing`, `npm:zod@4.4.3`, `npm:@modelcontextprotocol/sdk@1.29.0`, vendored `edn-parser-js`, GitHub Actions (`denoland/setup-deno`, OIDC), existing `scripts/compile-mcp.sh` / launcher.

**Spec:** `docs/snowball/specs/2026-07-19-deno-native-package-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `deno.json` | modify | JSR metadata, exports, tasks, imports (`npm:` allowlist + vendor + `@std/*`) |
| `deno.lock` | modify | Sole lockfile after Yarn removal |
| `scripts/check-npm-allowlist.sh` | create | Fail CI if `npm:` appears outside allowlist |
| `scripts/probe-mcp-stdio.ts` | create | Deno rewrite of stdio probe (replace `.mjs`) |
| `scripts/probe-mcp-stdio.mjs` | delete | Node probe |
| `scripts/compile-mcp.sh` | modify | Ensure tasks work without `package.json`; keep frozen lock |
| `scripts/check-mcp-deno.sh` | keep | Landmine grep + `deno check` |
| `.cursor/mcp.json` | modify | `deno task mcp` / `deno run` on `src/mcp/cli.ts` |
| `mcp.json` | keep | Consumer launcher (bash) |
| `src/**/*.test.ts` | modify | Vitest → Deno BDD/expect |
| `src/build-artifacts.test.ts` | rewrite | Deno/JSR package contract (no `dist/` npm bundle) |
| `src/cursor-plugin.test.ts` | modify | Deno local MCP + `deno.json` version pin; drop Yarn patch assertion |
| `src/pipeline.bench.ts` / `src/pipeline.bench.test.ts` | defer or delete from gates | Out of CI; optional later Deno bench task |
| `.github/workflows/ci.yml` | rewrite | Deno-only PR gates |
| `.github/workflows/release.yml` | rewrite | Main: gates + JSR dev always; binaries + stable JSR on version bump |
| `package.json`, `yarn.lock`, `.yarn/`, `.pnp.*`, `.yarnrc.yml` | delete | Yarn/PnP removed |
| `tsconfig.json`, `tsdown.config.ts`, `knip.json`, `stryker.config.mjs`, `.node-version`, `.oxlintrc.json`, `.oxfmtrc.json`, `.husky/` | delete | Node toolchain removed |
| `.gitignore` | modify | Drop Yarn PnP commit rules; keep `node_modules/` / `dist/` ignored |
| `README.md`, `AGENTS.md`, `CHANGELOG.md` | modify | Deno/JSR docs; drop Yarn/npm pack/Stryker |

**Dependency direction:**

```
deno.json ──imports──► vendor/edn-parser-js
                    ──npm:──► zod, @modelcontextprotocol/sdk
src/*.ts ──deno test / check / lint / fmt
src/mcp/cli.ts ──deno run (local) / deno compile (release)
main push ──deno publish --set-version BASE-dev.TIMESTAMP
version bump ──compile --all + GitHub Release + deno publish (stable)
```

---

### Task 1: Deno package of record (`deno.json`)

**Files:**
- Modify: `deno.json`
- Modify: `deno.lock` (via `deno cache` / `deno install`)

- [ ] **Step 1: Replace `deno.json` with the package manifest**

Write `deno.json` (adjust only if the live JSR package name differs — must match jsr.io):

```json
{
  "name": "@casualtheorics/argdown-2",
  "version": "0.2.0-alpha3",
  "exports": "./src/index.ts",
  "publish": {
    "exclude": [
      ".github",
      ".cursor",
      ".cursor-plugin",
      ".yarn",
      "docs",
      "examples",
      "scripts",
      "assets",
      "**/*.test.ts",
      "**/pipeline.bench.ts",
      "perf-baseline.json",
      "dist",
      "node_modules"
    ]
  },
  "tasks": {
    "test": "deno test -A --frozen --parallel src/",
    "check": "deno check --frozen src/index.ts src/mcp/cli.ts",
    "lint": "deno lint src scripts",
    "fmt": "deno fmt src scripts",
    "fmt:check": "deno fmt --check src scripts",
    "mcp": "deno run -A src/mcp/cli.ts",
    "compile:mcp": "bash ./scripts/compile-mcp.sh",
    "check:mcp-deno": "bash ./scripts/check-mcp-deno.sh",
    "probe:mcp": "deno run -A ./scripts/probe-mcp-stdio.ts",
    "check:npm-allowlist": "bash ./scripts/check-npm-allowlist.sh"
  },
  "imports": {
    "edn-parser-js": "./vendor/edn-parser-js/lib/index.js",
    "zod": "npm:zod@4.4.3",
    "@modelcontextprotocol/sdk/": "npm:/@modelcontextprotocol/sdk@1.29.0/",
    "@std/assert": "jsr:@std/assert@1",
    "@std/expect": "jsr:@std/expect@1",
    "@std/testing/": "jsr:@std/testing@1/"
  },
  "nodeModulesDir": "auto",
  "unstable": ["npm-lazy-caching", "sloppy-imports", "node-globals"],
  "compilerOptions": {
    "lib": ["es2022", "deno.ns"],
    "strict": true,
    "noImplicitAny": false
  }
}
```

If `@modelcontextprotocol/sdk` import map trailing-slash form fails resolution, switch to explicit subpath maps matching current source imports (e.g. `"@modelcontextprotocol/sdk/server/mcp.js": "npm:@modelcontextprotocol/sdk@1.29.0/server/mcp.js"`). Discover with:

```bash
rg -n "from '@modelcontextprotocol/sdk" src
```

- [ ] **Step 2: Refresh lockfile**

Run:

```bash
deno install
deno cache --frozen=false src/index.ts src/mcp/cli.ts
```

Expected: `deno.lock` updates; no Yarn involved.

- [ ] **Step 3: Sanity check MCP entry**

Run:

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno task check:mcp-deno
```

Expected: `check-mcp-deno: ok` (or install pinned Deno 2.4.5 first from `scripts/deno-version`).

- [ ] **Step 4: Commit**

```bash
git add deno.json deno.lock
git commit -m "$(cat <<'EOF'
chore(deno): make deno.json the package of record

Add JSR metadata, tasks, and a narrow npm: import map ahead of the Yarn cutover.
EOF
)"
```

---

### Task 2: `npm:` allowlist guard

**Files:**
- Create: `scripts/check-npm-allowlist.sh`
- Create: `scripts/check-npm-allowlist.test.sh` (optional shell assertion) — prefer a Deno test below
- Create: `src/npm-allowlist.test.ts`

- [ ] **Step 1: Write the allowlist script**

Create `scripts/check-npm-allowlist.sh`:

```bash
#!/usr/bin/env bash
# Fail if deno.json imports any npm: specifier outside the allowlist.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DENO_JSON="$ROOT/deno.json"

ALLOWED=(
  'npm:zod@'
  'npm:@modelcontextprotocol/sdk@'
  'npm:/@modelcontextprotocol/sdk@'
)

mapfile -t FOUND < <(grep -oE 'npm:/?[@A-Za-z0-9._/-]+@[0-9][^"]*' "$DENO_JSON" | sort -u || true)

if [[ ${#FOUND[@]} -eq 0 ]]; then
  echo "error: expected npm: allowlist entries in deno.json" >&2
  exit 1
fi

for spec in "${FOUND[@]}"; do
  ok=false
  for prefix in "${ALLOWED[@]}"; do
    if [[ "$spec" == "$prefix"* ]]; then
      ok=true
      break
    fi
  done
  if [[ "$ok" != true ]]; then
    echo "error: npm: specifier not allowlisted: $spec" >&2
    exit 1
  fi
done

echo "check-npm-allowlist: ok (${#FOUND[@]} specifier(s))"
```

```bash
chmod +x scripts/check-npm-allowlist.sh
```

Note: macOS bash 3.2 lacks `mapfile`. Use this portable loop instead if CI/local is bash 3.2:

```bash
FOUND="$(grep -oE 'npm:/?[@A-Za-z0-9._/-]+@[0-9][^"]*' "$DENO_JSON" | sort -u || true)"
if [[ -z "$FOUND" ]]; then
  echo "error: expected npm: allowlist entries in deno.json" >&2
  exit 1
fi
while IFS= read -r spec; do
  [[ -z "$spec" ]] && continue
  ok=false
  for prefix in "${ALLOWED[@]}"; do
    case "$spec" in
      "$prefix"*) ok=true; break ;;
    esac
  done
  if [[ "$ok" != true ]]; then
    echo "error: npm: specifier not allowlisted: $spec" >&2
    exit 1
  fi
done <<< "$FOUND"
COUNT="$(printf '%s\n' "$FOUND" | grep -c . || true)"
echo "check-npm-allowlist: ok (${COUNT} specifier(s))"
```

Prefer the portable version in the committed file.

- [ ] **Step 2: Write a Deno test that the script passes**

Create `src/npm-allowlist.test.ts`:

```ts
import { assertEquals } from '@std/assert';
import { dirname, fromFileUrl, join } from 'node:path';

const root = join(dirname(fromFileUrl(import.meta.url)), '..');

Deno.test('npm allowlist script exits 0', async () => {
  const cmd = new Deno.Command('bash', {
    args: [join(root, 'scripts/check-npm-allowlist.sh')],
    cwd: root,
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stdout } = await cmd.output();
  assertEquals(code, 0);
  assertEquals(new TextDecoder().decode(stdout).includes('check-npm-allowlist: ok'), true);
});
```

- [ ] **Step 3: Run script and test**

```bash
bash scripts/check-npm-allowlist.sh
deno test -A src/npm-allowlist.test.ts
```

Expected: both ok.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-npm-allowlist.sh src/npm-allowlist.test.ts deno.json
git commit -m "$(cat <<'EOF'
chore(deno): guard npm: import allowlist

Keep only zod and the MCP SDK on npm:; fail CI if the allowlist grows accidentally.
EOF
)"
```

---

### Task 3: First test port (`src/index.test.ts`)

**Files:**
- Modify: `src/index.test.ts`

- [ ] **Step 1: Rewrite the Vitest harness to Deno BDD + expect**

Replace the file with:

```ts
import { expect } from '@std/expect';
import { describe, it } from '@std/testing/bdd';

import { load, solve, validate } from './index.js';

const source = `
  #casualtheorics.argdown2.solver/grounded [
    #casualtheorics.argdown2.argdown/statement {:id :a}
    #casualtheorics.argdown2.argdown/statement {:id :b}
    #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
  ]
`;

describe('public API', () => {
  it('loads and solves a valid EDN document', () => {
    const loaded = load(source);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = solve(loaded.document);
    expect(Object.fromEntries(result.labels)).toEqual({ a: 'in', b: 'out' });
    expect(result.solver).toBe('casualtheorics.argdown2.solver/grounded');
    expect(result.warnings).toEqual([]);
  });

  it('returns reader diagnostics without throwing', () => {
    expect(load('{:broken')).toMatchObject({
      ok: false,
      errors: [{ code: 'edn/read-error' }],
    });
  });

  it('returns schema diagnostics without throwing', () => {
    expect(load('#other/solver []')).toMatchObject({
      ok: false,
      errors: [{ code: 'edn/unsupported-tag' }],
    });
  });

  it('returns semantic diagnostics without a partial document', () => {
    const result = load(`
      #casualtheorics.argdown2.solver/grounded [
        #casualtheorics.argdown2.argdown/attack {:from :a :to :missing}
      ]
    `);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toEqual([
      'semantic/missing-reference',
      'semantic/missing-reference',
    ]);
    expect('document' in result).toBe(false);
  });

  it('validates a pre-parsed raw EDN value', async () => {
    const { ednParseMulti } = await import('edn-parser-js');
    const raw = ednParseMulti(source)[0];
    expect(validate(raw).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the single file**

```bash
deno test -A --frozen src/index.test.ts
```

Expected: PASS. If `@std/expect` lacks `toMatchObject`, switch those assertions to `assertObjectMatch` from `@std/assert` and keep the rest on `expect`.

- [ ] **Step 3: Commit**

```bash
git add src/index.test.ts deno.lock
git commit -m "$(cat <<'EOF'
test: port public API suite to deno test

Establish the @std/testing/bdd + @std/expect pattern for the Yarn→Deno cutover.
EOF
)"
```

---

### Task 4: Port remaining Vitest suites (mechanical)

**Files:**
- Modify every remaining `src/**/*.test.ts` except `build-artifacts.test.ts` and `cursor-plugin.test.ts` (Task 5) and except `pipeline.bench.test.ts` (delete or quarantine in this task)

**Suites to port (header swap only unless noted):**

- `src/edn.test.ts`
- `src/edn-write.test.ts`
- `src/grounded.test.ts`
- `src/reduce-dung.test.ts`
- `src/schema.test.ts`
- `src/validate.test.ts`
- `src/parity.test.ts`
- `src/builder/apply.test.ts`
- `src/builder/resolve-ref.test.ts`
- `src/builder/soft-parse.test.ts`
- `src/mcp/io.test.ts`
- `src/mcp/server.test.ts`
- `src/mcp/tools.test.ts`

- [ ] **Step 1: Apply the header transform to each file**

In each file above, replace:

```ts
import { describe, expect, it } from 'vitest';
```

with:

```ts
import { expect } from '@std/expect';
import { describe, it } from '@std/testing/bdd';
```

If a file also imports other vitest symbols (`beforeEach`, `afterEach`), import them from `@std/testing/bdd` as well.

There are **no** `vi.*` mocks in this repo today — do not add a Vitest shim.

- [ ] **Step 2: Delete bench gate from the Deno suite**

Delete `src/pipeline.bench.test.ts` (Yarn/tinybench CI gate). Keep `src/pipeline.bench.ts` only if you immediately add a `deno task bench` that runs without Vitest; otherwise delete both and restore later. Spec allows defer — prefer delete both for a clean cutover:

```bash
git rm src/pipeline.bench.test.ts src/pipeline.bench.ts
# also remove perf-baseline.json if nothing reads it
git rm perf-baseline.json
```

- [ ] **Step 3: Run full unit tests**

```bash
deno task test
```

Expected: all ported suites PASS. Fix any matcher gaps (`toMatchObject`, `toBeTruthy`, async) with `@std/assert` helpers as needed — keep behavior identical.

- [ ] **Step 4: Commit**

```bash
git add src/**/*.test.ts
git commit -m "$(cat <<'EOF'
test: migrate Vitest suites to deno test

Swap vitest for @std/testing/bdd and @std/expect; drop the Yarn tinybench gate.
EOF
)"
```

---

### Task 5: Rewrite package/plugin contract tests

**Files:**
- Modify: `src/build-artifacts.test.ts`
- Modify: `src/cursor-plugin.test.ts`
- Modify: `.cursor/mcp.json`

- [ ] **Step 1: Point local MCP at Deno**

Write `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "argdown-2": {
      "command": "deno",
      "args": ["task", "mcp"]
    }
  }
}
```

- [ ] **Step 2: Replace build-artifact npm-bundle tests**

Rewrite `src/build-artifacts.test.ts` to assert the Deno/JSR package contract:

```ts
import { expect } from '@std/expect';
import { describe, it } from '@std/testing/bdd';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, fromFileUrl, join } from 'node:path';

const root = join(dirname(fromFileUrl(import.meta.url)), '..');

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

describe('deno package contract', () => {
  it('declares JSR name, version, and library export', () => {
    const deno = readJson('deno.json') as {
      name: string;
      version: string;
      exports: string | Record<string, string>;
    };
    expect(deno.name).toBe('@casualtheorics/argdown-2');
    expect(deno.version).toMatch(/^\d+\.\d+\.\d+/);
    const exportPath = typeof deno.exports === 'string'
      ? deno.exports
      : deno.exports['.'];
    expect(exportPath).toBe('./src/index.ts');
    expect(existsSync(join(root, 'src/index.ts'))).toBe(true);
  });

  it('vendors edn-parser-js instead of npm:', () => {
    const deno = readJson('deno.json') as { imports: Record<string, string> };
    expect(deno.imports['edn-parser-js']).toBe('./vendor/edn-parser-js/lib/index.js');
    expect(existsSync(join(root, 'vendor/edn-parser-js/lib/index.js'))).toBe(true);
  });
});
```

Do **not** assert `package.json` absence in this task — add that `it` in Task 7 Step 3 after Yarn deletion.

- [ ] **Step 3: Update cursor-plugin tests**

Replace Yarn-specific cases in `src/cursor-plugin.test.ts`. Full file:

```ts
import { expect } from '@std/expect';
import { describe, it } from '@std/testing/bdd';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

describe('Cursor plugin MCP config', () => {
  it('has a valid marketplace manifest for local install', () => {
    const marketplace = readJson('.cursor-plugin/marketplace.json') as {
      name: string;
      owner: { name: string };
      plugins: Array<{ name: string; source: string; description: string }>;
    };
    const manifest = readJson('.cursor-plugin/plugin.json') as { name: string };
    expect(marketplace.name).toBe('argdown-2');
    expect(marketplace.owner.name).toBeTruthy();
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0]?.name).toBe(manifest.name);
    expect(marketplace.plugins[0]?.source).toBe('.');
    expect(marketplace.plugins[0]?.description.length).toBeGreaterThan(10);
  });

  it('has a valid plugin manifest', () => {
    const manifest = readJson('.cursor-plugin/plugin.json') as {
      name: string;
      version: string;
      description: string;
      logo: string;
    };
    expect(manifest.name).toBe('argdown-2');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.description.length).toBeGreaterThan(10);
    expect(manifest.logo).toBe('assets/logo.svg');
  });

  it('exposes argdown-2 via the Deno binary launcher', () => {
    const mcp = readJson('mcp.json') as {
      mcpServers: {
        'argdown-2': { command: string; args: string[] };
      };
    };
    const server = mcp.mcpServers['argdown-2'];
    expect(server.command).toBe('bash');
    expect(server.args).toEqual(['scripts/argdown-2-mcp']);

    const denoVersion = (readJson('deno.json') as { version: string }).version;
    const launcherVersion = readFileSync(
      join(root, 'scripts/argdown-2-mcp.version'),
      'utf8',
    ).trim();
    expect(launcherVersion).toBe(denoVersion);
  });

  it('keeps a Deno-based project MCP config for local clones', () => {
    const local = readJson('.cursor/mcp.json') as {
      mcpServers: {
        'argdown-2': { command: string; args: string[] };
      };
    };
    expect(local.mcpServers['argdown-2']).toEqual({
      command: 'deno',
      args: ['task', 'mcp'],
    });
  });
});
```

- [ ] **Step 4: Run contract tests (except no-package.json if still present)**

```bash
deno test -A --frozen src/cursor-plugin.test.ts src/build-artifacts.test.ts
```

Expected: PASS for cursor-plugin; build-artifacts passes all asserts that do not require `package.json` deletion yet.

- [ ] **Step 5: Commit**

```bash
git add .cursor/mcp.json src/cursor-plugin.test.ts src/build-artifacts.test.ts
git commit -m "$(cat <<'EOF'
test: assert Deno/JSR package and local MCP contracts

Point .cursor/mcp.json at deno task mcp; drop Yarn patch and dist bundle expectations.
EOF
)"
```

---

### Task 6: Deno MCP probe

**Files:**
- Create: `scripts/probe-mcp-stdio.ts`
- Delete: `scripts/probe-mcp-stdio.mjs`
- Modify: `deno.json` tasks (already has `probe:mcp` from Task 1)

- [ ] **Step 1: Write Deno probe**

Create `scripts/probe-mcp-stdio.ts`:

```ts
#!/usr/bin/env -S deno run -A
import { basename } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const host = Deno.args[0];
if (!host) {
  console.error('Usage: deno task probe:mcp -- <path-to-argdown-2-mcp-binary>');
  console.error('   or: deno run -A scripts/probe-mcp-stdio.ts <path>');
  Deno.exit(2);
}

try {
  await Deno.lstat(host);
  const mode = (await Deno.stat(host)).mode;
  if (mode !== null && (mode & 0o111) === 0) {
    throw new Error('not executable');
  }
} catch {
  console.error(`error: MCP host is not executable: ${host}`);
  Deno.exit(1);
}

function parseToolResult(result: { content?: Array<{ type: string; text?: string }> }) {
  const content = result.content?.[0];
  if (content?.type !== 'text' || typeof content.text !== 'string') {
    throw new Error(`unexpected tool result content: ${JSON.stringify(result)}`);
  }
  return JSON.parse(content.text);
}

const client = new Client({ name: 'argdown-2-mcp-stdio-probe', version: '0.0.0' });
const transport = new StdioClientTransport({ command: host, args: [], stderr: 'inherit' });
let failed = false;

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (!tools.some((tool) => tool.name === 'create_document')) {
    throw new Error(
      `create_document tool not found; listed tools: ${tools.map((t) => t.name).join(', ')}`,
    );
  }
  const created = await client.callTool({
    name: 'create_document',
    arguments: { source: '' },
  });
  if (created.isError) {
    throw new Error(`create_document returned MCP error: ${JSON.stringify(created)}`);
  }
  const payload = parseToolResult(created as { content?: Array<{ type: string; text?: string }> });
  if (payload.ok !== true) {
    throw new Error(`create_document did not return ok: ${JSON.stringify(payload)}`);
  }
  console.log(`probe-mcp-stdio: ok (${basename(host)})`);
} catch (error) {
  failed = true;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: MCP stdio probe failed for ${host}: ${message}`);
} finally {
  await client.close().catch(() => {});
}

if (failed) Deno.exit(1);
```

- [ ] **Step 2: Delete Node probe and smoke locally**

```bash
git rm scripts/probe-mcp-stdio.mjs
bash scripts/compile-mcp.sh
deno run -A scripts/probe-mcp-stdio.ts "$(ls dist/mcp-bin/argdown-2-mcp-* | head -n1)"
```

Expected: `probe-mcp-stdio: ok (...)`.

- [ ] **Step 3: Commit**

```bash
git add scripts/probe-mcp-stdio.ts deno.json deno.lock
git commit -m "$(cat <<'EOF'
feat(mcp): replace Node stdio probe with Deno script

Keep compile+probe on the pinned Deno toolchain without yarn node.
EOF
)"
```

---

### Task 7: Remove Yarn / Node toolchain

**Files:**
- Delete: `package.json`, `yarn.lock`, `.yarnrc.yml`, `.pnp.cjs`, `.pnp.loader.mjs`, `.yarn/` (entire tree except do not touch `vendor/`), `.node-version`, `tsconfig.json`, `tsdown.config.ts`, `knip.json`, `stryker.config.mjs`, `.oxlintrc.json`, `.oxfmtrc.json`, `.husky/`
- Modify: `.gitignore`
- Ensure: `src/build-artifacts.test.ts` no-package.json case is active

- [ ] **Step 1: Delete Yarn/Node artifacts**

```bash
git rm -f package.json yarn.lock .yarnrc.yml .pnp.cjs .pnp.loader.mjs .node-version \
  tsconfig.json tsdown.config.ts knip.json stryker.config.mjs .oxlintrc.json .oxfmtrc.json
git rm -rf .yarn .husky
# If present:
git rm -f .yarn/patches/* 2>/dev/null || true
```

Confirm vendored parser remains:

```bash
test -f vendor/edn-parser-js/lib/index.js
```

- [ ] **Step 2: Simplify `.gitignore`**

Replace the Yarn PnP block at the top with:

```gitignore
# Deno may materialize npm: deps here for compile/check
node_modules/

# Build / compile output
dist/

# Legacy mutation tooling (removed)
reports/
.stryker-tmp/
```

Remove lines that instruct committing `.pnp.cjs` / `.yarn/releases`. Keep the rest of the file (JetBrains/macOS/agent dirs) intact.

- [ ] **Step 3: Add no-package.json assertion and verify green**

Append to the `describe('deno package contract')` block in `src/build-artifacts.test.ts`:

```ts
  it('has no package.json (Yarn/npm package removed)', () => {
    expect(existsSync(join(root, 'package.json'))).toBe(false);
  });
```

Then run:

```bash
deno task check:npm-allowlist
deno task lint
deno task fmt:check
deno task check
deno task test
deno task check:mcp-deno
```

Expected: all pass, including the new assertion.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: remove Yarn/Node package toolchain

Deno.json is the sole package manifest; drop PnP, Vitest, tsc emit, and related configs.
EOF
)"
```

---

### Task 8: Rewrite PR CI (`ci.yml`)

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace workflow with Deno-only gates**

Write `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  pull_request:
    branches: [main]

concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  quality:
    name: Deno quality gates
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - uses: denoland/setup-deno@v2
        with:
          deno-version-file: scripts/deno-version

      - name: npm: allowlist
        run: deno task check:npm-allowlist

      - name: Lint
        run: deno task lint

      - name: Format check
        run: deno task fmt:check

      - name: Typecheck
        run: deno task check

      - name: Test
        run: deno task test

      - name: Check MCP Deno entry
        run: deno task check:mcp-deno

      - name: Compile host MCP binary
        run: deno task compile:mcp

      - name: Probe host MCP binary
        run: |
          set -euo pipefail
          HOST="$(ls dist/mcp-bin/argdown-2-mcp-* | head -n1)"
          deno run -A scripts/probe-mcp-stdio.ts "$HOST"
```

Bump `actions/checkout` to `v6` only if the runner image supports it at implement time; `v4` is fine.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: run PR gates on Deno only

Replace Yarn/Node jobs with deno lint/fmt/check/test plus MCP compile probe.
EOF
)"
```

---

### Task 9: Release + JSR publish (`release.yml`)

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Rewrite release workflow**

Write `.github/workflows/release.yml` with this behavior:

1. On every push to `main` (and `workflow_dispatch`): run Deno quality gates (same as CI).
2. Always run `publish-jsr-dev` after gates: OIDC +  
   `deno publish --set-version "${BASE}-dev.$(date -u +%Y%m%d%H%M%S)" --allow-dirty`  
   (add `--allow-dirty` only if the working tree has ignored noise; prefer clean tree).
3. Detect version bump by comparing `deno.json` `version` to `HEAD~1` (jq).
4. If bumped (or dispatch override): `compile-mcp.sh --all`, probe Linux binary, checksums, GitHub Release **binaries only** (no tarball), stable `deno publish` (no `--set-version`), ensure `scripts/argdown-2-mcp.version` matches (fail if mismatched — bumping that file is part of the version-bump commit, not CI rewriting).

Skeleton (implement fully; do not leave stubs):

```yaml
name: release

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      version:
        description: "Version override for stable release (e.g. 0.2.0-alpha4). Empty = read deno.json and only publish stable if bumped."
        required: false

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write
  id-token: write

jobs:
  gates:
    name: Deno gates
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: denoland/setup-deno@v2
        with:
          deno-version-file: scripts/deno-version
      - run: deno task check:npm-allowlist
      - run: deno task lint
      - run: deno task fmt:check
      - run: deno task check
      - run: deno task test
      - run: deno task check:mcp-deno

  publish-jsr-dev:
    name: Publish JSR dev prerelease
    needs: [gates]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version-file: scripts/deno-version
      - name: Publish timestamped dev version
        run: |
          set -euo pipefail
          BASE="$(jq -r .version deno.json)"
          STAMP="$(date -u +%Y%m%d%H%M%S)"
          VER="${BASE}-dev.${STAMP}"
          echo "Publishing jsr dev version ${VER}"
          deno publish --set-version "$VER"

  stable-release:
    name: Stable GitHub Release + JSR
    needs: [gates]
    runs-on: ubuntu-latest
    timeout-minutes: 40
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: denoland/setup-deno@v2
        with:
          deno-version-file: scripts/deno-version

      - name: Detect version bump
        id: ver
        env:
          VERSION_OVERRIDE: ${{ inputs.version }}
        run: |
          set -euo pipefail
          NEW="$(jq -r .version deno.json)"
          if [ -n "${VERSION_OVERRIDE:-}" ]; then
            NEW="$VERSION_OVERRIDE"
            echo "changed=true" >> "$GITHUB_OUTPUT"
            echo "version=$NEW" >> "$GITHUB_OUTPUT"
          else
            OLD="$(git show HEAD~1:deno.json | jq -r .version)"
            if [ "$OLD" = "$NEW" ]; then
              echo "changed=false" >> "$GITHUB_OUTPUT"
              echo "version=$NEW" >> "$GITHUB_OUTPUT"
              exit 0
            fi
            echo "changed=true" >> "$GITHUB_OUTPUT"
            echo "version=$NEW" >> "$GITHUB_OUTPUT"
          fi
          if printf '%s' "$NEW" | grep -q -- '-'; then
            echo "is_prerelease=true" >> "$GITHUB_OUTPUT"
          else
            echo "is_prerelease=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Verify launcher pin matches deno.json version
        if: steps.ver.outputs.changed == 'true'
        env:
          VERSION: ${{ steps.ver.outputs.version }}
        run: |
          set -euo pipefail
          PIN="$(tr -d '[:space:]' < scripts/argdown-2-mcp.version)"
          if [ "$PIN" != "$VERSION" ]; then
            echo "::error::scripts/argdown-2-mcp.version ($PIN) != deno.json version ($VERSION)"
            exit 1
          fi

      - name: Compile MCP binaries
        if: steps.ver.outputs.changed == 'true'
        run: bash ./scripts/compile-mcp.sh --all

      - name: Probe Linux MCP binary
        if: steps.ver.outputs.changed == 'true'
        run: deno run -A scripts/probe-mcp-stdio.ts ./dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu

      - name: Generate checksums
        if: steps.ver.outputs.changed == 'true'
        run: |
          set -euo pipefail
          (
            cd dist/mcp-bin
            sha256sum \
              argdown-2-mcp-x86_64-apple-darwin \
              argdown-2-mcp-aarch64-apple-darwin \
              argdown-2-mcp-x86_64-unknown-linux-gnu \
              argdown-2-mcp-aarch64-unknown-linux-gnu \
              > sha256sums.txt
            test "$(wc -l < sha256sums.txt)" -eq 4
          )

      - name: Extract CHANGELOG notes
        id: notes
        if: steps.ver.outputs.changed == 'true'
        env:
          VERSION: ${{ steps.ver.outputs.version }}
        run: |
          set -euo pipefail
          VERSION_ESC=$(printf '%s' "$VERSION" | sed 's/\./\\./g')
          awk -v v="$VERSION_ESC" '
            $0 ~ "^## \\[" v "\\]" { flag=1; next }
            /^## \[/ && flag { flag=0 }
            flag
          ' CHANGELOG.md > release-notes.md
          if [ ! -s release-notes.md ]; then
            echo "::error::No CHANGELOG.md section for version ${VERSION}" >&2
            exit 1
          fi
          echo "notes_path=release-notes.md" >> "$GITHUB_OUTPUT"

      - name: Delete existing tag/release (idempotent)
        if: steps.ver.outputs.changed == 'true'
        env:
          VERSION: ${{ steps.ver.outputs.version }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          TAG="v${VERSION}"
          git push origin ":refs/tags/${TAG}" 2>/dev/null || true
          gh release delete "${TAG}" --yes --cleanup-tag 2>/dev/null || true

      - name: Create GitHub Release (binaries only)
        if: steps.ver.outputs.changed == 'true'
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ steps.ver.outputs.version }}
          name: argdown-2 v${{ steps.ver.outputs.version }}
          body_path: ${{ steps.notes.outputs.notes_path }}
          files: |
            dist/mcp-bin/argdown-2-mcp-x86_64-apple-darwin
            dist/mcp-bin/argdown-2-mcp-aarch64-apple-darwin
            dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu
            dist/mcp-bin/argdown-2-mcp-aarch64-unknown-linux-gnu
            dist/mcp-bin/sha256sums.txt
          fail_on_unmatched_files: true
          overwrite_files: true
          generate_release_notes: false
          draft: false
          prerelease: ${{ steps.ver.outputs.is_prerelease == 'true' }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish stable JSR
        if: steps.ver.outputs.changed == 'true'
        run: |
          set -euo pipefail
          # deno publish no-ops / errors if version exists — treat "already exists" as success.
          set +e
          OUT="$(deno publish 2>&1)"
          CODE=$?
          set -e
          echo "$OUT"
          if [ "$CODE" -eq 0 ]; then
            exit 0
          fi
          if echo "$OUT" | grep -qiE 'already (exists|published)|Version already'; then
            echo "Stable JSR version already published; skipping"
            exit 0
          fi
          exit "$CODE"
```

Prerequisite (operator, not code): JSR package linked to this GitHub repo for OIDC (already set up per brainstorm).

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "$(cat <<'EOF'
ci: publish JSR on main and binaries on version bumps

Add timestamped JSR dev publishes every merge; drop npm tarball from GitHub Releases.
EOF
)"
```

---

### Task 10: Docs and agent instructions

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update README development + install**

Replace Yarn/npm install sections with:

```markdown
## Install (library)

```bash
deno add jsr:@casualtheorics/argdown-2
```

```ts
import { load, solve } from "jsr:@casualtheorics/argdown-2";
```

## MCP (consumers)

Use the checked-in launcher (`bash scripts/argdown-2-mcp`) which downloads the pinned native binary from GitHub Releases. No Deno/Node required on the consumer machine.

## Development

Requires Deno matching `scripts/deno-version`.

```bash
deno task test
deno task check
deno task lint
deno task fmt:check
deno task mcp              # stdio MCP from source
deno task compile:mcp      # host native binary
deno task check:mcp-deno
deno task probe:mcp -- ./dist/mcp-bin/argdown-2-mcp-<host>
```
```

Remove: `yarn install`, `yarn build`, `yarn mutate`, `npm pack` / tarball install, Knip, Corepack, PnP notes.

- [ ] **Step 2: Update AGENTS.md**

Replace Yarn/PnP launcher guidance with Deno tasks; state Deno is day-to-day and release tooling; `yarn mcp` is gone; probe via `deno task probe:mcp`.

- [ ] **Step 3: CHANGELOG entry under Unreleased or next version**

```markdown
### Changed
- Package is Deno/JSR-native: Yarn/Node toolchain and npm tarball releases removed.
- Library install via `jsr:@casualtheorics/argdown-2`; every merge to main publishes a `*-dev.{utcTimestamp}` prerelease.
- Contributor tests/lint/fmt/check run on Deno; Stryker mutation gate dropped for now.
- GitHub Releases ship native MCP binaries only.
```

- [ ] **Step 4: Final verification**

```bash
deno task check:npm-allowlist
deno task lint
deno task fmt:check
deno task check
deno task test
deno task check:mcp-deno
bash scripts/compile-mcp.sh
deno run -A scripts/probe-mcp-stdio.ts "$(ls dist/mcp-bin/argdown-2-mcp-* | head -n1)"
test ! -f package.json
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: document Deno/JSR package cutover

Update install, development, and agent guidance for the Yarn/Node removal.
EOF
)"
```

---

## Self-review checklist (author)

| Spec requirement | Task |
|---|---|
| Deno package of record / delete package.json | 1, 7 |
| `npm:` allowlist zod + MCP SDK; vendor edn-parser | 1, 2, 7 |
| Deno test/check/lint/fmt | 3, 4, 8 |
| Drop Stryker | 7, 10 |
| Local MCP `deno run` / task | 1, 5 |
| Consumer launcher unchanged | 5 (assert), 9 |
| PR CI Deno-only | 8 |
| Every-merge JSR `*-dev.timestamp` | 9 |
| Version-bump binaries + stable JSR | 9 |
| No npm tarball | 9, 10 |
| Probe without Yarn | 6 |
| Docs/AGENTS/CHANGELOG | 10 |
| Bench defer/drop | 4 |

---

## Execution notes

- Do **not** reintroduce `package.json` for Deno’s npm resolver — import map + `deno.lock` are enough.
- If `deno publish --set-version` is unsupported on 2.4.5, upgrade the pin in `scripts/deno-version` to the oldest Deno 2.x that supports it, and update CI accordingly.
- Version-bump commits must update `deno.json` version, `scripts/argdown-2-mcp.version`, and CHANGELOG together.
