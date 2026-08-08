# Research: Deno 2.4.5 → 2.9.2 Risk Register — argdown-2

**Date**: 2026-08-07
**Spec**: [spec.md](./spec.md)
**Method**: Read-only inspection of `deno.json`, `deno.lock`,
`scripts/compile-mcp.sh`, `scripts/check-mcp-deno.sh`,
`src/mcp/io.ts`, `src/pi-package.test.ts`,
`vendor/edn-parser-js/lib/index.js`, `vendor/effect/packages/*`; live
behavior probes against the installed host (`deno 2.9.2 / typescript 6.0.3`).

---

## 1. `deno compile` flag compatibility

**Decision.** No changes required; the four flags (`--frozen`, `--lock`,
`--node-modules-dir=auto`, `--target`) keep their 2.4.5 semantics on 2.9.2.

**Rationale.** `deno compile --help` (2.9.2) still lists `--target <target>`
with the same value set, `--lock [<FILE>]`, `--frozen[=<BOOLEAN>]`, and
`--node-modules-dir[=<MODE>]`. `--frozen` is now an optional boolean but
`--frozen` with no value still defaults to `true`, matching the script's
invocation.

**Alternatives considered.** None — the script's flag set is the standard,
documented surface.

**Risk level.** Low.

**Evidence.** Live `deno compile --help` and `deno run --help` output on
the 2.9.2 host; `scripts/compile-mcp.sh:68-75`.

---

## 2. `deno check` flag compatibility

**Decision.** No changes required; `deno check --frozen --lock deno.lock
--node-modules-dir=auto src/mcp/cli.ts` parses and runs identically on
2.9.2.

**Rationale.** Same flag surface as item 1; the `--frozen --lock …`
combination behaves identically across the 2.x line. `--node-modules-dir=auto`
continues to populate a project-local `node_modules/` lazily for the `npm:`
specs declared in `imports`.

**Alternatives considered.** None.

**Risk level.** Low (medium confidence on whether any 2.5–2.9 micro-release
quietly tightened `--frozen` to require `--lock`; in practice they remain
independent and the script passes both).

**Evidence.** `deno run --help` excerpt on 2.9.2; matching CLI surface in
`deno check --help`.

---

## 3. Landmine grep in `scripts/check-mcp-deno.sh:14`

**Decision.** Keep the grep; it is still meaningful on 2.9.2.

**Rationale.** Deno 2.x does not make `process.binding`, `require.resolve`,
`__dirname`, `__filename` globally available to ESM `.ts` sources
regardless of the `node-globals` unstable flag. They are only reachable
inside explicit `.cjs` / `.cts` files loaded via `createRequire`. A hit
under `src/mcp/*.ts` therefore still indicates a hand-rolled Node-API
escape hatch that won't survive `deno compile`. The 2.9.2 `--help=unstable`
listing no longer shows a `--unstable-node-globals` CLI flag (it's
config-file-only), but the underlying restriction is unchanged — the script
grep targets TypeScript sources under `src/mcp/`, which is precisely where
the guard applies.

**Alternatives considered.** Dropping the grep — rejected (a future
contributor reintroducing `__dirname` in a `.ts` file is exactly the
silent-failure case this is built to catch); promoting to a `deno lint`
rule — out of scope for the version bump.

**Risk level.** Low.

**Evidence.** `deno run --help=unstable` listing on 2.9.2; live probe
showing bare `require`/`process` references in `.ts` files throw
`ReferenceError` without `--unstable-node-globals`.

---

## 4. `deno.lock` `version: 5`

**Decision.** No migration required; 2.9.2 still emits and accepts
`version: 5`.

**Rationale.** Deno 2.9.2's lock writer still produces `version: 5` for
the lockfile head when `deno cache` is invoked against a fresh project.
The v5 schema has been stable across the 2.x line.

**Alternatives considered.** Pre-emptively regenerating the lockfile on
2.9.2 — deferred; do as a separate, intentional refactor so this upgrade
stays a pure version bump.

**Risk level.** Low.

**Evidence.** Live `deno cache` probe on a sibling config writes
`"version": "5"`; `deno.lock:1-3` matches.

