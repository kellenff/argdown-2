# Distribution Contract

**Date**: 2026-08-07
**Branch**: `20260807-v1-baseline`
**Spec anchor**: FR-011
**Constitution anchor**: Principle IX (Technology Constraints & Distribution)

## Channels

`argdown-2` ships through **four** distribution channels. Each
channel has a distinct surface and lifecycle.

### 1. JSR (library)

**Surface**: `jsr:@casualtheorics/argdown-2`.

**Versioning**: every merge to `main` publishes a `*-dev.{utcTimestamp}`
prerelease via `.github/workflows/release.yml:publish-jsr-dev`.

**Install**:
```bash
deno add jsr:@casualtheorics/argdown-2
```

**Use**:
```ts
import { Effect } from "effect";
import { load, solve } from "jsr:@casualtheorics/argdown-2";
```

**Stable releases**: triggered by a `deno.json#version` bump (vs
`HEAD~1`). Detected by
`.github/workflows/release.yml`.

**Slow-types check**: `deno task publish:dry-run` runs in the
`dry-run-publish` CI job and MUST pass before any JSR publish.

### 2. GitHub Releases (native MCP binaries)

**Surface**: per-host-triple binaries attached to GitHub Releases.

**Host triples**:
- `x86_64-apple-darwin`
- `aarch64-apple-darwin`
- `x86_64-unknown-linux-gnu`
- `aarch64-unknown-linux-gnu`

**Stable release**: triggered by a `deno.json#version` bump.
`.github/workflows/release.yml` runs:

1. The full quality gate suite on `main`.
2. Multi-target compile via `scripts/compile-mcp.sh` (4 binaries).
3. Linux binary probe via `deno task probe:mcp <linux-bin>`.
4. Checksum generation.
5. GitHub Release with the four binaries and `sha256sums.txt`.
6. Stable JSR publish (tolerating "already published").

**Consumers**: the launcher (`scripts/argdown-2-mcp`) downloads
binaries from GitHub Releases on first use.

**No bundler step**: binaries compile directly from
`src/mcp/cli.ts` via `deno task compile:mcp`. There is no esbuild,
tsdown, or bundled entrypoint.

### 3. Claude Code marketplace

**Surface**: `.claude-plugin/marketplace.json` and
`plugins/argdown-2/`.

**Install** (one-click):
```
/plugin marketplace add kellenff/argdown-2
/plugin install argdown-2@argdown-2
```

**Contents**:
- MCP server registration (launcher + version pin copied under
  `plugins/argdown-2/scripts/`).
- Skills (shared with Pi; see below).
- README + LICENSE.

**Equivalence invariants**:
- `plugins/argdown-2/scripts/argdown-2-mcp` is byte-equivalent to
  canonical `scripts/argdown-2-mcp`. Enforced by
  `src/claude-plugin.test.ts`.
- `plugins/argdown-2/scripts/argdown-2-mcp.version` is
  byte-equivalent to canonical `scripts/argdown-2-mcp.version`.
  Enforced by `src/claude-plugin.test.ts` and `src/pi-package.test.ts`.

**Hand-edit-EDN ban**: enforced in the plugin README and the soft
rule section of each skill prompt.

### 4. Pi coding-agent package

**Surface**: root `package.json` (name `argdown-2-pi`, keyword
`pi-package`) and `pi/extensions/argdown-2-mcp.ts`.

**Install** (unix only):
```bash
pi install git:github.com/kellenff/argdown-2
```

Or from a local clone:
```bash
pi install /absolute/path/to/argdown-2
```

**Contents**:
- Extension bridge that uses `@modelcontextprotocol/sdk` to connect
  to the canonical `scripts/argdown-2-mcp` launcher.
- Skills shared with Claude Code (`plugins/argdown-2/skills/`).

**Shape and bridge tests**: `src/pi-package.test.ts` verifies that
the extension launches the launcher and lists all 14 MCP tools.

**Hand-edit-EDN ban**: same as Claude Code marketplace.

## Skill sharing

Skills are shared between Claude Code and Pi at
`plugins/argdown-2/skills/`. The skill list includes:

- `prose-to-argdown-2` (prose → MCP builder extraction)
- `interactive-argument` (collaborative prose/EDN workshop)
- `build-graph` (programmatic graph construction)
- `validate-debug` (validation diagnostics walkthrough)
- `interpret-solve` (solve result interpretation)

Adding a skill is **additive** (no version bump).

## Versioning policy

| Event | Library version | Binary version | Skills |
|---|---|---|---|
| Merge to `main` | `*-dev.{utcTimestamp}` prerelease | unchanged | unchanged |
| `deno.json#version` bump | new stable (e.g. `0.3.0`) | new stable binary | unchanged |
| Skill addition | unchanged | unchanged | new skill |
| New solver tag (additive) | minor bump | minor bump | unchanged |
| Breaking wire change | major bump | major bump + migration entry | may need updates |

## Stability

- JSR package name: **frozen** (`@casualtheorics/argdown-2`).
- GitHub Release asset names: **frozen** (`argdown-2-mcp-<triple>`,
  `sha256sums.txt`).
- Marketplace path: **frozen** (`plugins/argdown-2/`).
- Pi package name: **frozen** (`argdown-2-pi`).
- Skill list: **additive** (removing a skill is breaking for
  consumers that depend on it).

## Anti-patterns

- **Publishing the CLI as a separate binary**: there is no shipped
  CLI binary; the CLI is a `deno task` for local use only.
- **Adding PyPI / npm / Homebrew channels**: would require a
  constitution amendment (constitution Principle IX).
- **Bundling the launcher with the binary**: the launcher is
  always a separate bash script that downloads and verifies.
