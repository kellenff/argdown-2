# Deno MCP Compile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship zero-dependency native MCP binaries (macOS + Linux × arm64/x64) by Deno-compiling **source** `src/mcp/cli.ts` (no esbuild/tsdown MCP bundle), plus a hybrid bash launcher that replaces `corepack yarn dlx` for plugin / `mcp.json` / deeplink.

**Architecture:** `deno compile` resolves npm deps from this repo and emits four named Release assets under `dist/mcp-bin/`. `scripts/argdown-2-mcp` (bash 3.2+) resolves OS/arch, uses `$ARGDOWN2_MCP_BIN` / versioned cache / HTTPS download + checksum, then `exec`s. Dev keeps `yarn mcp` on Node/`tsc`.

**Tech Stack:** Deno (pinned compile toolchain), `deno.json` for npm resolution, bash 3.2+, curl, sha256sum/shasum, GitHub Actions `denoland/setup-deno` + `softprops/action-gh-release`, Vitest, Yarn 4 PnP (dev/library only).

**Spec:** `docs/snowball/specs/2026-07-18-deno-mcp-compile-design.md` (revised: source compile, no MCP bundler)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/deno-version` | new | Single-line Deno version pin (CI + compile script) |
| `deno.json` | new | Deno npm/`nodeModulesDir` config so compile resolves `package.json` deps |
| `scripts/compile-mcp.sh` | new | Deno compile `src/mcp/cli.ts` → host or `--all` four targets in `dist/mcp-bin/` |
| `scripts/probe-mcp-stdio.mjs` | new | Subprocess stdio MCP probe against a binary path |
| `scripts/check-mcp-deno.sh` | new | Landmine grep on `src/mcp` + `deno check src/mcp/cli.ts` |
| `scripts/argdown-2-mcp.version` | new | Launcher-pinned release version (no `v` prefix) |
| `scripts/argdown-2-mcp` | new | Hybrid bash launcher (cache / download / exec) |
| `scripts/argdown-2-mcp.test.sh` | new | Launcher shell tests (preseeded cache / overrides) |
| `src/cursor-plugin.test.ts` | modify | Expect launcher config, not `corepack yarn dlx` |
| `package.json` | modify | Add `compile:mcp`, `check:mcp-deno`, `probe:mcp` scripts |
| `.github/workflows/release.yml` | modify | Deno install, check, compile `--all`, probe, upload binaries + checksums |
| `mcp.json` | modify | Point at launcher |
| `README.md` | modify | Document zero-dep install; remove yarn dlx as default |
| `AGENTS.md` | modify | Note compile/probe; plugin launch path |
| `CHANGELOG.md` | modify | Entry when version bumps for first binary release |

**Out of scope / do not add:** `scripts/bundle-mcp.mjs`, esbuild, tsdown MCP packaging, `src/mcp-bundle.test.ts`.

**Dependency direction:**

```
src/mcp/cli.ts ──deno compile──► dist/mcp-bin/argdown-2-mcp-*
                                         ▲
scripts/argdown-2-mcp ──download/cache/exec
mcp.json / plugin ──► scripts/argdown-2-mcp
```

**Milestone note:** Tasks 1–3 deliver compile + CI assets. Tasks 4–6 switch consumers to the launcher. Prefer committing at each task boundary.

---

### Task 1: Deno config + compile script (source entry)

**Files:**
- Create: `scripts/deno-version`
- Create: `deno.json`
- Create: `scripts/compile-mcp.sh`
- Modify: `package.json` (scripts only)

- [ ] **Step 1: Pin Deno version**

Create `scripts/deno-version` (one line, no trailing blank):

```text
2.4.5
```

If that version is unavailable when implementing, use the newest Deno 2.x patch and keep this file as the only pin.

- [ ] **Step 2: Add `deno.json`**

Create `deno.json`:

```json
{
  "nodeModulesDir": "auto",
  "unstable": ["npm-lazy-caching"]
}
```

If `unstable` keys error on the pinned Deno, drop `unstable` and keep `nodeModulesDir`. The required behavior: `deno check` / `deno compile` on `src/mcp/cli.ts` resolve `@modelcontextprotocol/sdk`, `zod`, and `edn-parser-js` (patched). Prefer making Yarn’s install visible (e.g. run `yarn install` then ensure Deno can read `node_modules` or generate one with `deno install` / `npm install --ignore-scripts` in CI only for the compile job). **Do not** add esbuild.

If the Yarn `patch:` locator is invisible to Deno, in this task add the smallest fix that preserves the patched ESM import (e.g. document a CI step `yarn npm install` into a real `node_modules`, or vendor the one-line patch). Fail the task rather than bundling with esbuild.

- [ ] **Step 3: Write compile script**

Create `scripts/compile-mcp.sh`:

```bash
#!/usr/bin/env bash
# Compile src/mcp/cli.ts into native binaries under dist/mcp-bin/.
# Usage: scripts/compile-mcp.sh [--all]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DENO_VERSION="$(tr -d '[:space:]' < "$ROOT/scripts/deno-version")"
ENTRY="$ROOT/src/mcp/cli.ts"
OUT_DIR="$ROOT/dist/mcp-bin"

