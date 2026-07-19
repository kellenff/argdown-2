# Deno-Native Package Cutover

**Date:** 2026-07-19  
**Status:** Approved  
**Scope:** Remove Yarn/Node as the package manager and contributor toolchain; make Deno the package of record (JSR library + Deno tasks); keep CI-built native MCP binaries on GitHub Releases; publish JSR on every merge to `main` (dev prereleases) and on deliberate version bumps (stable).  
**Supersedes (partial):** `docs/snowball/specs/2026-07-18-deno-mcp-compile-design.md` § “Dev default stays Yarn/Node” and library npm-tarball assumptions. MCP compile + launcher design remains in force unless this doc conflicts.

---

## 1. Context and goals

Today Deno compiles the MCP binary from `src/mcp/cli.ts`, but day-to-day development, tests, lint/format, library emit, and the GitHub Release **npm tarball** still go through Yarn 4 PnP + Node (Vitest, `tsc`/tsdown, husky, knip, Stryker, oxlint/oxfmt). That dual stack contradicts a Deno-first package and creates lockfile-drift risk if both Yarn and `deno.lock` resolve the same graph.

**Goals:**

- Deno is the only install/run/test/lint/fmt/check path for contributors and CI.
- Library distribution is **JSR only** (no npm consumers, no npm tarball Release asset).
- CI continues to cut the four native MCP binaries and attach them to GitHub Releases.
- Every merge to `main` publishes a **running latest** JSR prerelease (timestamped).
- Deliberate version bumps publish **stable** JSR + GitHub Release binaries.
- Local/source-clone MCP via `deno run` / `deno task mcp` on `src/mcp/cli.ts`.
- Drop Yarn/PnP, `package.json`, Vitest, library `tsc`/tsdown emit, husky, knip, Stryker, and Node-hosted oxlint/oxfmt.

**Non-goals:**

- Windows MCP binaries (unchanged).
- Changing MCP tool contracts or the library `load` / `validate` / `solve` API.
- Shipping a Deno mutation-testing gate in this migration (Stryker dropped for now).
- Publishing the library to npm “for compatibility.”
- Using `npx jsr publish` (Node) in CI — use pinned `deno publish` with OIDC.

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Approach | Big-bang Deno package of record (Approach A) |
| Package of record | `deno.json` + `deno.lock` |
| Library install | JSR only (`jsr:@casualtheorics/argdown-2` or the linked JSR name) |
| npm / Yarn | Removed (`package.json`, PnP, yarn.lock, Corepack) |
| `npm:` allowlist | `zod` and `@modelcontextprotocol/sdk` only; CI fails on others |
| `edn-parser-js` | Keep vendored under `vendor/edn-parser-js/` |
| Contributor tooling | `deno test` / `check` / `lint` / `fmt` only |
| Mutation testing | Drop Stryker for this cutover |
| Local MCP | `deno task mcp` / `deno run` on `src/mcp/cli.ts` |
| Consumer MCP | Unchanged launcher + GitHub Release binaries |
| Stable release trigger | `deno.json` version changed vs previous commit on `main` (same spirit as today’s package.json check) |
| Stable artifacts | Four MCP binaries + checksums + stable `deno publish` |
| Continuous JSR | Every push/merge to `main`: `deno publish --set-version "${BASE}-dev.${YYYYmmddHHMMSS}"` (UTC) |
| JSR auth | GitHub Actions OIDC (`id-token: write`); no `npx` |
| Rejected | Phased dual Yarn+Deno toolchain; purity-first vendoring of MCP SDK; npm tarball |

---

## 3. Architecture

```text
src/**/*.ts  (TypeScript; JSR exports from deno.json)
     │
     ├─► deno test / check / lint / fmt     (contributor + CI)
     ├─► deno run src/mcp/cli.ts            (local MCP)
     ├─► deno compile → GitHub Release      (4 MCP binaries + checksums)
     └─► deno publish → JSR
            ├─ every main merge:  {base}-dev.{utcTimestamp}
            └─ version bump:      {base} stable

scripts/argdown-2-mcp  → cache/download/exec stable binary (consumers)
```

