# GitHub Release Contract

**Date**: 2026-08-07
**Spec**: [spec.md](../spec.md) — FR-012..FR-013, SC-003..SC-004
**Plan**: [plan.md](../plan.md)

## Contract

The `v1.0.0` GitHub Release MUST exist, MUST be tied to git tag
`v1.0.0`, MUST be marked non-prerelease, and MUST carry exactly
five assets (four binaries + `sha256sums.txt`). Its body MUST be
byte-equal to the `[1.0.0] - 2026-08-07` section of
`CHANGELOG.md`.

## Release metadata

| Field | Value |
|-------|-------|
| `tag_name` | `v1.0.0` |
| `name` | `argdown-2 v1.0.0` |
| `draft` | `false` |
| `prerelease` | `false` |
| `generate_release_notes` | `false` |
| `overwrite_files` | `true` (idempotent re-release) |
| `fail_on_unmatched_files` | `true` |

Set by `release.yml:209-228`.

## Asset list

Exactly five assets, in any order:

1. `argdown-2-mcp-x86_64-apple-darwin`
2. `argdown-2-mcp-aarch64-apple-darwin`
3. `argdown-2-mcp-x86_64-unknown-linux-gnu`
4. `argdown-2-mcp-aarch64-unknown-linux-gnu`
5. `sha256sums.txt`

Pinned by `release.yml:216-221` and asserted by
`fail_on_unmatched_files: true` (`release.yml:222`).

## Body contract

The release body MUST be byte-equal to the output of:

```bash
awk -v v="1\.0\.0" '
  $0 ~ "^## \\[" v "\\]" { flag=1; next }
  /^## \[/ && flag { flag=0 }
  flag
' CHANGELOG.md
```

Source: `release.yml:179-196` (`Extract CHANGELOG notes` step).
Output: `release-notes.md`, consumed via
`body_path: ${{ steps.notes.outputs.notes_path }}`
(`release.yml:215`).

## Idempotency contract

The release workflow is **idempotent**: if a tag or release with
the same name already exists, `release.yml:198-207` deletes them
before re-creating. This means the cut can be retried safely
after a gate failure without leaving stale assets.

## Validation procedure

```bash
# 1. Tag exists.
git tag -l 'v1.0.0'
# Expected: v1.0.0

# 2. Release exists, non-prerelease.
gh release view v1.0.0 --json isPrerelease -q '.isPrerelease'
# Expected: false

# 3. Five assets.
gh release view v1.0.0 --json assets \
  -q '.assets | length'
# Expected: 5

# 4. Body byte-equal to extracted CHANGELOG section.
diff <(gh release view v1.0.0 --json body -q .body) \
     <(awk -v v='1\.0\.0' '
        $0 ~ "^## \\[" v "\\]" { flag=1; next }
        /^## \[/ && flag { flag=0 }
        flag
      ' CHANGELOG.md)
# Expected: no diff.
```

## Failure mode

If any of the above checks fail, the cut is incomplete. The
release workflow does not auto-recover; the engineer must
diagnose and re-run the cut (typically by amending the version
bump commit and pushing again).