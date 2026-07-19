# Fix JSR Publish CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make continuous and stable JSR publishes succeed on `main`, and add a PR-time `deno publish --dry-run` gate.

**Architecture:** Minimal patches to the Deno-era workflows on `origin/main`. Continuous `*-dev.*` publish rewrites `deno.json` `version` in the job working tree (never committed) then runs `deno publish --allow-dirty`. Stable publish adds `--allow-dirty` so CI-generated `release-notes.md` does not abort. PR CI gains a job that only runs `deno publish --dry-run` after quality gates.

**Tech Stack:** GitHub Actions, Deno 2.x (`scripts/deno-version`), JSR OIDC (`id-token: write`), `jq`

**Spec:** `docs/snowball/specs/2026-07-19-fix-jsr-publish-ci-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `.github/workflows/release.yml` | Fix `publish-jsr-dev` version rewrite + `--allow-dirty`; fix stable `deno publish --allow-dirty` |
| `.github/workflows/ci.yml` | Add `dry-run-publish` job (`needs: [quality]`) running `deno publish --dry-run` |

No new scripts. No `deno.json` / docs changes required for the fix.

**Branch base:** Start from `origin/main` (Deno-native workflows already landed). Rebase or cherry-pick the design-spec commit if it is only on a divergent local `main`.

---

### Task 1: Sync workspace to `origin/main` and verify dry-run locally

**Files:**
- None (git + local Deno only)

- [ ] **Step 1: Update the working tree to match remote main**

```bash
git fetch origin main
git checkout -B fix/jsr-publish-ci origin/main
# If the design spec commit is missing here, cherry-pick it:
# git cherry-pick 9c97ad9
```

Expected: branch `fix/jsr-publish-ci` at `origin/main` tip; `.github/workflows/release.yml` contains `deno publish --set-version`; no `package.json`.

- [ ] **Step 2: Confirm `deno publish --dry-run` works on a clean tree**

```bash
deno --version   # should match or exceed scripts/deno-version (2.4.5+)
deno publish --dry-run
```

Expected: exits 0 (or prompts about auth but completes validations). Must not fail on package metadata. If it fails for unrelated package issues, stop and report — do not paper over with workflow changes.

- [ ] **Step 3: Commit branch tip only if cherry-pick added the spec**

```bash
git status
# If cherry-pick created a commit, leave it. Otherwise no commit this task.
```

---

### Task 2: Fix continuous JSR `*-dev.*` publish in `release.yml`

**Files:**
- Modify: `.github/workflows/release.yml` (job `publish-jsr-dev`, step `Publish timestamped dev version`)

- [ ] **Step 1: Replace the publish step body**

Find the step named `Publish timestamped dev version` (currently ends with `deno publish --set-version "$VER"`). Replace the entire `run:` block with:

```yaml
      - name: Publish timestamped dev version
        run: |
          set -euo pipefail
          BASE="$(jq -r .version deno.json)"
          STAMP="$(date -u +%Y%m%d%H%M%S)"
          VER="${BASE}-dev.${STAMP}"
          echo "Publishing jsr dev version ${VER}"
          # JSR requires deno.json version to match the published version;
          # --set-version alone is rejected (deno#27428). Patch in-job only.
          tmp="$(mktemp)"
          jq --arg v "$VER" '.version = $v' deno.json > "$tmp"
          mv "$tmp" deno.json
          deno publish --allow-dirty
```

Do not change job permissions (`contents: read`, `id-token: write`) or the preceding checkout/setup-deno steps.

- [ ] **Step 2: Locally simulate the rewrite + dry-run (no real publish)**

```bash
set -euo pipefail
cp deno.json /tmp/deno.json.bak
BASE="$(jq -r .version deno.json)"
STAMP="$(date -u +%Y%m%d%H%M%S)"
VER="${BASE}-dev.${STAMP}"
tmp="$(mktemp)"
jq --arg v "$VER" '.version = $v' deno.json > "$tmp"
mv "$tmp" deno.json
deno publish --dry-run --allow-dirty
mv /tmp/deno.json.bak deno.json
```

Expected: dry-run succeeds while `deno.json` temporarily shows `$VER`; after restore, `git status` shows a clean `deno.json` (or only unrelated dirt).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "$(cat <<'EOF'
fix(ci): patch deno.json version for JSR *-dev.* publishes

JSR rejects --set-version when deno.json still has the base version; rewrite in-job and publish with --allow-dirty.
EOF
)"
```

