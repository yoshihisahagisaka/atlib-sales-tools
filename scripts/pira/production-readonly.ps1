# Read-only metadata only. Does not authenticate, change gcloud config, inspect secrets or create resources.
[CmdletBinding()]
param([string]$Project='msp-zabbix',[string]$Region='asia-northeast1')
$ErrorActionPreference='Stop'
$runJson = & gcloud.cmd run services describe sales-tools --project=$Project --region=$Region --format='json(status.latestReadyRevisionName,status.traffic)'
if ($LASTEXITCODE -ne 0) { throw 'Cloud Run metadata read failed. Stop; do not copy credentials or change configuration.' }
$runState = $runJson | ConvertFrom-Json
[pscustomobject]@{latestReadyRevision=$runState.status.latestReadyRevisionName;traffic=$runState.status.traffic} | ConvertTo-Json -Depth 8
$trafficRevisions=@($runState.status.traffic | Where-Object { $_.revisionName -and $_.percent -gt 0 } | ForEach-Object {$_.revisionName} | Select-Object -Unique)
foreach($revisionName in $trafficRevisions) {
  & gcloud.cmd run revisions describe $revisionName --project=$Project --region=$Region --format='json(metadata.name,spec.containers[0].image,status.imageDigest)'
  if ($LASTEXITCODE -ne 0) { throw 'Revision image read failed. Stop.' }
}
# Main SHA must be compared to existing build/release evidence by digest, not inferred from readiness.
# For DB metadata, set a separately available read-only connection without printing it, then run:
# node scripts/pira/preflight.cjs
