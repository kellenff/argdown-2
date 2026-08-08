# Native MCP Binary Asset Bundle Contract

**Date**: 2026-08-07
**Spec**: [spec.md](../spec.md) — FR-009..FR-012, SC-002..SC-007
**Plan**: [plan.md](../plan.md)

## Contract

The `v1.0.0` GitHub Release MUST contain exactly five assets:
four `argdown-2-mcp-${target}` binaries (one per target triple)
and a `sha256sums.txt` covering all four. The Linux binary MUST
pass the stdio probe. Each binary's embedded server version MUST
report `1.0.0` on `initialize`.

## Target matrix

| Triple | Filename |
|--------|----------|
| `x86_64-apple-darwin` | `argdown-2-mcp-x86_64-apple-darwin` |
| `aarch64-apple-darwin` | `argdown-2-mcp-aarch64-apple-darwin` |
| `x86_64-unknown-linux-gnu` | `argdown-2-mcp-x86_64-unknown-linux-gnu` |
| `aarch64-unknown-linux-gnu` | `argdown-2-mcp-aarch64-unknown-linux-gnu` |

The matrix is fixed by `scripts/compile-mcp.sh:12-17` (canonical
source of truth) and re-asserted by `release.yml:170-175`.

## Compile invariants

Every binary in the bundle MUST be produced with the same
constraints:

- **Entry**: `src/mcp/cli.ts` (no bundler step —
  `compile-mcp.sh:8`).
- **Permissions**: `--allow-all` (path-mode MCP tools need
  filesystem I/O — `compile-mcp.sh:69`).
- **Deno release**: matches `scripts/deno-version` (CI:
  `setup-deno@v2` consumes this — `release.yml:45-46`;
  local: `compile-mcp.sh:30-33` enforces equality).
- **Lockfile**: bound to `deno.lock` (`compile-mcp.sh:71`).
- **Target**: exactly one of the four triples above.

## Checksums contract

`dist/mcp-bin/sha256sums.txt` MUST contain exactly four lines,
one per binary, in alphabetical target order, in the format:

```
<sha256>  argdown-2-mcp-<target>
```

Produced by `release.yml:164-177`; verified by
`scripts/argdown-2-mcp` `verify_checksum` (`scripts/argdown-2-mcp:32-56`),
which also accepts path-prefixed forms
(`scripts/argdown-2-mcp.test.sh:63-78`).

## Probe contract

The `x86_64-unknown-linux-gnu` binary MUST pass:

```bash
deno run -A scripts/probe-mcp-stdio.ts \
  ./dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu
```

The probe (`scripts/probe-mcp-stdio.ts`) MUST:

1. Connect to the binary over stdio using `@modelcontextprotocol/sdk`.
2. Send `initialize` (per MCP protocol).
3. Send `tools/list` and confirm the response contains exactly
   the 14 tool names from the v1 baseline contract:
   `add_argument`, `add_inference`, `add_relation`,
   `add_statement`, `add_solver`, `create_document`,
   `list_elements`, `remove_element`, `remove_import`,
   `remove_relation`, `set_import`, `solve`, `update_statement`,
   `validate`.
4. Exit 0.

This gate is wired into CI by `release.yml:160-162` and into the
post-compile local check by `deno task probe:mcp`.

## Embedded server version contract

Each binary MUST report `{ name: "argdown-2", version: "1.0.0" }`
in response to `initialize`. The constant lives at
`src/mcp/server.ts:21`.

## Validation procedure

```bash
# 1. Four binaries present.
ls dist/mcp-bin/argdown-2-mcp-* | wc -l
# Expected: 4.

# 2. sha256sums.txt has 4 lines, alphabetically ordered.
wc -l dist/mcp-bin/sha256sums.txt
# Expected: 4.

# 3. Linux binary passes the probe.
deno run -A scripts/probe-mcp-stdio.ts \
  ./dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu
# Expected: exit 0; tool list contains 14 names.

# 4. Each binary reports the right server version.
for bin in dist/mcp-bin/argdown-2-mcp-*; do
  deno run -A scripts/probe-mcp-stdio.ts "$bin"
done
# Expected: each prints "serverVersion=1.0.0" (probe prints
# `result.serverInfo.version` on every successful handshake).
```

## Failure mode

If any binary is missing, the probe fails, or `sha256sums.txt`
has the wrong line count, `release.yml:Compile MCP binaries` or
`release.yml:Probe Linux MCP binary` steps fail, blocking the
GitHub Release. CI surfaces the failure before any tag is
pushed.