TARGETS_ALL=(
  x86_64-apple-darwin
  aarch64-apple-darwin
  x86_64-unknown-linux-gnu
  aarch64-unknown-linux-gnu
)

if [[ ! -f "$ENTRY" ]]; then
  echo "error: missing $ENTRY" >&2
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

cd "$ROOT"
for target in "${TARGETS[@]}"; do
  out="$OUT_DIR/argdown-2-mcp-${target}"
  echo "deno compile → $out (entry=$ENTRY)"
  # MCP needs filesystem I/O for path-mode tools; allow-all keeps v1 simple.
  deno compile \
    --allow-all \
    --node-modules-dir=auto \
    --target "$target" \
    --output "$out" \
    "$ENTRY"
done

echo "Wrote:"
ls -la "$OUT_DIR"/argdown-2-mcp-*
```

```bash
chmod +x scripts/compile-mcp.sh
```

Add to `package.json` scripts:

```json
"compile:mcp": "bash ./scripts/compile-mcp.sh",
"check:mcp-deno": "bash ./scripts/check-mcp-deno.sh",
"probe:mcp": "yarn node ./scripts/probe-mcp-stdio.mjs"
```

(`check:mcp-deno` / `probe:mcp` land in Task 2; scripts may 404 until then.)

- [ ] **Step 4: Smoke compile on host**

```bash
curl -fsSL https://deno.land/install.sh | sh -s "v$(cat scripts/deno-version)"
export PATH="$HOME/.deno/bin:$PATH"
yarn install --immutable
# Ensure Deno can see npm packages (whatever Step 2 settled on), then:
yarn compile:mcp
```

Expected: `dist/mcp-bin/argdown-2-mcp-<host-target>` exists and is executable. If compile fails on npm/patch resolution, fix `deno.json` / install layout in this task — do not add a JS bundler.

- [ ] **Step 5: Commit**

```bash
git add scripts/deno-version deno.json scripts/compile-mcp.sh package.json
git commit -m "build(mcp): Deno-compile src/mcp/cli.ts into native binaries"
```

---

### Task 2: Compat gate (static check + stdio probe)

**Files:**
- Create: `scripts/check-mcp-deno.sh`
- Create: `scripts/probe-mcp-stdio.mjs`
- Modify: `package.json` (ensure scripts from Task 1 point at these files)

- [ ] **Step 1: Write static check script**

Create `scripts/check-mcp-deno.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTRY="$ROOT/src/mcp/cli.ts"
DENO_VERSION="$(tr -d '[:space:]' < "$ROOT/scripts/deno-version")"

if [[ ! -f "$ENTRY" ]]; then
  echo "error: missing $ENTRY" >&2
  exit 1
fi

# Landmine grep on MCP sources (not a bundled dist file).
if grep -REn "process\.binding\(|require\.resolve\(|__dirname|__filename" "$ROOT/src/mcp" --include='*.ts'; then
  echo "error: landmine pattern found under src/mcp (see matches above)" >&2
  exit 1
fi

if ! command -v deno >/dev/null 2>&1; then
  echo "error: deno not on PATH (need $DENO_VERSION)" >&2
  exit 1
fi

cd "$ROOT"
deno check --node-modules-dir=auto "$ENTRY"
echo "check-mcp-deno: ok"
```

```bash
chmod +x scripts/check-mcp-deno.sh
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

