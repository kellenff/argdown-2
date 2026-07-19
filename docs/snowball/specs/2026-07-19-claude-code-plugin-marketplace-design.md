# Claude Code plugin and marketplace (replace Cursor)

## Goal

Rip out the Cursor plugin/marketplace packaging and replace it with an in-repo Claude Code marketplace plus nested `argdown-2` plugin. One-click install for Claude Code only; keep a generic root `mcp.json` for other MCP clients.

## Decision

**Nested plugin under `plugins/argdown-2/`** (Approach 2), with marketplace catalog at repo `.claude-plugin/marketplace.json` and `source: "./plugins/argdown-2"`.

Full cutover: delete `.cursor-plugin/` and `.cursor/` (including `.cursor/mcp.json`), Cursor install docs, and Cursor deeplinks. Do not retain dual Cursor packaging.

## Layout

```text
argdown-2/
├── .claude-plugin/
│   └── marketplace.json            # marketplace host
├── plugins/argdown-2/              # plugin root (copied into Claude Code cache on install)
│   ├── .claude-plugin/plugin.json
│   ├── .mcp.json                   # bash ${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp
│   ├── skills/
│   │   ├── build-graph/SKILL.md
│   │   ├── validate-debug/SKILL.md
│   │   └── interpret-solve/SKILL.md
│   └── scripts/                    # copy of launcher + version pin (self-contained)
│       ├── argdown-2-mcp
│       └── argdown-2-mcp.version
├── mcp.json                        # keep: generic client launcher (repo-relative)
└── scripts/argdown-2-mcp*          # keep: canonical launcher for mcp.json / releases
```

## Components

### Marketplace

- File: `.claude-plugin/marketplace.json`
- `name`: `argdown-2`
- `owner.name`: `kellenff`
- One plugin entry: `name` `argdown-2`, `source` `./plugins/argdown-2`, description matching current product copy

### Plugin manifest

- File: `plugins/argdown-2/.claude-plugin/plugin.json`
- Metadata: name, displayName, version (aligned with `deno.json`), description, author, homepage, repository, keywords
- Logo: omit in v1 (YAGNI unless Claude Code requires it)
- Default discovery: skills from `skills/`, MCP from `.mcp.json` (no custom path overrides)

### MCP

- Plugin: `plugins/argdown-2/.mcp.json` with server key `argdown-2`, `command` `bash`, `args` `["${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp"]`
- Root: keep `mcp.json` as today (`bash` + `scripts/argdown-2-mcp`) for Claude Desktop and other generic clients

### Launcher vendoring

- Plugin `scripts/` holds a **copy** of canonical `scripts/argdown-2-mcp` and `scripts/argdown-2-mcp.version` (not a symlink to `../../scripts`, which may be omitted when Claude Code copies the plugin tree into cache)
- Deno test asserts plugin launcher + version file match canonical `scripts/`

### Skills (three)

| Skill | Purpose |
| --- | --- |
| `build-graph` | `create_document` → statements/arguments/inferences → relations |
| `validate-debug` | `validate`, interpret diagnostics, repair via MCP mutators |
| `interpret-solve` | `solve` (and `validate` when appropriate); explain grounded labels |

Each skill has a clear frontmatter `description` for auto-invocation. Bodies name MCP tools and repeat the EDN rule.

### Rule (soft, v1)

Claude Code plugins have no first-class `rules/` component. Encode “never hand-edit EDN; use builder MCP tools only” as:

- A repeated requirement in every skill body
- A one-liner in README install docs (and plugin description where useful)

Out of scope for v1: hooks, plugin `settings.json` `permissions.deny` on Write/Edit for `*.edn`.

## Data flow

1. User adds this repo as a marketplace (`/plugin marketplace add` for GitHub or local path).
2. User installs `argdown-2@argdown-2`.
3. Claude Code copies `plugins/argdown-2/` into the plugin cache.
4. On enable, `.mcp.json` starts the launcher under `${CLAUDE_PLUGIN_ROOT}`.
5. Launcher downloads/reuses the pinned native binary (same consumer path as today).
6. Skills are namespaced (`/argdown-2:build-graph`, etc.); Claude may auto-invoke from descriptions.

Authoring stays in MCP session state via builder tools. Skills must not instruct Write/Edit of `*.edn`.

## Error handling

| Failure | Handling |
| --- | --- |
| Launcher/binary missing or wrong platform | Existing launcher errors on MCP connect; README notes platforms / reinstall |
| Plugin launcher copy drifts from `scripts/` | CI test fails |
| User hand-edits `.edn` | Soft rule only — skills refuse and redirect to MCP |
| Invalid marketplace/plugin schema | Shape tests + document `claude plugin validate` |
| Source-clone library work | `deno task mcp` or root `mcp.json`; no Cursor paths |

## Out of scope

- Commands, hooks, agents
- Cursor deeplinks and dual Cursor packaging
- Hard EDN write-deny via permissions or hooks
- Separate marketplace repo / Anthropic official listing
- Plugin logo asset unless required later

## Testing

Replace Cursor plugin tests with Claude Code equivalents (e.g. `src/claude-plugin.test.ts`):

1. Marketplace: name, owner, one plugin, `source: "./plugins/argdown-2"`, description length
2. Plugin manifest: name/version/description; version matches `deno.json`
3. Plugin `.mcp.json`: `bash` + `${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp`
4. Root `mcp.json`: `bash` + `scripts/argdown-2-mcp`; launcher version matches `deno.json`
5. Launcher sync: plugin `scripts/` matches canonical `scripts/`
6. Skills: three dirs with `SKILL.md`; each mentions builder MCP / no hand-edit EDN
7. No assertions on `.cursor/` or `.cursor-plugin/`

## Docs / cleanup

- README: Claude Code marketplace add + install; keep generic `mcp.json` / Claude Desktop snippet; remove Cursor deeplink and `.cursor/mcp.json` guidance
- CHANGELOG: Cursor removal + Claude Code plugin/marketplace
- Update any remaining Cursor-plugin references (e.g. `AGENTS.md` if present)
- Delete `.cursor-plugin/` and `.cursor/`

## Success criteria

- `deno task test` covers the assertions above
- `claude plugin validate` succeeds on marketplace and plugin dirs (documented; optional CI if `claude` is available)
- Install path works: marketplace add → install → MCP tools listed → `create_document` succeeds

## Prior art

Supersedes the install packaging in [2026-07-18-cursor-plugin-mcp-design.md](./2026-07-18-cursor-plugin-mcp-design.md) for one-click install. Launcher/binary shipping remains as in the Deno MCP compile design; only the client packaging surface changes.
