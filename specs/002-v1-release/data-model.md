# Phase 1 Data Model: Cut argdown-2 v1.0.0 Release

**Date**: 2026-08-07
**Spec**: [spec.md](spec.md) — Key Entities section
**Plan**: [plan.md](plan.md)
**Research**: [research.md](research.md)

The release cut is a process over a small set of entities. None
of them are runtime data structures — they are project artifacts
whose values are synchronized to a single version string. The
schema below is the schema of the cut.

## Entity 1: Release

A single dated, version-tagged artifact set published across all
distribution channels simultaneously.

### Attributes

| Field | Type | Source / Producer | Notes |
|-------|------|-------------------|-------|
| `version` | string (SemVer) | `deno.json#version` (single source of truth) | `1.0.0` for this cut; must NOT include `-dev.*` or `-alpha.*` suffix |
| `date` | ISO 8601 date | hardcoded in CHANGELOG heading at PR creation time (per Q3) | `2026-08-07` for this cut; does not shift on retry |
| `tag` | git tag string | `v${version}` | `v1.0.0` for this cut |
| `prerelease` | boolean | `release.yml:Detect version bump` (line 133-137) | `false` for `1.0.0`; `true` only if version contains `-` |
| `channels` | set of distribution channels | this cut | {JSR library, GitHub Release × 4 binaries, Claude Code marketplace plugin, Pi package, embedded MCP server version} |
| `notes` | markdown text | `CHANGELOG.md` `[1.0.0] - 2026-08-07` section | byte-equal to GitHub Release body (per SC-003) |
| `commit_sha` | git SHA | the merge commit | bisectable cut point |

### State Transitions

```
   ┌─────────────┐   bump deno.json#version + 5 other pins     ┌────────────┐
   │ 0.2.0-alpha4├──────────────────────────────────────────► │ 1.0.0      │
   └─────────────┘   + close CHANGELOG [Unreleased]           └─────┬──────┘
                          + regenerate package-lock.json              │
                                                                      │ merge to main
                                                                      │ triggers release.yml
                                                                      ▼
                                                            ┌─────────────────────┐
                                                            │ release.yml runs:   │
                                                            │   gates             │
                                                            │   publish-jsr-dev   │
                                                            │   stable-release    │
                                                            │     (binaries,      │
                                                            │      checksums,     │
                                                            │      GH Release,    │
                                                            │      JSR stable)    │
                                                            └─────────┬───────────┘
                                                                      │
                                                                      ▼
                                                            ┌─────────────────────┐
                                                            │ consumers see       │
                                                            │ @casualtheorics/... │
                                                            │ @1.0.0 on JSR +     │
                                                            │ GitHub Releases v1.0│
                                                            └─────────────────────┘
```

There is no rollback state — the version string is monotonic. A
regression after `1.0.0` ships becomes `1.0.1` or `1.1.0` per
SemVer.

### Validation Rules

- `version` MUST equal `deno.json#version` (canonical source of truth).
- `version` MUST equal the value in every other version pin (FR-001
  through FR-006).
- `version` MUST NOT contain `-` (post-cut; prerelease suffixes are
  forbidden on stable releases per SemVer).
- `date` MUST be a valid ISO 8601 date in `[1.0.0] - YYYY-MM-DD` form.
- `tag` MUST equal `v${version}`.
- `notes` MUST be byte-equal to the GitHub Release body
  (`release.yml:215` reads `body_path`).

## Entity 2: Version pin

A single version string that appears in **six** locations in the
repository. Every pin is identical to every other pin after the cut.

### Attributes

