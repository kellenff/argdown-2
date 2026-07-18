# AGENTS.md

## Cursor Cloud specific instructions

`argdown-2` is a TypeScript library + stdio MCP server for loading, validating, and
solving EDN argument graphs (grounded Dung semantics). There is no GUI or web
service; the shipped artifact is the `argdown-2-mcp` stdio binary. Verify changes
with tests and the MCP flow, not a browser.

Standard commands live in `README.md` (`## Development`) and `package.json`
`scripts` (`build`, `typecheck`, `lint`, `format:check`, `test`, `bench`, `mcp`,
`mutate`, `knip`). Prefer those instead of re-deriving commands.

### Yarn 4 Plug'n'Play — always run Node through Yarn

This repo uses Yarn 4 with PnP. `.pnp.cjs` / `.pnp.loader.mjs` are tracked and
`node_modules/` is gitignored, so dependencies resolve **only** through the PnP
loader. Consequences:

- Run every Node entrypoint via Yarn: `yarn <script>` for package scripts, and
  `yarn node <file.mjs>` for ad-hoc scripts. A bare `node dist/mcp/cli.js` (or any
  bare `node ...`) fails with `ERR_MODULE_NOT_FOUND: Cannot find package
  '@modelcontextprotocol/sdk'` because PnP is not injected.
- The README's MCP client config (`"command": "node", "args": [".../dist/mcp/cli.js"]`)
  only works after an npm/tarball install that creates a real `node_modules`. When
  running the server from this source clone, launch it with `yarn node ./dist/mcp/cli.js`
  (i.e. `yarn mcp` after `yarn build`), or set the MCP client `command` to `yarn`
  with `args: ["node", "./dist/mcp/cli.js"]`.

### MCP server smoke test

The MCP server communicates over stdio (JSON-RPC). To exercise it end to end,
`yarn build` first, then connect an MCP client (spawning `yarn node ./dist/mcp/cli.js`)
and call `create_document` → `add_statement` → `add_relation` → `solve`. The 11
tools call the same `load`/`validate`/`solve` pipeline as the library.
