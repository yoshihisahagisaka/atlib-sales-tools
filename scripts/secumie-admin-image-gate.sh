#!/usr/bin/env bash
# SECU:MIE Web PR #51: build and scan only, no Cloud Run deploy.
set -Eeuo pipefail

PROJECT='msp-zabbix'
REGION='asia-northeast1'
BRANCH='feat/secumie-web-admin-interim-20261119'
IMAGE_BASE="asia-northeast1-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/sales-tools-staging"
RESULT="$HOME/secumie-admin-image-result.txt"

trap 'rc=$?; printf "ERROR\nEXIT=%s\n" "$rc" >> "$RESULT"; echo "[STOP] line $LINENO, exit $rc" >&2' ERR
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

echo '=== 4. Scan immutable image ==='
SCAN="$(gcloud artifacts docker images scan "$LOCAL" \
  --project="$PROJECT" --location=asia --format=json |
  jq -er '.response.scan')"
FINDINGS="$(gcloud artifacts docker images list-vulnerabilities \
  "$SCAN" --project="$PROJECT" --format=json)"
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
