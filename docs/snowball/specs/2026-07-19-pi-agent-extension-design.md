# Pi agent package (skills + MCP bridge extension)

## Goal

Ship a Pi coding-agent package from this repo so users can run:

```bash
pi install git:github.com/kellenff/argdown-2
```

and get (1) the three shared Agent Skills and (2) a custom TypeScript extension that bridges the existing stdio MCP server into Pi-registered tools. No third-party Pi MCP client (`pi-mcp-adapter`, `pi-mcp-extension`).

## Decision

**Approach A — thin root `package.json` + shared skills path + MCP SDK bridge.**

- Root `package.json` is Pi-facing only (does not replace `deno.json` as the library identity).
- Skills stay canonical at `plugins/argdown-2/skills/` (same tree Claude Code uses).
- Extension under `pi/extensions/` uses `@modelcontextprotocol/sdk` to spawn the canonical bash launcher and register MCP tools on Pi.
- Launcher path resolved from the extension module location (`import.meta.url`), not PATH or postinstall.

## Layout

```text
argdown-2/
├── package.json                      # thin Pi package manifest + SDK dep
├── pi/
│   └── extensions/
│       └── argdown-2-mcp.ts          # MCP Client → StdioClientTransport → registerTool
├── plugins/argdown-2/skills/         # canonical skills (Claude + Pi)
├── scripts/argdown-2-mcp*            # canonical launcher (unchanged)
└── src/pi-package.test.ts            # shape + install-verification tests
```

## Components

### Root `package.json`

- `name`: `argdown-2-pi` (git install uses the repo URL; npm publish out of scope for v1)
- `keywords`: include `pi-package`
- `version`: track `deno.json` version (asserted in tests)
- `pi.skills`: `["./plugins/argdown-2/skills"]`
- `pi.extensions`: `["./pi/extensions/argdown-2-mcp.ts"]`
- `dependencies`: `@modelcontextprotocol/sdk` only (pin compatible with the server’s protocol expectations)
- `peerDependencies`: `@earendil-works/pi-coding-agent` and `typebox` at `"*"` (Pi-bundled; do not bundle)
- `files`: `["pi", "plugins/argdown-2/skills", "scripts", "package.json", "README.md"]`
- No build/`prepare` that compiles the extension — Pi loads `.ts` via jiti
- If Deno publish would pick up npm metadata, exclude `package.json` (and `pi/`) from `deno.json` `publish.exclude` as needed

### Extension (`pi/extensions/argdown-2-mcp.ts`)

Default-export factory receiving Pi `ExtensionAPI`. On load:

1. Resolve package root from `import.meta.url` → absolute path to `scripts/argdown-2-mcp`
2. Connect MCP `Client` with `StdioClientTransport` (`command: "bash"`, `args: [launcherPath]`)
3. `tools/list` → for each tool, `pi.registerTool` with name, description, and parameters bridged from MCP JSON Schema to TypeBox (Pi’s expected shape)
4. `execute` forwards to `client.callTool`; map MCP errors into tool result content
5. On reload/dispose: close the transport before reconnecting

Eager connect on extension load for v1. Lazy start commands and status UI are out of scope unless trivial.

Tool naming: prefer stable names matching MCP tool names (or a documented prefix). Do not fork skill bodies for naming; fix registration/README if Pi requires a prefix.

### Launcher

Unchanged contract: `scripts/argdown-2-mcp` + `scripts/argdown-2-mcp.version`. Extension does not download binaries. No second launcher copy under `pi/` — git install keeps the full tree (unlike Claude’s `${CLAUDE_PLUGIN_ROOT}` vendoring).

### Skills

No Pi-specific skill copies. The three skills (`build-graph`, `validate-debug`, `interpret-solve`) remain the single source of truth. Soft rule unchanged: never hand-edit `*.edn`; use builder MCP tools only.

### Docs

- README: Pi install one-liner (`pi install git:github.com/kellenff/argdown-2[@ref]`), unix-only note, tools come from the extension (not `.mcp.json` / third-party MCP clients)
- AGENTS.md: note Pi package alongside Claude Code marketplace packaging

## Data flow

1. `pi install git:…` clones to `~/.pi/agent/git/…/argdown-2` and runs `npm install`.
2. Pi loads skills from `plugins/argdown-2/skills` and jiti-loads the extension.
3. Extension resolves launcher → bash → download/reuse pinned native binary → MCP `initialize` + `tools/list` → register tools.
4. Agent turns call registered tools → extension → `callTool` → same `load` / `validate` / `solve` / builder pipeline as other MCP clients.
5. Hot `/reload` closes the old client and reconnects cleanly.

Authoring state lives in the MCP session via builder tools.

## Error handling

| Failure | Handling |
| --- | --- |
| Launcher path missing after resolve | Fail extension load with expected path + reinstall/layout hint |
| Binary download / wrong platform | Surfaced as MCP connect failure from launcher stderr; README lists unix + platforms |
| `initialize` / `tools/list` fails | Register no tools; notify via `ctx.ui` when available; skills still load |
| Tool call / transport drop | Return error as tool result; simple reconnect-once or instruct `/reload` |
| Skill vs tool name mismatch | Fix in extension registration + README; no skill forks in v1 |
| Deno publish vs root `package.json` | Keep JSR on `deno.json`; exclude npm/Pi paths from Deno publish if required |
| Windows | Unsupported in v1 (bash launcher); document explicitly |

## Out of scope

- `pi-mcp-adapter` / `pi-mcp-extension` or shipping `.pi/mcp.json` as the primary path
- Nested `plugins/argdown-2-pi/` skill copies or sync tests
- Hand-rolled JSON-RPC MCP client
- Windows launcher / `.cmd` shim
- Prompts, themes, npm registry publish of the Pi package
- Lazy MCP lifecycle commands and rich status UI

## Testing

Add `src/pi-package.test.ts` (Deno):

1. Root `package.json`: `pi-package` keyword; `pi.skills` / `pi.extensions` paths exist on disk; version matches `deno.json`
2. Extension module exists and default-exports a function
3. Skills are the same three directories already covered by `claude-plugin.test.ts` (no second skill tree)
4. Launcher resolve helper (exported for test) resolves to `scripts/argdown-2-mcp` from package root

**Install verification** (network on first binary fetch):

- Spawn SDK client → `bash` + resolved launcher → `initialize` + `listTools` → assert tool count matches the server (11) → close
- May be a Deno test with network permissions or `deno task probe:pi-bridge`; same spirit as `probe:mcp`

## Success criteria

- `pi install git:github.com/kellenff/argdown-2` (or local path to repo root) loads skills + extension
- Registered tools include the builder/validate/solve surface; `create_document` succeeds through Pi
- `deno task test` covers shape + install-verification assertions above
- README documents install, unix-only, and extension-based MCP (not a third-party client)

## Prior art

- Claude Code packaging: [2026-07-19-claude-code-plugin-marketplace-design.md](./2026-07-19-claude-code-plugin-marketplace-design.md) — skills + launcher; Pi adds a custom bridge instead of host `.mcp.json`
- Launcher/binary shipping: Deno MCP compile designs; unchanged consumer binary path
- Pi docs: packages (`pi` key in `package.json`), extensions (jiti `.ts`, `registerTool`), peer deps for `@earendil-works/pi-coding-agent` / `typebox`
