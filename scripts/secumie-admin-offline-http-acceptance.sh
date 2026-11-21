#!/usr/bin/env bash
# Offline HTTP acceptance against the existing immutable PDF-capable image.
# No builds, vulnerability scans, Cloud Run deployment, DB, SMTP or external URLs.
set -Eeuo pipefail

IMAGE='asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging@sha256:810d3ddcf97cd009cdf73de77dfff008cd281d234ff49f9ae39a4dfdf86a384e'
IMAGE_SOURCE='808e99e275b73fbd25fb795b26115df144c78e1e'
RESULT="$HOME/secumie-admin-http-acceptance-result.txt"
printf 'RUNNING\n' > "$RESULT"

[[ -d .git ]] || { echo '[STOP] Run from the PR #51 repository checkout'; exit 1; }
git merge-base --is-ancestor "$IMAGE_SOURCE" HEAD || { echo '[STOP] Image source differs'; exit 1; }
# Only docs/scripts/tests may be changed since this exact runtime was built.
if ! git diff --quiet "$IMAGE_SOURCE" HEAD -- Dockerfile package.json package-lock.json src public; then
  echo '[STOP] Runtime or public UI changed since image build'; exit 1
fi
[[ -z "$(git status --porcelain)" ]] || { echo '[STOP] Dirty working tree'; exit 1; }

echo '=== Pull pinned immutable image (no rebuild) ==='
gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet >/dev/null 2>&1
docker pull "$IMAGE"

echo '=== Offline real HTTP test: auth gate / WSC engine / Chromium PDF ==='
set +e
OUTPUT="$(docker run --rm --network none --shm-size=512m \
  --mount "type=bind,source=$PWD/test,target=/app/test,readonly" \
  --entrypoint node "$IMAGE" \
  --test --test-reporter=tap /app/test/secumieWebAdmin.http.acceptance.cjs 2>&1)"
RC=$?
set -e
printf '%s\n' "$OUTPUT"
if [[ "$RC" != 0 ]]; then
  printf 'HTTP_ACCEPTANCE_FAILED\n' >> "$RESULT"
  echo '[STOP] HTTP integration tests failed'
  exit 1
fi

printf '%s\n' "$OUTPUT" | grep -Eq '^# tests 6$' || { echo '[STOP] Must run 6 tests'; exit 1; }
printf '%s\n' "$OUTPUT" | grep -Eq '^# pass 6$' || { echo '[STOP] All 6 must pass'; exit 1; }
printf '%s\n' "$OUTPUT" | grep -Eq '^# fail 0$' || { echo '[STOP] No failures allowed'; exit 1; }
printf '%s\n' "$OUTPUT" | grep -Eq '^# (skipped|skip) 0$' || { echo '[STOP] No SKIP allowed'; exit 1; }

printf 'HTTP_ACCEPTANCE_PASS\nTESTS=6\nPASS=6\nSKIP=0\n' >> "$RESULT"
echo '=== HTTP ACCEPTANCE PASS: 6/6, SKIP 0 ==='
echo 'No actual Google OAuth callback, no external diagnosis; Cloud Run and DB unchanged.'