| Pin location | File / path | Format | Enforced by |
|--------------|-------------|--------|-------------|
| `deno.json#version` | `deno.json:3` | JSON string | canonical source of truth |
| `scripts/argdown-2-mcp.version` | `scripts/argdown-2-mcp.version:1` | bare string, trailing newline optional | `src/claude-plugin.test.ts:80-82` (equality test) |
| `plugins/argdown-2/scripts/argdown-2-mcp.version` | `plugins/argdown-2/scripts/argdown-2-mcp.version:1` | bare string, trailing newline required (byte-equivalent to canonical) | `src/claude-plugin.test.ts:85-91` (byte equality) |
| `plugins/argdown-2/.claude-plugin/plugin.json#version` | `plugins/argdown-2/.claude-plugin/plugin.json:4` | JSON string | `src/claude-plugin.test.ts:43-55` |
| `package.json#version` | `package.json:3` | JSON string | `src/pi-package.test.ts:43-59` |
| `package-lock.json#packages[""].version` | `package-lock.json:3,9` | JSON string | regenerated by `yarn install` after `package.json` bump |
| `src/mcp/server.ts` serverInfo | `src/mcp/server.ts:21` | JSON object literal | (not parity-tested, but reported by `initialize` handshake) |

**Note**: there are 6 logical pins, but `package-lock.json` has two
physical occurrences (root and the `""` entry). All four
git-trackable JSON / version files (`deno.json`, the two
`.version` files, `plugin.json`, `package.json`) plus
`package-lock.json` are tracked. The `src/mcp/server.ts` constant
is source-tracked but is a TypeScript literal, not a separate file.

### Relationships

```
deno.json#version ─────────► ┐
scripts/argdown-2-mcp.version ┤
plugins/.../argdown-2-mcp.version ─► byte-equal to scripts/.../version
plugins/.../.claude-plugin/plugin.json#version ─┤
package.json#version ───► package-lock.json#version (regenerated)
src/mcp/server.ts serverInfo.version ───────────┘
```

All six arrows are `equality` relationships. The cut enforces them
all by being a single atomic commit.

### Validation Rules

- All 6 pins read the exact same string (`1.0.0`).
- `plugins/argdown-2/scripts/argdown-2-mcp` (launcher bash
  script) is byte-equivalent to `scripts/argdown-2-mcp`
  (`src/claude-plugin.test.ts:85-88`).
- `plugins/argdown-2/scripts/argdown-2-mcp.version` is
  byte-equivalent to `scripts/argdown-2-mcp.version`
  (`src/claude-plugin.test.ts:89-91`).

## Entity 3: Native MCP binary

A compiled `deno compile` artifact for one of four target triples.

### Attributes

| Field | Type | Value |
|-------|------|-------|
| `target` | triple string | one of `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu` |
| `path` | relative path | `dist/mcp-bin/argdown-2-mcp-${target}` |
| `version` | SemVer string | matches Release.version (built into binary via `src/mcp/server.ts:21` constant) |
| `sha256` | hex string | first field of the corresponding line in `dist/mcp-bin/sha256sums.txt` |
| `entry` | source path | `src/mcp/cli.ts` (constant — `compile-mcp.sh:8`) |
| `deno_version` | Deno release | matches `scripts/deno-version` (enforced by `compile-mcp.sh:30-33`) |
| `permissions` | string | `--allow-all` (constant — `compile-mcp.sh:69`) |

### Relationships

- Many-to-one with `Release`: every Native MCP binary in a Release
  shares the same `version` and `commit_sha`.
- One-to-one with `sha256sums.txt`: each binary has exactly one
  line in the checksum file.
- One-to-one with the GitHub Release asset: each binary is one of
  the four `argdown-2-mcp-${target}` assets (plus `sha256sums.txt`
  itself, for five assets total).

### Validation Rules

- Exactly 4 binaries are produced (per target triple).
- `sha256sums.txt` contains exactly 4 lines, one per binary, in
  alphabetical target order (`release.yml:170-176`).
- Each binary's embedded server version (returned by `initialize`)
  matches `Release.version`.
- The Linux binary (`x86_64-unknown-linux-gnu`) passes the stdio
  probe (`scripts/probe-mcp-stdio.ts`); the probe confirms the
  14-tool contract.

## Entity 4: CHANGELOG entry

