# Deno MCP Compile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship zero-dependency native MCP binaries (macOS + Linux × arm64/x64) by Deno-compiling an inlined `dist/mcp/cli.js`, plus a hybrid bash launcher that replaces `corepack yarn dlx` for plugin / `mcp.json` / deeplink.

**Architecture:** Ensure `yarn build` produces a single dependency-inlined ESM MCP CLI; `scripts/compile-mcp.sh` cross-compiles it with a pinned Deno into four named Release assets; `scripts/argdown-2-mcp` (bash 3.2+) resolves OS/arch, uses `$ARGDOWN2_MCP_BIN` / versioned cache / HTTPS download + checksum, then `exec`s. Dev keeps `yarn mcp` on Node.

**Tech Stack:** Deno (pinned compile toolchain), esbuild (MCP inline bundle on current `tsc` tree), bash 3.2+, curl, sha256sum/shasum, GitHub Actions `softprops/action-gh-release`, Vitest, Yarn 4 PnP.

**Spec:** `docs/snowball/specs/2026-07-18-deno-mcp-compile-design.md`

**Bridge note:** Spec assumes an inlined `dist/mcp/cli.js`. Current `main` uses `yarn build` = `tsc` (multi-file, external deps). Task 1 adds an esbuild MCP bundle step so Deno compile has a zero-dep-ready entry without a full tsdown migration.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/deno-version` | new | Single-line Deno version pin (CI + compile script) |
| `scripts/bundle-mcp.mjs` | new | esbuild: `src/mcp/cli.ts` → inlined `dist/mcp/cli.js` |
| `scripts/compile-mcp.sh` | new | Deno compile host or `--all` four targets → `dist/mcp-bin/` |
| `scripts/probe-mcp-stdio.mjs` | new | Subprocess stdio MCP probe against a binary path |
| `scripts/check-mcp-bundle.sh` | new | Static landmine grep + `deno check` on bundle |
| `scripts/argdown-2-mcp.version` | new | Launcher-pinned release version (no `v` prefix) |
| `scripts/argdown-2-mcp` | new | Hybrid bash launcher (cache / download / exec) |
| `scripts/argdown-2-mcp.test.sh` | new | Launcher shell tests (fixture HTTP or preseeded cache) |
| `src/mcp-bundle.test.ts` | new | Assert built `dist/mcp/cli.js` is inlined + has shebang |
| `src/cursor-plugin.test.ts` | modify | Expect launcher config, not `corepack yarn dlx` |
| `package.json` | modify | `build` chains bundle; add `compile:mcp`, `probe:mcp`; esbuild dep |
| `.github/workflows/release.yml` | modify | Deno install, probe, compile `--all`, upload binaries + checksums |
| `.github/workflows/ci.yml` | modify | Optional: run bundle contract test after build (if pack check exists) |
| `mcp.json` | modify | Point at launcher |
| `README.md` | modify | Document zero-dep install, launcher, remove yarn dlx as default |
| `AGENTS.md` | modify | Note compile/probe scripts; plugin launch path |
| `CHANGELOG.md` | modify | Entry when version bumps for first binary release |

**Dependency direction:**

```
src/mcp/cli.ts ──esbuild──► dist/mcp/cli.js ──deno compile──► dist/mcp-bin/argdown-2-mcp-*
                                                                      ▲
scripts/argdown-2-mcp ──download/cache/exec────────────────────────────┘
mcp.json / plugin ──► scripts/argdown-2-mcp
```

**Milestone note:** Tasks 1–4 deliver compile + CI assets (usable without plugin change). Tasks 5–7 switch consumers to the launcher. Prefer committing at each task boundary.

---

### Task 1: Inlined MCP CLI bundle

**Files:**
- Create: `scripts/bundle-mcp.mjs`
- Create: `src/mcp-bundle.test.ts`
- Modify: `package.json` (`build` script, `esbuild` devDependency)

- [ ] **Step 1: Write the failing test**

Create `src/mcp-bundle.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliJs = join(root, 'dist/mcp/cli.js');

