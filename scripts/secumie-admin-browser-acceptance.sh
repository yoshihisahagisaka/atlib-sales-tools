#!/usr/bin/env bash
# Run the actual SECU:MIE admin browser acceptance tests inside the already built
# PDF-capable container, using only local mock endpoints and synthetic test data.
# No build, scan, Cloud Run changes, database access, email or outbound network.
set -Eeuo pipefail

IMAGE='asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging@sha256:810d3ddcf97cd009cdf73de77dfff008cd281d234ff49f9ae39a4dfdf86a384e'
IMAGE_SOURCE='808e99e275b73fbd25fb795b26115df144c78e1e'

[[ -d .git ]] || { echo '[STOP] Run in atlib-sales-tools repository'; exit 1; }
git merge-base --is-ancestor "$IMAGE_SOURCE" HEAD || {
  echo '[STOP] Image source is not an ancestor'; exit 1;
}
# Image contains source code and assets as of IMAGE_SOURCE; later changes
# may only modify tests/docs/scripts for this no-rebuild acceptance gate.
if ! git diff --quiet "$IMAGE_SOURCE" HEAD -- Dockerfile package.json package-lock.json src public; then
  echo '[STOP] Image source or public UI has changed since image was built'
  exit 1
fi

echo '=== 1. Verify built image ==='
gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet >/dev/null 2>&1
docker pull "$IMAGE"

echo '=== 2. Execute real browser tests in container (no network) ==='
# test/ is mounted read-only; the runtime already contains the matching
# public HTML, JS, fonts and Playwright package.  The test starts its own
# localhost mock HTTP server and MUST run Chromium (no silent SKIP).
set +e
OUTPUT="$(docker run --rm --network none --shm-size=512m \
  --mount "type=bind,source=$PWD/test,target=/app/test,readonly" \
  -e REQUIRE_BROWSER=1 \
  --entrypoint node "$IMAGE" \
  --test --test-reporter=tap /app/test/secumieWebAdmin.browser.test.cjs 2>&1)"
RC=$?
set -e
printf '%s\n' "$OUTPUT"
[[ "$RC" == 0 ]] || { echo '[STOP] Browser tests failed'; exit 1; }
printf '%s\n' "$OUTPUT" | grep -Eq '^# tests 4$' || {
  echo '[STOP] Expected four browser tests'; exit 1;
}
printf '%s\n' "$OUTPUT" | grep -Eq '^# pass 4$' || {
  echo '[STOP] All browser tests must pass'; exit 1;
}
printf '%s\n' "$OUTPUT" | grep -Eq '^# (skipped|skip) 0$' || {
  echo '[STOP] Skipped browser tests are not accepted'; exit 1;
}
echo '=== BROWSER ACCEPTANCE PASS: 4/4, SKIP 0 ==='
echo 'No Cloud Run traffic or databases were modified.'
