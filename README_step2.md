# Step 2-v1: 메타데이터 정규화 & 검증

## 🎯 목적

Spotify API로 수집한 원본 데이터를 **현재 지형도 UI와 호환되는 형태**로 정규화합니다.

### 핵심 원칙
1. ✅ **원본 보존**: Spotify 세부 장르 데이터(`primaryGenre`, `artistGenres`) 절대 삭제/덮어쓰기 금지
2. ✅ **UI 호환**: 기존 코드가 기대하는 필드명과 구조 유지 (`country`, `region_bucket`)
3. ✅ **확장 가능**: 추후 추천/필터/시각화에 활용할 상위 카테고리(`genreFamily`) 추가

---

## 📂 파일 구조

```
out/
├── albums_spotify_v0.json     # 입력: Spotify API 원본 데이터
├── albums_spotify_v1.json     # 출력: 정규화된 데이터
└── report_step2_v1.json       # 출력: 품질 리포트

scripts/
├── normalize_dataset_v1.mjs   # 정규화 스크립트
└── validate_dataset_v1.mjs    # 검증 스크립트
```

---

## 🚀 실행 순서

### 1. 정규화 실행
```bash
npm run step2:normalize
```

**처리 내용:**
- ✅ `genreFamily` 추가 (상위 카테고리 매핑)
- ✅ `region_bucket` 추정 (market 기반, 100% 필수)
- ✅ `country` 표준화 (기존 UI 호환)
- ✅ 원본 Spotify 장르 데이터 유지

**출력:** `out/albums_spotify_v1.json`

### 2. 검증 실행
```bash
npm run step2:validate
```

**검증 항목:**
- 데이터 채움률 (year, genre, region, country, artwork)
- 분포 통계 (genreFamily Top 15, region_bucket, country Top 15)
- 경고 & 권장사항

**출력:** `out/report_step2_v1.json` + 콘솔 요약

---

## 📊 정규화 상세

### 1. genreFamily 매핑

Spotify의 세부 장르를 **13개 상위 카테고리**로 매핑 (원본 유지):

| Family | 키워드 예시 |
|--------|------------|
| Pop | pop, dance pop, indie pop, electropop |
| Rock | rock, classic rock, indie rock, psychedelic rock |
| Hip Hop | hip hop, rap, trap, gangsta rap |
| R&B/Soul | r&b, soul, neo soul, funk |
| Electronic | electronic, edm, house, techno, ambient |
| Jazz/Blues | jazz, blues, bebop, smooth jazz |
| Classical | classical, opera, baroque, orchestral |
| Alternative/Indie | alternative, indie folk, post-punk, shoegaze |
| Metal | metal, heavy metal, death metal, metalcore |
| Folk/World | folk, world, celtic, country, bluegrass |
| Latin | latin, reggaeton, salsa, bachata |
| K-pop/Asia Pop | k-pop, j-pop, korean, mandopop |
| Unknown | (매칭 실패 시) |

**알고리즘:**
- `primaryGenre` 우선 확인
- 매칭 실패 시 `artistGenres` 전체 스캔
- 키워드 부분 매칭으로 유연하게 처리
- confidence 점수 계산 (0.0 ~ 1.0)

### 2. region_bucket 추정 (필수!)

MapCanvas 크래시 방지를 위해 **100% 채워야 함**.

**우선순위:**
1. **Market 기반**: `KR` → `Asia`, `US` → `North America`
2. **장르 힌트**: `k-pop` → `Asia`, `reggaeton` → `Latin America`
3. **기본값**: `North America` (Unknown 허용 최소화)

**지원 region:**
- North America, Europe, Asia, Latin America
- Caribbean, Oceania, Africa, Unknown

### 3. country 표준화

**현재 상태: 전체 비어있음 (예상)**

Spotify v0 데이터에는 앨범별 country 정보가 없습니다 (market만 존재).

**처리 방식:**
```json
{
  "country": null,              // MapCanvas 호환 (null 허용)
  "countryName": null,          // 표준 풀네임
  "countryCode": null,          // ISO 코드
  "countrySource": "unknown"    // 데이터 출처
}
```

**기존 UI 영향:**
- ✅ MapCanvas는 `region_bucket`으로 폴백하므로 정상 작동
- ✅ Y축 세밀한 배치는 불가하지만 크래시 없음

---

## 📈 예상 결과

### 정규화 후 (albums_spotify_v1.json)
```json
{
  "albumId": "spotify:album:abc123",
  "title": "Album Title",
  "artistName": "Artist Name",
  "year": 1975,
  
  // 원본 Spotify 장르 (보존)
  "primaryGenre": "psychedelic rock",
  "artistGenres": ["psychedelic rock", "classic rock"],
  
  // 추가: 상위 카테고리
  "genreFamily": "Rock",
  "genreFamilyConfidence": 0.85,
  
  // 추가: 지역 (필수!)
  "region_bucket": "North America",
  "region_source": "market",
  
  // 추가: 국가 (현재 null)
  "country": null,
  "countryName": null,
  "countryCode": null,
  "countrySource": "unknown"
}
```

