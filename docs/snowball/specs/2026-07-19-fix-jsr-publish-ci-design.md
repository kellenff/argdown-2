# Fix JSR Publish CI

**Date:** 2026-07-19  
**Status:** Approved  
**Scope:** Repair failing `release.yml` JSR publish jobs after the Deno/JSR cutover, and restore a PR-time publish dry-run via `deno publish --dry-run`.  
**Related:** `docs/snowball/specs/2026-07-19-deno-native-package-design.md` §5 (CI and release data flow).

---

## 1. Context and goals

Merge of the Deno-native package cutover rewrote `.github/workflows/release.yml` to publish JSR via OIDC. The first `main` run failed:

1. **Dev JSR** (`publish-jsr-dev`): `deno publish --set-version "${BASE}-dev.${STAMP}"` failed because JSR requires the version in `deno.json` to already match the published version (`deno#27428` / JSR tarball check). `--set-version` alone is insufficient.
2. **Stable JSR**: `deno publish` aborted with “uncommitted changes” because the job had written `release-notes.md` into the working tree.

GitHub Release binary assets for `v0.2.0-alpha3` succeeded; only JSR publish failed.

PR `ci.yml` lost the old npm-pack dry-run and has no JSR dry-run yet. `deno publish --dry-run` is supported and performs publish validation without uploading.

**Goals:**

- Every merge to `main` successfully publishes a timestamped JSR `*-dev.*` prerelease.
- Version-bump (or dispatch) stable `deno publish` succeeds even when CI creates local files.
- PRs run `deno publish --dry-run` so publish-contract breakage is caught before merge.

**Non-goals:**

- Extracting publish logic into shared shell scripts.
- Simulating GitHub Release / binary matrix on PRs.
- Docs/CHANGELOG updates beyond what implementation needs.
- Automatically re-publishing the already-cut `v0.2.0-alpha3` stable JSR (operator can `workflow_dispatch` after this lands).

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Approach | Minimal patch to existing workflows only |
| Continuous `*-dev.*` | Keep; patch `deno.json` `version` in-job, then publish |
| `--set-version` | Do not use for continuous publish |
| Dirty tree | `deno publish --allow-dirty` for both real publish paths |
| PR dry-run | `deno publish --dry-run` only (no Release simulation) |
| Files touched | `.github/workflows/release.yml`, `.github/workflows/ci.yml` |

---

## 3. Release workflow (`release.yml`)

### 3.1 Dev JSR (`publish-jsr-dev`)

Replace `deno publish --set-version "$VER"` with:

1. `BASE="$(jq -r .version deno.json)"`
2. `STAMP="$(date -u +%Y%m%d%H%M%S)"`
3. `VER="${BASE}-dev.${STAMP}"`
4. Rewrite `deno.json` `version` to `$VER` with `jq` (working tree only; never commit)
5. `deno publish --allow-dirty`

Failure still fails the workflow (unchanged design intent).

### 3.2 Stable JSR

Change the publish invocation to `deno publish --allow-dirty` (still capture stdout/stderr and treat “already published” as success).

No change to version-bump detection, launcher pin check, binary compile/probe/checksums, CHANGELOG extraction, or GitHub Release creation.

---

## 4. PR CI (`ci.yml`)

Add job `dry-run-publish`:

- `needs: [quality]` — run only after Deno quality gates pass
- Checkout + `denoland/setup-deno@v2` with `scripts/deno-version`
- `deno publish --dry-run`
- Optional short GitHub step summary (package name/version)

Permissions stay `contents: read`. No `id-token: write` required for dry-run.

---

## 5. Error handling

| Condition | Behavior |
|---|---|
| Dev publish fails for any reason | Fail job / workflow |
| Stable publish: version already on JSR | Success (existing handling) |
| Stable publish: dirty tree | Allowed via `--allow-dirty` |
| PR dry-run fails | Fail CI; block merge |
| Timestamp collision on same UTC second | Fail; re-run (unchanged) |

---

## 6. Success criteria

1. `publish-jsr-dev` can publish `${BASE}-dev.${STAMP}` without JSR version-mismatch errors.
2. Stable JSR publish succeeds when `release-notes.md` (or similar CI dirt) is present.
3. PR CI runs `deno publish --dry-run` after quality gates.
4. No new scripts, package manifests, or docs required for the fix.
