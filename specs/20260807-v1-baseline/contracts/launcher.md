# Launcher Contract

**Date**: 2026-08-07
**Branch**: `20260807-v1-baseline`
**Spec anchor**: FR-012, FR-013
**Constitution anchor**: Principle IX (Technology Constraints & Distribution)

## Surface

`bash scripts/argdown-2-mcp` is the **consumer-facing entry point**
for the stdio MCP server. It is a thin bash wrapper that resolves
the native binary to execute, downloads it if missing, verifies
its integrity via `sha256sums.txt`, and `exec`s it.

The launcher is **byte-equivalent** between the canonical location
(`scripts/argdown-2-mcp`) and the Claude Code plugin copy
(`plugins/argdown-2/scripts/argdown-2-mcp`). This equivalence is
enforced by `src/claude-plugin.test.ts` and `src/pi-package.test.ts`.

## Resolution order

The launcher resolves the binary in this order:

1. **`ARGDOWN2_MCP_BIN` environment variable**. If set, the launcher
   `exec`s that path directly and does not contact the network.
   Useful for local development and CI overrides.
2. **Versioned `XDG_CACHE_HOME` cache**. If a binary matching the
   pinned version is already cached locally, the launcher verifies
   its `sha256sums.txt` and `exec`s it.
3. **Download + verify + exec**. The launcher downloads the
   release archive for the host triple from GitHub Releases, verifies
   `sha256sums.txt`, extracts the binary into the cache, and
   `exec`s it.

If any of these steps fail (override not executable, cache miss,
checksum mismatch, network error, unsupported OS), the launcher
**exits with a clear refusal message** and does not execute.

## Host triples

The launcher supports four host triples:

- `x86_64-apple-darwin` (Intel macOS)
- `aarch64-apple-darwin` (Apple Silicon macOS)
- `x86_64-unknown-linux-gnu` (Intel Linux)
- `aarch64-unknown-linux-gnu` (ARM Linux)

The mapping from `uname` output to triple lives in
`scripts/argdown-2-mcp` and is exercised by
`scripts/argdown-2-mcp.test.sh`.

## Version pinning

The launcher reads the binary version from
`scripts/argdown-2-mcp.version`. This file is updated when
`deno.json#version` is bumped. CI enforces:

> The version in `scripts/argdown-2-mcp.version` MUST match
> `deno.json#version`. Mismatch fails release CI.

(enforced by `.github/workflows/release.yml:Verify launcher pin
matches deno.json version`)

## sha256 verification

The downloaded archive ships with `sha256sums.txt` containing a
line per binary in the form:

```
<sha256hex>  argdown-2-mcp-<triple>
```

The launcher:

1. Downloads `sha256sums.txt` to the cache.
2. Computes the SHA-256 of the downloaded binary.
3. Compares line-by-line.
4. Refuses to `exec` on mismatch.

A tampered or corrupted `sha256sums.txt` results in a clear
refusal message and no partial execution.

## Refusal semantics

| Condition | Action |
|---|---|
| `ARGDOWN2_MCP_BIN` set but not executable | Exit non-zero with clear message; no fallback to download. |
| Cache binary missing or unreadable | Fall through to download. |
| Cache binary checksum mismatch | Refuse; do not overwrite without explicit re-download. |
| Download network failure | Refuse with network error message. |
| Downloaded checksum mismatch | Refuse; do not cache. |
| Unsupported OS triple | Refuse with the supported-triple list. |

All refusal paths exit with a non-zero status and a message on
stderr; **no partial execution**.

## `exec` semantics

On success, the launcher `exec`s the resolved binary, replacing
the bash process. stdin/stdout/stderr pass through unchanged.
The binary communicates over stdio via JSON-RPC.

## Symlink / hardlink behavior

The cache uses a versioned directory layout:

```
$XDG_CACHE_HOME/argdown-2/mcp/<version>/<triple>/
├── argdown-2-mcp-<triple>
└── sha256sums.txt
```

No symlinks or hardlinks across versions; each version is fully
isolated to prevent cross-version contamination.

## Network calls

The launcher makes exactly one HTTPS call to the configured GitHub
Releases endpoint when no cached binary exists for the host triple
+ version. No telemetry, no analytics, no background polling.

Override `ARGDOWN2_MCP_BIN` to opt out of all network access.

## Stability

- Resolution order: **frozen** (constitution Principle IX).
- Refusal semantics: **frozen** (constitution Principle IX).
- `sha256sums.txt` format: **frozen** (a single `<sha256hex>  <name>`
  line per binary, space-separated).
- Host triples: **frozen** (adding a triple requires a constitution
  amendment).
- `ARGDOWN2_MCP_BIN` override: **frozen** (public escape hatch).

## Anti-patterns

- **Running the launcher with `--help`**: it has no CLI surface;
  it `exec`s the binary unconditionally.
- **Capturing launcher stdout**: stdout is the binary's JSON-RPC
  stream; do not pipe it through `tee` or `grep` except at the MCP
  client layer.
- **Disabling checksum verification**: there is no flag to do so;
  set `ARGDOWN2_MCP_BIN` instead.