### 검증 리포트 예상 (report_step2_v1.json)
```json
{
  "summary": {
    "totalAlbums": 1000,
    "uniqueAlbumIds": 1000,
    "hasDuplicates": false
  },
  "fillRates": {
    "year": { "filled": 1000, "rate": 100.0 },
    "primaryGenre": { "filled": 692, "rate": 69.2 },
    "genreFamily": { "filled": 750, "rate": 75.0 },
    "region_bucket": { "filled": 1000, "rate": 100.0 },
    "country": { "filled": 0, "rate": 0.0 }
  },
  "warnings": [
    "country 필드가 전체 비어있습니다: 0.0%"
  ],
  "recommendations": [
    "💡 다음 단계: MusicBrainz/Discogs API로 country 데이터 보강 권장",
    "현재는 MapCanvas가 region_bucket으로 폴백하므로 정상 작동합니다"
  ]
}
```

---

## ⚠️ 알려진 제약사항

### 1. country 필드 비어있음 (0%)
**이유:** Spotify API는 앨범별 country 정보를 제공하지 않음

**영향:** 
- MapCanvas Y축 세밀한 배치 불가능
- 지역(region_bucket) 수준에서만 배치 가능

**다음 단계 (Step 3):**
- MusicBrainz API 연동하여 country 데이터 보강
- Discogs API 활용 가능
- 레이블 정보로 추정 가능

### 2. primaryGenre 채움률 낮음 (~69%)
**이유:** 일부 아티스트는 장르 정보가 없음

**영향:**
- genreFamily 매핑률 하락 가능
- 현재는 artistGenres로 보완

**개선 방안:**
- 장르 매핑 규칙 확장
- 앨범 제목/아티스트명 기반 추정 (Step 3)

---

## 🔍 품질 목표

| 항목 | 목표 | 현재 예상 |
|------|------|----------|
| year | 100% | ✅ 100% |
| primaryGenre | 70%+ | ⚠️ 69.2% |
| genreFamily | 70%+ | ✅ 75%+ |
| region_bucket | 100% | ✅ 100% |
| country | - | ⚠️ 0% (예상) |
| artworkUrl | 95%+ | ✅ 98%+ |

---

## 🛠️ 트러블슈팅

### "File not found: out/albums_spotify_v0.json"
```bash
# Spotify 데이터를 먼저 수집하세요
node fetch_spotify_albums.mjs
```

### "CRITICAL: region_bucket이 비어있습니다"
```bash
# normalize 스크립트의 deriveRegion 함수 확인
# market 또는 genre로 추정 로직이 실패한 경우
# scripts/normalize_dataset_v1.mjs 수정 필요
```

### genreFamily 채움률이 낮음 (< 70%)
```bash
# GENRE_FAMILY_MAP에 키워드 추가
# scripts/normalize_dataset_v1.mjs의 GENRE_FAMILY_MAP 수정
```

---

## 📋 체크리스트

실행 전 확인:
- [ ] `out/albums_spotify_v0.json` 존재 확인
- [ ] Node.js 설치 확인 (`node --version`)

실행 후 확인:
- [ ] `out/albums_spotify_v1.json` 생성 확인
- [ ] `out/report_step2_v1.json` 생성 확인
- [ ] region_bucket 채움률 100% 확인
- [ ] genreFamily 채움률 70%+ 확인
- [ ] country 비어있음 경고 확인 (예상)

---

## 🚀 다음 단계 (Step 3)

### country 데이터 보강
```bash
# MusicBrainz API 연동
npm run step3:enrich-country

# 예상 결과:
# country 채움률: 0% → 80%+
```

### 장르 데이터 개선
```bash
# 앨범명/레이블 기반 장르 추정
npm run step3:enhance-genres

# 예상 결과:
# primaryGenre 채움률: 69% → 90%+
```

---

## 📝 변경 이력

### v1 (2026-01-19)
- ✅ genreFamily 매핑 추가 (13개 카테고리)
- ✅ region_bucket 추정 (market 기반, 100% 필수)
- ✅ country 표준화 (기존 UI 호환)
- ✅ 검증 리포트 생성
- ✅ 원본 Spotify 장르 데이터 보존

---

## 📞 문의

문제 발생 시:
1. `out/report_step2_v1.json` 확인
2. 콘솔 경고 메시지 확인
3. `scripts/normalize_dataset_v1.mjs` 로직 검토
