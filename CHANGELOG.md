# Changelog

All notable changes to `argdown-2` are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/).

> **Distribution:** the library is published to
> [JSR](https://jsr.io/@casualtheorics/argdown-2). Install with
> `deno add jsr:@casualtheorics/argdown-2` and import via
> `jsr:@casualtheorics/argdown-2`. Every merge to `main` publishes a
> `*-dev.{utcTimestamp}` prerelease. Native MCP binaries ship via GitHub
> Releases only.

## [Unreleased]

### Added

- `interactive-argument` skill: collaborative prose/EDN argument workshopping
  with one-move-per-turn dialogue and an explicit confirmation gate before
  research-agent citation dispatch (shared Claude Code + Pi skill tree).
- `prose-to-argdown-2` skill: three-pass prose → MCP builder extraction with
  provenance ledger, solver selection, fixtures, and shape tests (shared Claude
  Code + Pi skill tree).
- First-class solver components with IDs, local endpoint scopes, identified
  relations, identity interfaces, typed confidence boundaries, and bottom-up
  grounded composition.
- Builder/MCP nesting: optional `parentId` on mutations, plus `add_solver`,
  `set_import`, and `remove_import`.
- Evidential solver (`#casualtheorics.argdown2.solver/evidential`): grounded
  labels on a Cayrol & Lagasquie-Schiex 2005 §3.3 necessary-support reduction
  (`A --> B` becomes `A → nec:A->B → B`).
- Pi coding-agent package: root `package.json` + `pi/extensions` MCP bridge
  over the existing launcher; shares Claude Code skills (unix only).
- Claude Code in-repo marketplace (`.claude-plugin/marketplace.json`) and nested
  plugin (`plugins/argdown-2`) with MCP, skills (including `prose-to-argdown-2`
  and `interactive-argument`), and a soft rule to never hand-edit EDN.

### Changed

- **CLI:** Argument parser rewritten on `@optique/core` + `@optique/run`. New
  `solve` and `validate` subcommands; the bare invocation (`argdown-2 foo.edn`)
  and `--dry-run` flag remain as back-compat synonyms. Exit codes (0/1/2) and
  output formats (table/dot/mermaid/json) are preserved.
- Replace bare solver-vector roots with tagged document maps containing an
  identified root component. This is an intentional pre-1.0 wire break.
- `solve()` now returns per-component `native`, `aggregate`, `boundary`,
  `children`, and `warnings` layers instead of `labels` / `extensions` plus a
  positional `nested` array.
- MCP relations are added and removed by stable relation ID.
- Relation kinds unsupported by a solver now fail validation
  (`semantic/unsupported-relation-kind`) and are refused by the builder
  (`builder/unsupported-relation-kind`), instead of being silently omitted at
  reduce time.
- `readEdn` now returns `Effect.Effect<unknown, EdnError, never>`
  instead of a synchronous `ReadResult`. Errors are a tagged union
  (`RootCount` / `ReadError`) carrying the existing `Diagnostic`
  shape. Two internal consumers (`src/index.ts`, `src/builder/soft-parse.ts`)
  unwrap via `Effect.match` + `Effect.runSync` and preserve the
  existing `LoadResult` / `SoftParseResult` boundary types. Public
  `load()` / `softParse()` / `validate()` signatures are unchanged.
  Adds `effect` (npm:4.0.0-beta.101) as a runtime dependency.

### Removed

- Cursor plugin / marketplace (`.cursor-plugin/`) and project-local
  `.cursor/mcp.json` one-click install path.
- `ReadResult` type removed from `src/model.ts`. It was an internal
  boundary type for the pre-Effect `readEdn` signature and is unused
  after the EDN reader Effect refactor. Not a public API break —
  `ReadResult` was never re-exported from the package entrypoint.

## [0.2.0-alpha4] - 2026-07-19

### Changed

- Enable JSR [slow-types](https://jsr.io/docs/about-slow-types) compliance via
  `deno task publish:dry-run` (PR CI runs this in the `dry-run-publish` job).
- Enable `noImplicitAny` in `deno.json` compiler options.

## [0.2.0-alpha3] - 2026-07-19

### Changed

- Ship MCP binaries compiled by Deno directly from `src/mcp/cli.ts`, with no
  MCP bundler step.
- Replace the consumer `yarn dlx` MCP launch path with the checked-in
  `bash scripts/argdown-2-mcp` binary launcher.

## [0.2.0-alpha2] - 2026-07-18

### Added

- Cursor plugin (`.cursor-plugin/plugin.json` + root `mcp.json`) for one-click MCP install.
- Project-local `.cursor/mcp.json` that launches the server via `yarn node` after build.
- Stryker mutation testing (`yarn mutate`) with Vitest runner, TypeScript checker, and an 80% break threshold on `edn`, `grounded`, `reduce-dung`, and `validate`.

### Changed

- MCP one-click config uses `corepack yarn dlx` (not `npx` / bare `yarn`) so Yarn 2+ runs even when PATH `yarn` is classic 1.x, and the Yarn `patch:` dependency on `edn-parser-js` is applied.
- Declare `edn-parser-js` via the Yarn `patch:` protocol in `dependencies` (not only `resolutions`) so consumers and `yarn dlx` get the ESM fix.
- `prepare` runs `husky || true` so local installs succeed without husky on the PATH.
- Upgraded Vitest from 1.x to 3.x (required by `@stryker-mutator/vitest-runner` 9.x).

## [0.2.0-alpha1] - 2026-07-17

Breaking pre-1.0 reset.

### Added

- EDN-only canonical representation with namespaced solver and theory tags.
- `load`, `validate`, and `solve` library APIs.
- Zod structural validation and cross-reference validation.
- Formally correct grounded Dung labeling.
- Argdown 1.x censorship parity example.

### Removed

- Custom `.argdown` lexer, parser, source AST, stringifier, CLI, MCP server, and Mermaid renderer.
- Bipolar, ASPIC+, evidential, preferred, stable, and complete solver surfaces.
- Parser and solver benchmark/mutation infrastructure.

### Fixed

- Grounded labeling now applies the formal conditions: IN iff all attackers are OUT; OUT iff any attacker is IN. Self-attacks are UNDEC.

## [0.1.0-alpha1] - 2026-06-28

First public artifact. Pre-release. Captures everything shipped to date
across the parser, AST, renderers, solvers, CLI, and MCP server. No
backward-compatibility promises yet — the language surface is frozen (see
`docs/GRAMMAR.bnf`) but the wire formats and CLI shape may shift before
`1.0.0`.

### Added

#### Parser and AST

- Chevrotain-based lexer + parser for the language specified in
  `docs/GRAMMAR.bnf`, emitting a typed AST with discriminated unions.
- Error recovery: partial AST output plus structured error records on
  parse failure, so tools can keep going past the first error.
- 7-arrow relation taxonomy: support (`-->`), rebut (`--x`), undercut
  (`-.->`), undermine (`-.-`), indirect support (`~>`), incoming (`?>`),
  and equivalence (`<->`).
- Linked-argument inference with multi-premise, disjunction, and
  nesting (`([#thesis]) -> [#a], [#b].`).
- Unified `{}` attribute blocks with typed values (string, number, bool,
  null, flow-sequence, flow-mapping, plain scalar).
- Structured blocks: `:::evidence`, `:::stakeholder`, `:::meta`,
  `:::position`, `:::domain`.
- Frontmatter (`===`) at the top of a document.
- Hard-error stance on legacy `:—` rule syntax (rejected, not translated).
- `./ast` subpath export so downstream tooling can depend on the AST type
  surface without pulling the parser runtime.

#### Solvers

- Dung grounded extension (`solve`).
- Bipolar grounded extension, Method 2 with bipolar support
  (`solveBipolar`, Cayrol & Lagasquie-Schiex 2005 §3.2).
- ASPIC+ grounded extension (`solveAspic`), with `preference:`
  attribute determining which attacks become defeats (Modgil & Prakken
  2014 dispute derivation).
- Evidential grounded extension (`solveEvidential`, Cayrol &
  Lagasquie-Schiex 2005 §3.3): each `-->` is read as "supporter is
  necessary for the supported" and defeat propagates in the opposite
  direction of bipolar's deductive reduction.
- Twelve multi-extension semantics: `preferred`, `stable`, `complete` —
  each across all four edge reductions (`-bipolar`, `-aspic`,
  `-evidential`).
- Residue-based implementation for multi-extension finders
  (`findPreferredExtensions`, `findStableExtensions`,
  `findCompleteExtensions`) using SCC decomposition.
- Iterative `tarjanScc` helper.
- ASPIC+ `preference:` attribute honored across `solveAspic` and the
  three `-aspic` multi-extension variants.

#### Renderers

- Mermaid `flowchart TD` renderer (`renderMermaid`) as the smoke-test
  visualization over the AST.
- Stringifier (`stringify`) that round-trips a parsed document back to
  source — closes the read/write loop and powers the `format` CLI
  subcommand.

#### CLI

- Subcommand-based `argdown` binary with `render`, `solve`, `ast`,
  `validate`, `format`, `mcp`. Each subcommand reads from stdin or a
  filename argument and writes its result to stdout; parse errors go to
  stderr with a non-zero exit code.
- `--semantics=<dung|bipolar|aspic|evidential|…>` flag on `solve`
  covering all 16 semantics.
- Backward-compatibility shim: the legacy `argdown-mermaid` binary name
  and the legacy `--solve --semantics=…` flag form (without a
  subcommand) still work, with a one-time deprecation hint on stderr.
- `--help` and `--version` self-documentation.
- `argdown mcp` MCP server on stdio exposing `parse`, `validate`,
  `render_mermaid`, `solve`, and `format` as JSON-RPC tools. EOF on
  stdin or SIGTERM triggers a clean shutdown.

### Changed

- Distribution channel: the `argdown` CLI is now distributed as a
  GitHub Releases tarball (`@casualtheorics/argdown-2-<version>.tgz`)
  produced by the new `.github/workflows/release.yml` workflow. There
  is no longer a working `npx github:<repo>` path, because the GitHub
  repo's tarball omits `dist/` (it is gitignored).
- `package.json` `private` is still `true`; the version bumped from
  `0.0.0` to `0.1.0-alpha1` to mark the first public artifact without
  claiming stability.

### Fixed

- CLI now accepts `-` as a stdin sentinel in every subcommand. Without
  this, `echo '...' | argdown render -` (and `solve -`, `ast -`,
  `validate -`, `format -`) failed with `ENOENT: no such file or
  directory, open '-'` because `loadInput` only fell back to stdin
  when the filename argument was `undefined`. Matches the conventional
  Unix form (cf. `cat`, `jq`).

[0.1.0-alpha1]: https://github.com/kellenff/argdown-2/releases/tag/v0.1.0-alpha1
[0.2.0-alpha1]: https://github.com/kellenff/argdown-2/releases/tag/v0.2.0-alpha1
[0.2.0-alpha2]: https://github.com/kellenff/argdown-2/releases/tag/v0.2.0-alpha2
[0.2.0-alpha4]: https://github.com/kellenff/argdown-2/releases/tag/v0.2.0-alpha4
[0.2.0-alpha3]: https://github.com/kellenff/argdown-2/releases/tag/v0.2.0-alpha3