describe('MCP CLI bundle', () => {
  it('emits dist/mcp/cli.js with shebang', () => {
    expect(existsSync(cliJs)).toBe(true);
    const text = readFileSync(cliJs, 'utf8');
    expect(text.startsWith('#!/usr/bin/env node\n')).toBe(true);
  });

  it('inlines app dependencies (no bare package imports)', () => {
    const text = readFileSync(cliJs, 'utf8');
    expect(text).not.toMatch(/from ['"]@modelcontextprotocol\/sdk/);
    expect(text).not.toMatch(/from ['"]zod['"]/);
    expect(text).not.toMatch(/from ['"]edn-parser-js['"]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test src/mcp-bundle.test.ts
```

Expected: FAIL — `dist/mcp/cli.js` missing or still has bare package imports after plain `tsc`.

- [ ] **Step 3: Add esbuild bundle script + wire build**

Create `scripts/bundle-mcp.mjs`:

```js
import * as esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'dist/mcp/cli.js');
mkdirSync(dirname(outfile), { recursive: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, 'src/mcp/cli.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  // Keep node: built-ins external; Deno Node-compat provides them at compile/run.
  packages: 'bundle',
  logLevel: 'info',
});
```

In `package.json`:

1. Add `"esbuild": "^0.25.0"` to `devDependencies`.
2. Change scripts:

```json
"build": "tsc && yarn node ./scripts/bundle-mcp.mjs",
"compile:mcp": "bash ./scripts/compile-mcp.sh"
```

(`compile:mcp` may fail until Task 2 — that is fine.)

Run:

```bash
yarn add -D esbuild@^0.25.0
yarn build
```

- [ ] **Step 4: Run test to verify it passes**

```bash
yarn test src/mcp-bundle.test.ts
yarn test
```

Expected: PASS for bundle tests; full suite still green (Node MCP path uses bundled CLI).

- [ ] **Step 5: Commit**

```bash
git add package.json yarn.lock scripts/bundle-mcp.mjs src/mcp-bundle.test.ts
git commit -m "build(mcp): inline MCP CLI with esbuild for Deno compile"
```

---

### Task 2: Deno pin + compile script

**Files:**
- Create: `scripts/deno-version`
- Create: `scripts/compile-mcp.sh`

- [ ] **Step 1: Write Deno version pin**

Create `scripts/deno-version` containing exactly one line (no blank line):

```text
2.4.5
```

(If 2.4.5 is unavailable when implementing, bump to the newest 2.x patch and keep the pin file as the single source of truth.)

- [ ] **Step 2: Write compile script**

Create `scripts/compile-mcp.sh`:

```bash
#!/usr/bin/env bash
# Compile dist/mcp/cli.js into native binaries under dist/mcp-bin/.
# Usage: scripts/compile-mcp.sh [--all]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DENO_VERSION="$(tr -d '[:space:]' < "$ROOT/scripts/deno-version")"
CLI_JS="$ROOT/dist/mcp/cli.js"
OUT_DIR="$ROOT/dist/mcp-bin"

TARGETS_ALL=(
  x86_64-apple-darwin
  aarch64-apple-darwin
  x86_64-unknown-linux-gnu
  aarch64-unknown-linux-gnu
)

if [[ ! -f "$CLI_JS" ]]; then
  echo "error: missing $CLI_JS — run yarn build first" >&2
  exit 1
fi

if ! command -v deno >/dev/null 2>&1; then
  echo "error: deno not on PATH (need $DENO_VERSION)" >&2
  exit 1
fi

INSTALLED="$(deno --version | head -n1 | awk '{print $2}')"
if [[ "$INSTALLED" != "$DENO_VERSION" ]]; then
  echo "error: deno $INSTALLED on PATH; pin is $DENO_VERSION" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

host_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os:$arch" in
    Darwin:x86_64) echo x86_64-apple-darwin ;;
    Darwin:arm64) echo aarch64-apple-darwin ;;
    Linux:x86_64) echo x86_64-unknown-linux-gnu ;;
    Linux:aarch64|Linux:arm64) echo aarch64-unknown-linux-gnu ;;
    *)
      echo "error: unsupported host for default compile: $os $arch" >&2
      exit 1
      ;;
  esac
}

TARGETS=()
if [[ "${1:-}" == "--all" ]]; then
  TARGETS=("${TARGETS_ALL[@]}")
else
  TARGETS=("$(host_target)")
fi

for target in "${TARGETS[@]}"; do
  out="$OUT_DIR/argdown-2-mcp-${target}"
  echo "deno compile → $out"
  # MCP needs filesystem I/O for path-mode tools; allow-all keeps v1 simple.
  deno compile \
    --allow-all \
    --target "$target" \
    --output "$out" \
    "$CLI_JS"
done

echo "Wrote:"
ls -la "$OUT_DIR"/argdown-2-mcp-*
```

```bash
chmod +x scripts/compile-mcp.sh
```

- [ ] **Step 3: Install pinned Deno locally and compile host target**

```bash
curl -fsSL https://deno.land/install.sh | sh -s "v$(cat scripts/deno-version)"
export PATH="$HOME/.deno/bin:$PATH"
yarn build
yarn compile:mcp
```

Expected: `dist/mcp-bin/argdown-2-mcp-<host-target>` exists and is executable.

- [ ] **Step 4: Commit**

```bash
git add scripts/deno-version scripts/compile-mcp.sh package.json
git commit -m "build(mcp): add Deno compile script with version pin"
```

---

### Task 3: Compat gate (static check + stdio probe)

**Files:**
- Create: `scripts/check-mcp-bundle.sh`
- Create: `scripts/probe-mcp-stdio.mjs`
- Modify: `package.json` (scripts `check:mcp-bundle`, `probe:mcp`)

- [ ] **Step 1: Write static check script**

Create `scripts/check-mcp-bundle.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI_JS="$ROOT/dist/mcp/cli.js"
DENO_VERSION="$(tr -d '[:space:]' < "$ROOT/scripts/deno-version")"

if [[ ! -f "$CLI_JS" ]]; then
  echo "error: missing $CLI_JS — run yarn build first" >&2
  exit 1
fi

# Landmine grep: fail on patterns that break under deno compile / Node compat.
if grep -E "process\.binding\(|require\.resolve\(|__dirname|__filename" "$CLI_JS"; then
  echo "error: landmine pattern found in MCP bundle (see matches above)" >&2
  exit 1
fi

if ! command -v deno >/dev/null 2>&1; then
  echo "error: deno not on PATH (need $DENO_VERSION)" >&2
  exit 1
fi

deno check "$CLI_JS"
echo "check-mcp-bundle: ok"
```

```bash
chmod +x scripts/check-mcp-bundle.sh
```

- [ ] **Step 2: Write stdio probe**

Create `scripts/probe-mcp-stdio.mjs`:

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const bin = process.argv[2];
if (!bin) {
  console.error('usage: yarn node scripts/probe-mcp-stdio.mjs <binary-path>');
  process.exit(2);
}

const transport = new StdioClientTransport({
  command: bin,
  args: [],
  stderr: 'inherit',
});

const client = new Client({ name: 'argdown-2-probe', version: '0.0.0' });
await client.connect(transport);

const tools = await client.listTools();
const names = tools.tools.map((t) => t.name);
if (!names.includes('create_document')) {
  throw new Error(`create_document missing; got: ${names.join(', ')}`);
}

const result = await client.callTool({
  name: 'create_document',
  arguments: { source: '' },
});
if (result.isError) {
  throw new Error(`create_document failed: ${JSON.stringify(result)}`);
}

await client.close();
console.log('probe-mcp-stdio: ok');
```

- [ ] **Step 3: Wire package scripts and run gate locally**

Add to `package.json` scripts:

```json
"check:mcp-bundle": "bash ./scripts/check-mcp-bundle.sh",
"probe:mcp": "yarn node ./scripts/probe-mcp-stdio.mjs"
```

Run:

```bash
yarn build
yarn check:mcp-bundle
HOST=$(ls dist/mcp-bin/argdown-2-mcp-* | head -n1)
yarn compile:mcp   # if not already built
HOST=$(ls dist/mcp-bin/argdown-2-mcp-* | head -n1)
yarn probe:mcp "$HOST"
```

Expected: both checks print `ok`. If `deno check` or probe fails, stop and patch the bundle (or escalate per spec fallback) before continuing.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-mcp-bundle.sh scripts/probe-mcp-stdio.mjs package.json
git commit -m "test(mcp): add Deno bundle check and stdio MCP probe"
```

---

### Task 4: Release workflow — compile all targets + upload assets

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Raise timeout and add Deno + compile steps**

In `.github/workflows/release.yml`:

1. Change `timeout-minutes: 10` → `timeout-minutes: 30` (cross-compile downloads denort ×4).
2. After the existing `Build` step (and after tests), when `steps.ver.outputs.changed == 'true'`, add:

```yaml
      - name: Setup Deno
        if: steps.ver.outputs.changed == 'true'
        uses: denoland/setup-deno@v2
        with:
          deno-version-file: scripts/deno-version

      - name: Check MCP bundle (Deno)
        if: steps.ver.outputs.changed == 'true'
        run: yarn check:mcp-bundle

      - name: Compile MCP binaries (all targets)
        if: steps.ver.outputs.changed == 'true'
        run: bash ./scripts/compile-mcp.sh --all

      - name: Probe host MCP binary (stdio)
        if: steps.ver.outputs.changed == 'true'
        run: |
          set -euo pipefail
          HOST_BIN=$(ls dist/mcp-bin/argdown-2-mcp-*-unknown-linux-gnu | head -n1)
          # On ubuntu-latest prefer the runner arch binary:
          if [[ -x dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu ]]; then
            HOST_BIN=dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu
          elif [[ -x dist/mcp-bin/argdown-2-mcp-aarch64-unknown-linux-gnu ]]; then
            HOST_BIN=dist/mcp-bin/argdown-2-mcp-aarch64-unknown-linux-gnu
          fi
          yarn probe:mcp "$HOST_BIN"

      - name: Write MCP binary checksums
        if: steps.ver.outputs.changed == 'true'
        run: |
          set -euo pipefail
          cd dist/mcp-bin
          sha256sum argdown-2-mcp-* > sha256sums.txt
          # Require exactly four binaries + checksums file
          test "$(ls -1 argdown-2-mcp-* | wc -l)" -eq 4
          cat sha256sums.txt
```

Note: the version-detect step currently runs *after* build. Keep ordering consistent with the file — either move `ver` detection before compile (preferred: detect version early, skip compile when unchanged) or gate compile with the same `if` once `ver` exists. **Do not compile on version-unchanged pushes.**

If `ver` stays after build today, insert the Deno steps **after** `Detect version bump` and **before** `Pack tarball`, all gated on `steps.ver.outputs.changed == 'true'`.

3. Update the GitHub Release `files:` to include binaries + checksums. Replace:

```yaml
          files: ${{ steps.pack.outputs.tarball }}
```

with:

```yaml
          files: |
            ${{ steps.pack.outputs.tarball }}
            dist/mcp-bin/argdown-2-mcp-x86_64-apple-darwin
            dist/mcp-bin/argdown-2-mcp-aarch64-apple-darwin
            dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu
            dist/mcp-bin/argdown-2-mcp-aarch64-unknown-linux-gnu
            dist/mcp-bin/sha256sums.txt
```

- [ ] **Step 2: Sanity-check workflow YAML locally**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"
```

Expected: no parse error (or use `actionlint` if available).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): attach Deno-compiled MCP binaries and checksums"
```

---

### Task 5: Hybrid bash launcher

**Files:**
- Create: `scripts/argdown-2-mcp.version`
- Create: `scripts/argdown-2-mcp`
- Create: `scripts/argdown-2-mcp.test.sh`

- [ ] **Step 1: Write failing launcher tests**

Create `scripts/argdown-2-mcp.version` with the current `package.json` version (no `v`):

```text
0.2.0-alpha2
```

Create `scripts/argdown-2-mcp.test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAUNCHER="$ROOT/scripts/argdown-2-mcp"
VERSION="$(tr -d '[:space:]' < "$ROOT/scripts/argdown-2-mcp.version")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Fake binary that exits 0 and ignores stdin
FAKE="$TMP/fake-mcp"
cat > "$FAKE" <<'EOF'
#!/usr/bin/env bash
exec cat >/dev/null
EOF
chmod +x "$FAKE"

# Override path wins
ARGDOWN2_MCP_BIN="$FAKE" "$LAUNCHER" </dev/null
echo "ok: ARGDOWN2_MCP_BIN"

# Unsupported OS simulation via env (launcher must honor ARGDOWN2_MCP_UNAME_S for tests)
if ARGDOWN2_MCP_UNAME_S=Windows_NT "$LAUNCHER" </dev/null 2>"$TMP/err"; then
  echo "error: expected Windows to fail" >&2
  exit 1
fi
grep -qi 'not supported' "$TMP/err"
echo "ok: unsupported OS"

# Cache hit: seed cache with fake binary + checksums
CACHE="$TMP/cache/argdown-2/mcp/$VERSION"
mkdir -p "$CACHE"
# Use a deterministic target name for Linux x64 in test mode
TARGET=x86_64-unknown-linux-gnu
cp "$FAKE" "$CACHE/argdown-2-mcp-$TARGET"
(
  cd "$CACHE"
  if command -v sha256sum >/dev/null; then
    sha256sum "argdown-2-mcp-$TARGET" > sha256sums.txt
  else
    shasum -a 256 "argdown-2-mcp-$TARGET" > sha256sums.txt
  fi
)
XDG_CACHE_HOME="$TMP/cache" \
  ARGDOWN2_MCP_UNAME_S=Linux \
  ARGDOWN2_MCP_UNAME_M=x86_64 \
  "$LAUNCHER" </dev/null
echo "ok: cache hit"

# Checksum mismatch refuses exec
echo 'deadbeef  argdown-2-mcp-x86_64-unknown-linux-gnu' > "$CACHE/sha256sums.txt"
if XDG_CACHE_HOME="$TMP/cache" \
  ARGDOWN2_MCP_UNAME_S=Linux \
  ARGDOWN2_MCP_UNAME_M=x86_64 \
  "$LAUNCHER" </dev/null 2>"$TMP/err2"; then
  echo "error: expected checksum failure" >&2
  exit 1
fi
grep -qi 'checksum' "$TMP/err2"
echo "ok: checksum mismatch"

echo "argdown-2-mcp.test.sh: all ok"
```

```bash
chmod +x scripts/argdown-2-mcp.test.sh
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bash scripts/argdown-2-mcp.test.sh
```

Expected: FAIL — launcher missing.

- [ ] **Step 3: Implement launcher**

Create `scripts/argdown-2-mcp`:

```bash
#!/usr/bin/env bash
# Hybrid launcher: ARGDOWN2_MCP_BIN → versioned cache → download → exec.
# Speaks MCP on stdio after exec; diagnostics go to stderr only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/scripts/argdown-2-mcp.version")"
REPO_SLUG="kellenff/argdown-2"
TAG="v${VERSION}"
BASE_URL="https://github.com/${REPO_SLUG}/releases/download/${TAG}"

uname_s="${ARGDOWN2_MCP_UNAME_S:-$(uname -s)}"
uname_m="${ARGDOWN2_MCP_UNAME_M:-$(uname -m)}"

die() { echo "argdown-2-mcp: $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    need_cmd shasum
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

verify_checksum() {
  local file="$1" sums="$2" base
  base="$(basename "$file")"
  need_cmd awk
  local expected
  expected="$(awk -v b="$base" '$2 == b || $2 == ("*" b) || $2 == ("./" b) { print $1; exit }' "$sums")"
  [[ -n "$expected" ]] || die "no checksum entry for $base in $sums"
  local actual
  actual="$(sha256_file "$file")"
  [[ "$actual" == "$expected" ]] || die "checksum mismatch for $base (got $actual want $expected)"
}

resolve_target() {
  case "$uname_s" in
    Darwin)
      case "$uname_m" in
        x86_64) echo x86_64-apple-darwin ;;
        arm64) echo aarch64-apple-darwin ;;
        *) die "unsupported macOS arch: $uname_m" ;;
      esac
      ;;
    Linux)
      case "$uname_m" in
        x86_64) echo x86_64-unknown-linux-gnu ;;
        aarch64|arm64) echo aarch64-unknown-linux-gnu ;;
        *) die "unsupported Linux arch: $uname_m" ;;
      esac
      ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      die "Windows is not supported in v1"
      ;;
    *)
      die "unsupported OS: $uname_s"
      ;;
  esac
}

