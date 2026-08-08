# JSR Stable Publish Contract

**Date**: 2026-08-07
**Spec**: [spec.md](../spec.md) — FR-013, SC-001
**Plan**: [plan.md](../plan.md)

## Contract

JSR MUST list `@casualtheorics/argdown-2@1.0.0` as a stable
(non-prerelease) version after the cut, with no `-dev.*` or
`-alpha.*` suffix on the version string.

## Mechanism

JSR is published via `deno publish`, invoked at the end of
`release.yml:stable-release` (`release.yml:230-247`). OIDC trust
is configured by the `id-token: write` permission
(`release.yml:32`).

### Version handling

- `deno.json#version` is the source of truth (`release.yml:118`).
- For dev publishes, the workflow patches
  `deno.json#version` to `${base}-dev.${utcTimestamp}` in-job
  (`release.yml:81-93`); for stable publishes, no patching is
  performed — the version is `1.0.0` as-is.
- JSR rejects mismatched publishes (deno#27428 referenced at
  `release.yml:88-89`); the workflow handles this by patching in
  memory only for dev publishes.

### "Already published" tolerance

`release.yml:Publish stable JSR` (`release.yml:230-247`) treats
`already published` as success:

```bash
if echo "$OUT" | grep -qiE 'already (exists|published)|Version already'; then
  echo "Stable JSR version already published; skipping"
  exit 0
fi
```

Any other publish error is a release blocker.

## Validation procedure

```bash
# 1. Version is listed and stable.
curl -s 'https://jsr.io/@casualtheorics/argdown-2/meta.json' \
  | jq '.versions["1.0.0"] | { version, yanked }'
# Expected: { "version": "1.0.0", "yanked": false }

# 2. Resolved dependency in a fresh Deno project.
mkdir /tmp/jsr-v1-check && cd /tmp/jsr-v1-check
deno init --quiet
deno add jsr:@casualtheorics/argdown-2
cat deno.json | jq '.imports."@casualtheorics/argdown-2"'
# Expected: "jsr:@casualtheorics/argdown-2@^1.0.0"

cat deno.lock | jq '.packages."jsr:@casualtheorics/argdown-2".version'
# Expected: "1.0.0"

# 3. Stable publish (no prerelease suffix in the JSR metadata).
curl -s 'https://jsr.io/@casualtheorics/argdown-2/1.0.0/meta.json' \
  | jq '. | { version, manifest: .manifest | keys }'
# Expected: "version": "1.0.0", manifest keys include "deno.json"
```

## Failure mode

If `deno publish` returns a non-`already published` error, the
release workflow exits non-zero and the GitHub Release may have
already been created (the JSR step is the last step in
`release.yml:stable-release`). The engineer must diagnose the
publish failure, fix the underlying cause (often a JSR rate limit
or a denied OIDC trust), and re-run the workflow.

Note: a re-run after JSR succeeds but before the GitHub Release
is published will retry both; an `already published` response on
the retry is treated as success.