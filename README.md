# argdown-2

A TypeScript library and MCP server for loading, validating, and solving argument graphs represented in [EDN](https://github.com/edn-format/edn). One input format, solver-tagged documents, no partial documents on failure.

> `0.2.0-alpha1` is a breaking pre-1.0 reset from `0.1.0-alpha1`. The custom `.argdown` parser, source AST, Mermaid renderer, CLI, and 15 multi-extension solvers are gone. A builder MCP server replaces the old custom-language MCP. See [CHANGELOG.md](CHANGELOG.md) for history.

## Quick start

```ts
import { load, solve } from "jsr:@casualtheorics/argdown-2";

const loaded = load(`
  #casualtheorics.argdown2.solver/grounded [
    #casualtheorics.argdown2.argdown/statement {:id :a :text "A"}
    #casualtheorics.argdown2.argdown/statement {:id :b :text "B"}
    #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
  ]
`);

if (!loaded.ok) {
  console.error(loaded.errors);
} else {
  console.log(solve(loaded.document).labels);
  // Map(2) { 'a' => 'in', 'b' => 'out' }
}
```

Three functions, one return shape: `{ ok: true, ... } | { ok: false, errors }`. The library never throws and never produces a partial document.

## Status and rigor

Seven EDN fixtures live in `src/bench.fixtures/` and are exercised by every commit: `small-minimal`, `small-relations`, `small-argument`, `medium-censorship`, `heavy-attacks`, `deep-arguments`, `large-stress`. [`examples/argdown1-censorship.edn`](examples/argdown1-censorship.edn) ports the [Argdown 1.x censorship tutorial](https://argdown.org/guide/a-first-example.html); `src/parity.test.ts` verifies that the grounded labels match the pure-attack expected set, with one `reduce/support-omitted` warning per represented support relation.

## Architecture

The library runs as a three-stage data pipeline:

1. `load(source)` parses the EDN source into a raw value via [`edn-parser-js`](https://www.npmjs.com/package/edn-parser-js).
2. `validate(value)` runs a recursive Zod schema, then a cross-reference check that every inference premise, inference conclusion, and relation endpoint resolves to an existing statement, argument, or inference.
3. `solve(document)` dispatches on the document's solver root tag. Grounded, bipolar, and evidential reduce to a Dung framework and compute grounded labels by fixed-point iteration: IN iff all attackers are OUT, OUT iff any attacker is IN, UNDEC otherwise. Preferred, stable, and complete return extensions instead. Self-attacks are UNDEC.

Because EDN maps directly to JS data, syntax and cross-reference validation collapse into a single pipeline. The custom parser + AST + visitor split from `0.1.0` is no longer present in `0.2.0`.

The MCP server is a co-equal layer above this pipeline. It registers 11 tools that call `load`, `validate`, `solve`, and the builder functions directly. There is no separate code path; an agent-constructed graph goes through the same validation and solver as a programmatic one.

## Solver

`solve` dispatches on the document root tag:

| Root tag | Result | Support handling |
| --- | --- | --- |
| `#…/solver/grounded` | labels | omitted (`reduce/support-omitted`) |
| `#…/solver/bipolar` | labels | deductive reduction (`B → sup:A->B → A`) |
| `#…/solver/evidential` | labels | necessary reduction (`A → nec:A->B → B`) |
| `#…/solver/preferred` | extensions | omitted (pure-attack Dung) |
| `#…/solver/stable` | extensions | omitted (pure-attack Dung) |
| `#…/solver/complete` | extensions | omitted (pure-attack Dung) |

Grounded labeling is Dung's grounded semantics: the smallest complete extension containing all unattacked arguments and all arguments recursively defended by them. Anything attacked by an IN argument is OUT. Arguments that survive in un-attacked odd cycles or self-attack are UNDEC.

Worked example. A document with three statements and one self-attack:

```edn
#casualtheorics.argdown2.solver/grounded [
  #casualtheorics.argdown2.argdown/statement {:id :a}
  #casualtheorics.argdown2.argdown/statement {:id :b}
  #casualtheorics.argdown2.argdown/statement {:id :c}
  #casualtheorics.argdown2.argdown/attack {:from :a :to :a}
]
```

Labels: `{ a: 'undec', b: 'in', c: 'in' }`. `:a` self-attacks, so it is not IN (no grounded extension accepts it) and not OUT (no IN attacker exists), so UNDEC. `:b` and `:c` have no attackers, so IN.

Under `grounded`, `support` and `undercut` are preserved in the document but emit omission warnings and contribute nothing to the reduction. Under `bipolar` / `evidential`, `support` is reduced via auxiliaries; `undercut` is still omitted with a warning.

Bipolar vs evidential on the same graph (`A` supports `B`, `C` attacks `A`):

```edn
#casualtheorics.argdown2.solver/evidential [
  #casualtheorics.argdown2.argdown/statement {:id :a}
  #casualtheorics.argdown2.argdown/statement {:id :b}
  #casualtheorics.argdown2.argdown/statement {:id :c}
  #casualtheorics.argdown2.argdown/support {:from :a :to :b}
  #casualtheorics.argdown2.argdown/attack {:from :c :to :a}
]
```

| Solver | a | b | c |
| --- | --- | --- | --- |
| bipolar | out | in | in |
| evidential | out | out | in |

Evidential propagates A's defeat to B (necessary support). Bipolar does not (deductive support protects/affects the supporter instead).

## MCP server

Eleven tools, stdio transport, single binary `argdown-2-mcp`. Every mutating tool takes exactly one of `path` (filesystem `.edn`, atomic write via temp + rename) or `source` (full document text, returns updated text). Builder mutations may soft-warn (`builder/unresolved-ref`); `builder/duplicate-id` and `builder/missing-id` refuse the edit and return a `refused` field with no document change.

| Tool | Purpose |
| --- | --- |
| `create_document` | Create an empty document (optional solver tag; default grounded) |
| `add_statement` | Add a statement (id + optional prose text) |
| `update_statement` | Update an existing statement by id |
| `add_argument` | Add an argument (id + optional description) |
| `add_inference` | Add an inference under an argument; premises and conclusion accept id or prose |
| `add_relation` | Add `support`, `attack`, `contradiction`, or `undercut` |
| `remove_element` | Remove a statement, argument, or inference by id |
| `remove_relation` | Remove a relation by kind + endpoints |
| `list_elements` | List statements, arguments, inferences, and relations |
| `validate` | Strict-load and return semantic diagnostics |
| `solve` | Strict-load and compute labels or extensions for the document's solver |

### One-click install (Claude Code plugin)

This repo is a Claude Code marketplace. Installing the `argdown-2` plugin registers the MCP server and ships skills for build / validate / solve.

1. In Claude Code: `/plugin marketplace add kellenff/argdown-2` (or add a local checkout path).
2. `/plugin install argdown-2@argdown-2`
3. Enable the plugin if prompted. MCP starts via the checked-in binary launcher.

**Never hand-edit EDN** while using the plugin — mutate graphs only through the builder MCP tools (`create_document`, `add_statement`, …).

Optional checks after changing plugin files:

```bash
claude plugin validate .
claude plugin validate ./plugins/argdown-2
```

The plugin launches the server with `bash ${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp` (launcher + version pin are copied under `plugins/argdown-2/scripts/`). The version is pinned in [`scripts/argdown-2-mcp.version`](scripts/argdown-2-mcp.version). From a source clone of this repo, run `deno task mcp` for stdio MCP from TypeScript.

Release binaries are compiled directly from [`src/mcp/cli.ts`](src/mcp/cli.ts) with `deno task compile:mcp` / [`scripts/compile-mcp.sh`](scripts/compile-mcp.sh); there is no separate MCP bundler.

**Claude Desktop** (`claude_desktop_config.json`) or other MCP clients via root [`mcp.json`](mcp.json):

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

Call `validate` before `solve` when you need a hard gate on incremental authoring.

## Canonical EDN shape

One file contains one solver-tagged root whose value is a vector of theory entries:

| Tag | Purpose |
| --- | --- |
| `#casualtheorics.argdown2.solver/grounded` | Grounded labels; support omitted |
| `#casualtheorics.argdown2.solver/bipolar` | Grounded labels; deductive support reduction |
| `#casualtheorics.argdown2.solver/evidential` | Grounded labels; necessary support reduction |
| `#casualtheorics.argdown2.solver/preferred` | Preferred extensions (pure-attack) |
| `#casualtheorics.argdown2.solver/stable` | Stable extensions (pure-attack) |
| `#casualtheorics.argdown2.solver/complete` | Complete extensions (pure-attack) |
| `#casualtheorics.argdown2.argdown/statement` | Declare a statement node |
| `#casualtheorics.argdown2.argdown/argument` | Declare an argument and optional inferences |
| `#casualtheorics.argdown2.argdown/inference` | Link statement premises to a statement conclusion |
| `#casualtheorics.argdown2.argdown/support` | Support; omitted under grounded / multi-extension, reduced under bipolar / evidential |
| `#casualtheorics.argdown2.argdown/attack` | Add one directed Dung attack |
| `#casualtheorics.argdown2.argdown/contradiction` | Add attacks in both directions |
| `#casualtheorics.argdown2.argdown/undercut` | Target an inference; omitted from all current reductions with a warning |

IDs and references are EDN keywords. IDs are globally unique across statements, arguments, and inferences.

## Validation

`load(source)` performs three checks in order: strict EDN parsing, Zod schema validation of tagged values and fields, and identity, reference, and endpoint validation. Failure returns `{ ok: false, errors }` with semantic paths (e.g., `[2, ':inferences', 0, ':premises', 3]`). A malformed document never produces a partial document.

Use `validate(value)` when EDN has already been read with `edn-parser-js` and you only need the schema and semantic checks.

## Project status

What is here: strict EDN loader, Zod schema validation, cross-reference validator, grounded / bipolar / evidential label solvers, preferred / stable / complete multi-extension solvers, builder MCP server, atomic-write I/O layer, GitHub Actions CI and release workflows.

What is not here: a custom `.argdown` language or parser, a source AST, a Mermaid or DOT renderer, a CLI binary (the MCP server is the only shipped binary), ASPIC+ or CLS 2013 full evidential labeling, a public license (the license will be chosen before the first public release).

Distribution: the library is published to [JSR](https://jsr.io/@casualtheorics/argdown-2) (`jsr:@casualtheorics/argdown-2`); every merge to `main` publishes a `*-dev.{utcTimestamp}` prerelease. Native MCP binaries ship via GitHub Releases (`.github/workflows/release.yml`).

The namespaced EDN theory tags are spec-frozen. New solver roots (such as evidential) are additive via `SOLVER_TAGS`. Downstream consumers cannot invent theory tags without forking. This is a deliberate scoping decision.

## Install (library)

```bash
deno add jsr:@casualtheorics/argdown-2
```

```ts
import { load, solve } from "jsr:@casualtheorics/argdown-2";
```

## MCP (consumers)

Use the checked-in launcher (`bash scripts/argdown-2-mcp`) which downloads the pinned native binary from GitHub Releases. No Deno/Node required on the consumer machine.

## Development

Requires Deno matching [`scripts/deno-version`](scripts/deno-version).

```bash
deno task test
deno task check
deno task publish:dry-run
deno task lint
deno task fmt:check
deno task mcp              # stdio MCP from source
deno task compile:mcp      # host native binary
deno task check:mcp-deno
deno task probe:mcp -- ./dist/mcp-bin/argdown-2-mcp-<host>
```

PR-time validation runs in `.github/workflows/ci.yml`; release-time runs in `.github/workflows/release.yml`. The two share the same gates.

## License

Private. The license will be chosen before the first public release.
