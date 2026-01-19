#!/bin/bash
set -e  # 에러 발생 시 즉시 중단

echo "🚀 Music Map Data Pipeline - Full Execution"
echo "=========================================="
echo ""

# Step 0: 현재 상태 확인
echo "📊 Step 0: Current State Check"
echo "----------------------------------------"
if [ -f "out/albums_spotify_v0.json" ]; then
    V0_COUNT=$(node -e "console.log(require('./out/albums_spotify_v0.json').count)")
    echo "✅ v0.json exists: $V0_COUNT albums"
else
    echo "❌ v0.json not found! Run fetch first."
    exit 1
fi

# Docker 상태 확인
echo ""
echo "🐳 Checking Docker containers..."
docker-compose ps

echo ""
echo "=========================================="
read -p "Continue with pipeline? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Pipeline cancelled."
    exit 0
fi

# Step 1: Normalize
echo ""
echo "📋 Step 1: Normalizing data (v0 → v1)..."
npm run step2:normalize

# Step 2: Genre Enrichment
echo ""
echo "🎵 Step 2: Genre enrichment (v1 → v2)..."
npm run step2.5:enrich-genre

# Step 3: Country Enrichment
echo ""
echo "🌍 Step 3: Country enrichment (v2 → v3)..."
npm run step3:enrich-country

# Step 4: Docker 볼륨 동기화 (중요!)
echo ""
echo "🔄 Step 4: Syncing v3.json to Docker container..."
docker cp "out/albums_spotify_v3.json" sonic_backend:/out/albums_spotify_v3.json
echo "✅ File synced successfully"

# Step 5: Import to Database
echo ""
echo "💾 Step 5: Importing to database..."
docker exec sonic_backend python scripts/import_albums_v3.py

# Step 6: Final Statistics
echo ""
echo "=========================================="
echo "📊 Final Database Statistics"
echo "=========================================="
docker exec sonic_db psql -U sonic -d sonic_db -c "
SELECT 
    COUNT(*) as total_albums,
    COUNT(*) FILTER (WHERE year >= 1960 AND year <= 1985) as classic_albums_1960_1985,
    COUNT(*) FILTER (WHERE year >= 1986 AND year <= 2000) as albums_1986_2000,
    COUNT(*) FILTER (WHERE year >= 2001) as modern_albums_2001_plus
FROM albums;
"

echo ""
echo "✅ Pipeline complete!"
echo "🎨 Check your map at: http://localhost:3000"
