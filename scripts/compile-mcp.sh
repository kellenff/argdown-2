#!/usr/bin/env bash
# Compile src/mcp/cli.ts into native binaries under dist/mcp-bin/.
# Usage: scripts/compile-mcp.sh [--all]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DENO_VERSION="$(tr -d '[:space:]' < "$ROOT/scripts/deno-version")"
ENTRY="$ROOT/src/mcp/cli.ts"
OUT_DIR="$ROOT/dist/mcp-bin"
LOCKFILE="$ROOT/deno.lock"

TARGETS_ALL=(
  x86_64-apple-darwin
  aarch64-apple-darwin
  x86_64-unknown-linux-gnu
  aarch64-unknown-linux-gnu
)

if [[ ! -f "$ENTRY" ]]; then
  echo "error: missing $ENTRY" >&2
  exit 1
fi

if ! command -v deno >/dev/null 2>&1; then
  echo "error: deno not on PATH (need $DENO_VERSION)" >&2
  exit 1
fi

INSTALLED="$(deno --version | head -n1 | awk '{print $2}')"
if [[ "$INSTALLED" != "$DENO_VERSION" ]]; then
  echo "error: deno $INSTALLED on PATH; pin is $DENO_VERSION" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

host_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os:$arch" in
    Darwin:x86_64) echo x86_64-apple-darwin ;;
    Darwin:arm64) echo aarch64-apple-darwin ;;
    Linux:x86_64) echo x86_64-unknown-linux-gnu ;;
    Linux:aarch64|Linux:arm64) echo aarch64-unknown-linux-gnu ;;
    *)
      echo "error: unsupported host for default compile: $os $arch" >&2
      exit 1
      ;;
  esac
}

TARGETS=()
if [[ "$#" -gt 1 || ( "$#" -eq 1 && "${1:-}" != "--all" ) ]]; then
  echo "Usage: scripts/compile-mcp.sh [--all]" >&2
  exit 2
elif [[ "${1:-}" == "--all" ]]; then
  TARGETS=("${TARGETS_ALL[@]}")
else
  TARGETS=("$(host_target)")
fi

cd "$ROOT"
for target in "${TARGETS[@]}"; do
  out="$OUT_DIR/argdown-2-mcp-${target}"
  echo "deno compile → $out (entry=$ENTRY)"
  # MCP needs filesystem I/O for path-mode tools; allow-all keeps v1 simple.
  deno compile \
    --allow-all \
    --frozen \
    --lock "$LOCKFILE" \
    --node-modules-dir=auto \
    --target "$target" \
    --output "$out" \
    "$ENTRY"
done

echo "Wrote:"
ls -la "$OUT_DIR"/argdown-2-mcp-*
