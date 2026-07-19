# Deno Compilation of the MCP Server

**Date:** 2026-07-18
**Status:** Approved
**Scope:** Ship zero-dependency native MCP binaries (macOS + Linux, arm64 + x64) via Deno compile of the existing tsdown bundle, plus a hybrid bash launcher that replaces `corepack yarn dlx` for Cursor plugin / `mcp.json` / deeplink install.

---

## 1. Context and goals

Today the MCP server is launched for consumers via `corepack yarn dlx` against a GitHub Releases tarball so Yarn 2+ applies and the checked-in `edn-parser-js` patch sticks. That path still requires Node, Corepack, and a working Yarn on the host. PATH `yarn` is often classic 1.x; PnP and patch application remain host-environment failure modes.

`yarn build` already produces a dependency-inlined `dist/mcp/cli.js` (tsdown). Deno can compile that artifact into standalone executables with cross-compilation from a single CI runner.

**Goals:**

- Zero runtime deps on the consumer machine for MCP: no Node, Yarn, or Corepack.
- Four release binaries: macOS + Linux × arm64 + x64.
- Hybrid launcher: local cache / override first, download from the pinned GitHub Release if missing.
- Replace `corepack yarn dlx` entirely in plugin / `mcp.json` / deeplink.
- Keep `yarn mcp` / Vitest on Node for day-to-day development; optional local compile script.

**Non-goals:**

- Windows binaries (v1).
- Deno-native MCP rewrite / dual entry (`deno-cli.ts`).
- Bun `--compile` or Node SEA as the default toolchain.
- Auto-floating to `latest` release; launcher pins a version.
- Changing MCP tool contracts or the library `load` / `validate` / `solve` API.
- Requiring Deno for ordinary contributor workflows (tests stay on Node).

**Fallback:** If the Deno compat probe fails and cheap patches cannot fix it, escalate to a first-class Deno MCP entry (Approach 2 from brainstorming). Do not start there.

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Approach | Deno-compile existing `dist/mcp/cli.js` (Approach 1) |
| Consumer success criterion | Native binary; no Node/Yarn/Corepack |
| Platforms (v1) | `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu` |
| Launch path | Bash 3.2+ launcher; hybrid cache → download → exec |
| Plugin / mcp.json / deeplink | Launcher only; remove `corepack yarn dlx` |
| Version selection | Pinned in launcher (or sibling manifest); bump deliberately |
| Dev default | `yarn build` + `yarn mcp` (Node) |
| Optional local compile | `yarn compile:mcp` (host target; `--all` for full matrix) |
| Library tarball | Keep for programmatic library use; not used to launch MCP |
| Compat gate | `deno check` + static landmine grep + subprocess stdio MCP probe |
| Rejected | Deno-native entry first; Node SEA; floating `latest`; silent yarn fallback |

---

## 3. Architecture

```text
yarn build (tsdown)
        │
        ▼
 dist/mcp/cli.js  ──►  deno compile --target ×4  ──►  GitHub Release assets
                                                      argdown-2-mcp-{target}
        │
        ▼ (dev only)
 yarn mcp / vitest   (unchanged Node path)

Cursor plugin / mcp.json
        │
        ▼
 scripts/argdown-2-mcp  (bash 3.2+)
   1. resolve OS/arch
   2. if cache hit → exec
   3. else download matching Release asset → verify → cache → exec
```

**Boundaries:**

- **Compile pipeline** (CI + optional local script): Deno is a build tool only.
- **Launcher**: host-facing; runtime deps are bash + curl/HTTPS (+ sha256 tool). No Node.
- **Library tarball**: programmatic `load` / `validate` / `solve` only.

---

## 4. Components

### 4.1 Compile script

- Path: `scripts/compile-mcp.sh` (exposed as `yarn compile:mcp`).
- Prerequisite: `dist/mcp/cli.js` from `yarn build`.
- Pin Deno to the same version CI uses.
- Default: compile host target only. `--all`: emit all four binaries.
- Output names (stable Release asset names):
  - `argdown-2-mcp-x86_64-apple-darwin`
  - `argdown-2-mcp-aarch64-apple-darwin`
  - `argdown-2-mcp-x86_64-unknown-linux-gnu`
  - `argdown-2-mcp-aarch64-unknown-linux-gnu`

### 4.2 Release workflow

- After existing build/test gates: install pinned Deno → run compat probe → `compile --all` → write `sha256sums.txt` → attach four binaries + checksums to the GitHub Release (alongside the library tarball).
- Partial matrix failure fails the release; do not publish an incomplete binary set.

### 4.3 Launcher (`scripts/argdown-2-mcp`)

