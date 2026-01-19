# 🎵 Music Map Data Pipeline - 사용 가이드

## 📋 목차
1. [파이프라인 개요](#파이프라인-개요)
2. [빠른 시작](#빠른-시작)
3. [단계별 실행](#단계별-실행)
4. [문제 해결](#문제-해결)

---

## 파이프라인 개요

```
┌─────────────┐
│   Spotify   │
│     API     │
└──────┬──────┘
       │ fetch_spotify_albums.mjs
       ↓
┌─────────────┐
│ v0.json     │ ← Raw data
└──────┬──────┘
       │ step2:normalize
       ↓
┌─────────────┐
│ v1.json     │ ← Normalized (genreFamily, region_bucket)
└──────┬──────┘
       │ step2.5:enrich-genre
       ↓
┌─────────────┐
│ v2.json     │ ← Genre enriched (MusicBrainz/Discogs)
└──────┬──────┘
       │ step3:enrich-country
       ↓
┌─────────────┐
│ v3.json     │ ← Country enriched (final)
└──────┬──────┘
       │ import_albums_v3.py
       ↓
┌─────────────┐
│ PostgreSQL  │ ← Database
└─────────────┘
```

---

## 빠른 시작

### 전체 파이프라인 한 번에 실행 (권장)

```bash
# 1. v0.json이 있다고 가정 (fetch는 이미 완료)
# 2. 전체 파이프라인 실행
npm run pipeline:all
```

이 명령어는 다음을 자동으로 실행합니다:
- ✅ v0 → v1 (normalize)
- ✅ v1 → v2 (genre enrich)
- ✅ v2 → v3 (country enrich)
- ✅ Docker 볼륨 동기화
- ✅ DB import

---

## 단계별 실행

필요에 따라 각 단계를 개별적으로 실행할 수 있습니다:

### Step 0: 데이터 수집 (선택)
```bash
# Spotify에서 데이터 수집 (API rate limit 주의!)
node fetch_spotify_albums.mjs

# 또는 플레이리스트에서 수집
node fetch_from_playlists.mjs

# 또는 클래식 명반 직접 추가
docker exec sonic_backend python scripts/insert_classic_albums.py
```

### Step 1: Normalize
```bash
npm run step2:normalize
```
- **입력**: `out/albums_spotify_v0.json`
- **출력**: `out/albums_spotify_v1.json`
- **작업**: genreFamily 매핑, region_bucket 초기 설정

### Step 2: Genre Enrichment
```bash
npm run step2.5:enrich-genre
```
- **입력**: `out/albums_spotify_v1.json`
- **출력**: `out/albums_spotify_v2.json`
- **작업**: MusicBrainz/Discogs로 장르 정보 보강

### Step 3: Country Enrichment
```bash
npm run step3:enrich-country
```
- **입력**: `out/albums_spotify_v2.json`
- **출력**: `out/albums_spotify_v3.json`
- **작업**: MusicBrainz/Discogs로 국가 정보 보강

### Step 4: Import to Database
```bash
npm run pipeline:import
```
- **입력**: `out/albums_spotify_v3.json`
- **작업**: 
  1. 호스트 → Docker 볼륨 동기화
  2. PostgreSQL DB에 import (중복 제거)

---

## 문제 해결

### ❌ "Total albums in JSON: 0" 또는 파일이 없다는 에러

**원인**: 이전 단계가 완료되지 않았거나 파일이 손상됨

**해결**:
```bash
# 파일 확인
ls -lh out/albums_spotify_*.json

# 각 파일의 레코드 수 확인
node -e "['v0','v1','v2','v3'].forEach(v => console.log(v + ':', require('./out/albums_spotify_'+v+'.json').count))"
```

### ❌ Docker 볼륨 동기화 문제

**증상**: 호스트에는 최신 파일이 있는데 Docker 컨테이너는 오래된 파일을 읽음

**해결**:
```bash
# 수동으로 동기화
docker cp out/albums_spotify_v3.json sonic_backend:/out/albums_spotify_v3.json

# 또는 컨테이너 재시작
docker-compose restart backend
```

### ❌ "Prepared 0 new albums (skipped X existing)"

**의미**: v3.json의 모든 앨범이 이미 DB에 존재함 (정상 동작)

**확인**:
```bash
# DB의 현재 앨범 수 확인
docker exec sonic_db psql -U sonic -d sonic_db -c "SELECT COUNT(*) FROM albums;"

# 연도별 분포 확인
docker exec sonic_db psql -U sonic -d sonic_db -c "SELECT year, COUNT(*) FROM albums GROUP BY year ORDER BY year;"
```

### ❌ Spotify API Rate Limit

**증상**: "Rate limited. Waiting 67640s..."

**해결**: 
- 내일 다시 시도하거나
- 다른 데이터 소스 사용 (클래식 명반 스크립트 등)

---

## 데이터 검증

### 현재 상태 확인
```bash
# 전체 통계
docker exec sonic_backend python scripts/import_albums_v3.py

# 또는 직접 SQL
docker exec sonic_db psql -U sonic -d sonic_db -c "
SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE year BETWEEN 1960 AND 1985) as classic_60_85,
    COUNT(*) FILTER (WHERE year BETWEEN 1986 AND 2000) as retro_86_00,
    COUNT(*) FILTER (WHERE year > 2000) as modern_2000s
FROM albums;
"
```

### 국가별 분포
```bash
docker exec sonic_db psql -U sonic -d sonic_db -c "
SELECT country, COUNT(*) 
FROM albums 
WHERE country IS NOT NULL 
GROUP BY country 
ORDER BY COUNT(*) DESC 
LIMIT 20;
"
```

---

## 💡 팁

1. **중복 방지**: import 스크립트는 자동으로 중복을 제거합니다. 여러 번 실행해도 안전합니다.

2. **Append 모드**: 기존 데이터를 유지하면서 새 데이터만 추가됩니다.

3. **로그 확인**: 각 단계마다 상세한 로그가 출력됩니다. 문제가 있으면 로그를 확인하세요.

4. **백업**: 중요한 작업 전에 DB 백업을 권장합니다:
   ```bash
   docker exec sonic_db pg_dump -U sonic sonic_db > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

---

## 🎨 프론트엔드 확인

데이터 import 후:
```
http://localhost:3000
```

맵에서 앨범들이 제대로 표시되는지 확인하세요!
