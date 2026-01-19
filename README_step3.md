# Step 3: Country 보강 파이프라인 (MusicBrainz + Discogs)

## 🎯 목적

Step 2에서 생성된 데이터의 **country 정보를 외부 API로 보강**하여 MapCanvas의 Y축 국가별 노드 매핑을 활성화합니다.

### 핵심 원칙
1. ✅ **기존 값 보존**: country가 이미 있는 레코드는 절대 덮어쓰지 않음
2. ✅ **2단계 보강**: MusicBrainz (1차) → Discogs (2차, 실패 시만)
3. ✅ **데이터 유지**: Spotify 원본 장르 데이터 (`primaryGenre`, `artistGenres`) 절대 삭제 금지
4. ✅ **UI 호환**: 기존 코드가 읽는 `country` 필드에 결과 반영

---

## 📂 파일 구조

```
out/
├── albums_spotify_v1.json           # 입력: Step 2 정규화 데이터
├── albums_spotify_v3.json           # 출력: Country 보강 완료
└── report_step3_country.json        # 출력: 보강 결과 리포트

scripts/
├── enrich_country_v3.mjs            # 보강 스크립트 (MB + Discogs)
└── report_step3_country.mjs         # 리포트 생성 스크립트
```

---

## 🚀 실행 순서

### 0. 환경 설정 (선택사항)

`.env` 파일에 Discogs 토큰 추가 (없으면 MusicBrainz만 사용):

```bash
# .env
DISCOGS_TOKEN=your_discogs_personal_access_token
```

**Discogs 토큰 발급 방법:**
1. https://www.discogs.com/settings/developers 접속
2. "Generate new token" 클릭
3. 생성된 토큰 복사하여 `.env`에 추가

> ⚠️ **주의**: Discogs 토큰이 없어도 MusicBrainz만으로 실행 가능합니다.

### 1. Country 보강 실행

```bash
npm run step3:enrich-country
```

**처리 내용:**
- ✅ MusicBrainz API로 아티스트 출신 국가 조회
- ✅ Discogs API로 앨범 발매 국가 조회 (실패한 것만)
- ✅ 기존 country 값은 절대 덮어쓰지 않음
- ✅ Rate limit 자동 처리 (MB: 1req/s, Discogs: <60req/min)

**예상 소요 시간:**
- 1000개 앨범 기준: 약 20-30분
- MusicBrainz는 1초당 1요청 제한
- Discogs는 분당 60요청 제한

**출력:** `out/albums_spotify_v3.json`

### 2. 리포트 생성

```bash
npm run step3:report-country
```

**리포트 내용:**
- v1 vs v3 채움률 비교
- Source 분포 (musicbrainz / discogs / unknown)
- Type 분포 (artist_origin / release_country)
- Top 20 국가 분포
- 실패 케이스 샘플 20개
- 경고 & 권장사항

**출력:** `out/report_step3_country.json` + 콘솔 요약

---

## 📊 보강 상세

### 1. MusicBrainz API (1차 보강)

**대상**: 아티스트 출신 국가

**API 엔드포인트:**
```
https://musicbrainz.org/ws/2/artist?query=artist:<artistName>&fmt=json&limit=5
```

**선택 로직:**
1. Score 최상위 우선
2. 아티스트명 완전 일치 (대소문자/공백 무시) 우선
3. `artist.country` (ISO 코드) 또는 `artist.area.name` (국가명) 추출

**장점:**
- ✅ 정확한 아티스트 출신 국가 제공
- ✅ 무료, 토큰 불필요
- ✅ 음악 전문 데이터베이스

**제약:**
- ⚠️ Rate limit: 1 req/sec
- ⚠️ 일부 아티스트는 등록 안되어있음

### 2. Discogs API (2차 보강)

**대상**: 앨범 발매 국가 (MusicBrainz 실패한 것만)

**API 엔드포인트:**
```
https://api.discogs.com/database/search?q=<artistName> <albumTitle>&type=release&token=<TOKEN>&per_page=5
```

**선택 로직:**
1. 검색 결과에서 title에 artistName 포함 여부 확인
2. 가장 적합한 release의 `country` 필드 사용

**장점:**
- ✅ 앨범 정보가 풍부함
- ✅ 커버리지가 높음

**제약:**
- ⚠️ Personal Access Token 필요
- ⚠️ Rate limit: 60 req/min
- ⚠️ 발매 국가(release country)이므로 아티스트 출신지와 다를 수 있음

### 3. 데이터 구조

