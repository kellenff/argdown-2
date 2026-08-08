# Quickstart: End-to-End v1 Release Validation

**Date**: 2026-08-07
**Spec**: [spec.md](spec.md)
**Plan**: [plan.md](plan.md)
**Contracts**: [version-pin-parity](contracts/version-pin-parity.md),
[binary-asset-bundle](contracts/binary-asset-bundle.md),
[github-release](contracts/github-release.md),
[jsr-stable-publish](contracts/jsr-stable-publish.md)

This guide is the runnable validation path for the v1 release
cut. Run each scenario top to bottom; if any step fails, the
cut is incomplete and must be re-attempted.

## Prerequisites

- `deno` 2.9.2 on `PATH` (matches `scripts/deno-version`).
- `yarn` 1.x on `PATH` (for `package-lock.json` regeneration).
- `git` on `PATH` with push access to the upstream remote.
- `gh` CLI authenticated with `repo` and `workflow` scopes
  (for the post-merge verification).
- `curl`, `sha256sum` (or `shasum` on macOS), `awk`.

## Scenario 1: Pre-merge local validation

Runs on the `002-v1-release` branch before pushing.

### Step 1.1 — Confirm all six version pins read `1.0.0`

```bash
for f in deno.json \
         scripts/argdown-2-mcp.version \
         plugins/argdown-2/scripts/argdown-2-mcp.version \
         plugins/argdown-2/.claude-plugin/plugin.json \
         package.json; do
  case "$f" in
    *.json) jq -r '.version' "$f" ;;
    *)      tr -d '[:space:]' < "$f" ;;
  esac
done | sort -u
```

**Expected output**: a single line, `1.0.0`.

### Step 1.2 — Confirm plugin launcher copy is byte-equivalent

```bash
diff scripts/argdown-2-mcp \
     plugins/argdown-2/scripts/argdown-2-mcp
diff scripts/argdown-2-mcp.version \
     plugins/argdown-2/scripts/argdown-2-mcp.version
```

**Expected**: no diff.

### Step 1.3 — Confirm embedded MCP server version

```bash
grep -n 'version: "1.0.0"' src/mcp/server.ts
```

**Expected**: exactly one match.

### Step 1.4 — Confirm CHANGELOG closure

```bash
grep -E '^## \[1\.0\.0\] - 2026-08-07$' CHANGELOG.md
grep -E '^## \[Unreleased\]' CHANGELOG.md  # only if follow-up work is pending
grep -F '[0.2.0-alpha4]: https://github.com/kellenff/argdown-2/releases/tag/v0.2.0-alpha4' \
  CHANGELOG.md
```

**Expected**: at least the first match; optionally a fresh empty
`[Unreleased]` block; the `0.2.0-alpha4` link reference preserved
in the footer.

### Step 1.5 — Confirm README was NOT touched by this cut

```bash
git diff -- README.md
```

**Expected**: no diff (the README refresh is deferred to the
fresh grfp run per FR-015 / Q2).

## Scenario 2: Quality gates

The Deno quality gates MUST all pass on the bumped commit.

### Step 2.1 — Local pre-flight

```bash
deno task test
deno task lint
deno task fmt:check
deno task check
deno task check:npm-allowlist
deno task check:mcp-deno
deno task publish:dry-run
```

**Expected**: every task exits 0.

The CI gate matrix is the authoritative check; the local
pre-flight is a fast feedback loop.

### Step 2.2 — CI gates

Push the branch and open the PR; CI runs every gate above plus
the host MCP binary compile + probe (`ci.yml`). Wait for green
before merging.

## Scenario 3: Compile and probe

Runs locally after merge to verify the binaries match what CI
produced.

### Step 3.1 — Compile all four binaries

```bash
bash scripts/compile-mcp.sh --all
ls dist/mcp-bin/argdown-2-mcp-* | wc -l
```

**Expected**: `4` (one binary per target triple).

### Step 3.2 — Generate checksums

```bash
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
```

**Expected**: `sha256sums.txt` exists with exactly four lines.

### Step 3.3 — Probe the Linux binary

```bash
deno run -A scripts/probe-mcp-stdio.ts \
  ./dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu
```

