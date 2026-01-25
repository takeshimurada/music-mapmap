#!/bin/bash
# 🎵 Sonic Topography - 초기 셋업 스크립트
# 새로운 환경에서 프로젝트를 처음 시작할 때 실행하세요

set -e

echo "🎵 Sonic Topography - Setup Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. 환경 확인
echo "📋 Step 1/6: Checking requirements..."
echo ""

# Docker 확인
if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed"
  echo "   Please install Docker Desktop: https://www.docker.com/products/docker-desktop"
  exit 1
fi
echo "   ✅ Docker: $(docker --version)"

# Docker Compose 확인
if ! command -v docker-compose &> /dev/null; then
  echo "❌ Docker Compose is not installed"
  exit 1
fi
echo "   ✅ Docker Compose: $(docker-compose --version)"

# Node.js 확인
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed"
  echo "   Please install Node.js: https://nodejs.org/"
  exit 1
fi
echo "   ✅ Node.js: $(node --version)"

# npm 확인
if ! command -v npm &> /dev/null; then
  echo "❌ npm is not installed"
  exit 1
fi
echo "   ✅ npm: $(npm --version)"

echo ""

# 2. 환경 변수 파일 생성
echo "📋 Step 2/6: Setting up environment files..."
echo ""

if [ ! -f .env ]; then
  echo "   Creating .env file..."
  cat > .env << 'EOF'
# Gemini API Key (for AI features)
GEMINI_API_KEY=

# Spotify API (for data collection)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_MARKET=US
TARGET_ALBUMS=1000

# Last.fm API (optional)
LASTFM_API_KEY=

# Database
POSTGRES_USER=sonic
POSTGRES_PASSWORD=0416
POSTGRES_DB=sonic_db
DATABASE_URL=postgresql+asyncpg://sonic:0416@db:5432/sonic_db

# Redis
REDIS_URL=redis://redis:6379/0
EOF
  echo "   ✅ Created .env file"
  echo "   ⚠️  Please add your API keys to .env file!"
else
  echo "   ✅ .env file already exists"
fi

if [ ! -f frontend/.env.local ]; then
  echo "   Creating frontend/.env.local..."
  cat > frontend/.env.local << 'EOF'
# Gemini API Key for AI features (frontend)
VITE_API_KEY=
EOF
  echo "   ✅ Created frontend/.env.local"
  echo "   ⚠️  Please add your Gemini API key to frontend/.env.local!"
else
  echo "   ✅ frontend/.env.local already exists"
fi

echo ""

# 3. 디렉토리 생성
echo "📋 Step 3/6: Creating directories..."
echo ""

mkdir -p out backups
echo "   ✅ Created ./out (for data pipeline)"
echo "   ✅ Created ./backups (for DB backups)"

echo ""

# 4. 의존성 설치
echo "📋 Step 4/6: Installing dependencies..."
echo ""

echo "   Installing frontend dependencies..."
cd frontend
npm install --silent
cd ..
echo "   ✅ Frontend dependencies installed"

echo ""

# 5. Docker 컨테이너 시작
echo "📋 Step 5/6: Starting Docker containers..."
echo ""

docker-compose up -d
echo "   ✅ Docker containers started"

# 컨테이너가 준비될 때까지 대기
echo "   ⏳ Waiting for database to be ready..."
sleep 5

echo ""

# 6. 초기 데이터 확인
echo "📋 Step 6/6: Checking database..."
echo ""

ALBUM_COUNT=$(docker exec sonic_db psql -U sonic -d sonic_db -t -c "SELECT COUNT(*) FROM albums;" 2>/dev/null | xargs || echo "0")

if [ "$ALBUM_COUNT" -eq "0" ]; then
  echo "   ⚠️  Database is empty"
  echo ""
  echo "   You have 3 options to populate the database:"
  echo ""
  echo "   Option 1: Restore from backup (fastest)"
  echo "   ─────────────────────────────────────────────"
  echo "   If you have a backup file:"
  echo "     ./scripts/db/restore.sh backup_name"
  echo ""
  echo "   Option 2: Collect from MusicBrainz (recommended, ~10 minutes)"
  echo "   ─────────────────────────────────────────────────────────────"
  echo "   Collects ~500 albums with cover images:"
  echo "     docker exec sonic_backend bash -c 'PYTHONPATH=/app python scripts/fetch/musicbrainz.py'"
  echo ""
  echo "   Option 3: Collect from Spotify (requires API key, rate limited)"
  echo "   ────────────────────────────────────────────────────────────────"
  echo "   1. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env"
  echo "   2. Run: npm run fetch:spotify"
  echo ""
else
  echo "   ✅ Database has $ALBUM_COUNT albums"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup completed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 Next steps:"
echo ""
echo "1. Add API keys to .env and frontend/.env.local"
echo "2. Populate database (see options above)"
echo "3. Start frontend:"
echo "     cd frontend && npm run dev"
echo "4. Open http://localhost:5173"
echo ""
echo "📚 For more information, see README.md"
echo ""
