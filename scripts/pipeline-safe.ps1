Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Section($text) {
  Write-Host ""
  Write-Host $text
}

function Load-EnvFile($path) {
  if (!(Test-Path $path)) { return }
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $parts = $line.Split("=", 2)
    if ($parts.Count -ne 2) { return }
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ($key -ne "") {
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
  }
}

function Run-Command($label, $cmd, $args) {
  Write-Host $label
  & $cmd @args
  return $LASTEXITCODE
}

function Backup-RenderDb($rootDir) {
  if (-not $env:RENDER_DATABASE_URL) {
    Write-Host "RENDER_DATABASE_URL not set. Skipping Render backup."
    return
  }

  $backupDir = Join-Path $rootDir "backups\render"
  $latestFile = Join-Path $rootDir "backups\latest.sql.gz"
  $stampDate = Get-Date -Format "yyyyMMdd"
  $stampTime = Get-Date -Format "HHmmss"
  $targetDir = Join-Path $backupDir $stampDate
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

  $outFile = Join-Path $targetDir ("render_{0}_{1}.sql.gz" -f $stampDate, $stampTime)
  $tmpFile = Join-Path $targetDir ("render_{0}_{1}.sql" -f $stampDate, $stampTime)

  $pgUrl = $env:RENDER_DATABASE_URL -replace "^postgresql\+asyncpg://", "postgresql://"
  Write-Host "Backing up Render DB..."

  $cmd = "docker run -i --rm postgres:18 pg_dump --no-owner --no-privileges $pgUrl > `"$tmpFile`""
  cmd /c $cmd
  if ($LASTEXITCODE -ne 0) {
    throw "Render backup failed with exit code $LASTEXITCODE"
  }

  $inStream = [System.IO.File]::OpenRead($tmpFile)
  $outStream = [System.IO.File]::Create($outFile)
  $gzipStream = New-Object System.IO.Compression.GzipStream($outStream, [System.IO.Compression.CompressionMode]::Compress)
  $inStream.CopyTo($gzipStream)
  $gzipStream.Dispose()
  $outStream.Dispose()
  $inStream.Dispose()
  Remove-Item -Force $tmpFile

  Write-Host "Render backup saved: $outFile"
  Copy-Item -Force $outFile $latestFile
  Write-Host "Render backup copied to: $latestFile"

  $allBackups = Get-ChildItem -Path $backupDir -Filter "*.sql.gz" -Recurse | Sort-Object LastWriteTime -Descending
  if ($allBackups.Count -gt 10) {
    $allBackups | Select-Object -Skip 10 | Remove-Item -Force
  }
}

function Sync-RenderDb() {
  if (-not $env:RENDER_DATABASE_URL) {
    Write-Host "RENDER_DATABASE_URL not set. Skipping Render sync."
    return
  }

  $running = (& docker ps --format "{{.Names}}") -split "`n"
  if ($running -notcontains "sonic_backend") {
    throw "sonic_backend container not running."
  }

  Write-Host "Syncing to Render DB..."
  $commonArgs = @("exec", "-e", "DATABASE_URL=$($env:RENDER_DATABASE_URL)")

  if ($env:DISCOGS_TOKEN) { $commonArgs += @("-e", "DISCOGS_TOKEN=$($env:DISCOGS_TOKEN)") }
  if ($env:COVER_LIMIT) { $commonArgs += @("-e", "COVER_LIMIT=$($env:COVER_LIMIT)") }
  if ($env:DRY_RUN) { $commonArgs += @("-e", "DRY_RUN=$($env:DRY_RUN)") }

  & docker @($commonArgs + @("sonic_backend", "python", "scripts/db/import/import-album-groups.py"))
  if ($LASTEXITCODE -ne 0) { throw "Render sync failed: import-album-groups.py" }

  & docker @($commonArgs + @("sonic_backend", "python", "scripts/db/import/import-metadata.py"))
  if ($LASTEXITCODE -ne 0) { throw "Render sync failed: import-metadata.py" }

  & docker @($commonArgs + @("sonic_backend", "python", "scripts/db/covers/update-spotify-missing-covers.py"))
  if ($LASTEXITCODE -ne 0) { throw "Render sync failed: update-spotify-missing-covers.py" }

  & docker @($commonArgs + @("sonic_backend", "python", "scripts/db/covers/update-covers.py"))
  if ($LASTEXITCODE -ne 0) { throw "Render sync failed: update-covers.py" }

  Write-Host "Render sync complete."
}

Write-Host "Pipeline Safe Runner (PowerShell)"
Write-Host "==============================="

$rootDir = (Resolve-Path ".").Path
Load-EnvFile (Join-Path $rootDir ".env")
Load-EnvFile (Join-Path $rootDir ".env.local")

$renderSyncRequired = $env:RENDER_SYNC_REQUIRED
if (-not $renderSyncRequired) {
  $renderSyncRequired = "true"
}

Write-Section "Step 0: Pre-pipeline backup..."
try { & npm run db:backup | Out-Host } catch { Write-Host "Pre-backup failed, continuing..." }
Write-Section "Step 0b: Pre-pipeline Render backup..."
try { Backup-RenderDb $rootDir } catch { Write-Host "Render pre-backup failed: $($_.Exception.Message)" }

$pipelineExitCode = 0
Write-Section "Running pipeline..."
$steps = @(
  "pipeline:cleanup",
  "fetch:spotify",
  "pipeline:all",
  "fetch:metadata",
  "metadata:import"
)

foreach ($step in $steps) {
  & npm run $step
  if ($LASTEXITCODE -ne 0) {
    $pipelineExitCode = $LASTEXITCODE
    break
  }
}

if ($pipelineExitCode -eq 0) {
  if (-not $env:RENDER_DATABASE_URL -and $renderSyncRequired -eq "true") {
    throw "RENDER_DATABASE_URL not set. Render sync is required but missing."
  }
  Write-Section "Syncing Render DB..."
  try { Sync-RenderDb } catch { Write-Host "Render sync failed: $($_.Exception.Message)" }
} else {
  Write-Section "Pipeline failed. Skipping Render sync."
}

Write-Section "Final backup (always runs)..."
try { & npm run db:backup | Out-Host } catch { Write-Host "Final backup failed!" }
Write-Section "Final Render backup (always runs)..."
try { Backup-RenderDb $rootDir } catch { Write-Host "Render final backup failed: $($_.Exception.Message)" }

Write-Host ""
Write-Host "==============================="
if ($pipelineExitCode -eq 0) {
  Write-Host "Pipeline completed successfully!"
} else {
  Write-Host "Pipeline failed with exit code: $pipelineExitCode"
  Write-Host "But backup was attempted."
}

exit $pipelineExitCode
