# argdown-2

A TypeScript library and MCP server for loading, validating, and solving argument graphs represented in [EDN](https://github.com/edn-format/edn). One input format, one solver, no partial documents on failure.

> `0.2.0-alpha1` is a breaking pre-1.0 reset from `0.1.0-alpha1`. The custom `.argdown` parser, source AST, Mermaid renderer, CLI, and 15 multi-extension solvers are gone. A builder MCP server replaces the old custom-language MCP. See [CHANGELOG.md](CHANGELOG.md) for history.

## Quick start

```ts
import { load, solve } from '@casualtheorics/argdown-2';

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

The four behavioral files (`src/edn.ts`, `src/grounded.ts`, `src/reduce-dung.ts`, `src/validate.ts`) are held to an 80% Stryker mutation threshold by `yarn mutate`. Declarative Zod schemas in `src/schema.ts` are deliberately excluded as low-value mutants.

Seven EDN fixtures live in `src/bench.fixtures/` and are exercised by every commit: `small-minimal`, `small-relations`, `small-argument`, `medium-censorship`, `heavy-attacks`, `deep-arguments`, `large-stress`. [`examples/argdown1-censorship.edn`](examples/argdown1-censorship.edn) ports the [Argdown 1.x censorship tutorial](https://argdown.org/guide/a-first-example.html); `src/parity.test.ts` verifies that the grounded labels match the pure-attack expected set, with one `reduce/support-omitted` warning per represented support relation.

## Architecture

The library runs as a three-stage data pipeline:

1. `load(source)` parses the EDN source into a raw value via [`edn-parser-js`](https://www.npmjs.com/package/edn-parser-js).
2. `validate(value)` runs a recursive Zod schema, then a cross-reference check that every inference premise, inference conclusion, and relation endpoint resolves to an existing statement, argument, or inference.
3. `solve(document)` reduces the validated document to a Dung framework (dropping `support` and `undercut` with a warning, splitting `contradiction` into two directed attacks) and computes grounded labels by fixed-point iteration: IN iff all attackers are OUT, OUT iff any attacker is IN, UNDEC otherwise. Self-attacks are UNDEC.

Because EDN maps directly to JS data, syntax and cross-reference validation collapse into a single pipeline. The custom parser + AST + visitor split from `0.1.0` is no longer present in `0.2.0`.

The MCP server is a co-equal layer above this pipeline. It registers 11 tools that call `load`, `validate`, `solve`, and the builder functions directly. There is no separate code path; an agent-constructed graph goes through the same validation and solver as a programmatic one.

## Solver

`solve` implements Dung's grounded semantics: the smallest complete extension containing all arguments that are not attacked and all arguments recursively defended by them. Anything attacked by an IN argument is OUT. Arguments that survive in un-attacked odd cycles or self-attack are UNDEC.

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

`support` and `undercut` relations are preserved in the document but emit `reduce/support-omitted` or `reduce/undercut-omitted` warnings and contribute nothing to the Dung reduction.

## MCP server

Eleven tools, stdio transport, single binary `argdown-2-mcp`. Every mutating tool takes exactly one of `path` (filesystem `.edn`, atomic write via temp + rename) or `source` (full document text, returns updated text). Builder mutations may soft-warn (`builder/unresolved-ref`); `builder/duplicate-id` and `builder/missing-id` refuse the edit and return a `refused` field with no document change.

| Tool | Purpose |
| --- | --- |
| `create_document` | Create an empty grounded document |
| `add_statement` | Add a statement (id + optional prose text) |
| `update_statement` | Update an existing statement by id |
| `add_argument` | Add an argument (id + optional description) |
| `add_inference` | Add an inference under an argument; premises and conclusion accept id or prose |
| `add_relation` | Add `support`, `attack`, `contradiction`, or `undercut` |
| `remove_element` | Remove a statement, argument, or inference by id |
| `remove_relation` | Remove a relation by kind + endpoints |
| `list_elements` | List statements, arguments, inferences, and relations |
| `validate` | Strict-load and return semantic diagnostics |
| `solve` | Strict-load and compute grounded labels |

### One-click install (Cursor plugin)

This repo is a Cursor plugin. Installing it registers the `argdown-2` MCP server automatically.

1. In Cursor, open **Customize** → add this repository as a plugin / team marketplace source, **or** symlink it for local testing:
   ```bash
   ln -s /absolute/path/to/argdown-2 ~/.cursor/plugins/local/argdown-2
   ```
2. Reload the window. Toggle **argdown-2** on under Tools & MCP if needed.

You can also use the [MCP install deeplink](cursor://anysphere.cursor-deeplink/mcp/install?name=argdown-2&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIi0tcGFja2FnZT1odHRwczovL2dpdGh1Yi5jb20va2VsbGVuZmYvYXJnZG93bi0yL3JlbGVhc2VzL2Rvd25sb2FkL3YwLjIuMC1hbHBoYTIvY2FzdWFsdGhlb3JpY3MtYXJnZG93bi0yLTAuMi4wLWFscGhhMi50Z3oiLCJhcmdkb3duLTItbWNwIl19) (opens Cursor’s install prompt with the same `npx` config as [`mcp.json`](mcp.json)).

The plugin launches the server from the GitHub Releases tarball via `npx` (no absolute path required). From a source clone of this repo, prefer the committed [`.cursor/mcp.json`](.cursor/mcp.json) which runs `yarn node ./dist/mcp/cli.js` after `yarn build`.

**Claude Desktop** (`claude_desktop_config.json`) or manual Cursor config:

```json
{
  "mcpServers": {
    "argdown-2": {
      "command": "npx",
      "args": [
        "-y",
        "--package=https://github.com/kellenff/argdown-2/releases/download/v0.2.0-alpha2/casualtheorics-argdown-2-0.2.0-alpha2.tgz",
        "argdown-2-mcp"
      ]
    }
  }
}
```

Call `validate` before `solve` when you need a hard gate on incremental authoring.

## Canonical EDN shape

One file contains one solver-tagged root whose value is a vector of theory entries:

| Tag | Purpose |
| --- | --- |
| `#casualtheorics.argdown2.solver/grounded` | Select grounded evaluation for the document |
| `#casualtheorics.argdown2.argdown/statement` | Declare a statement node |
| `#casualtheorics.argdown2.argdown/argument` | Declare an argument and optional inferences |
| `#casualtheorics.argdown2.argdown/inference` | Link statement premises to a statement conclusion |
| `#casualtheorics.argdown2.argdown/support` | Represent support; omitted from Dung reduction with a warning |
| `#casualtheorics.argdown2.argdown/attack` | Add one directed Dung attack |
| `#casualtheorics.argdown2.argdown/contradiction` | Add attacks in both directions |
| `#casualtheorics.argdown2.argdown/undercut` | Target an inference; omitted from Dung reduction with a warning |

IDs and references are EDN keywords. IDs are globally unique across statements, arguments, and inferences.

## Validation

`load(source)` performs three checks in order: strict EDN parsing, Zod schema validation of tagged values and fields, and identity, reference, and endpoint validation. Failure returns `{ ok: false, errors }` with semantic paths (e.g., `[2, ':inferences', 0, ':premises', 3]`). A malformed document never produces a partial document.

Use `validate(value)` when EDN has already been read with `edn-parser-js` and you only need the schema and semantic checks.

## Project status

What is here: strict EDN loader, Zod schema validation, cross-reference validator, grounded Dung solver, builder MCP server, atomic-write I/O layer, tinybench harness, Stryker mutation gates, GitHub Actions CI and release workflows.

What is not here: a custom `.argdown` language or parser, a source AST, a Mermaid or DOT renderer, a CLI binary (the MCP server is the only shipped binary), preferred/stable/complete or bipolar/ASPIC+/evidential solvers (the reset deleted them along with the parser), npm publish (distribution is a GitHub Releases tarball built by `.github/workflows/release.yml`), a public license (the license will be chosen before the first public release).

The namespaced EDN tags and the `#casualtheorics.argdown2.solver/grounded` root are spec-frozen. Downstream consumers cannot extend the language without forking. This is a deliberate scoping decision.

## Installation

The package is `private: true` and is not on npm. The GitHub Actions workflow `.github/workflows/release.yml` builds, tests, mutates, packs, and attaches a tarball to a GitHub Release whenever `package.json` version changes on `main`:

```bash
npm install https://github.com/kellenff/argdown-2/releases/download/<TAG>/casualtheorics-argdown-2-<VERSION>.tgz
```

To run from source, clone and use Yarn 4 with PnP. `.pnp.cjs` and `.pnp.loader.mjs` are tracked; `node_modules/` is gitignored.

## Development

```bash
yarn install        # Yarn 4 with PnP
yarn build          # tsc to dist/
yarn typecheck      # tsc --noEmit
yarn lint           # oxlint
yarn format:check   # oxfmt --check
yarn test           # vitest
yarn mutate         # Stryker; 80% threshold on the four behavioral files
yarn bench          # tinybench pipeline (load, solve, load-solve) over 7 fixtures
yarn bench:check    # compare against perf-baseline.json
yarn knip           # fail if package.json lists unused or missing deps
yarn mcp            # node ./dist/mcp/cli.js
```

PR-time validation runs in `.github/workflows/ci.yml`; release-time runs in `.github/workflows/release.yml`. The two share the same gates. HTML mutation reports land in `reports/mutation/`.

## License

Private. The license will be chosen before the first public release.
