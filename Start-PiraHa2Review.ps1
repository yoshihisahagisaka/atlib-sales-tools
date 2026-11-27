param([int]$Port = 4174)
$ErrorActionPreference = 'Stop'
if (-not $env:PIRA_HA2_DB_PASSWORD) { throw 'Set PIRA_HA2_DB_PASSWORD for the isolated local PostgreSQL review database.' }
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDir = Join-Path $repo '.pira-ha2-review'
$pidFile = Join-Path $stateDir 'server.pid'
if (Test-Path -LiteralPath $pidFile) {
  $existingPid = [int](Get-Content -LiteralPath $pidFile -Raw)
  if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) { throw "HA-2 review server is already running (PID $existingPid)." }
}
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$env:PIRA_HA2_PORT = $Port.ToString()
$process = Start-Process -FilePath 'node' -ArgumentList @('-r','ts-node/register','scripts/piraHa2ReviewServer.ts') -WorkingDirectory $repo -RedirectStandardOutput (Join-Path $stateDir 'server.log') -RedirectStandardError (Join-Path $stateDir 'server-error.log') -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id -NoNewline
$health = "http://127.0.0.1:$Port/__ha/status"
for ($attempt=0; $attempt -lt 80; $attempt++) { try { if ((Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 1).StatusCode -eq 200) { break } } catch {}; Start-Sleep -Milliseconds 250 }
if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) { throw "HA-2 review server failed. See .pira-ha2-review/server-error.log" }
$url = "http://127.0.0.1:$Port/__ha/login?role=admin"
Write-Host "HA-2 review URL: http://127.0.0.1:$Port/admin/pira/"
Write-Host 'Role switch links: administrator / viewer (shown at the top of the page).'
Write-Host 'Database: isolated local PostgreSQL pira_ha2_review (fictional records only).'
$chromeCandidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$chrome = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($chrome) { Start-Process -FilePath $chrome -ArgumentList @('--new-window', $url) }
else { Start-Process $url }
