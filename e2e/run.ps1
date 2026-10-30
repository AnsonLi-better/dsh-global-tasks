# Runs the real GUI end-to-end suite against a throwaway DSH home.
#
# Why a separate home: the suite drives a live browser, so it must not touch your
# real profile, sessions, or completion records. DSH_HOME isolates all of it.
#
# Usage:
#   pwsh -File e2e/run.ps1                       # build fixtures from your own sessions
#   pwsh -File e2e/run.ps1 -Keep                 # leave the temp home for inspection
#
# Requires: a local DSH install, Google Chrome, and Node 22+.
param(
  [switch]$Keep,
  [string]$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe",
  [string]$DshCli = ""
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$home2 = Join-Path $env:TEMP ("dsh-gt-e2e-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$cdpPort = 9400 + (Get-Random -Maximum 90)
$profileDir = Join-Path $home2 'chrome-profile'

function Write-Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

if (-not $DshCli) {
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd",
    "$env:PROGRAMFILES\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
  )
  $DshCli = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $DshCli) { throw "dsh CLI not found; pass -DshCli <path to dsh.cmd>" }
if (-not (Test-Path $ChromePath)) { throw "Chrome not found at $ChromePath; pass -ChromePath" }

$env:DSH_HOME = $home2
New-Item -ItemType Directory -Path $home2 -Force | Out-Null

try {
  Write-Step "Bootstrapping an isolated profile at $home2"
  # Each native step logs to a file instead of `*> $null`: a silent redirect hides
  # both progress and the real failure, which is how this suite used to hang.
  $bootLog = Join-Path $home2 'bootstrap.log'
  & $DshCli qa --from-default-profile web --dump-config *> $bootLog
  if ($LASTEXITCODE -ne 0) {
    Write-Host (Get-Content $bootLog -ErrorAction SilentlyContinue | Select-Object -Last 20)
    throw "profile bootstrap failed (exit $LASTEXITCODE)"
  }
  if (-not (Test-Path (Join-Path $home2 'profiles\qa\package.json'))) {
    throw "profile bootstrap reported success but created no profiles\qa"
  }

  & $DshCli plugin --profile qa add "link:$repo" *> $bootLog
  if ($LASTEXITCODE -ne 0) {
    Write-Host (Get-Content $bootLog -ErrorAction SilentlyContinue | Select-Object -Last 20)
    throw "plugin install failed (exit $LASTEXITCODE)"
  }
  if (-not (Test-Path (Join-Path $home2 'profiles\qa\node_modules\dsh-global-tasks\package.json'))) {
    throw "plugin install reported success but the package is not linked"
  }

  Write-Step "Seeding realistic sessions from the local DSH home"
  $seed = Join-Path $PSScriptRoot 'seed.mjs'
  node $seed $home2
  if ($LASTEXITCODE -ne 0) { throw "seed failed" }

  Write-Step "Starting dsh web on a free port"
  $log = Join-Path $home2 'web.log'
  $err = Join-Path $home2 'web.err.log'
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'cmd.exe'
  $psi.Arguments = "/c `"`"$DshCli`" qa --no-open --port 0 --host 127.0.0.1 > `"$log`" 2> `"$err`"`""
  $psi.UseShellExecute = $false
  $psi.EnvironmentVariables['DSH_HOME'] = $home2
  $server = [System.Diagnostics.Process]::Start($psi)

  $url = $null
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $log) {
      $line = Get-Content $log -Raw -ErrorAction SilentlyContinue
      if ($line -match '(http://127\.0\.0\.1:\d+/\?token=\S+)') { $url = $Matches[1]; break }
    }
  }
  if (-not $url) {
    Write-Host (Get-Content $err -ErrorAction SilentlyContinue | Select-Object -First 20)
    throw "the web server did not print a URL"
  }
  Write-Host "   $url"

  Write-Step "Launching headless Chrome with CDP on $cdpPort"
  $cpsi = New-Object System.Diagnostics.ProcessStartInfo
  $cpsi.FileName = $ChromePath
  $cpsi.Arguments = "--headless=new --remote-debugging-port=$cdpPort --user-data-dir=`"$profileDir`" --no-first-run --no-default-browser-check --window-size=1440,900 `"$url`""
  $cpsi.UseShellExecute = $false
  $chrome = [System.Diagnostics.Process]::Start($cpsi)

  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    try { Invoke-WebRequest -Uri "http://127.0.0.1:$cdpPort/json/version" -UseBasicParsing -TimeoutSec 2 *> $null; break } catch {}
  }

  Write-Step "Driving the GUI"
  node (Join-Path $PSScriptRoot 'gui.mjs') $cdpPort
  $code = $LASTEXITCODE

  if ($code -ne 0) {
    Write-Host "`nServer stderr:" -ForegroundColor Yellow
    Get-Content $err -ErrorAction SilentlyContinue | Select-Object -First 20
  }
  exit $code
}
finally {
  foreach ($p in @($chrome, $server)) {
    if ($p -and -not $p.HasExited) { try { $p.Kill($true) } catch {} }
  }
  if (-not $Keep) {
    Start-Sleep -Milliseconds 800
    Remove-Item $home2 -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "`nKept: $home2" -ForegroundColor Yellow
  }
}
