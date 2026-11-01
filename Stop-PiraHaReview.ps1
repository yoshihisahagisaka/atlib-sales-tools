$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $repo '.pira-ha-review\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'HA-1 review server is not running.'; exit 0 }

$serverPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction SilentlyContinue
if ($process -and $process.CommandLine -like '*piraHaReviewServer.ts*') {
  Stop-Process -Id $serverPid
  Write-Host "Stopped HA-1 review server (PID $serverPid)."
} elseif ($process) {
  throw "PID $serverPid is not the HA-1 review server. No process was stopped."
} else {
  Write-Host 'HA-1 review server was already stopped.'
}
Remove-Item -LiteralPath $pidFile -Force