**Boundaries:**

- **Library:** published TypeScript sources via JSR; no `dist/` npm pack.
- **MCP consumers:** native binaries only; not via JSR.
- **MCP contributors:** Deno run on source; optional local compile.
- **Launcher pin:** tracks stable GitHub Release versions only — not JSR `*-dev.*`.

---

## 4. Components

### 4.1 `deno.json`

- JSR metadata: `name`, `version`, `exports` (public library entry), `publish.exclude` for tests/fixtures/scripts/plugin noise as needed.
- `tasks`: at least `test`, `check`, `lint`, `fmt`, `fmt:check`, `mcp`, `compile:mcp`, `probe:mcp`; `bench` only if ported.
- `imports`: vendored `edn-parser-js`; `npm:zod@…`; `npm:@modelcontextprotocol/sdk@…`.
- CI/script guard: fail if any other `npm:` specifier appears.
- Keep only the Deno/npm-compat flags still required for `deno check` / `deno compile` of `src/mcp/cli.ts`; drop the rest once unused.

### 4.2 Removed tooling

- `package.json`, `yarn.lock`, `.yarn/`, `.pnp.cjs`, `.pnp.loader.mjs`, `.yarnrc.yml`, `.node-version`
- Vitest, Stryker, knip, husky, lint-staged, oxlint/oxfmt Node configs as package scripts
- `tsdown` / `tsc` emit as the library build and npm `files: ["dist"]` pack path
- npm pack / tarball GitHub Release assets
- README/AGENTS paths that require Yarn or `node_modules`

### 4.3 Kept / adapted scripts

- `scripts/deno-version`, `compile-mcp.sh`, `check-mcp-deno.sh`, `argdown-2-mcp`, `argdown-2-mcp.version`
- Probe script: rewrite to Deno TypeScript (no `yarn node` / `.mjs` Node entry)
- `.cursor/mcp.json`: Deno task/run on `src/mcp/cli.ts` (not `yarn node ./dist/mcp/cli.js`)
- Root / plugin `mcp.json` launcher config stays launcher-based for consumers

### 4.4 Tests

- Port Vitest → `Deno.test` + `@std/assert` (or Deno built-ins).
- Replace `vi.*` with Deno-friendly stubs or delete brittle mocks; do not invent a Vitest shim.
- Retain coverage intent for library pipeline, builder, MCP tools, plugin/launcher contracts, compile/probe.
- Benchmarks: port to `deno task bench` if cheap; otherwise remove the Yarn/tinybench CI gate and defer (no half-broken bench).

### 4.5 Docs

- README + AGENTS.md: Deno tasks; JSR install; launcher for MCP consumers; source-clone Deno MCP.
- CHANGELOG: note cutover, dropped npm tarball, dropped Stryker gate, continuous JSR dev publishes.

---

## 5. CI and release data flow

### 5.1 PR CI

1. Checkout  
2. Setup pinned Deno (`scripts/deno-version`)  
3. `deno lint`, `deno fmt --check`, `deno check` (library + MCP entry), `deno test`  
4. Host `compile:mcp` + landmine grep + stdio probe  
5. No Node, Yarn, npm pack, knip, or Stryker  

### 5.2 Push to `main` — continuous JSR (“running latest”)

After gates pass:

- Job `publish-jsr-dev` (or equivalent):  
  - `permissions: contents: read`, `id-token: write`  
  - Pinned Deno  
  - `BASE` = version field in `deno.json`  
  - `deno publish --set-version "${BASE}-dev.$(date -u +%Y%m%d%H%M%S)"`  
- Does not commit the prerelease version back to the repo.  
- Timestamp collision on retry (same UTC second): fail; re-run.  
- Failure fails the workflow (main must not stay green if continuous publish is broken).