cache_dir() {
  local base
  if [[ -n "${XDG_CACHE_HOME:-}" ]]; then
    base="$XDG_CACHE_HOME"
  else
    base="${HOME}/.cache"
  fi
  echo "${base}/argdown-2/mcp/${VERSION}"
}

if [[ -n "${ARGDOWN2_MCP_BIN:-}" ]]; then
  [[ -x "$ARGDOWN2_MCP_BIN" ]] || die "ARGDOWN2_MCP_BIN not executable: $ARGDOWN2_MCP_BIN"
  exec "$ARGDOWN2_MCP_BIN" "$@"
fi

need_cmd curl
TARGET="$(resolve_target)"
ASSET="argdown-2-mcp-${TARGET}"
CACHE="$(cache_dir)"
CACHED="$CACHE/$ASSET"
SUMS="$CACHE/sha256sums.txt"

mkdir -p "$CACHE" || die "cache not writable: $CACHE"

if [[ -x "$CACHED" && -f "$SUMS" ]]; then
  verify_checksum "$CACHED" "$SUMS"
  # Best-effort quarantine strip on macOS
  if [[ "$uname_s" == "Darwin" ]] && command -v xattr >/dev/null 2>&1; then
    xattr -d com.apple.quarantine "$CACHED" 2>/dev/null || true
  fi
  exec "$CACHED" "$@"
