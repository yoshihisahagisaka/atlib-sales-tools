#!/usr/bin/env bash
# SECU:MIE Web admin dependency recovery, build/test, immutable image scan.
# Safe to run with nohup: all work and the result remain in $HOME.
# Does NOT deploy Cloud Run, migrate databases or change any traffic.
set -Eeuo pipefail

PROJECT='msp-zabbix'
REGION='asia-northeast1'
REPOSITORY='https://github.com/yoshihisahagisaka/atlib-sales-tools.git'
BRANCH='feat/secumie-web-admin-interim-20261119'
BASE='e218ec81e67d620bdb634bb36a417abaeafb890b'
WORK="$(mktemp -d "$HOME/secumie-admin-pr51.XXXXXX")"
RESULT="$HOME/secumie-admin-pr51-result.txt"
trap 'echo "[STOP] command failed at line $LINENO (exit $?)" >&2' ERR

echo "WORK=$WORK"
echo "START=$(date -u +%FT%TZ)"
printf 'RUNNING\n' > "$RESULT"

echo '=== 1. Exact Git base ==='
git clone --quiet --single-branch --branch "$BRANCH" "$REPOSITORY" "$WORK/repo"
cd "$WORK/repo"
git merge-base --is-ancestor "$BASE" HEAD || { echo '[STOP] Unexpected branch history'; exit 1; }
EXTRA="$(git diff --name-only "$BASE" HEAD)"
if [[ "$EXTRA" != 'scripts/secumie-admin-repair-and-gate.sh' ]]; then
  echo "[STOP] Unexpected intervening files: $EXTRA"
  exit 1
fi
[[ -z "$(git status --porcelain)" ]] || { echo '[STOP] Dirty source'; exit 1; }
echo "START_SHA=$(git rev-parse HEAD)"

echo '=== 2. Targeted package updates and Zod compatibility ==='
python3 <<'PY'
from pathlib import Path
import json
import re

p = Path('package.json')
data = json.loads(p.read_text(encoding='utf-8'))
data['dependencies'].update({
    'nodemailer': '10.6.0',
    'zod': '4.6.7',
    'express': '4.22.3'
})
data.setdefault('overrides', {}).update({
    'google-gax': '4.4.1',
    '@grpc/grpc-js': '1.14.7',
    'protobufjs': '7.6.6',
    'qs': '6.17.1',
    'body-parser': '1.20.9',
    'proxy-addr': '2.0.8'
})
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

pattern = re.compile(r"""(\bfrom\s*)(['"])zod\2""")
changed = []
for f in Path('src').rglob('*.ts'):
    before = f.read_text(encoding='utf-8')
    after = pattern.sub(lambda m: m.group(1) + m.group(2) + 'zod/v3' + m.group(2), before)
    if before != after:
        f.write_text(after, encoding='utf-8')
        changed.append(str(f))
print('Zod v3 compatibility imports:', len(changed))
if len(changed) < 40:
    raise SystemExit('[STOP] Unexpected Zod import count')
PY

echo '=== 3. Locked install, TypeScript, regressions ==='
npm install --package-lock-only --no-audit --no-fund
npm ci --no-audit --no-fund
npm run build
node -r ts-node/register --test \
  test/wscSalesService.test.ts \
  test/businessWebConsultation.golden.test.ts \
  test/businessWebConsultation.api.test.ts \
  test/partnerLeadHttpIntegration.golden.test.ts \
  test/kaizenAssessment.golden.test.ts \
  test/diagnosisPreparation.golden.test.ts \
  test/diagnosisReport.golden.test.ts \
  test/diagnosisReview.golden.test.ts
node --test test/secumieWebAdmin.contract.test.cjs
node --check public/admin/secumie-web.js
echo '=== 4. Production dependency audit ==='
npm audit --omit=dev --audit-level=high
git diff --check

echo '=== 5. Push only after tests and audit pass ==='
REMOTE="$(git ls-remote origin "refs/heads/$BRANCH" | awk '{print $1}')"
CURRENT="$(git rev-parse HEAD)"
[[ "$REMOTE" == "$CURRENT" ]] || { echo '[STOP] GitHub branch advanced'; exit 1; }
git add package.json package-lock.json src
git diff --cached --check
git commit -m 'fix(security): update Sales Tools runtime dependencies preserving Zod v3 schemas'
SHA="$(git rev-parse HEAD)"
git push origin "HEAD:refs/heads/$BRANCH"
echo "VERIFIED_SHA=$SHA"
printf 'SOURCE_PASS\nGIT=%s\n' "$SHA" > "$RESULT"

echo '=== 6. Build immutable candidate (no Cloud Run deploy) ==='
SHORT_SHA="$(printf '%s' "$SHA" | cut -c1-10)"
IMAGE_BASE="asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/sales-tools-staging"
IMAGE="$IMAGE_BASE:smw-admin-$SHORT_SHA-$(date -u +%Y%m%d%H%M%S)"
gcloud builds submit . \
  --project="$PROJECT" --region="$REGION" \
  --tag="$IMAGE" --timeout=1800s --quiet
IMMUTABLE="$(gcloud artifacts docker images describe "$IMAGE" --project="$PROJECT" --format=json | jq -er '.image_summary.fully_qualified_digest')"
echo "IMAGE=$IMMUTABLE"
printf 'IMAGE=%s\n' "$IMMUTABLE" >> "$RESULT"

echo '=== 7. Scan candidate image ==='
gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet >/dev/null 2>&1
docker pull "$IMMUTABLE"
LOCAL="secumie-admin-$SHORT_SHA:check"
docker tag "$IMMUTABLE" "$LOCAL"
SCAN="$(gcloud artifacts docker images scan "$LOCAL" --project="$PROJECT" --location=asia --format=json | jq -er '.response.scan')"
FINDINGS="$(gcloud artifacts docker images list-vulnerabilities "$SCAN" --project="$PROJECT" --format=json)"
BLOCKERS="$(printf '%s' "$FINDINGS" | jq -er '
  if type != "array" then error("Unexpected findings")
  else [.[].vulnerability | (.effectiveSeverity // .severity // "UNKNOWN")
    | select(. == "HIGH" or . == "CRITICAL" or . == "UNKNOWN" or . == "SEVERITY_UNSPECIFIED")
  ] | length end
')"
echo "HIGH_CRITICAL_UNKNOWN=$BLOCKERS"
if [[ "$BLOCKERS" != 0 ]]; then
  printf '%s' "$FINDINGS" | jq '[
    .[] | . as $v | .vulnerability.packageIssue[]? |
    {package: (.affectedPackage // "unknown"),
     severity: ($v.vulnerability.effectiveSeverity // $v.vulnerability.severity // "UNKNOWN"),
     fixed: (.fixedVersion.fullName // "not available")}
  ] | group_by(.package) | map({package: .[0].package, count: length, fixed: ([.[].fixed] | unique)}) | sort_by(-.count) | .[:15]'
  echo 'SECURITY_NO_GO' >> "$RESULT"
  exit 1
fi

echo 'FINAL_PASS' >> "$RESULT"
echo 'Cloud Run and DB unchanged.'
echo "FINISH=$(date -u +%FT%TZ)"
