param(
  [int]$Start = 0,
  [int]$Limit = 500,
  [int]$MinIntervalMs = 2000,
  [int]$BatchDelayMs = 1500,
  [int]$RetryAfterCapSec = 600
)

docker exec --env-file .env `
  --env PYTHONUNBUFFERED=1 `
  --env SPOTIFY_DISCO_UPDATE_EXISTING=1 `
  --env SPOTIFY_DISCO_ENRICH_COUNTRY=0 `
  --env SPOTIFY_MIN_INTERVAL_MS=$MinIntervalMs `
  --env SPOTIFY_BATCH_DELAY_MS=$BatchDelayMs `
  --env SPOTIFY_RESPECT_RETRY_AFTER=1 `
  --env SPOTIFY_RETRY_AFTER_CAP_SEC=$RetryAfterCapSec `
  --env SPOTIFY_DISCO_START=$Start `
  --env SPOTIFY_DISCO_LIMIT=$Limit `
  sonic_backend python scripts/db/import/backfill-spotify-discography.py
