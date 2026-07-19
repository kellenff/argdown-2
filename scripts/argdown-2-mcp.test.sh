#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAUNCHER="$ROOT/scripts/argdown-2-mcp"
VERSION="$(tr -d '[:space:]' < "$ROOT/scripts/argdown-2-mcp.version")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAKE="$TMP/fake-mcp"
cat > "$FAKE" <<'EOF'
#!/usr/bin/env bash
exec cat >/dev/null
EOF
chmod +x "$FAKE"

ARGDOWN2_MCP_BIN="$FAKE" "$LAUNCHER" </dev/null
echo "ok: ARGDOWN2_MCP_BIN"

if ARGDOWN2_MCP_UNAME_S=Windows_NT "$LAUNCHER" </dev/null 2>"$TMP/err"; then
  echo "error: expected Windows to fail" >&2
  exit 1
fi
grep -qi 'not supported' "$TMP/err"
echo "ok: unsupported OS"

CACHE="$TMP/cache/argdown-2/mcp/$VERSION"
mkdir -p "$CACHE"
TARGET=x86_64-unknown-linux-gnu
cp "$FAKE" "$CACHE/argdown-2-mcp-$TARGET"
(
  cd "$CACHE"
  if command -v sha256sum >/dev/null; then
    sha256sum "argdown-2-mcp-$TARGET" > sha256sums.txt
  else
    shasum -a 256 "argdown-2-mcp-$TARGET" > sha256sums.txt
  fi
)
XDG_CACHE_HOME="$TMP/cache" \
  ARGDOWN2_MCP_UNAME_S=Linux \
  ARGDOWN2_MCP_UNAME_M=x86_64 \
  "$LAUNCHER" </dev/null
echo "ok: cache hit"

echo 'deadbeef  argdown-2-mcp-x86_64-unknown-linux-gnu' > "$CACHE/sha256sums.txt"
if XDG_CACHE_HOME="$TMP/cache" \
  ARGDOWN2_MCP_UNAME_S=Linux \
  ARGDOWN2_MCP_UNAME_M=x86_64 \
  "$LAUNCHER" </dev/null 2>"$TMP/err2"; then
  echo "error: expected checksum failure" >&2
  exit 1
fi
grep -qi 'checksum' "$TMP/err2"
if [[ -e "$CACHE/argdown-2-mcp-$TARGET" ]]; then
  echo "error: expected bad cached binary to be deleted" >&2
  exit 1
fi
if [[ -e "$CACHE/sha256sums.txt" ]]; then
  echo "error: expected bad cached checksums to be deleted" >&2
  exit 1
fi
echo "ok: checksum mismatch"

echo "argdown-2-mcp.test.sh: all ok"
