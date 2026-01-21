#!/bin/bash
# Auto restore from latest backup if DB is empty or old

set -e

BACKUP_FILE="./backups/latest.sql.gz"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ℹ️  No backup found at $BACKUP_FILE"
  echo "   Skipping auto-restore."
  exit 0
fi

echo "🔍 Checking DB state..."

# Check if DB has data
ALBUM_COUNT=$(docker exec sonic_db psql -U sonic -d sonic_db -t -c "SELECT COUNT(*) FROM album_groups;" 2>/dev/null | tr -d ' ' || echo "0")

if [ "$ALBUM_COUNT" -gt 0 ]; then
  echo "✅ DB already has $ALBUM_COUNT albums. Skipping restore."
  exit 0
fi

echo "📦 DB is empty. Restoring from latest backup..."
echo "   Source: $BACKUP_FILE"

# Stop backend to avoid connection issues
docker-compose stop backend 2>/dev/null || true

# Drop and recreate DB
docker exec sonic_db psql -U sonic -d postgres -c "DROP DATABASE IF EXISTS sonic_db;"
docker exec sonic_db psql -U sonic -d postgres -c "CREATE DATABASE sonic_db;"

# Restore
gunzip -c "$BACKUP_FILE" | docker exec -i sonic_db psql -U sonic -d sonic_db

# Restart backend
docker-compose start backend 2>/dev/null || true

echo "✅ Restore complete! DB now has data."
