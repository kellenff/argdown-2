#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTRY="$ROOT/src/mcp/cli.ts"
DENO_VERSION="$(tr -d '[:space:]' < "$ROOT/scripts/deno-version")"

if [[ ! -f "$ENTRY" ]]; then
  echo "error: missing $ENTRY" >&2
  exit 1
fi

# Landmine grep on MCP sources (not a bundled dist file).
if grep -REn "process\.binding\(|require\.resolve\(|__dirname|__filename" "$ROOT/src/mcp" --include='*.ts'; then
  echo "error: landmine pattern found under src/mcp (see matches above)" >&2
  exit 1
fi

if ! command -v deno >/dev/null 2>&1; then
  echo "error: deno not on PATH (need $DENO_VERSION)" >&2
  exit 1
fi

cd "$ROOT"
# IMPORTANT: use frozen lock like compile script.
deno check --frozen --lock "$ROOT/deno.lock" --node-modules-dir=auto "$ENTRY"
echo "check-mcp-deno: ok"
