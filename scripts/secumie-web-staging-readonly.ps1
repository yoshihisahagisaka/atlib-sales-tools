# Read-only SECU:MIE Web Staging inventory for Windows PowerShell 5.1+.
# Requires Google Cloud CLI authenticated to msp-zabbix.
# No database connections, Secret values, builds, migrations or deployments.
[CmdletBinding()]
param([switch]$DryRun)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$project = 'msp-zabbix'
$region = 'asia-northeast1'
$instance = 'secumie-sg-shared-staging-db'
$services = @('sales-tools', 'sales-tools-staging')
$requiredDatabases = @('postgres', 'secumie_insight_staging', 'secure_guard_staging')
$webDatabase = 'secumie_web_staging'
$webRoles = @('secumie_web_runtime_staging', 'secumie_web_admin_staging', 'secumie_web_migration_staging')
$gcloud = if ($env:OS -eq 'Windows_NT') { 'gcloud.cmd' } else { 'gcloud' }

function Read-GcloudJson {
  param([string[]]$Arguments)
  $output = & $gcloud @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "[STOP] gcloud read-only command failed: $($Arguments[0]) $($Arguments[1])"
  }
  $json = ($output | Out-String)
  if ([string]::IsNullOrWhiteSpace($json)) { throw '[STOP] Empty gcloud JSON response' }
  return (ConvertFrom-Json -InputObject $json)
}

$commands = @(
  @('run','services','describe','sales-tools',"--project=$project","--region=$region",'--format=json'),
  @('run','services','describe','sales-tools-staging',"--project=$project","--region=$region",'--format=json'),
  @('sql','instances','describe',$instance,"--project=$project",'--format=json'),
  @('sql','databases','list',"--instance=$instance","--project=$project",'--format=json'),
  @('sql','users','list',"--instance=$instance","--project=$project",'--format=json')
)

if ($DryRun) {
  Write-Output '=== SECU:MIE WEB STAGING READONLY DRY RUN ==='
  foreach ($arguments in $commands) {
    Write-Output ("$gcloud " + ($arguments -join ' '))
  }
  Write-Output 'DRY_RUN_PASS: Only gcloud describe/list commands; no GCP request sent.'
  return
}

if (-not (Get-Command $gcloud -ErrorAction SilentlyContinue)) {
  throw '[STOP] Google Cloud CLI not installed or not found'
}

Write-Output '=== 1. Existing Cloud Run traffic (read-only) ==='
foreach ($service in $services) {
  $description = Read-GcloudJson -Arguments @(
    'run','services','describe',$service,"--project=$project","--region=$region",'--format=json'
  )
  $traffic = @($description.status.traffic | Where-Object { $_.percent -eq 100 })
  if ($traffic.Count -ne 1) { throw "[STOP] $service does not have exactly one 100% traffic revision" }
  Write-Output ("SERVICE={0} TRAFFIC_100={1}" -f $service,$traffic[0].revisionName)
}

Write-Output '=== 2. Shared Staging Cloud SQL (read-only) ==='
$found = Read-GcloudJson -Arguments @('sql','instances','describe',$instance,"--project=$project",'--format=json')
if ($found.name -ne $instance -or $found.state -ne 'RUNNABLE' -or
    $found.databaseVersion -ne 'POSTGRES_16' -or $found.region -ne $region -or
    $found.settings.deletionProtectionEnabled -ne $true -or
    $found.settings.backupConfiguration.enabled -ne $true -or
    $found.settings.backupConfiguration.pointInTimeRecoveryEnabled -ne $true) {
  throw '[STOP] Shared Staging Cloud SQL state/settings differ from the approved foundation'
}
$publicIPs = @($found.ipAddresses | Where-Object { $_.type -eq 'PRIMARY' })
if ($publicIPs.Count -ne 0) {
  throw '[STOP] Unexpected public IP on shared Staging Cloud SQL'
}
Write-Output ("INSTANCE={0} STATE={1} ENGINE={2} BACKUP=ON PITR=ON DELETION_PROTECTION=ON PUBLIC_IP=NONE" -f $instance,$found.state,$found.databaseVersion)

Write-Output '=== 3. Existing databases and users (read-only) ==='
$databases = @(Read-GcloudJson -Arguments @('sql','databases','list',"--instance=$instance","--project=$project",'--format=json'))
$users = @(Read-GcloudJson -Arguments @('sql','users','list',"--instance=$instance","--project=$project",'--format=json'))
$databaseNames = @($databases | ForEach-Object { $_.name })
$userNames = @($users | ForEach-Object { $_.name })
foreach ($name in $requiredDatabases) {
  if ($databaseNames -notcontains $name) { throw "[STOP] Expected existing database absent: $name" }
}
if ($databaseNames -contains $webDatabase) {
  throw "[STOP] Web database already exists; reconcile its owner and migration ledger before bootstrap"
}
foreach ($name in $webRoles) {
  if ($userNames -contains $name) {
    throw "[STOP] Web Cloud SQL user already exists: $name"
  }
}
Write-Output ("DATABASES={0}" -f (($databaseNames | Sort-Object) -join ','))
Write-Output 'WEB_DATABASE=NOT_LISTED WEB_USERS=NOT_LISTED'
Write-Output 'NOTE: Cloud SQL API user list does not prove PostgreSQL pg_roles/ACL absence.'
Write-Output 'NOTE: PostgreSQL catalog access and migration ledger require a separately approved private DB session.'
Write-Output 'READONLY_PREFLIGHT_PASS: No GCP writes, SQL connections or Secret access.'