fi

TMPDIR_DL="$(mktemp -d "$CACHE/.dl.XXXXXX")"
cleanup() { rm -rf "$TMPDIR_DL"; }
trap cleanup EXIT

echo "argdown-2-mcp: downloading ${ASSET} (${TAG})" >&2
HTTP_ASSET="$(curl -fsSL -o "$TMPDIR_DL/$ASSET" -w '%{http_code}' "$BASE_URL/$ASSET" || true)"
[[ "$HTTP_ASSET" == "200" ]] || die "download failed ($HTTP_ASSET): $BASE_URL/$ASSET"
HTTP_SUMS="$(curl -fsSL -o "$TMPDIR_DL/sha256sums.txt" -w '%{http_code}' "$BASE_URL/sha256sums.txt" || true)"
[[ "$HTTP_SUMS" == "200" ]] || die "download failed ($HTTP_SUMS): $BASE_URL/sha256sums.txt"

verify_checksum "$TMPDIR_DL/$ASSET" "$TMPDIR_DL/sha256sums.txt"
chmod +x "$TMPDIR_DL/$ASSET"
mv -f "$TMPDIR_DL/sha256sums.txt" "$SUMS"
mv -f "$TMPDIR_DL/$ASSET" "$CACHED"
trap - EXIT
rm -rf "$TMPDIR_DL"