---

## 5. `deno.json` `unstable` flags

**Decision.** Keep all three entries (`npm-lazy-caching`, `sloppy-imports`,
`node-globals`); none have been promoted to stable, removed, or renamed in
2.9.2.

**Rationale.** All three remain valid keys in the `unstable` array
(Deno emits a `Warning 'X' isn't a valid unstable feature` only when an
unknown key is supplied). `--unstable-npm-lazy-caching` and
`--unstable-sloppy-imports` still appear in `deno run --help=unstable`;
`node-globals` is config-only in 2.9.2 (no CLI flag) but still functional.
The `deno-lint` exclusion `no-sloppy-imports` continues to make sense while
`sloppy-imports` is still gated.

**Alternatives considered.** Removing any of the three — rejected; the
codebase uses Node built-ins (`node:fs/promises`, `node:path`) which work
regardless, but `node-globals` is what makes bare `process`/`Buffer`
references in `src/mcp/server.ts` and `src/mcp/cli.ts` type-check and run.

**Risk level.** Low.

**Evidence.** Live `deno run --help=unstable` listing; live probe with the
current `unstable` array runs cleanly with no warning; a bogus key
correctly produces the warning line, confirming the recognizer path.

---

## 6. TypeScript 6.0 new strict defaults

**Decision.** No new strict defaults in the TS 6.0 bundled with Deno 2.9.2
are expected to break the existing codebase under `strict: true` +
`noImplicitAny: true`.

**Rationale.** Deno pins its TypeScript defaults conservatively —
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` remain **off**
by default in the bundled TS 6.0. Project `compilerOptions.lib` is
`["es2022","deno.window"]`, which TS 6.0 still ships. There is no global
`useUnknownInCatchVariables` tightening or `noImplicitOverride` change in
the bundled version that would newly fail the existing tests.

**Alternatives considered.** Adding `noUncheckedIndexedAccess` /
`exactOptionalPropertyTypes` pre-emptively — out of scope; treat as a
separate quality PR.

**Risk level.** Low (medium caveat: TS 6.0 ships several other small
strict-adjacent tweaks; the codebase has many `Deno.test` calls and an
effect vendor tree, so a single edge-case type error in an obscure path
remains plausible and is caught by `deno task check`).

**Evidence.** Probe `arr[0].toFixed()` on a possibly-empty `number[]`
typechecks without error in the bundled TS 6.0; `deno.json:70-77` shows
the explicit `strict`/`noImplicitAny` pair.

---

## 7. `deno publish` flag/protocol changes

**Decision.** No changes required; `--dry-run` and `--allow-dirty` are
unchanged in 2.9.2.

**Rationale.** `deno publish --help` (2.9.2) still lists `--dry-run`
("Prepare the package for publishing performing all checks and validations
without uploading"), `--allow-dirty`, `--allow-slow-types`,
`--no-provenance`, `--set-version`, and `--token`. The JSR publishing
protocol is unchanged across the 2.4.5 → 2.9.2 window.

**Alternatives considered.** None.

**Risk level.** Low.

**Evidence.** Live `deno publish --help` listing on the 2.9.2 host; live
`deno publish --dry-run --allow-dirty` end-to-end probe on a sibling
package.

---

## 8. Vendored `edn-parser-js` + vendored `effect/`

**Decision.** No surface change expected to break either vendor tree.

**Rationale.** `edn-parser-js` is shipped as native ESM
(`vendor/edn-parser-js/lib/index.js` exports `parse` / `ednParseMulti`),
so it does not depend on the CJS / dynamic-`require` Node-compat surface.
`vendor/effect/` is `npm:effect@4.0.0-beta.101` (ESM-only,
`src/index.ts` entry), consumed via `npm:` specifier through
`nodeModulesDir: "auto"`; that path uses Deno's standard npm resolver,
which has been stable across the 2.x line. The `node-globals` flag (still
required, see item 5) provides `process`/`Buffer` globals to the bundled
platform-node modules at runtime. There were no Node-compat regressions in
the 2.4.5 → 2.9.2 window that affected ESM-only or standard-resolver npm
packages.

**Alternatives considered.** Switching to `npm:` resolution for
`edn-parser-js` — out of scope; the local-file mapping is intentional and
survives the bump.

**Risk level.** Low to medium (medium caveat: `vendor/effect/` is a beta
release and a beta's `package.json#exports` is the single most likely
source of breakage, but that's a vendored-tree concern, not a Deno-version
concern).