---

### Task 3: Fix stable JSR publish dirty-tree abort

**Files:**
- Modify: `.github/workflows/release.yml` (step `Publish stable JSR`)

- [ ] **Step 1: Add `--allow-dirty` to stable publish**

Replace the `Publish stable JSR` step `run:` block with:

```yaml
      - name: Publish stable JSR
        if: steps.ver.outputs.changed == 'true'
        run: |
          set -euo pipefail
          # release-notes.md (and similar CI dirt) must not abort publish.
          # deno publish errors if version exists — treat "already published" as success.
          set +e
          OUT="$(deno publish --allow-dirty 2>&1)"
          CODE=$?
          set -e
          echo "$OUT"
          if [ "$CODE" -eq 0 ]; then
            exit 0
          fi
          if echo "$OUT" | grep -qiE 'already (exists|published)|Version already'; then
            echo "Stable JSR version already published; skipping"
            exit 0
          fi
          exit "$CODE"
```

- [ ] **Step 2: Sanity-check YAML still has both fixes**

```bash
rg -n "set-version|allow-dirty|Publishing jsr dev" .github/workflows/release.yml
```

Expected:
- No remaining `deno publish --set-version`
- At least two `--allow-dirty` occurrences (dev + stable)
- Dev step still echoes `Publishing jsr dev version`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "$(cat <<'EOF'
fix(ci): allow dirty tree for stable JSR publish

CI writes release-notes.md before deno publish; --allow-dirty prevents aborting on that uncommitted file.
EOF
)"
```

---

### Task 4: Add PR `deno publish --dry-run` job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Append the dry-run job after `quality`**

After the `quality` job (end of file), append:

```yaml

  dry-run-publish:
    name: Dry-run JSR publish
    needs: [quality]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: denoland/setup-deno@v2
        with:
          deno-version-file: scripts/deno-version

      - name: Dry-run JSR publish
        run: |
          set -euo pipefail
          NAME="$(jq -r .name deno.json)"
          VERSION="$(jq -r .version deno.json)"
          {
            echo "## Dry-run JSR publish"
            echo
            echo "- **Package:** \`${NAME}@${VERSION}\`"
            echo "- **Command:** \`deno publish --dry-run\`"
          } >> "$GITHUB_STEP_SUMMARY"
          deno publish --dry-run
```

Keep top-level `permissions: contents: read`. Do not add `id-token: write` for this job.

- [ ] **Step 2: Validate workflow parses**

```bash
# Prefer actionlint if installed; otherwise Python YAML load:
python3 -c 'import yaml,sys; yaml.safe_load(open(".github/workflows/ci.yml")); yaml.safe_load(open(".github/workflows/release.yml")); print("ok")'
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: dry-run JSR publish on pull requests

Catch publish-contract failures before merge without uploading to JSR.
EOF
)"
```

---

### Task 5: Final verification and handoff notes

**Files:**
- None

- [ ] **Step 1: Diff against origin/main**

```bash
git fetch origin main
git log --oneline origin/main..HEAD
git diff origin/main...HEAD -- .github/workflows/
```

Expected: only `ci.yml` and `release.yml` changed (plus optional design-spec cherry-pick). Diff shows version rewrite, `--allow-dirty` on both publish paths, and `dry-run-publish` job.

- [ ] **Step 2: Operator follow-up (do not automate in this plan)**

After merge to `main`, if stable `@casualtheorics/argdown-2@0.2.0-alpha3` is still unpublished on JSR, re-run the release workflow via `workflow_dispatch` (empty version override) or a no-op that still hits the stable path — GitHub Release already exists and is idempotent.

- [ ] **Step 3: No further commit unless verification found drift**

If verification is clean, stop. Open a PR when the operator asks.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Patch `deno.json` for `*-dev.*` then `--allow-dirty` | Task 2 |
| Stable `deno publish --allow-dirty` + already-published handling | Task 3 |
| PR `deno publish --dry-run` after quality | Task 4 |
| Minimal patch / workflows only | Tasks 2–4 |
| Out of scope: scripts, Release dry-run, auto re-publish | Task 5 note only |
