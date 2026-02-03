Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$envFile = Join-Path $root '.env.local'

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $parts = $line.Split('=', 2)
    if ($parts.Length -ne 2) { return }
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ($name) { Set-Item -Path "Env:$name" -Value $value }
  }
}

if (-not $env:RENDER_DATABASE_URL) {
  Write-Host "RENDER_DATABASE_URL not set. Skipping Render sync."
  exit 0
}

$running = docker ps --format '{{.Names}}' | Select-String -Pattern '^sonic_backend$'
if (-not $running) {
  Write-Host "sonic_backend container not running."
  exit 1
}

Write-Host "Syncing to Render DB..."

$envArgs = @('-e', "DATABASE_URL=$($env:RENDER_DATABASE_URL)")
if ($env:DISCOGS_TOKEN) { $envArgs += @('-e', "DISCOGS_TOKEN=$($env:DISCOGS_TOKEN)") }
if ($env:COVER_LIMIT) { $envArgs += @('-e', "COVER_LIMIT=$($env:COVER_LIMIT)") }
if ($env:DRY_RUN) { $envArgs += @('-e', "DRY_RUN=$($env:DRY_RUN)") }

& docker exec @envArgs sonic_backend python scripts/db/import/import-album-groups.py
& docker exec @envArgs sonic_backend python scripts/db/import/import-metadata.py
& docker exec @envArgs sonic_backend python scripts/db/covers/update-spotify-missing-covers.py
& docker exec @envArgs sonic_backend python scripts/db/covers/update-covers.py

Write-Host "Render sync complete."
