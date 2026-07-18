# Cursor plugin for one-click MCP install

## Goal

Ship a Cursor plugin so users can install the `argdown-2` MCP server without hand-editing `mcp.json`.

## Decision

Single-plugin layout at the repository root (same pattern as the official plugin template’s single-plugin mode and Prisma’s Cursor plugin):

- `.cursor-plugin/plugin.json` — plugin manifest
- `mcp.json` — MCP server entry (`mcpServers.argdown-2`)
- `assets/logo.svg` — marketplace logo

Launch command uses `npx` against the GitHub Releases tarball (the project’s documented distribution channel until npm publish):

```json
{
  "command": "npx",
  "args": [
    "-y",
    "--package=https://github.com/kellenff/argdown-2/releases/download/v0.2.0-alpha2/casualtheorics-argdown-2-0.2.0-alpha2.tgz",
    "argdown-2-mcp"
  ]
}
```

## Supporting fixes

1. **Husky must not break consumer installs.** Replace `"postinstall": "husky"` with `"prepare": "husky || true"` so local/dev installs succeed when husky is absent.
2. **npm consumers need the edn-parser-js patch.** Yarn `resolutions` patches are ignored by npm. Ship `scripts/apply-edn-parser-patch.mjs` and run it from `postinstall` (dependency lifecycle) so `npx` release-tarball installs get a working ESM import.
3. **Version bump to `0.2.0-alpha2`.** The published `v0.2.0-alpha1` tarball predates the MCP server; a bump on merge triggers a release that includes `argdown-2-mcp`.

## Out of scope

- npm registry publish
- Skills, rules, agents, or hooks in the plugin (YAGNI — MCP config only)
- Multi-plugin marketplace manifest

## Success criteria

- Plugin files validate as JSON and match Cursor’s plugin reference shape
- Fresh `npm install` of a packed tarball succeeds without husky
- `npx --package=<tarball> argdown-2-mcp` starts the stdio MCP server
- README documents plugin install and the MCP deeplink