if [[ "$uname_s" == "Darwin" ]] && command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$CACHED" 2>/dev/null || true
fi

exec "$CACHED" "$@"
```

```bash
chmod +x scripts/argdown-2-mcp
```

- [ ] **Step 4: Run launcher tests**

```bash
bash scripts/argdown-2-mcp.test.sh
```

Expected: `argdown-2-mcp.test.sh: all ok`.

- [ ] **Step 5: Commit**

```bash
git add scripts/argdown-2-mcp scripts/argdown-2-mcp.version scripts/argdown-2-mcp.test.sh
git commit -m "feat(mcp): add hybrid bash launcher for release binaries"
```

---

### Task 6: Plugin / mcp.json / deeplink / cursor-plugin tests

**Files:**
- Modify: `mcp.json`
- Modify: `src/cursor-plugin.test.ts`
- Modify: `README.md` (deeplink + install sections)

- [ ] **Step 1: Update failing plugin contract test**

Replace the `corepack yarn dlx` test in `src/cursor-plugin.test.ts` with:

```ts
  it('launches MCP via the hybrid bash launcher (no yarn dlx)', () => {
    const mcp = readJson('mcp.json') as {
      mcpServers: {
        'argdown-2': { command: string; args?: string[] };
      };
    };
    const server = mcp.mcpServers['argdown-2'];
    expect(server.command).toBe('bash');
    expect(server.args).toEqual(['scripts/argdown-2-mcp']);
  });

  it('pins launcher version to package.json version', () => {
    const version = (readJson('package.json') as { version: string }).version;
    const pin = readFileSync(join(root, 'scripts/argdown-2-mcp.version'), 'utf8').trim();
    expect(pin).toBe(version);
  });
