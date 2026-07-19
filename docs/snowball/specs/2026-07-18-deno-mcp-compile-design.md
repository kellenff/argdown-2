# Deno Compilation of the MCP Server

**Date:** 2026-07-18
**Status:** Approved (revised 2026-07-19)
**Scope:** Ship zero-dependency native MCP binaries (macOS + Linux, arm64 + x64) via Deno compile of the **TypeScript MCP entry** (`src/mcp/cli.ts`), plus a hybrid bash launcher that replaces `corepack yarn dlx` for Cursor plugin / `mcp.json` / deeplink install. No esbuild/tsdown MCP bundling step.

---

## 1. Context and goals

Today the MCP server is launched for consumers via `corepack yarn dlx` against a GitHub Releases tarball so Yarn 2+ applies and the checked-in `edn-parser-js` patch sticks. That path still requires Node, Corepack, and a working Yarn on the host. PATH `yarn` is often classic 1.x; PnP and patch application remain host-environment failure modes.

Deno `compile` can take the existing MCP TypeScript entry, resolve its npm dependencies, and emit a standalone executable. That replaces any separate JS bundler (tsdown, esbuild, etc.) for the shipped MCP binary.

**Goals:**

- Zero runtime deps on the consumer machine for MCP: no Node, Yarn, or Corepack.
- Four release binaries: macOS + Linux × arm64 + x64.
- Hybrid launcher: local cache / override first, download from the pinned GitHub Release if missing.
- Replace `corepack yarn dlx` entirely in plugin / `mcp.json` / deeplink.
- Keep `yarn mcp` / Vitest on Node for day-to-day development; optional local compile script.
- **No MCP pre-bundle** — Deno compile is the only packaging step for the shipped binary.

**Non-goals:**

- Windows binaries (v1).
- Deno-native MCP rewrite / dual entry (`deno-cli.ts`) unless the source-compile probe fails.
- Bun `--compile`, Node SEA, esbuild, or tsdown as an MCP packaging path.
- Auto-floating to `latest` release; launcher pins a version.
- Changing MCP tool contracts or the library `load` / `validate` / `solve` API.
- Requiring Deno for ordinary contributor workflows (tests stay on Node).
- Changing the library `yarn build` / tarball pipeline beyond what Deno compile needs for npm resolution (e.g. a small `deno.json`).

**Fallback:** If Deno cannot compile `src/mcp/cli.ts` (npm/patch/Node-compat) and cheap config/patches cannot fix it, escalate to a Deno-oriented entry or a minimal import-map shim. Do **not** reintroduce an esbuild/tsdown MCP bundle as the default path.

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Approach | Deno-compile **source** `src/mcp/cli.ts` (deps resolved by Deno) |
| MCP bundling | **None** — no esbuild/tsdown step for the shipped binary |
| Consumer success criterion | Native binary; no Node/Yarn/Corepack |
| Platforms (v1) | `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu` |
| Launch path | Bash 3.2+ launcher; hybrid cache → download → exec |
| Plugin / mcp.json / deeplink | Launcher only; remove `corepack yarn dlx` |
| Version selection | Pinned in launcher (or sibling manifest); bump deliberately |
| Dev default | `yarn build` + `yarn mcp` (Node / existing `tsc` emit) |
| Optional local compile | `yarn compile:mcp` (host target; `--all` for full matrix) |
| Library tarball | Keep for programmatic library use; not used to launch MCP |
| Compat gate | `deno check` on source entry + landmine grep on MCP sources + subprocess stdio probe of compiled host binary |
| Rejected | Pre-bundle then compile; Deno-native rewrite first; Node SEA; floating `latest`; silent yarn fallback |

---

## 3. Architecture

```text
src/mcp/cli.ts  ──►  deno compile --target ×4  ──►  GitHub Release assets
   (+ npm deps via package.json / deno.json)         argdown-2-mcp-{target}

yarn build / yarn mcp / vitest   (dev-only Node path; unchanged tsc library emit)

Cursor plugin / mcp.json
        │
        ▼
 scripts/argdown-2-mcp  (bash 3.2+)
   1. resolve OS/arch
   2. if cache hit → exec
   3. else download matching Release asset → verify → cache → exec
```

**Boundaries:**

- **Compile pipeline** (CI + optional local script): Deno is the MCP packager (resolve + compile). No intermediate bundled `dist/mcp/cli.js` for release.
- **Launcher**: host-facing; runtime deps are bash + curl/HTTPS (+ sha256 tool). No Node.
- **Library tarball**: programmatic `load` / `validate` / `solve` only; still produced by the existing Node/`tsc` build for library consumers.
- **Dev Node MCP**: may still use `dist/mcp/cli.js` from `tsc` for `yarn mcp`; that path is not the consumer install path.

---

## 4. Components

### 4.1 Deno project config

- Small root `deno.json` (or equivalent) so `deno compile` / `deno check` resolve npm packages from this repo’s `package.json` (including the Yarn `patch:` locator for `edn-parser-js` or an equivalent Deno-visible install of the patched package).
- Exact flags (`nodeModulesDir`, permission flags, etc.) are implementation details; the contract is: **compile entry is `src/mcp/cli.ts`**, not a pre-bundled dist file.

### 4.2 Compile script

