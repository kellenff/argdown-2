#!/usr/bin/env bash
#
# verify-fixture.sh — run argdown-2 validate on every fixture's expected.argdown
#
# Usage:
#   skills/prose-to-argdown/scripts/verify-fixture.sh           # verify all fixtures
#   skills/prose-to-argdown/scripts/verify-fixture.sh all       # same
#   skills/prose-to-argdown/scripts/verify-fixture.sh <name>    # verify one fixture (e.g. lead-essay)
#
# Verification uses the locally-built argdown-2 CLI (yarn build && dist/cli.js).
# The script must be run from the argdown-2 repo root.

set -euo pipefail

# Auto-detect repo root from this script's location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
FIXTURES_DIR="${REPO_ROOT}/skills/prose-to-argdown/fixtures"
CLI="${REPO_ROOT}/dist/cli.js"

verify_one() {
  local name="$1"
  local fixture_dir="${FIXTURES_DIR}/${name}"
  local expected="${fixture_dir}/expected.argdown"

  if [[ ! -f "$expected" ]]; then
    echo "SKIP: ${name} (no expected.argdown — early-exit fixture)"
    return 0
  fi

  echo -n "  ${name} ... "
  if yarn node "$CLI" validate "$expected" >/dev/null 2>&1; then
    echo "PASS"
    return 0
  else
    echo "FAIL"
    yarn node "$CLI" validate "$expected" || true
    return 1
  fi
}

verify_all() {
  local failed=0
  for dir in "${FIXTURES_DIR}"/*/; do
    local name
    name=$(basename "$dir")
    if ! verify_one "$name"; then
      failed=$((failed + 1))
    fi
  done

  echo
  if [[ "$failed" -eq 0 ]]; then
    echo "All fixtures passed."
    return 0
  else
    echo "${failed} fixture(s) failed."
    return 1
  fi
}

case "${1:-all}" in
  all)
    verify_all
    ;;
  "")
    verify_all
    ;;
  *)
    verify_one "$1"
    ;;
esac