```

Add `readFileSync` to the existing `node:fs` import if not already present.

Keep the local `.cursor/mcp.json` yarn-based clone config test unchanged.

- [ ] **Step 2: Run test to verify it fails**

```bash
yarn test src/cursor-plugin.test.ts
```

Expected: FAIL — still expects corepack.

- [ ] **Step 3: Update mcp.json**

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

Cursor resolves plugin MCP paths relative to the plugin install directory (the repo snapshot). If implementation discovers absolute-path requirements, document the finding in the PR — do not reintroduce yarn dlx.

- [ ] **Step 4: Update README MCP install + deeplink**

In `README.md` § One-click install:

1. Replace prose about `corepack yarn dlx` with: plugin runs `bash scripts/argdown-2-mcp`, which caches/downloads the Deno-compiled binary for the pinned release (no Node/Yarn required).
2. Replace the manual config JSON example with the same launcher shape as `mcp.json`.
3. Rebuild the deeplink: base64url (or standard base64 as Cursor expects) of:

```json
{"command":"bash","args":["scripts/argdown-2-mcp"]}
```

Generate:

```bash
python3 - <<'PY'
import base64, json
cfg = {"command": "bash", "args": ["scripts/argdown-2-mcp"]}
print(base64.b64encode(json.dumps(cfg, separators=(',', ':')).encode()).decode())
PY
```

Update the `cursor://anysphere.cursor-deeplink/mcp/install?name=argdown-2&config=...` URL with that payload.

