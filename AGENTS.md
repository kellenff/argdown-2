# AGENTS.md

## Cursor Cloud specific instructions

`argdown-2` is a TypeScript library + stdio MCP server for loading, validating, and
solving EDN argument graphs (grounded Dung semantics). There is no GUI or web
service; the shipped artifact is the `argdown-2-mcp` stdio binary. Verify changes
with tests and the MCP flow, not a browser.

Standard commands live in `README.md` (`## Development`) and `deno.json`
`tasks` (`test`, `check`, `lint`, `fmt:check`, `mcp`, `compile:mcp`,
`check:mcp-deno`, `probe:mcp`). Prefer those instead of re-deriving commands.

### MCP binary launcher and release tooling

Consumers launch the shipped MCP server through the checked-in launcher:
`bash scripts/argdown-2-mcp`. The launcher downloads or reuses the pinned native
`argdown-2-mcp` binary version from `scripts/argdown-2-mcp.version`.

Release binaries are compiled directly from `src/mcp/cli.ts` with
`deno task compile:mcp` (or `bash scripts/compile-mcp.sh`). There is no MCP
bundler step: do not add esbuild, tsdown, or a separate bundled MCP entrypoint
for this path.

Deno is day-to-day development and release tooling. Use `deno task mcp` for
stdio MCP from source; use `deno task check:mcp-deno`, `deno task compile:mcp`,
and `deno task probe:mcp <bin>` (or `deno run -A scripts/probe-mcp-stdio.ts
<bin>`) to verify the binary-shipping path.

### Claude Code marketplace

One-click install for Claude Code uses `.claude-plugin/marketplace.json` and
`plugins/argdown-2/` (MCP via `${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp`,
plus skills). Keep the plugin launcher copy in sync with canonical
`scripts/argdown-2-mcp` and `scripts/argdown-2-mcp.version` (enforced by
`src/claude-plugin.test.ts`). There is no Cursor plugin packaging in this repo.

### Pi coding agent package

Root `package.json` is a thin Pi package manifest (`pi install git:…`).
Skills are shared with Claude Code at `plugins/argdown-2/skills/`. The
extension under `pi/extensions/` bridges MCP via `@modelcontextprotocol/sdk`
and the canonical `scripts/argdown-2-mcp` launcher. Shape and bridge tests
live in `src/pi-package.test.ts`.

### MCP server smoke test

The MCP server communicates over stdio (JSON-RPC). To exercise it end to end,
run `deno task mcp` (or connect an MCP client to a compiled binary), then call
`create_document` → `add_statement` → `add_relation` → `solve`. The 14 tools
call the same `load`/`validate`/`solve` pipeline as the library.
