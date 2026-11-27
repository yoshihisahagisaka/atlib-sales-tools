param([int]$Port = 4173)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDir = Join-Path $repo '.pira-ha-review'
$pidFile = Join-Path $stateDir 'server.pid'
$logFile = Join-Path $stateDir 'server.log'
$serverScript = Join-Path $repo 'scripts\piraHaReviewServer.ts'

if (Test-Path -LiteralPath $pidFile) {
  $existingPid = [int](Get-Content -LiteralPath $pidFile -Raw)
  if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
    throw "HA-1 review server is already running (PID $existingPid)."
  }
}

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$env:PIRA_HA_PORT = $Port.ToString()
$process = Start-Process -FilePath 'node' -ArgumentList @('-r','ts-node/register','scripts/piraHaReviewServer.ts') -WorkingDirectory $repo -RedirectStandardOutput $logFile -RedirectStandardError (Join-Path $stateDir 'server-error.log') -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id -NoNewline
$url = "http://127.0.0.1:$Port/pira/pira-e2.html"

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try { if ((Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1).StatusCode -eq 200) { break } } catch {}
  Start-Sleep -Milliseconds 250
}
if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) { throw "HA-1 review server failed. See $logFile" }

Write-Host "HA-1 review URL: $url"
Write-Host 'Review authentication code: 246810'
Write-Host 'Use test data only. Data is held in memory and is discarded when stopped.'
Start-Process $url
