# Version-Pin Parity Contract

**Date**: 2026-08-07
**Spec**: [spec.md](../spec.md) — FR-001..FR-006, SC-005
**Plan**: [plan.md](../plan.md)

## Contract

Every version-pin location in the repository MUST read the
**exact same SemVer string** after the v1 cut. The canonical
source of truth is `deno.json#version`; every other pin is a
mirror.

## Pin Locations

| Pin | File | Format |
|-----|------|--------|
| 1 | `deno.json:3` — `"version": "1.0.0"` | JSON string |
| 2 | `scripts/argdown-2-mcp.version:1` — `1.0.0\n` | bare string, trailing newline |
| 3 | `plugins/argdown-2/scripts/argdown-2-mcp.version:1` — `1.0.0\n` | bare string, trailing newline; **byte-equivalent** to pin 2 |
| 4 | `plugins/argdown-2/.claude-plugin/plugin.json:4` — `"version": "1.0.0"` | JSON string |
| 5 | `package.json:3` — `"version": "1.0.0"` | JSON string |
| 6 | `src/mcp/server.ts:21` — `{ name: "argdown-2", version: "1.0.0" }` | TypeScript object literal |

## Enforced by

- `src/claude-plugin.test.ts:43-91`
  - `expect(manifest.version).toBe(denoVersion)` (pin 4 == pin 1)
  - `expect(launcherVersion).toBe(denoVersion)` (pin 2 == pin 1)
  - byte equality of pin 3 vs pin 2 launcher pin file
- `src/pi-package.test.ts:43-59`
  - `expect(pkg.version).toBe(denoVersion)` (pin 5 == pin 1)

Pin 6 is not parity-tested but is observable via the MCP
`initialize` handshake (the server returns
`{ name: "argdown-2", version: "1.0.0" }`).

## Validation procedure

```bash
# 1. All pins read the same value.
for f in deno.json \
         scripts/argdown-2-mcp.version \
         plugins/argdown-2/scripts/argdown-2-mcp.version \
         plugins/argdown-2/.claude-plugin/plugin.json \
         package.json; do
  case "$f" in
    *.json) jq -r '.version // .' "$f" ;;
    *)      tr -d '[:space:]' < "$f" ;;
  esac
done | sort -u
# Expected output: exactly one line, "1.0.0".

# 2. Plugin launcher pin is byte-equivalent to canonical.
diff scripts/argdown-2-mcp.version \
     plugins/argdown-2/scripts/argdown-2-mcp.version
# Expected: no diff.

# 3. Plugin launcher script is byte-equivalent to canonical.
diff scripts/argdown-2-mcp \
     plugins/argdown-2/scripts/argdown-2-mcp
# Expected: no diff.

# 4. Embedded MCP server version reads 1.0.0.
grep -n 'version: "1.0.0"' src/mcp/server.ts
# Expected: one match.
```

## Failure mode

If any pin drifts, `deno task test` fails with a parity assertion
error from `src/claude-plugin.test.ts` or `src/pi-package.test.ts`,
and `release.yml` refuses to push the stable release at the
`Verify launcher pin matches deno.json version` gate
(`release.yml:144-154`).