- [ ] **Step 3: Run gate locally**

```bash
export PATH="$HOME/.deno/bin:$PATH"
yarn check:mcp-deno
yarn compile:mcp
HOST=$(ls dist/mcp-bin/argdown-2-mcp-* | head -n1)
yarn probe:mcp "$HOST"
```

Expected: both checks print `ok`. If `deno check` or probe fails, fix source/config here (spec fallback — not esbuild).

- [ ] **Step 4: Commit**

```bash
git add scripts/check-mcp-deno.sh scripts/probe-mcp-stdio.mjs package.json
git commit -m "test(mcp): add Deno source check and stdio MCP probe"
```

---

### Task 3: Release workflow — compile all targets + upload assets

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Raise timeout and add Deno steps**

In `.github/workflows/release.yml`:

1. Change `timeout-minutes: 10` → `timeout-minutes: 30`.
2. After `Detect version bump` (and only when `steps.ver.outputs.changed == 'true'`), **before** pack/release, add:

```yaml
      - name: Setup Deno
        if: steps.ver.outputs.changed == 'true'
        uses: denoland/setup-deno@v2
        with:
          deno-version-file: scripts/deno-version

      - name: Check MCP entry (Deno)
        if: steps.ver.outputs.changed == 'true'
        run: yarn check:mcp-deno

      - name: Compile MCP binaries (all targets)
        if: steps.ver.outputs.changed == 'true'
        run: bash ./scripts/compile-mcp.sh --all

      - name: Probe host MCP binary (stdio)
        if: steps.ver.outputs.changed == 'true'
        run: |
          set -euo pipefail
          if [[ -x dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu ]]; then
            HOST_BIN=dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu
          elif [[ -x dist/mcp-bin/argdown-2-mcp-aarch64-unknown-linux-gnu ]]; then
            HOST_BIN=dist/mcp-bin/argdown-2-mcp-aarch64-unknown-linux-gnu
          else
            echo "::error::no Linux host binary found under dist/mcp-bin" >&2
            exit 1
          fi
          yarn probe:mcp "$HOST_BIN"

      - name: Write MCP binary checksums
        if: steps.ver.outputs.changed == 'true'
        run: |
          set -euo pipefail
          cd dist/mcp-bin
          sha256sum argdown-2-mcp-* > sha256sums.txt
          test "$(ls -1 argdown-2-mcp-* | wc -l)" -eq 4
          cat sha256sums.txt
```

3. Update Release `files:` to:

```yaml
          files: |
            ${{ steps.pack.outputs.tarball }}
            dist/mcp-bin/argdown-2-mcp-x86_64-apple-darwin
            dist/mcp-bin/argdown-2-mcp-aarch64-apple-darwin
            dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu
            dist/mcp-bin/argdown-2-mcp-aarch64-unknown-linux-gnu
            dist/mcp-bin/sha256sums.txt
```

Do not compile when version is unchanged. If CI needs a real `node_modules` for Deno, add that prepare step next to Setup Deno (still no bundler).

- [ ] **Step 2: Sanity-check workflow YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"
```

Expected: no parse error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): attach Deno-compiled MCP binaries from source"
```

---

### Task 4: Hybrid bash launcher

**Files:**
- Create: `scripts/argdown-2-mcp.version`
- Create: `scripts/argdown-2-mcp`
- Create: `scripts/argdown-2-mcp.test.sh`

- [ ] **Step 1: Write failing launcher tests**

Create `scripts/argdown-2-mcp.version` matching `package.json` version (no `v`):

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

FAKE="$TMP/fake-mcp"
cat > "$FAKE" <<'EOF'
#!/usr/bin/env bash
exec cat >/dev/null
EOF
chmod +x "$FAKE"

ARGDOWN2_MCP_BIN="$FAKE" "$LAUNCHER" </dev/null
echo "ok: ARGDOWN2_MCP_BIN"

if ARGDOWN2_MCP_UNAME_S=Windows_NT "$LAUNCHER" </dev/null 2>"$TMP/err"; then
  echo "error: expected Windows to fail" >&2
  exit 1
fi
grep -qi 'not supported' "$TMP/err"
echo "ok: unsupported OS"