**추가되는 필드:**
```json
{
  "country": "South Korea",           // ← MapCanvas가 읽는 필드 (canonicalCountryField)
  "countryName": "South Korea",       // 표준 국가명
  "countryCode": "KR",                // ISO-2 코드 (가능한 경우)
  "countrySource": "musicbrainz",     // "musicbrainz" | "discogs" | "existing" | "unknown"
  "countryType": "artist_origin"      // "artist_origin" | "release_country" | "unknown"
}
```

**countrySource 의미:**
- `"existing"`: v1에서 이미 있던 값 (보존)
- `"musicbrainz"`: MusicBrainz로 보강
- `"discogs"`: Discogs로 보강
- `"unknown"`: 실패 (Unknown 처리)

**countryType 의미:**
- `"artist_origin"`: 아티스트 출신 국가 (MusicBrainz)
- `"release_country"`: 앨범 발매 국가 (Discogs)
- `"unknown"`: 정보 없음

---

## 📈 예상 결과

### 보강 전 (v1)
```json
{
  "country": null,
  "countryName": null,
  "countryCode": null,
  "countrySource": "unknown"
}
```

**채움률:** 0% (1000개 중 0개)

### 보강 후 (v3)
```json
{
  "country": "South Korea",
  "countryName": "South Korea",
  "countryCode": "KR",
  "countrySource": "musicbrainz",
  "countryType": "artist_origin"
}
```

**예상 채움률:** 60-80% (MusicBrainz + Discogs)

**분포 예상:**
```
Source:
  musicbrainz: 50-60%
  discogs: 10-20%
  unknown: 20-30%

Type:
  artist_origin: 50-60%
  release_country: 10-20%
  unknown: 20-30%
```

---

## 🔍 리포트 예시

### 콘솔 출력
```bash
📊 Step 3: Country Enrichment Report
======================================

1️⃣ Fill Rate Comparison
------------------------
v1 (before): 0/1000 (0.0%)
v3 (after):  723/1000 (72.3%)
Improvement: +723 (+72.3%p)

2️⃣ Country Source Distribution
-------------------------------
musicbrainz      598 (59.8%)
discogs          125 (12.5%)
unknown          277 (27.7%)

3️⃣ Country Type Distribution
-----------------------------
artist_origin        598 (59.8%)
release_country      125 (12.5%)
unknown              277 (27.7%)

4️⃣ Top 20 Countries
--------------------
United States            287 (28.7%)
United Kingdom           156 (15.6%)
South Korea               89 (8.9%)
Japan                     67 (6.7%)
Canada                    45 (4.5%)
...
⚠️ Unknown                277 (27.7%)

✅ Enrichment target achieved (+30%p+)
```

---

## ⚠️ 알려진 제약사항

### 1. MusicBrainz Rate Limit

**제약:** 1 req/sec (매우 느림)

**영향:**
- 1000개 앨범 → 최소 1000초 (약 17분)
- 재시도 포함 시 더 오래 걸림

**완화:**
- ✅ 캐시 사용: 동일 아티스트는 1회만 호출
- ✅ 자동 대기: sleep(1000ms) 포함

### 2. Discogs Token 필요

**제약:** Personal Access Token 필요

**영향:**
- 토큰 없으면 Discogs 단계 스킵
- MusicBrainz만 사용 → 채움률 낮아짐

**해결:**
```bash
# .env 파일에 추가
DISCOGS_TOKEN=your_token_here
```

### 3. 국가 정보 차이

**MusicBrainz (artist_origin):**
- 아티스트 출신 국가
- 예: BTS → "South Korea"

**Discogs (release_country):**
- 앨범 발매 국가
- 예: BTS 앨범 → "US" (미국 발매)

**영향:**
- 같은 아티스트도 앨범마다 country가 다를 수 있음
- MapCanvas에서 동일 아티스트가 여러 국가에 분산될 수 있음

**완화:**
- MusicBrainz 우선 사용 (artist_origin이 더 일관적)
- countryType으로 출처 명시

### 4. Unknown 비율

**예상:** 20-30%

**원인:**
- MusicBrainz에 등록 안된 아티스트
- Discogs에서도 앨범을 찾지 못함
- API 요청 실패

**완화:**
- Manual curation: 인기 앨범은 수동 입력
- 추가 API 연동 (LastFM, Spotify artist endpoint 등)

---

## 🛠️ 트러블슈팅

### "File not found: out/albums_spotify_v1.json"
```bash
# Step 2를 먼저 실행하세요
npm run step2:normalize
```

