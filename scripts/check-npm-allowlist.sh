#!/usr/bin/env bash
# Fail if deno.json imports any npm: specifier outside the allowlist.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DENO_JSON="${1:-$ROOT/deno.json}"

ALLOWED=(
  'npm:zod@'
  'npm:@modelcontextprotocol/sdk@'
  'npm:/@modelcontextprotocol/sdk@'
)

FOUND="$(grep -oE 'npm:[^"[:space:]]+' "$DENO_JSON" | sort -u || true)"
if [[ -z "$FOUND" ]]; then
  echo "error: expected npm: allowlist entries in deno.json" >&2
  exit 1
fi
while IFS= read -r spec; do
  [[ -z "$spec" ]] && continue
  ok=false
  for prefix in "${ALLOWED[@]}"; do
    case "$spec" in
      "$prefix"*) ok=true; break ;;
    esac
  done
  if [[ "$ok" != true ]]; then
    echo "error: npm: specifier not allowlisted: $spec" >&2
    exit 1
  fi
done <<< "$FOUND"
COUNT="$(printf '%s\n' "$FOUND" | grep -c . || true)"
echo "check-npm-allowlist: ok (${COUNT} specifier(s))"