**Evidence.** `vendor/effect/packages/effect/package.json` (ESM-only);
`vendor/edn-parser-js/lib/index.js` (ESM-only); live probe on the host
showing `node:` builtins + `npm:zod` resolve and run identically to 2.4.5
behavior.

---

## 9. Four release triples for `deno compile --target`

**Decision.** All four triples remain supported; no target-list churn in
2.9.2.

**Rationale.** `deno compile --help` (2.9.2) lists the `--target` value
set as `x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu,
x86_64-pc-windows-msvc, x86_64-apple-darwin, aarch64-apple-darwin`. The
three of these the project ships (`x86_64-apple-darwin`,
`aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`,
`aarch64-unknown-linux-gnu`) are all present. Cross-compile to a non-host
triple downloads the relevant slim runtime into `$DENO_DIR` on first
invocation; that mechanism is unchanged.

**Alternatives considered.** Adding Windows targets — out of scope for a
Deno version bump.

**Risk level.** Low.

**Evidence.** Live cross-compile of a trivial module to all four targets
on the 2.9.2 host succeeded and produced four valid executables.

---

## 10. `sanitizeOps` workaround in `src/pi-package.test.ts:109-131`

**Decision.** Keep the `sanitizeOps: false, sanitizeResources: false`
workaround — **2.9.2 has not fixed this.**

**Rationale.** Probed empirically on the 2.9.2 host: a `describe({
sanitizeOps: true, fn() { it(..., () => { const t = setTimeout(()=>{},
2000); t.unref(); }) } })` still fails with `Leaks detected: A timer was
started in this test, but never completed.` Deno's leak detector tracks
timers by handle, not by event-loop refcount; `t.unref()` changes the
event-loop's keep-alive policy but does not detach the timer from the
sanitizer's accounting. The same pattern with `sanitizeOps: false` passes.
The comment block in `src/pi-package.test.ts:109-111` is therefore still
load-bearing and still accurate.

**Alternatives considered.** Switching to `sanitizeResources: true` only,
or to waiting on a `Deno.refTimer`-style API — none exist in 2.9.2.

**Risk level.** Low (the test is gated behind a deliberate `describe`
block, so a future Deno fix would require no code change).

**Evidence.** Live probe on the 2.9.2 host reproduces the same
`Leaks detected: A timer was started in this test` error path with
`sanitizeOps: true` even after `t.unref()`.

---

## Overall verdict: **GREEN**

The 2.4.5 → 2.9.2 upgrade is mechanical: the script flag surface is
identical, the lockfile schema is unchanged, all three `unstable` flags
are still required, the four release triples still cross-compile, the
`deno publish` flag surface is identical, TS 6.0 introduces no new strict
default that the codebase trips, and the `sanitizeOps` workaround in
`src/pi-package.test.ts:109-131` is still load-bearing in 2.9.2 (so it
must be preserved, but no behavioral change is needed).

The only live action items on the upgrade PR are:

1. Bump `scripts/deno-version` from `2.4.5` to `2.9.2`.
2. Update the inline version comment in `src/pi-package.test.ts:109-111`
   (e.g. `Deno 2.4.5 → 2.9.2 sanitizeOps …`).
3. Update the `scripts/deno-version` reference paragraph in
   `.specify/memory/constitution.md` (currently says `currently 2.4.5`).
4. Rerun `deno task compile:mcp` to refresh the host-target release
   binary (if a release binary is included in the PR; otherwise the
   release workflow handles it).
5. Rerun `deno task check` / `deno task test` / `deno task check:mcp-deno`
   / `deno task probe:mcp` against the freshly compiled binary.
6. Rerun the full CI matrix locally as a smoke test before pushing.

No code edits anticipated beyond the three documentation/literal updates.