### "Rate limited by MusicBrainz"
```bash
# 자동으로 대기하지만, 너무 자주 실패하면:
# 1. 인터넷 연결 확인
# 2. MusicBrainz 서비스 상태 확인: https://musicbrainz.org
```

### "Discogs API error"
```bash
# 1. .env에 DISCOGS_TOKEN 확인
# 2. 토큰 유효성 확인: https://www.discogs.com/settings/developers
# 3. Rate limit (60 req/min) 초과 확인
```

### "Enrichment rate too low (< 30%)"
```bash
# 원인 분석:
npm run step3:report-country

# 리포트 확인 후:
# 1. failedCases 샘플 확인
# 2. 아티스트명 매칭 문제인지 확인
# 3. Discogs 토큰 추가 여부 확인
```

### "Too slow"
```bash
# MusicBrainz는 1 req/sec 제한이 있어 느립니다.
# 개선 방법:
# 1. 캐시가 작동하는지 확인 (동일 아티스트 재호출 없어야 함)
# 2. 중단 후 재실행 시 이미 완료된 것은 스킵되도록 개선
# 3. Parallel processing은 금지 (Rate limit 위반)
```

---

## 📋 체크리스트

실행 전 확인:
- [ ] `out/albums_spotify_v1.json` 존재 확인
- [ ] `.env`에 `DISCOGS_TOKEN` 추가 (선택사항)
- [ ] 인터넷 연결 확인

실행 후 확인:
- [ ] `out/albums_spotify_v3.json` 생성 확인
- [ ] `out/report_step3_country.json` 생성 확인
- [ ] country 채움률 30%+ 확인
- [ ] Top 국가 분포 합리적인지 확인
- [ ] Unknown 비율 50% 이하인지 확인

---

## 🎯 완료 기준

| 항목 | 목표 | 달성 방법 |
|------|------|----------|
| country 채움률 | +30%p 이상 | MusicBrainz + Discogs |
| MusicBrainz 성공률 | 50%+ | 아티스트명 정확 매칭 |
| Discogs 보완 | 10%+ | 토큰 설정 필수 |
| Unknown 비율 | 50% 이하 | 양질의 API 결과 |
| UI 호환성 | 100% | country 필드 동기화 |

---

## 🚀 다음 단계 (DB 임포트)

### Step 3.5: PostgreSQL 임포트

```python
# backend/scripts/import_albums_v3.py
# albums_spotify_v3.json → PostgreSQL

# 변환:
# - albumId (spotify:album:xxx) → id (String)
# - countryName → country (String)
# - genreFamily → genre (String)
# - primaryGenre → genre_detail (JSON)
# - artistGenres → artist_genres (JSON)
# - region_bucket → region_bucket (String)
```

**예상 결과:**
- DB에 1000개 앨범 임포트
- MapCanvas에서 국가별 Y축 노드 매핑 활성화
- 세밀한 위치 배치 (COUNTRY_Y_POSITION 사용)

---

## 📝 변경 이력

### v3 (2026-01-19)
- ✅ MusicBrainz API 1차 보강 (artist_origin)
- ✅ Discogs API 2차 보강 (release_country)
- ✅ 기존 country 값 보존
- ✅ Rate limit 자동 처리
- ✅ 캐시로 중복 호출 방지
- ✅ countrySource/countryType 메타데이터 추가
- ✅ 상세 리포트 생성

---

## 💡 개선 아이디어 (향후)

### 1. 추가 API 연동
- LastFM API (아티스트 정보)
- Spotify Artist Endpoint (출신지)
- AllMusic API

### 2. 매칭 개선
- Fuzzy matching (Levenshtein distance)
- 아티스트명 정규화 (대소문자, 공백, 특수문자)

### 3. 캐시 영속화
- 캐시를 파일로 저장 (`cache/musicbrainz.json`)
- 재실행 시 캐시 로드로 속도 향상

### 4. 병렬 처리 (주의)
- Rate limit 준수하면서 병렬 요청
- Queue 시스템으로 요청 관리

---

## 📞 문의

문제 발생 시:
1. `out/report_step3_country.json` 확인
2. 콘솔 경고 메시지 확인
3. `scripts/enrich_country_v3.mjs` 로직 검토
4. MusicBrainz/Discogs API 문서 참고

**API 문서:**
- MusicBrainz: https://musicbrainz.org/doc/MusicBrainz_API
- Discogs: https://www.discogs.com/developers