CACHE="$TMP/cache/argdown-2/mcp/$VERSION"
mkdir -p "$CACHE"
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
bash scripts/argdown-2-mcp.test.sh
```

Expected: FAIL — launcher missing.

- [ ] **Step 2: Implement launcher**

Create `scripts/argdown-2-mcp`:

```bash
#!/usr/bin/env bash
# Hybrid launcher: ARGDOWN2_MCP_BIN → versioned cache → download → exec.
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
  local file="$1" sums="$2" base expected actual
  base="$(basename "$file")"
  expected="$(awk -v b="$base" '$2 == b || $2 == ("*" b) || $2 == ("./" b) { print $1; exit }' "$sums")"
  [[ -n "$expected" ]] || die "no checksum entry for $base in $sums"
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
bash scripts/argdown-2-mcp.test.sh
```

Expected: `argdown-2-mcp.test.sh: all ok`.

- [ ] **Step 3: Commit**

```bash
git add scripts/argdown-2-mcp scripts/argdown-2-mcp.version scripts/argdown-2-mcp.test.sh
git commit -m "feat(mcp): add hybrid bash launcher for release binaries"
```

---

### Task 5: Plugin / mcp.json / deeplink / cursor-plugin tests

**Files:**
- Modify: `mcp.json`
- Modify: `src/cursor-plugin.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Update plugin contract test**

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

Import `readFileSync` from `node:fs` if needed. Keep `.cursor/mcp.json` yarn clone test unchanged.

```bash
yarn test src/cursor-plugin.test.ts
```

Expected: FAIL — still expects corepack.

- [ ] **Step 2: Update mcp.json**

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

- [ ] **Step 3: Update README + deeplink**

Replace `corepack yarn dlx` prose/examples with the launcher. Rebuild deeplink config base64:

```bash
python3 - <<'PY'
import base64, json
cfg = {"command": "bash", "args": ["scripts/argdown-2-mcp"]}
print(base64.b64encode(json.dumps(cfg, separators=(',', ':')).encode()).decode())
PY
```

Keep source-clone docs pointing at `.cursor/mcp.json` / `yarn mcp`.

- [ ] **Step 4: Re-run tests**

```bash
yarn test src/cursor-plugin.test.ts
bash scripts/argdown-2-mcp.test.sh
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp.json src/cursor-plugin.test.ts README.md
git commit -m "feat(plugin): launch MCP via Deno binary launcher"
```

---

### Task 6: Docs polish + release checklist

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md` / `CHANGELOG.md` as needed

- [ ] **Step 1: Update AGENTS.md**

Document:

- Consumer path: `bash scripts/argdown-2-mcp` (zero Node).
- Compile: `bash scripts/compile-mcp.sh` / `yarn compile:mcp` from **`src/mcp/cli.ts`** (no MCP bundler).
- Gates: `yarn check:mcp-deno`, `yarn probe:mcp <bin>`.
- Deno is release tooling; day-to-day remains `yarn mcp`.

- [ ] **Step 2: CHANGELOG when bumping the binary-shipping version**

Bump `package.json` and `scripts/argdown-2-mcp.version` together; add a section noting Deno-compiled binaries from source and removal of yarn dlx.

- [ ] **Step 3: Final verification**

```bash
yarn build
yarn test
yarn lint
yarn typecheck
bash scripts/argdown-2-mcp.test.sh
export PATH="$HOME/.deno/bin:$PATH"
yarn check:mcp-deno
yarn compile:mcp
yarn probe:mcp "$(ls dist/mcp-bin/argdown-2-mcp-* | head -n1)"
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md CHANGELOG.md package.json scripts/argdown-2-mcp.version
git commit -m "docs: document Deno source-compile MCP binaries and launcher"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Deno-compile **source** `src/mcp/cli.ts` | Task 1 |
| No esbuild/tsdown MCP bundling | Explicit out-of-scope; no Task for it |
| Four targets + named assets | Tasks 1 + 3 |
| Compat: deno check source + landmine grep + stdio probe | Task 2 + 3 |
| Release attaches binaries + checksums | Task 3 |
| Hybrid launcher | Task 4 |
| Replace yarn dlx in plugin/mcp.json/deeplink | Task 5 |
| Dev keeps yarn mcp; optional compile | Tasks 1, 6 |
| No Windows; no silent yarn/bundler fallback | Task 4 + Task 1 notes |

No TBD placeholders in task steps.