- Bash 3.2+ (universal on macOS; available on Linux).
- Map `uname` → one of the four asset names; unsupported OS/arch exits 1 (Windows: explicit “not supported in v1”).
- Cache: `~/.cache/argdown-2/mcp/<version>/` (XDG on Linux; reasonable macOS fallback under the same layout).
- Version pinned in the launcher or a tiny sibling manifest (same release tag as the intended binaries).
- Lookup order:
  1. `$ARGDOWN2_MCP_BIN` if set
  2. Versioned cache hit with matching checksum
  3. HTTPS download of the pinned tag’s asset + checksums
  4. Verify sha256 → atomic install into cache → `chmod +x` → strip macOS quarantine when needed → `exec`
- Download via direct Release asset URLs (not the unauthenticated GitHub API) to avoid rate limits.
- Stderr for diagnostics only; never write to MCP stdio.

### 4.4 Plugin / mcp.json / deeplink

- `command` points at the launcher; `args` empty (or pass-through only).
- Remove `corepack yarn dlx` configuration entirely.
- Update README install docs and the MCP install deeplink accordingly.

### 4.5 Package `bin` field

- Consumer MCP launch no longer depends on package `bin` via `yarn dlx`.
- Keep or adjust `bin` for library-package consistency as a follow-up detail in the implementation plan; it must not be required for the zero-dep path.

---

## 5. Data flow

### 5.1 Release (CI)

Version bump push → lint/format/typecheck/test/build → compat probe → compile all four → checksums → GitHub Release assets.

### 5.2 Cold start (Cursor launches MCP)

Host runs launcher → resolve OS/arch + pinned version → override / cache / download → verify → exec binary → binary speaks MCP JSON-RPC on stdio (same contract as `dist/mcp/cli.js`).

### 5.3 Warm start

Cache hit → exec; no network.

### 5.4 Dev

`yarn mcp` → Node on `dist/mcp/cli.js`. Optional compile; launcher can use `$ARGDOWN2_MCP_BIN` for a locally built binary.

---

## 6. Error handling

| Condition | Behavior |
|---|---|
| Unsupported OS/arch | Exit 1, clear stderr message |
| Missing `curl` / sha256 tool | Exit 1, name the missing tool |
| Download HTTP failure / truncated file | Delete partials, exit 1 with URL + status |
| Checksum mismatch | Delete bad file, exit 1; do not exec |
| Cache not writable | Exit 1 with path |
| `$ARGDOWN2_MCP_BIN` not executable | Exit 1 |
| Compat probe failure in CI | Fail release; no binary upload |
| Partial compile matrix failure | Fail release; no incomplete set |
| MCP tool/runtime errors | Unchanged from today’s Node MCP |

No silent fallback to `yarn dlx` or Node. Launcher version pin ≠ latest release is intentional; bump the pin when consumers should move.

---

## 7. Testing

### 7.1 Compat gate (blocks compile/release)

1. Static: `deno check` on `dist/mcp/cli.js`, plus targeted grep for landmines (`process.binding`, `require.resolve`, risky `__dirname` use).
2. Runtime: spawn the **compiled host binary** as a subprocess; real stdio JSON-RPC: `initialize` → `tools/list` → one `tools/call` (e.g. `create_document`). Fail on any step.

Insufficient: bare `deno run` smoke or dynamic `import()` of the CLI (auto-starts stdio).

### 7.2 Launcher tests

Shell/unit tests with local fixture or pre-seeded cache: cache hit, checksum fail, unsupported arch, `$ARGDOWN2_MCP_BIN` override. No live GitHub dependency in CI unit tests.

### 7.3 CI matrix

- Linux runner cross-compiles all four targets.
- Stdio probe runs on the **host** binary at minimum.
- Non-host artifacts: exist on disk + listed in checksums (no QEMU exec required for v1).

### 7.4 Regression

- Existing Vitest MCP suite stays on Node.
- Build-artifact / release contract tests cover compile outputs and Release asset expectations as implemented.

### 7.5 Success criteria

- Fresh machine with bash + curl (and a sha256 tool) can run the launcher and complete MCP `initialize`.
- No Node/Yarn/Corepack on PATH required for that path.

---

## 8. Implementation notes (for planning)

Likely plan split (blast-radius flagged decomposition):

1. **Compile + CI + compat probe** — script, Deno pin, release asset upload, checksums.
2. **Launcher + plugin config + docs** — hybrid cache/download, replace yarn dlx, deeplink/README.

Chorus angles to preserve in the plan: subprocess probe over smoke tests; bash 3.2+ over pure POSIX sh for HTTPS/checksum/quarantine complexity; direct asset URLs over API; treat `__dirname` under `deno compile` as a silent-failure landmine in the static audit.

---

## 9. Open implementation details (non-blocking)

Resolved at plan/implementation time without changing this design:

- Exact cache path on macOS if XDG is not used.
- Whether version pin lives inline in the launcher vs `scripts/argdown-2-mcp.version`.
- Precise Deno CLI flags (`--allow-*`, `--node-modules-dir`, etc.) needed for a clean compile of the tsdown bundle.
- Whether package.json `bin` remains pointing at `dist/mcp/cli.js` for non-plugin Node users.