4. Keep `.cursor/mcp.json` documented for source clones (`yarn node ./dist/mcp/cli.js` after `yarn build`).

- [ ] **Step 5: Run tests**

```bash
yarn test src/cursor-plugin.test.ts
bash scripts/argdown-2-mcp.test.sh
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp.json src/cursor-plugin.test.ts README.md
git commit -m "feat(plugin): launch MCP via Deno binary launcher"
```

---

### Task 7: Docs polish + release checklist

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md` (`## Development` / status if needed)
- Modify: `CHANGELOG.md` (when cutting the binary-shipping version)

- [ ] **Step 1: Update AGENTS.md**

Add under Development / MCP:

- Consumer/plugin path: `bash scripts/argdown-2-mcp` (zero Node).
- Release compile: `yarn build && yarn compile:mcp --` → actually `bash scripts/compile-mcp.sh --all`.
- Gates: `yarn check:mcp-bundle`, `yarn probe:mcp <bin>`.
- Deno is CI/release tooling only; contributors use `yarn mcp` for day-to-day.

- [ ] **Step 2: Add CHANGELOG section when version is bumped**

When ready to publish binaries, bump `package.json` + `scripts/argdown-2-mcp.version` together and add:

```markdown
## [0.2.0-alpha3] - YYYY-MM-DD

### Added
- Deno-compiled MCP binaries for macOS/Linux (arm64 + x64) on GitHub Releases
- Hybrid `scripts/argdown-2-mcp` launcher (cache + download + checksum)

### Changed
- Cursor plugin / mcp.json no longer uses `corepack yarn dlx`
```

(Use the real next version; keep pin file in sync.)

- [ ] **Step 3: Final verification**

```bash
yarn build
yarn test
yarn lint
yarn typecheck
bash scripts/argdown-2-mcp.test.sh
# If Deno available:
yarn check:mcp-bundle
yarn compile:mcp
yarn probe:mcp "$(ls dist/mcp-bin/argdown-2-mcp-* | head -n1)"
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md CHANGELOG.md package.json scripts/argdown-2-mcp.version
git commit -m "docs: document Deno MCP binaries and launcher workflow"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Inlined `dist/mcp/cli.js` for Deno compile | Task 1 (esbuild bridge) |
| Four Deno targets, named assets | Task 2 + 4 |
| Compat: deno check + landmine grep + stdio probe | Task 3 + 4 |
| Release attaches binaries + checksums | Task 4 |
| Hybrid launcher (override → cache → download) | Task 5 |
| Replace yarn dlx in plugin/mcp.json/deeplink | Task 6 |
| Dev keeps yarn mcp; optional compile | Tasks 1–2, 7 |
| No Windows; no silent yarn fallback | Task 5 |
| Version pin (not floating latest) | Task 5 (`argdown-2-mcp.version`) |
| package.json `bin` may remain for Node users | Deferred — leave `bin` pointing at `dist/mcp/cli.js` |

No TBD placeholders remain in task steps.
