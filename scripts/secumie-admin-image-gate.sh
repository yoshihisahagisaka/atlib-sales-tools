#!/usr/bin/env bash
# SECU:MIE Web PR #51: build and scan only, no Cloud Run deploy.
set -Eeuo pipefail

PROJECT='msp-zabbix'
REGION='asia-northeast1'
BRANCH='feat/secumie-web-admin-interim-20261119'
IMAGE_BASE="asia-northeast1-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/sales-tools-staging"
RESULT="$HOME/secumie-admin-image-result.txt"

# Persist a terminal result also for intentional fail-closed preflight exits.
on_exit() {
  local rc=$?
  if (( rc != 0 )); then
    if ! grep -Eq '^(PREFLIGHT_NO_GO|SECURITY_NO_GO|ERROR)$' "$RESULT" 2>/dev/null; then
      printf 'ERROR\nEXIT=%s\n' "$rc" >> "$RESULT"
    fi
    echo "[STOP] Image gate exit $rc" >&2
  fi
}
trap on_exit EXIT
stop_preflight() {
  printf 'PREFLIGHT_NO_GO\nREASON=%s\n' "$1" >> "$RESULT"
  echo "[STOP] $1" >&2
  exit 1
}
printf 'RUNNING\n' > "$RESULT"

[[ -d .git ]] || { echo '[STOP] Run from clean repository clone'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo '[STOP] Git working tree is dirty'; exit 1; }
SOURCE_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git ls-remote origin "refs/heads/$BRANCH" | awk '{print $1}')"
[[ "$SOURCE_SHA" == "$REMOTE_SHA" ]] || { echo '[STOP] Remote HEAD mismatch'; exit 1; }
git merge-base --is-ancestor 774595ae7c3998ebe9d655076f2d3e086c6e457a HEAD || {
  echo '[STOP] Dependency fix commit not present'; exit 1;
}

echo "SOURCE_SHA=$SOURCE_SHA"
echo '=== 0. Simulate Xvfb purge against previously verified image ==='
PRIOR_IMAGE='asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging@sha256:810d3ddcf97cd009cdf73de77dfff008cd281d234ff49f9ae39a4dfdf86a384e'
gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet >/dev/null 2>&1
if ! docker image inspect "$PRIOR_IMAGE" >/dev/null 2>&1; then
  docker pull "$PRIOR_IMAGE" >/dev/null
fi
PURGE_PLAN="$(docker run --rm --network none --read-only --user 0 \
  --entrypoint /usr/bin/apt-get "$PRIOR_IMAGE" \
  -s purge --auto-remove xvfb xserver-common)"
# APT purge dry runs print Purg for purge and Remv for removal.
REMOVALS="$(printf '%s\n' "$PURGE_PLAN" | awk '$1 == "Purg" || $1 == "Remv" {print $2}')"
echo 'APT simulated removal packages:'
if [[ -z "$REMOVALS" ]]; then
  printf '%s\n' "$PURGE_PLAN" | tail -n 40
  stop_preflight 'APT did not report any Purg/Remv operations'
fi
printf '%s\n' "$REMOVALS"
for target in xvfb xserver-common; do
  if ! printf '%s\n' "$REMOVALS" | grep -Eq "^$target(:[a-z0-9]+)?$"; then
    stop_preflight "APT plan did not remove expected package: $target"
  fi
done
for protected in libc6 nodejs libnss3 libssl3t64 libexpat1 fontconfig fonts-noto-cjk libgbm1 libglib2.0-0t64 libasound2t64 libcups2t64 ca-certificates libx11-6 libxcomposite1 libxdamage1 libxrandr2; do
  if printf '%s\n' "$REMOVALS" | grep -Eq "^$protected(:[a-z0-9]+)?$"; then
    stop_preflight "APT would remove a required runtime dependency: $protected"
  fi
done
echo 'APT simulation PASS (read-only).'

echo '=== 1. Build candidate image ==='
IMAGE="$IMAGE_BASE:smw-admin-$(printf '%s' "$SOURCE_SHA" | cut -c1-10)-$(date -u +%Y%m%d%H%M%S)"
gcloud builds submit . \
  --project="$PROJECT" \
  --region="$REGION" \
  --tag="$IMAGE" \
  --timeout=1800s \
  --quiet

IMMUTABLE="$(gcloud artifacts docker images describe "$IMAGE" \
  --project="$PROJECT" --format=json |
  jq -er '.image_summary.fully_qualified_digest')"
echo "IMAGE=$IMMUTABLE"
printf 'BUILD_PASS\nGIT=%s\nIMAGE=%s\n' "$SOURCE_SHA" "$IMMUTABLE" > "$RESULT"

echo '=== 2. Pull immutable image ==='
gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet >/dev/null 2>&1
docker pull "$IMMUTABLE"
LOCAL="secumie-admin-pr51-$(printf '%s' "$SOURCE_SHA" | cut -c1-10):scan"
docker tag "$IMMUTABLE" "$LOCAL"

echo '=== 3. Synthetic Japanese PDF smoke in final container (offline) ==='
docker run --rm --network none --shm-size=512m \
  --entrypoint node "$IMMUTABLE" -e '
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><body><h1>セキュリティ診断</h1><p>合成データのPDF検証です。</p></body></html>");
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    if (pdf.length < 1024 || pdf.subarray(0, 5).toString() !== "%PDF-") {
      throw new Error("Generated PDF was invalid");
    }
    console.log("PDF_SMOKE_PASS bytes=" + pdf.length);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
