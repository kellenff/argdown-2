# tsdown Bundling Design

**Date:** 2026-07-18
**Status:** Approved
**Scope:** Replace `tsc`-emit `yarn build` with tsdown dual-entry ESM bundles that inline all dependencies; keep `yarn typecheck` as `tsc --noEmit`.

---

## 1. Context and goals

Today `yarn build` runs `tsc` and emits a multi-file `dist/` tree (including test modules under `src/`). The package is ESM-only (`"type": "module"`) with two consumers of built JS:

1. Library entry — `exports["."]` → `dist/index.js` + `dist/index.d.ts`
2. MCP binary — `bin.argdown-2-mcp` → `dist/mcp/cli.js`

Release and Cursor-plugin flows pack / `yarn dlx` this package. A self-contained bundle (no runtime `node_modules` resolution for app deps) makes the MCP binary more reliable under PnP and tarball installs.

**Goals:**

- Drive `yarn build` with tsdown (Rolldown-based library bundler).
- Two named entries: library + MCP CLI, preserving existing `dist/` paths used by `exports` and `bin`.
- Bundle **all** dependencies into both outputs (`deps.alwaysBundle` / no externals).
- Keep `yarn typecheck` as `tsc --noEmit`.
- Emit declaration files for the library surface; leave public API unchanged (`load` / `validate` / `solve`).

**Non-goals:**

- CJS dual build, minify, Node SEA / `exe`.
- Removing runtime `dependencies` from `package.json` (Yarn patch for `edn-parser-js` still requires the declaration).
- Changing the published JS API or MCP tool contract.
- Replacing Vitest / knip / oxlint with tsdown.

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Approach | Single `tsdown.config.ts`, dual named entries |
| Entries | `index` ← `src/index.ts`; `mcp/cli` ← `src/mcp/cli.ts` |
| Format | ESM only |
| Platform | `node` |
| Externals | None — `deps: { alwaysBundle: [/.*/] }` |
| Declarations | `dts: true` (library contract); CLI `.d.ts` not part of pack contract |
| Typecheck | Unchanged: `tsc --noEmit` |
| Runtime deps in package.json | Keep declared (patch + local/dev resolution) |
| Minify / CJS / SEA | Out of scope |
| Approach rejected | Separate lib/CLI configs; array-of-configs split without need |

---

## 3. Architecture

```text
src/index.ts  ──tsdown──►  dist/index.js (+ .d.ts, maps as configured)
src/mcp/cli.ts ──tsdown──►  dist/mcp/cli.js  (shebang preserved)
     └─ all deps inlined (zod, edn-parser-js, @modelcontextprotocol/sdk, …)
```

`tsc` remains the typechecker only. It no longer populates `dist/`. Explicit entries mean test files under `src/**/*.test.ts` are no longer emitted into `dist/`.

---

## 4. Components

### 4.1 `tsdown.config.ts` (new)

- `entry: { index: 'src/index.ts', 'mcp/cli': 'src/mcp/cli.ts' }`
- `format: ['esm']`, `platform: 'node'`
- `deps: { alwaysBundle: [/.*/] }`
- `dts: true`
- Preserve CLI shebang (`#!/usr/bin/env node`) via tsdown shebang/banner support if passthrough is insufficient
- Prefer defaults otherwise (no minify unless tsdown requires an explicit opt-out)

### 4.2 `package.json` scripts / deps

- Add `tsdown` as a `devDependency`
- `"build": "tsdown"`
- `"typecheck": "tsc --noEmit"` unchanged
- `main` / `types` / `exports` / `bin` / `files` unchanged (paths already match)

### 4.3 Docs and CI comments

- README Development: `yarn build` description updates from “tsc to dist/” to tsdown
- `.github/workflows/release.yml` comment that says `` `tsc` populates dist/ `` updates accordingly
- AGENTS.md only if it hard-codes emit-via-`tsc` (keep Yarn PnP guidance)

### 4.4 Pack verification

- CI required tarball files today: `package/dist/index.js`, `package/dist/index.d.ts`
- Add `package/dist/mcp/cli.js` to the required list

---

## 5. Error handling and compatibility

- Build failures surface as tsdown / Rolldown errors; CI already fails on non-zero `yarn build`.
- Runtime: bundled deps must resolve through Yarn PnP at **build** time; the built CLI must start with `yarn node ./dist/mcp/cli.js` without needing those packages at import time for the app graph.
- `isolatedDeclarations` in `tsconfig.json` stays; it supports clean `.d.ts` emit under tsdown.

---

## 6. Testing / verification

1. `yarn build` → `dist/index.js`, `dist/index.d.ts`, `dist/mcp/cli.js` exist
2. Outputs do not rely on external package imports for app dependencies (inlined)
3. `yarn typecheck`, `yarn test`, `yarn lint`, `yarn knip` pass
4. Smoke: MCP entry starts under `yarn node ./dist/mcp/cli.js` / `yarn mcp`
5. Pack dry-run / CI required-files check includes `package/dist/mcp/cli.js`

---

## 7. File touch list

| Path | Change |
|---|---|
| `tsdown.config.ts` | New |
| `package.json` | `build` script; add `tsdown` |
| `README.md` | Build command comment |
| `.github/workflows/release.yml` | Comment accuracy |
| `.github/workflows/ci.yml` | Require `dist/mcp/cli.js` in pack check |
| `AGENTS.md` | Only if wording implies `tsc` emit |

No application `src/` logic changes expected unless shebang or import-meta edge cases force a tiny CLI fix.