- Path: `scripts/compile-mcp.sh` (exposed as `yarn compile:mcp`).
- Prerequisite: pinned Deno on PATH; repo deps available for Deno’s npm resolution (CI: `yarn install` then Deno setup, or Deno’s own npm install as needed).
- **Entry:** `src/mcp/cli.ts`.
- Default: compile host target only. `--all`: emit all four binaries under `dist/mcp-bin/`.
- Output names (stable Release asset names):
  - `argdown-2-mcp-x86_64-apple-darwin`
  - `argdown-2-mcp-aarch64-apple-darwin`
  - `argdown-2-mcp-x86_64-unknown-linux-gnu`
  - `argdown-2-mcp-aarch64-unknown-linux-gnu`

### 4.3 Release workflow

- After existing build/test gates: install pinned Deno → static check on source → `compile --all` → stdio probe on host binary → write `sha256sums.txt` → attach four binaries + checksums to the GitHub Release (alongside the library tarball).
- Partial matrix failure fails the release; do not publish an incomplete binary set.

### 4.4 Launcher (`scripts/argdown-2-mcp`)

- Bash 3.2+ (universal on macOS; available on Linux).
- Map `uname` → one of the four asset names; unsupported OS/arch exits 1 (Windows: explicit “not supported in v1”).
- Cache: `~/.cache/argdown-2/mcp/<version>/` (XDG on Linux; same layout fallback on macOS).
- Version pinned in the launcher or a tiny sibling manifest (same release tag as the intended binaries).
- Lookup order:
  1. `$ARGDOWN2_MCP_BIN` if set
  2. Versioned cache hit with matching checksum
  3. HTTPS download of the pinned tag’s asset + checksums
  4. Verify sha256 → atomic install into cache → `chmod +x` → strip macOS quarantine when needed → `exec`
- Download via direct Release asset URLs (not the unauthenticated GitHub API) to avoid rate limits.
- Stderr for diagnostics only; never write to MCP stdio.

### 4.5 Plugin / mcp.json / deeplink

- `command` points at the launcher; `args` empty (or pass-through only).
- Remove `corepack yarn dlx` configuration entirely.
- Update README install docs and the MCP install deeplink accordingly.

### 4.6 Package `bin` field

- Consumer MCP launch no longer depends on package `bin` via `yarn dlx`.
- Keep `bin` → `dist/mcp/cli.js` for optional Node users if useful; it must not be required for the zero-dep path.

---

## 5. Data flow

### 5.1 Release (CI)

Version bump push → lint/format/typecheck/test/build (library) → Deno check source → compile all four → probe host binary → checksums → GitHub Release assets.

### 5.2 Cold start (Cursor launches MCP)

Host runs launcher → resolve OS/arch + pinned version → override / cache / download → verify → exec binary → binary speaks MCP JSON-RPC on stdio (same tool contract as today’s Node MCP).

### 5.3 Warm start

Cache hit → exec; no network.

### 5.4 Dev

`yarn mcp` → Node on `tsc`-emitted `dist/mcp/cli.js`. Optional `yarn compile:mcp` for a local native binary; launcher can point at it via `$ARGDOWN2_MCP_BIN`.

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
| Compat probe / Deno compile failure in CI | Fail release; no binary upload |
| Partial compile matrix failure | Fail release; no incomplete set |
| MCP tool/runtime errors | Unchanged from today’s Node MCP |

No silent fallback to `yarn dlx`, Node, or a JS bundler. Launcher version pin ≠ latest release is intentional; bump the pin when consumers should move.

---

## 7. Testing

### 7.1 Compat gate (blocks compile/release)

1. Static: `deno check src/mcp/cli.ts` (with the same Deno config as compile), plus targeted grep over `src/mcp/**/*.ts` for landmines (`process.binding`, `require.resolve`, risky `__dirname` / `__filename` use).
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
- Release contract tests cover compile outputs and Release asset expectations as implemented.

### 7.5 Success criteria

- Fresh machine with bash + curl (and a sha256 tool) can run the launcher and complete MCP `initialize`.
- No Node/Yarn/Corepack on PATH required for that path.
- No esbuild/tsdown MCP bundle artifact required to produce Release binaries.

---

## 8. Implementation notes (for planning)

Plan split:

1. **Compile + CI + compat probe** — `deno.json`, Deno pin, compile from `src/mcp/cli.ts`, release assets + checksums.
2. **Launcher + plugin config + docs** — hybrid cache/download, replace yarn dlx, deeplink/README.

Chorus angles to preserve: subprocess probe over smoke tests; bash 3.2+ for launcher complexity; direct asset URLs over API; treat `__dirname` under `deno compile` as a silent-failure landmine in the static audit.

---

## 9. Open implementation details (non-blocking)

Resolved at plan/implementation time without changing this design:

- Exact cache path on macOS if XDG is not used.
- Whether version pin lives inline in the launcher vs `scripts/argdown-2-mcp.version`.
- Precise Deno CLI / `deno.json` settings so Yarn’s `edn-parser-js` patch is visible to Deno (e.g. `nodeModulesDir`, `npm install` vs Yarn).
- Whether package.json `bin` remains pointing at `dist/mcp/cli.js` for non-plugin Node users.