'
echo 'PDF_SMOKE_PASS' >> "$RESULT"

echo '=== 4. Browser UI acceptance (4/4 required) ==='
BROWSER_OUTPUT="$(docker run --rm --network none --shm-size=512m \
  --mount "type=bind,source=$PWD/test,target=/app/test,readonly" \
  -e REQUIRE_BROWSER=1 \
  --entrypoint node "$IMMUTABLE" \
  --test --test-reporter=tap /app/test/secumieWebAdmin.browser.test.cjs)"
printf '%s\n' "$BROWSER_OUTPUT"
printf '%s\n' "$BROWSER_OUTPUT" | grep -Eq '^# tests 4$' || { echo '[STOP] Browser count != 4'; exit 1; }
printf '%s\n' "$BROWSER_OUTPUT" | grep -Eq '^# pass 4$' || { echo '[STOP] Browser acceptance failed'; exit 1; }
printf '%s\n' "$BROWSER_OUTPUT" | grep -Eq '^# (skipped|skip) 0$' || { echo '[STOP] Browser SKIP not allowed'; exit 1; }
printf 'BROWSER_PASS=4/4\n' >> "$RESULT"

echo '=== 5. Offline HTTP WSC PDF acceptance (6/6 required) ==='
HTTP_OUTPUT="$(docker run --rm --network none --shm-size=512m \
  --mount "type=bind,source=$PWD/test,target=/app/test,readonly" \
  --entrypoint node "$IMMUTABLE" \
  --test --test-reporter=tap /app/test/secumieWebAdmin.http.acceptance.cjs)"
printf '%s\n' "$HTTP_OUTPUT"
printf '%s\n' "$HTTP_OUTPUT" | grep -Eq '^# tests 6$' || { echo '[STOP] HTTP test count != 6'; exit 1; }
printf '%s\n' "$HTTP_OUTPUT" | grep -Eq '^# pass 6$' || { echo '[STOP] HTTP acceptance failed'; exit 1; }
printf '%s\n' "$HTTP_OUTPUT" | grep -Eq '^# (skipped|skip) 0$' || { echo '[STOP] HTTP SKIP not allowed'; exit 1; }
printf 'HTTP_PASS=6/6\n' >> "$RESULT"

echo '=== 6. Scan immutable image (once) ==='
SCAN="$(gcloud artifacts docker images scan "$LOCAL" \
  --project="$PROJECT" --location=asia --format=json |
  jq -er '.response.scan')"
FINDINGS="$(gcloud artifacts docker images list-vulnerabilities \
  "$SCAN" --project="$PROJECT" --format=json)"
printf '%s\n' "$FINDINGS" > "$HOME/secumie-admin-image-vulnerabilities.json"
printf 'SCAN=%s\n' "$SCAN" >> "$RESULT"
SUMMARY="$(printf '%s' "$FINDINGS" | jq -e '
  if type != "array" then error("Invalid scan result")
  else
    [.[].vulnerability | (.effectiveSeverity // .severity // "UNKNOWN")] |
    {
      CRITICAL: (map(select(. == "CRITICAL")) | length),
      HIGH: (map(select(. == "HIGH")) | length),
      UNKNOWN: (map(select(. == "UNKNOWN" or . == "SEVERITY_UNSPECIFIED" or . == "UNSPECIFIED")) | length),
      OTHER: (map(select(. != "CRITICAL" and . != "HIGH" and . != "UNKNOWN" and . != "SEVERITY_UNSPECIFIED" and . != "UNSPECIFIED")) | length)
    }
  end
')"
echo "$SUMMARY"
printf '%s\n' "$SUMMARY" >> "$RESULT"

BLOCKERS="$(printf '%s' "$SUMMARY" | jq '.CRITICAL + .HIGH + .UNKNOWN')"
if [[ "$BLOCKERS" != '0' ]]; then
  printf '%s' "$FINDINGS" | jq '[
    .[] | . as $v
    | ($v.vulnerability.effectiveSeverity // $v.vulnerability.severity // "UNKNOWN") as $sev
    | select($sev == "CRITICAL" or $sev == "HIGH" or $sev == "UNKNOWN"
      or $sev == "SEVERITY_UNSPECIFIED" or $sev == "UNSPECIFIED")
    | .vulnerability.packageIssue[]?
    | {package: (.affectedPackage // "unknown"),
       severity: $sev,
       fixed: (.fixedVersion.fullName // "not available")}
  ] | group_by(.package)
    | map({package: .[0].package, blockers: length, severities: ([.[].severity] | unique),
           fixed: ([.[].fixed] | unique)})
    | sort_by(-.blockers)'
  printf 'SECURITY_NO_GO\n' >> "$RESULT"
  echo '[STOP] Scanner reported security blockers; no Cloud Run changes'
  exit 1
fi

printf 'FINAL_PASS\n' >> "$RESULT"
echo '=== FINAL PASS ==='
echo "GIT=$SOURCE_SHA"
echo "IMAGE=$IMMUTABLE"
echo 'Cloud Run and DB unchanged.'