A versioned section of `CHANGELOG.md` that documents the changes
shipped in a given Release.

### Attributes

| Field | Type | Value (this cut) |
|-------|------|------------------|
| `heading` | markdown heading | `## [1.0.0] - 2026-08-07` |
| `body` | markdown text | everything between this heading and the next `## [` heading |
| `subheadings` | markdown subheadings | `### Added`, `### Changed`, `### Removed` (preserved from prior `[Unreleased]` block, minus the preamble) |
| `link_reference` | markdown link reference | `[1.0.0]: https://github.com/kellenff/argdown-2/releases/tag/v1.0.0` (added to footer) |
| `predecessor_links` | markdown link references | `[0.2.0-alpha4]: https://github.com/kellenff/argdown-2/releases/tag/v0.2.0-alpha4` and earlier (preserved) |

### State Transitions

```
[Unreleased]                       ────────►   [1.0.0] - 2026-08-07
   preamble (7 lines)              ── delete ──►    (gone)
   ### Added                       ──────────►   ### Added
   ### Changed                     ──────────►   ### Changed
   ### Removed                     ──────────►   ### Removed
                                                   │
                                                   ▼
                                              (file footer)
                                              [0.2.0-alpha4]: ...
                                              [1.0.0]: ...        ◄── new
```

A fresh `[Unreleased]` placeholder MAY be added if follow-up work
is pending after the cut (FR-008), but it MUST be empty.

### Validation Rules

- Heading matches `## [\d+\.\d+\.\d+(-\w+\.\d+)?] - YYYY-MM-DD`
  exactly.
- Heading appears in CHANGELOG.md exactly once.
- The body does NOT contain the alpha-rollback preamble text
  (Q1 confirmed preamble deletion).
- The file footer contains the link reference for `1.0.0` and
  preserves the `0.2.0-alpha4` reference.
- The body is byte-equal to the GitHub Release body
  (`release.yml:179-196`).

## Entity 5: GitHub Release

A `gh release create` artifact tied to the `v${version}` git tag.

### Attributes

| Field | Type | Value (this cut) |
|-------|------|------------------|
| `tag_name` | git tag string | `v1.0.0` |
| `name` | display name | `argdown-2 v1.0.0` |
| `body` | markdown text | byte-equal to `CHANGELOG.md` `[1.0.0] - 2026-08-07` section body |
| `assets` | set of binary / text files | { `argdown-2-mcp-x86_64-apple-darwin`, `argdown-2-mcp-aarch64-apple-darwin`, `argdown-2-mcp-x86_64-unknown-linux-gnu`, `argdown-2-mcp-aarch64-unknown-linux-gnu`, `sha256sums.txt` } |
| `draft` | boolean | `false` |
| `prerelease` | boolean | `false` |
| `overwrite_files` | boolean | `true` (idempotent re-release) |

### Relationships

- One-to-one with `Release`.
- One-to-many with `Native MCP binary` (4 binaries) plus the
  `sha256sums.txt` artifact.

### Validation Rules

- `tag_name` matches `v${Release.version}`.
- `assets` contains exactly 5 entries (4 binaries + checksums),
  matching `dist/mcp-bin/`.
- `body` is byte-equal to the extracted CHANGELOG section.
- `prerelease: false` for `1.0.0`.

## Summary of cut-time invariants

After the cut, every entity above satisfies its validation rules.
The cut is "done" when:

1. All 6 version pins read `1.0.0`.
2. `CHANGELOG.md` has a `## [1.0.0] - 2026-08-07` section with
   preamble deleted, footer preserved.
3. `dist/mcp-bin/` has 4 binaries + `sha256sums.txt`.
4. The stdio probe exits 0 against the Linux binary.
5. The GitHub Release `v1.0.0` exists with 5 assets and a
   CHANGELOG-byte-equal body.
6. JSR lists `@casualtheorics/argdown-2@1.0.0` as a stable
   release.