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

echo '=== 3. Existing shared Staging Cloud SQL (read-only) ==='
INSTANCE='secumie-sg-shared-staging-db'
INSTANCE_JSON="$(gcloud sql instances describe "$INSTANCE" --project="$PROJECT" --format=json)"
printf '%s\n' "$INSTANCE_JSON" | jq '{
  name, state, databaseVersion,
  deletionProtection: .settings.deletionProtectionEnabled,
  backup: .settings.backupConfiguration.enabled,
  pitr: .settings.backupConfiguration.pointInTimeRecoveryEnabled
}'
if ! printf '%s\n' "$INSTANCE_JSON" | jq -e --arg instance "$INSTANCE" '
  .name == $instance
  and .state == "RUNNABLE"
  and .databaseVersion == "POSTGRES_16"
  and .settings.deletionProtectionEnabled == true
  and .settings.backupConfiguration.enabled == true
  and .settings.backupConfiguration.pointInTimeRecoveryEnabled == true
' >/dev/null; then
  echo '[STOP] Shared Staging DB instance differs from approved foundation'
  exit 1
fi

echo '=== 4. Web-owned DB and Cloud SQL users (metadata only) ==='
DATABASES_JSON="$(gcloud sql databases list --instance="$INSTANCE" --project="$PROJECT" --format=json)"
USERS_JSON="$(gcloud sql users list --instance="$INSTANCE" --project="$PROJECT" --format=json)"
printf '%s\n' "$DATABASES_JSON" | jq -r '.[].name' | sort
printf '%s\n' "$USERS_JSON" | jq -r '.[].name' | sort
for name in postgres secumie_insight_staging secure_guard_staging; do
  if ! printf '%s\n' "$DATABASES_JSON" | jq -e --arg name "$name" 'any(.[]; .name == $name)' >/dev/null; then
    echo "[STOP] Existing database missing: $name"
    exit 1
  fi
done
if printf '%s\n' "$DATABASES_JSON" | jq -e 'any(.[]; .name == "secumie_web_staging")' >/dev/null; then
  echo '[STOP] Web Staging database already exists; reconcile ledger and ownership before any bootstrap'
  exit 1
fi
for name in secumie_web_runtime_staging secumie_web_admin_staging secumie_web_migration_staging; do
  if printf '%s\n' "$USERS_JSON" | jq -e --arg name "$name" 'any(.[]; .name == $name)' >/dev/null; then
    echo "[STOP] Web Staging Cloud SQL user already exists: $name"
    exit 1
  fi
done
echo 'Cloud SQL API inventory found no Web DB/user. PostgreSQL pg_roles and ACLs'
echo 'are NOT verified by the SQL Admin API. Confirm them separately before writes.'
echo 'No database/role/migration/Secret/Cloud Run resources were changed.'

echo '=== SECU:MIE WEB ADMIN READONLY PREFLIGHT COMPLETE ==='
echo 'No Production or Staging configuration was changed.'
