# Cursor plugin for one-click MCP install

## Goal

Ship a Cursor plugin so users can install the `argdown-2` MCP server without hand-editing `mcp.json`.

## Decision

Single-plugin layout at the repository root (same pattern as the official plugin template’s single-plugin mode and Prisma’s Cursor plugin):

- `.cursor-plugin/plugin.json` — plugin manifest
- `mcp.json` — MCP server entry (`mcpServers.argdown-2`)
- `assets/logo.svg` — marketplace logo

Launch command uses `yarn dlx` against the GitHub Releases tarball so Yarn applies the checked-in `edn-parser-js` patch:

```json
{
  "command": "yarn",
  "args": [
    "dlx",
    "-p",
    "https://github.com/kellenff/argdown-2/releases/download/v0.2.0-alpha2/casualtheorics-argdown-2-0.2.0-alpha2.tgz",
    "argdown-2-mcp"
  ]
}
```

Requires Yarn 2+ on the PATH (this repo pins `packageManager: yarn@4.17.0`).

## Supporting fixes

1. **Husky must not break consumer installs.** Use `"prepare": "husky || true"` so local/dev installs succeed when husky is absent.
2. **`edn-parser-js` via `patch:` in `dependencies`.** Root-only `resolutions` are ignored when the package is installed as a dependency of a `yarn dlx` temp project. Declaring the patched locator as a direct dependency makes `yarn dlx` apply the ESM fix. Ship `.yarn/patches/edn-parser-js-npm-2.0.2.patch` in `files`.
3. **Version bump to `0.2.0-alpha2`.** The published `v0.2.0-alpha1` tarball predates the MCP server; a bump on merge triggers a release that includes `argdown-2-mcp`.

## Out of scope

- npm registry publish
- Skills, rules, agents, or hooks in the plugin (YAGNI — MCP config only)
- Multi-plugin marketplace manifest

## Success criteria

- Plugin files validate as JSON and match Cursor’s plugin reference shape
- `yarn dlx -p <tarball> argdown-2-mcp` starts the stdio MCP server with the patch applied
- README documents plugin install and the MCP deeplink
