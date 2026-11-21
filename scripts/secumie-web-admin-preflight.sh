#!/usr/bin/env bash
# SECU:MIE Web admin: read-only Cloud Run and Git provenance preflight.
# This script does not deploy, migrate, modify traffic, or read secret values.
set -Eeuo pipefail

PROJECT='msp-zabbix'
REGION='asia-northeast1'
REPOSITORY='https://github.com/yoshihisahagisaka/atlib-sales-tools.git'
ADMIN_BRANCH='feat/secumie-web-admin-interim-20261119'

command -v git >/dev/null || { echo '[STOP] git is required'; exit 1; }
command -v gcloud >/dev/null || { echo '[STOP] gcloud is required'; exit 1; }
command -v jq >/dev/null || { echo '[STOP] jq is required'; exit 1; }

echo '=== 1. Canonical Git refs (read-only) ==='
REFS="$(git ls-remote "$REPOSITORY" "refs/heads/main" "refs/heads/$ADMIN_BRANCH")"
MAIN_HEAD="$(printf '%s\n' "$REFS" | awk '$2 == "refs/heads/main" {print $1}')"
ADMIN_HEAD="$(printf '%s\n' "$REFS" | awk -v ref="refs/heads/$ADMIN_BRANCH" '$2 == ref {print $1}')"
[[ "$MAIN_HEAD" =~ ^[0-9a-f]{40}$ && "$ADMIN_HEAD" =~ ^[0-9a-f]{40}$ ]] || {
  echo '[STOP] Git refs are incomplete'; exit 1;
}
echo "main=$MAIN_HEAD"
echo "admin_candidate=$ADMIN_HEAD"

echo '=== 2. Cloud Run services (read-only) ==='
for SERVICE in sales-tools sales-tools-staging; do
  echo "--- $SERVICE ---"
  DESCRIPTION="$(gcloud run services describe "$SERVICE" \
    --project="$PROJECT" --region="$REGION" --format=json)"
  printf '%s\n' "$DESCRIPTION" | jq -e '{
    service: .metadata.name,
    latestReady: .status.latestReadyRevisionName,
    ingress: .metadata.annotations["run.googleapis.com/ingress"],
    serviceAccount: .spec.template.spec.serviceAccountName,
    configuredImage: .spec.template.spec.containers[0].image,
    traffic100: [.status.traffic[]? | select(.percent == 100) | {revisionName, percent, tag, url}],
    webSecurityTags: [.status.traffic[]? | select((.tag // "") | test("wsc|secumie")) | {revisionName, percent, tag, url}]
  }'
  COUNT="$(printf '%s\n' "$DESCRIPTION" | jq '[.status.traffic[]? | select(.percent == 100)] | length')"
  [[ "$COUNT" == 1 ]] || { echo "[STOP] $SERVICE has $COUNT 100% revisions"; exit 1; }
done

echo '=== SECU:MIE WEB ADMIN READONLY PREFLIGHT COMPLETE ==='
echo 'No Production or Staging configuration was changed.'
