#!/usr/bin/env bash
#
# run-skill.sh — print a fixture's input prose to stdout, for the agent to ingest.
#
# Usage:
#   skills/prose-to-argdown/scripts/run-skill.sh <fixture-name>     # print input.txt
#
# Then in your agent host, load the prose-to-argdown skill and ask it to
# extract the claims from the prose shown on stdin.

set -euo pipefail

name="${1:?Usage: run-skill.sh <fixture-name>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
input="${REPO_ROOT}/skills/prose-to-argdown/fixtures/${name}/input.txt"

if [[ ! -f "$input" ]]; then
  echo "Fixture not found: $input" >&2
  exit 1
fi

cat "$input"
