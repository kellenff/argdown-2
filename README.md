# argdown-2

An EDN argumentation library for validated, solver-rooted theories and grounded Dung evaluation.

> `0.2.0-alpha1` is a breaking pre-1.0 reset. The former custom `.argdown` language and parser are not supported; an MCP builder server is available for incremental EDN authoring.

## Quick start

```ts
import { load, solve } from '@casualtheorics/argdown-2';

const loaded = load(`
  #casualtheorics.argdown2.solver/grounded [
    #casualtheorics.argdown2.argdown/statement {:id :a}
    #casualtheorics.argdown2.argdown/statement {:id :b}
    #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
  ]
`);

if (!loaded.ok) {
  console.error(loaded.errors);
} else {
  console.log(solve(loaded.document).labels);
}
```

## MCP server

Build the package, then start the stdio MCP server:

```bash
yarn build
yarn mcp
# or after install: argdown-2-mcp
```

**Cursor** (`.cursor/mcp.json` or global MCP settings):

```json
{
  "mcpServers": {
    "argdown-2": {
      "command": "node",
      "args": ["/absolute/path/to/argdown-2/dist/mcp/cli.js"]
    }
  }
}
```

Use the path to `dist/mcp/cli.js` in your clone or `node_modules/@casualtheorics/argdown-2/dist/mcp/cli.js` after install.

### Tools

| Tool | Purpose |
|---|---|
| `create_document` | Create an empty grounded document |
| `add_statement` | Add a statement (`id`, optional `text` prose) |
| `update_statement` | Update statement prose or tags |
| `add_argument` | Add an argument (`id`, optional `description`) |
| `add_inference` | Add an inference under an argument |
| `add_relation` | Add `support`, `attack`, `contradiction`, or `undercut` |
| `remove_element` | Remove a statement, argument, or inference |
| `remove_relation` | Remove a relation by kind and endpoints |
| `list_elements` | List statements, arguments, inferences, and relations |
| `validate` | Strict-load; return semantic diagnostics |
| `solve` | Strict-load and compute grounded labels |

Mutating tools take exactly one of `path` (filesystem `.edn`) or `source` (full document text). Statement prose is the `text` field. Path mode writes in place; source mode returns the updated EDN in `source`.

Builder mutations may succeed with soft warnings (e.g. ambiguous refs). Call `validate` before `solve` when you need a hard gate.

## Canonical EDN shape

One file contains one solver-tagged root whose value is a vector:

```edn
#casualtheorics.argdown2.solver/grounded
[
  #casualtheorics.argdown2.argdown/statement {:id :a}
  #casualtheorics.argdown2.argdown/statement {:id :b}
  #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
]
```

| Tag | Purpose |
|---|---|
| `#casualtheorics.argdown2.solver/grounded` | Select grounded evaluation for the document |
| `#casualtheorics.argdown2.argdown/statement` | Declare a statement node |
| `#casualtheorics.argdown2.argdown/argument` | Declare an argument and optional inferences |
| `#casualtheorics.argdown2.argdown/inference` | Link statement premises to a statement conclusion |
| `#casualtheorics.argdown2.argdown/support` | Represent support (omitted from v1 Dung reduction) |
| `#casualtheorics.argdown2.argdown/attack` | Add one directed Dung attack |
| `#casualtheorics.argdown2.argdown/contradiction` | Add attacks in both directions |
| `#casualtheorics.argdown2.argdown/undercut` | Target an inference (omitted from v1 reduction) |

IDs and references are EDN keywords. IDs are globally unique across statements, arguments, and inferences.

## Validation

`load(source)` performs three checks:

1. strict EDN parsing;
2. Zod validation of tagged values and fields;
3. identity, reference, and endpoint validation.

Failure returns `{ ok: false, errors }`. Diagnostics use semantic paths; malformed data never produces a partial document.

Use `validate(value)` when EDN has already been read with `edn-parser-js`.

## Grounded reduction

`solve(document)` labels every statement and argument `in`, `out`, or `undec`.

| Relation | Grounded Dung behavior |
|---|---|
| Attack | One directed attack |
| Contradiction | Directed attacks both ways |
| Support | Preserved in the document; omitted with a warning |
| Undercut | Preserved in the document; omitted with a warning |

Inferences are logical structure and are not Dung nodes.

## Argdown 1.x parity

[`examples/argdown1-censorship.edn`](examples/argdown1-censorship.edn) ports the official Argdown 1.x censorship tutorial. Its [mapping note](examples/argdown1-censorship.mapping.md) records relations that were implicit in the original syntax and are explicit in EDN.

## Breaking reset

This release removes the custom lexer/parser, source AST, formatter, CLI, legacy MCP server, Mermaid renderer, and advanced solver surfaces. A new builder MCP server (`yarn mcp`) replaces the old custom-language MCP for incremental EDN authoring. There is no compatibility shim or migration parser. Historical designs remain under `docs/snowball/`.

## Development

```bash
yarn lint
yarn format:check
yarn typecheck
yarn test
yarn build
yarn knip
yarn mutate
```

`yarn knip` fails if `package.json` lists unused or missing dependencies. `yarn mutate` runs [Stryker](https://stryker-mutator.io/) against `edn`, `grounded`, `reduce-dung`, and `validate` (declarative Zod schemas and benches are excluded). It fails if the mutation score drops below 80%. HTML reports land in `reports/mutation/`.
