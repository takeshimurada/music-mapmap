#!/bin/bash
# Auto backup DB after data collection

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/db_auto_backup_$TIMESTAMP.sql.gz"
LATEST_LINK="$BACKUP_DIR/latest.sql.gz"

echo "🗄️  Auto Backup: Creating DB backup..."

# Create backup
docker exec sonic_db pg_dump -U sonic sonic_db | gzip > "$BACKUP_FILE"

# Update latest symlink (Windows compatible - just copy)
cp "$BACKUP_FILE" "$LATEST_LINK"

echo "✅ Backup created: $BACKUP_FILE"
echo "📦 Latest backup: $LATEST_LINK"
echo ""
echo "💡 Commit to Git:"
echo "   git add backups/"
echo "   git commit -m \"chore: auto backup $(date +%Y-%m-%d)\""
echo "   git push"