**Expected**: exits 0; the probe prints the server version
(`1.0.0`) and the 14 tool names.

### Step 3.4 — Probe the host binary

```bash
host_target="$(uname -m | sed 's/x86_64/x86_64/')-$(uname -s | tr '[:upper:]' '[:lower:]')"
# macOS: x86_64-apple-darwin or aarch64-apple-darwin
# Linux: x86_64-unknown-linux-gnu or aarch64-unknown-linux-gnu
deno run -A scripts/probe-mcp-stdio.ts \
  "./dist/mcp-bin/argdown-2-mcp-${host_target}"
```

**Expected**: exits 0; server reports `1.0.0`.

## Scenario 4: Launcher test (existing test suite)

Runs the canonical four-path launcher test.

```bash
bash scripts/argdown-2-mcp.test.sh
```

**Expected output** (last line):
`argdown-2-mcp.test.sh: all ok`

The test exercises:
- `ARGDOWN2_MCP_BIN` override path.
- Unsupported OS (`Windows_NT`) refusal.
- Versioned cache hit.
- Checksum mismatch (corrupted cache).
- Path-prefixed checksum line format.

## Scenario 5: Post-merge verification

After `git push origin 002-v1-release` and PR merge to `main`:

### Step 5.1 — Tag and GitHub Release

```bash
git fetch --tags
git tag -l 'v1.0.0'
gh release view v1.0.0 --json isPrerelease,assets -q \
  '{ prerelease: .isPrerelease, assets: .assets | length }'
```

**Expected**: tag `v1.0.0` exists; release is non-prerelease;
exactly 5 assets.

### Step 5.2 — Release body byte-equals CHANGELOG section

```bash
diff <(gh release view v1.0.0 --json body -q .body) \
     <(awk -v v='1\.0\.0' '
        $0 ~ "^## \\[" v "\\]" { flag=1; next }
        /^## \[/ && flag { flag=0 }
        flag
      ' CHANGELOG.md)
```

**Expected**: no diff.

### Step 5.3 — JSR stable version is listed

```bash
curl -s 'https://jsr.io/@casualtheorics/argdown-2/meta.json' \
  | jq '.versions["1.0.0"]'
```

**Expected**: an object with `"version": "1.0.0"`.

### Step 5.4 — Fresh `deno add` resolves to `1.0.0`

```bash
TMP="$(mktemp -d)"
(cd "$TMP" && deno init --quiet && \
  deno add jsr:@casualtheorics/argdown-2 && \
  jq '.imports."@casualtheorics/argdown-2"' deno.json)
rm -rf "$TMP"
```

**Expected**: `"jsr:@casualtheorics/argdown-2@^1.0.0"`.

### Step 5.5 — Fresh launcher fetch resolves to `v1.0.0`

```bash
TMP="$(mktemp -d)"
XDG_CACHE_HOME="$TMP/cache" \
  ARGDOWN2_MCP_UNAME_S=Linux \
  ARGDOWN2_MCP_UNAME_M=x86_64 \
  bash scripts/argdown-2-mcp </dev/null 2>"$TMP/stderr"
grep '^argdown-2-mcp:' "$TMP/stderr"
ls "$TMP/cache/argdown-2/mcp/1.0.0/x86_64-unknown-linux-gnu/"
rm -rf "$TMP"
```

**Expected**: stderr line includes `v1.0.0`; cache directory
contains `argdown-2-mcp-x86_64-unknown-linux-gnu` and
`sha256sums.txt`.

## Done When

All five scenarios above pass. The cut is complete when:

- All 6 version pins read `1.0.0` (Scenario 1).
- All 7 Deno quality gates pass (Scenario 2).
- 4 binaries compile + Linux probe exits 0 (Scenario 3).
- Launcher test suite passes (Scenario 4).
- Tag, release, JSR version, fresh `deno add`, and fresh launcher
  fetch all reflect `1.0.0` (Scenario 5).

If any step fails, see the relevant contract document for
diagnosis. Most failures are caught by the `deno task test`
parity tests in `src/claude-plugin.test.ts` and
`src/pi-package.test.ts`.