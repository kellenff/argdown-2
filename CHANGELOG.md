# Changelog

All notable changes to `argdown-2` are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/).

> **Distribution:** the package is not yet on npm. Install a tagged release
> via the GitHub Releases tarball:
>
> ```bash
> echo '[#A] --> [#B]' \
>   | npx https://github.com/kellenff/argdown-2/releases/download/<TAG>/casualtheorics-argdown-2-<VERSION>.tgz \
>       render -
> ```
>
> See the "Cutting a release" section in `README.md` for how new versions
> are produced. The GitHub Actions workflow `.github/workflows/release.yml`
> builds, tests, packs, and publishes the tarball automatically on every
> push to `main` whose `package.json` `version` differs from the previous
> commit.

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