JSR has no mutable npm-style `latest` dist-tag; a new published version on every merge is what makes “latest” track `main`.

### 5.3 Push to `main` — stable release (version bump)

When `deno.json` `version` differs from the previous commit (manual `workflow_dispatch` may force):

1. Same Deno gates  
2. `compile:mcp --all` → four binaries under `dist/mcp-bin/` + `sha256sums.txt`  
3. GitHub Release for that version: binaries + checksums only (no npm tarball)  
4. Stable JSR: `deno publish` at the exact `deno.json` version; if already published, skip/success  
5. Align `scripts/argdown-2-mcp.version` with the released version (existing pin rule)

The continuous `*-dev.*` JSR publish (§5.2) still runs on that same push (using the new `BASE`), so a version-bump merge yields both the stable version and a fresh dev prerelease.

### 5.4 Error handling

| Condition | Behavior |
|---|---|
| Any PR/main gate failure | No JSR publish, no GitHub Release |
| Partial binary matrix failure | Fail release; do not publish incomplete asset set |
| Stable JSR version already published | Skip/success for that version |
| Dev JSR publish failure | Fail the job |
| Unsupported MCP OS/arch in launcher | Unchanged (exit 1) |
| Suggestion to use Node/`npx`/Yarn in CI | Rejected |

---

## 6. Testing and success criteria

**Compat (unchanged intent):** `deno check` + landmine grep on `src/mcp` + stdio probe of compiled host binary.

**Regression:** ported Deno tests replace Vitest; cursor-plugin tests expect Deno source-clone config and launcher consumer config.

**Success criteria:**

1. No Yarn/Node required to develop, test, or release.  
2. `deno task` (or equivalent) test/check/lint/fmt green in CI.  
3. Every merge to `main` publishes a new JSR `{base}-dev.{utcTimestamp}` version.  
4. Version bumps publish stable JSR + four MCP binaries + checksums.  
5. Local MCP works via Deno; consumers still use `scripts/argdown-2-mcp`.  
6. No npm tarball in Release assets; no `package.json` in the repo.

---

## 7. Implementation slices (for planning)

Blast-radius on Approach A was high (~27 paths); implement as separate plan tasks / PRs if needed, not as separate products:

1. **Deno package skeleton** — expand `deno.json`, lockfile, npm: allowlist guard; remove Yarn/PnP/`package.json` once Deno gates pass.  
2. **Test + task port** — Vitest → Deno.test; probe → Deno; `.cursor/mcp.json` → Deno MCP.  
3. **CI** — rewrite `ci.yml` to Deno gates + compile/probe.  
4. **Release** — binaries-only GitHub Release; stable `deno publish`; every-merge `*-dev.*` JSR job.  
5. **Docs/CHANGELOG** — contributor and consumer cutover.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| MCP SDK Node-compat under `deno compile` | Keep check + probe; do not widen `npm:` allowlist; do not purity-vendor the SDK in this migration |
| Vitest mock churn | Prefer deleting brittle mocks over shims |
| JSR `*-dev.*` version spam | Accepted; UTC timestamps; launcher ignores them |
| Dual lockfile drift if Yarn left “for a while” | Forbidden — Yarn removed in slice 1 after Deno gates pass |
| Prior design said “keep yarn mcp” | This doc wins for contributor MCP |

---

## 9. Open implementation details (non-blocking)

Resolved at plan/implementation time without changing this design:

- Exact JSR scope/name string if it differs from `@casualtheorics/argdown-2` (must match the already-created JSR package).  
- Whether `deno.json` `exports` point at `./src/index.ts` or a thinner public entry.  
- Exact GitHub Actions job names/workflow split (`ci.yml` vs `release.yml` vs dedicated publish workflow).  
- Whether checkout action major is `v4` or `v6` — prefer current Actions best practice at implement time; not a product decision.  
- Bench port vs defer.  
- Optional later spike: Deno-capable mutation testing (out of scope here).
