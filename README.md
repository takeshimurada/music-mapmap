# 🎵 Sonic Topography - Music Map

<div align="center">

**음악을 시간과 공간으로 탐험하는 인터랙티브 2D 맵**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-61dafb)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791)](https://www.postgresql.org/)
[![Deck.gl](https://img.shields.io/badge/Deck.gl-8.9-ff69b4)](https://deck.gl/)

**Version 4.5.0** | 2026-01-23

</div>

---

## 📝 Changelog

### Version 4.5.1 (2026-01-25)

#### 🔍 SearchBar UX 개선
- ✅ **확장 인터랙션 개선**: 박스 어디를 클릭해도 확장
- ✅ **슬라이딩 전환**: 폭/패딩 애니메이션을 더 부드럽게 조정
- ✅ **단일 박스 스타일**: 이중 박스 구조 정리

#### 🗄️ 데이터 정리
- ✅ **중복 앨범 정리 SQL 추가**: `scripts/db/dedupe_album_groups.sql`
- ✅ **정리 전 백업 생성**: `backups/dedupe_20260125.sql.gz`

### Version 4.5.0 (2026-01-23)

#### 🎨 대규모 UI/UX 개편 - 라이트 테마 적용
- ✅ **디자인 시스템 전환**: 다크 네온 → 모던 라이트 테마
  - 참고 사이트: https://koreanmusicawards.com/archive/
  - 색상: 검은색 텍스트, 흰색 배경, 회색 보더
  - 깔끔하고 미니멀한 디자인 일관성
- ✅ **Archive 페이지 구현**:
  - 모든 앨범을 그리드 형태로 표시
  - 장르, 연도, 국가, 정렬 필터 지원
  - 무한 스크롤 (50개씩 로드)
  - 앨범 클릭 시 DetailPanel 표시
  - 성능 최적화 (React.memo, progressive loading)

#### 🗺️ Map Canvas 개선
- ✅ **라이트 테마 적용**:
  - 흰색 배경 (`clearColor: [1, 1, 1, 1]`)
  - 검은색 텍스트 및 라인
  - 투명한 가장자리 (블러 효과 제거)
- ✅ **노드 인터랙션 개선**:
  - 클릭 즉시 크기 1.8배 확대 + 검은색 테두리 (0.5px)
  - 드래그/줌 시 DetailPanel 자동 닫기
  - DetailPanel 닫힐 때 노드 원상태 복구
  - 즉각 반응 (애니메이션 제거, useMemo dependency 최적화)

#### 🎯 UI 컴포넌트 개선
- ✅ **SearchBar & Library**:
  - 높이 통일 (40px)
  - 검색창 확장 시 가로만 확대
  - 배경 클릭으로 자동 닫기
  - "My" → "Library"로 명칭 변경
- ✅ **Library Panel 리디자인**:
  - 모던하고 시크한 레이아웃
  - 컴팩트한 카드 디자인
  - 검은색 액센트 컬러
- ✅ **DetailPanel**:
  - 배경 클릭으로 닫기
  - 라이트 테마 적용
- ✅ **모든 패널 일관성**:
  - Navigation, TimelineBar, ForYouPanel 등 전체 라이트 테마 통일

#### 🚀 성능 최적화
- ✅ Archive 페이지 progressive loading
- ✅ React.memo로 AlbumCard 최적화
- ✅ useMemo dependency 정확성 개선
- ✅ 무한 스크롤 IntersectionObserver 구현

---

### Version 4.1.0 (2026-01-21)

#### 🔧 메타데이터 임포트 시스템 개선
- ✅ **Spotify 프로필 임포트 버그 수정**: Creators가 이미 존재해도 프로필이 없으면 자동 추가
- ✅ **Phase 분리**: Phase 1a (Creators), Phase 1b (Spotify Profiles) 독립 처리
- ✅ **통계 출력 개선**: 최종 DB 통계에 `creator_spotify_profile` 개수 추가
- ✅ **누락 방지**: 나중에 `npm run metadata:import` 재실행 시 프로필 자동 보완

#### 📊 데이터 무결성
- ✅ **메타데이터 완전성 확인**: 769개 Spotify 프로필 추가 임포트
- ✅ **자동화 개선**: 한 번의 명령으로 모든 메타데이터 임포트 보장

---

### Version 4.0.0 (2026-01-21)

#### 🎯 데이터 안정화 및 성능 최적화
- ✅ **프론트엔드 로드 개선**: 앨범 로드 limit을 50,000개로 증가 (이전 2,000개)
- ✅ **DB 데이터 복원**: 3,914개 앨범, 3,914개 map_nodes, 5,387명 creators 복구
- ✅ **파일 정리**: 중간 버전 JSON 파일 제거 (v1, v2, v3), 최종 v0.json만 유지
- ✅ **개발 환경 개선**: .gitignore에 .cursor 폴더 추가, __pycache__ 정리

#### 🗄️ 데이터베이스 무결성
- ✅ **테이블 검증**: album_groups (3,914), map_nodes (3,914), creators (5,387), releases (3,914)
- ✅ **백업 시스템**: Docker 컨테이너 기반 백업/복원 자동화

---

### Version 3.5.0 (2026-01-20)

#### 🗄️ 데이터베이스 스키마 대규모 리팩터링
- ✅ **Target Schema 마이그레이션 완료**: `albums` → `album_groups`, `artists` → `creators` 통합
- ✅ **역할 정규화**: `roles` 테이블 기반 크레딧 시스템 (`album_credits`, `track_credits`)
- ✅ **네임스페이스 ID 전략**: `spotify:album:<id>`, `spotify:artist:<id>`, `local:creator:<uuid>` 형식
- ✅ **트랙 레벨 크레딧**: 각 트랙별 프로듀서/작곡가/작사가 분리 저장
- ✅ **마이그레이션 스크립트**: 기존 데이터 자동 이관 (`scripts/db/migrate_to_target_schema.py`)
- ✅ **스키마 검증 도구**: 데이터 무결성 확인 (`scripts/db/validate_target_schema.py`)

#### 🎤 메타데이터 임포트 시스템
- ✅ **아티스트 정보**: Spotify API 기반 `creators` + `creator_spotify_profile` 임포트
- ✅ **협업 관계**: 메인/피처링 아티스트 → `album_credits` 자동 매핑
- ✅ **크레딧 정보**: MusicBrainz 기반 프로듀서/엔지니어/작사가 정보 수집 및 임포트
- ✅ **역할 시드**: 14개 기본 역할 자동 생성 (`scripts/db/seed_roles.py`)
- ✅ **배치 임포트**: 대용량 데이터 효율적 처리 (1000+ 앨범, 600+ 아티스트)

#### 📊 Spotify 데이터 통합
- ✅ **1000개 앨범 임포트**: `albums_spotify_v3.json` → `album_groups` + `map_nodes` + `releases`
- ✅ **API 정렬 개선**: 최신 데이터 우선 표시 (`ORDER BY created_at DESC`)
- ✅ **데이터 분포**: 1950s-2020s 연대별 앨범 분포 (1970s 중심)

#### 🔧 개발 도구 개선
- ✅ **메타데이터 파이프라인**: `npm run fetch:metadata` → `npm run metadata:import` 원클릭 실행
- ✅ **DB 임포트 스크립트**: `import_album_groups.py`, `import_metadata.py` 분리
- ✅ **에러 처리 강화**: FK 제약 조건 자동 처리, 누락 데이터 스킵

---

### Version 3.0.0 (이전)

#### 🎨 앨범 커버 이미지 시스템
- ✅ MusicBrainz 앨범에 Cover Art Archive 통합
- ✅ 기존 DB 앨범 커버 자동 업데이트 스크립트 (`scripts/db/update_covers.py`)
- ✅ 앨범 커버 통계 및 관리 도구

#### 🗺️ UI/UX 개선
- ✅ X축 연도 범위 확장: 1960 → **1950년부터 시작**
- ✅ 1950년 기준선 추가 (은은한 보라색 라인)
- ✅ 지역 레이블 위치 최적화 (노드 영역 밖에서 시작)
- ✅ 타임슬라이더 1950-2024 범위로 확장

#### 📦 데이터 파이프라인
- ✅ MusicBrainz 데이터 수집 안정화
- ✅ Cover Art Archive API 통합
- ✅ DB 백업/복원 시스템 구축
- ✅ 초기 셋업 자동화 스크립트

#### 🔧 개발 경험 개선
- ✅ Docker 볼륨 영구 저장 가이드
- ✅ 프로젝트 재구조화 완료 (frontend/, backend/, scripts/)
- ✅ 명확한 Quick Start 가이드

---

## 📋 목차

1. [프로젝트 개요](#-프로젝트-개요)
2. [주요 기능](#-주요-기능)
3. [기술 스택](#-기술-스택)
4. [시스템 아키텍처](#-시스템-아키텍처)
5. [데이터베이스 스키마](#-데이터베이스-스키마)
6. [API 문서](#-api-문서)
7. [빠른 시작](#-빠른-시작)
8. [데이터 파이프라인](#-데이터-파이프라인)
9. [프론트엔드 가이드](#-프론트엔드-가이드)
10. [백엔드 가이드](#-백엔드-가이드)
11. [사용자 시스템](#-사용자-시스템)
12. [AI 기능](#-ai-기능)
13. [환경 변수](#-환경-변수)
14. [트러블슈팅](#-트러블슈팅)
15. [개발 가이드](#-개발-가이드)

---

## 🎯 프로젝트 개요

**Sonic Topography**는 음악 앨범을 2D 지도 상에 시각화하여 탐색할 수 있는 웹 애플리케이션입니다.

### 핵심 컨셉
- **X축**: 발매 연도 (1960-2024)
- **Y축**: 지역/국가 (8개 대륙, 60+ 국가)
- **크기**: 인기도 (Spotify popularity)
- **색상**: 지역별 구분 (북미, 유럽, 아시아, 남미, 라틴아메리카, 카리비안, 오세아니아, 아프리카)

### 주요 특징
- 🗺️ WebGL 기반 고성능 2D 맵 렌더링 (2,000+ 앨범 동시 표시)
- 🔍 실시간 검색 및 필터링 (연도, 지역, 검색어)
- 🤖 Gemini AI 기반 앨범 상세 정보 생성
- ❤️ 사용자 좋아요 시스템 및 이벤트 로깅
- 📊 LOD (Level of Detail) 최적화 (줌 레벨에 따라 그리드 집계 ↔ 개별 노드 전환)
- 🎨 Modern UI with Glass Morphism

---

## ✨ 주요 기능

### 1. 인터랙티브 2D 맵
- **Deck.gl** 기반 WebGL 렌더링
- 드래그 팬, 마우스 휠 줌
- 호버 시 앨범 정보 프리뷰
- 클릭 시 상세 패널 열기

### 2. 필터링 & 검색
- **연도 범위 슬라이더**: 1960-2024
- **지역 토글**: 8개 대륙/지역 필터
- **검색**: 앨범명, 아티스트명 실시간 검색
- **하이라이트**: 검색 결과 강조 표시

### 3. 앨범 상세 정보
- Spotify 앨범 커버
- AI 생성 앨범 요약 (한국어/영어)
- 트랙리스트, 크레딧 정보
- 리뷰 다이제스트 (Rolling Stone, Pitchfork, AllMusic 등)
- Spotify로 열기 (외부 링크)

### 4. 사용자 기능
- **좋아요 (Like)**: 앨범/아티스트 좋아요
- **For You 패널**: 좋아요한 앨범 목록
- **이벤트 로깅**: 검색, 클릭, 재생 등 사용자 행동 기록
- **My Logs**: 개인 메모 및 평점 (향후 구현)

### 5. LOD 최적화
- **줌 < 2.0**: 그리드 집계 (5년/0.1 vibe 단위)
- **줌 ≥ 2.0**: 개별 앨범 노드 (최대 2,000개)
- 성능: 60 FPS 유지

---

## 🛠️ 기술 스택

### 프론트엔드

| 기술 | 버전 | 역할 |
|------|------|------|
| **React** | 19.2.3 | UI 컴포넌트 프레임워크 |
| **TypeScript** | 5.8.2 | 타입 안정성 |
| **Vite** | 6.2.0 | 개발 서버 & 빌드 도구 |
| **Deck.gl** | 8.9.35 | WebGL 기반 데이터 시각화 |
| **Zustand** | 4.5.2 | 전역 상태 관리 |
| **D3.js** | 7.9.0 | 스케일 함수 및 데이터 변환 |
| **Lucide React** | 0.460.0 | 아이콘 라이브러리 |
| **Google Generative AI** | 0.21.0 | Gemini AI SDK |

### 백엔드

| 기술 | 버전 | 역할 |
|------|------|------|
| **FastAPI** | 0.109.0 | Python 비동기 REST API 서버 |
| **SQLAlchemy** | 2.0.25 | ORM (Object-Relational Mapping) |
| **AsyncPG** | 0.29.0 | PostgreSQL 비동기 드라이버 |
| **Uvicorn** | 0.27.0 | ASGI 서버 |
| **Pydantic** | (via FastAPI) | 데이터 검증 및 스키마 |
| **Google GenAI** | 0.2.1 | Gemini AI Python SDK |
| **Redis** | 5.0.1 | 캐싱 (향후 활용) |

### 데이터베이스

| 기술 | 버전 | 역할 |
|------|------|------|
| **PostgreSQL** | 15 | 메인 데이터 저장소 |
| **Redis** | 7 | 캐싱 및 세션 관리 |

### 인프라

| 기술 | 역할 |
|------|------|
| **Docker** | 컨테이너화 |
| **Docker Compose** | 멀티 컨테이너 오케스트레이션 |

### 외부 API

| 서비스 | 용도 |
|--------|------|
| **Spotify API** | 앨범 메타데이터 수집 |
| **MusicBrainz API** | 아티스트 출신 국가 보강 |
| **Discogs API** | 앨범 발매 국가 보강 |
| **Google Gemini API** | AI 기반 앨범 리서치 |
| **Last.fm API** | 보조 음악 데이터 (선택) |

---

## 🏗️ 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐             │
│  │ MapCanvas │  │  Detail  │  │  Search  │             │
│  │ (Deck.gl) │  │  Panel   │  │   Bar    │             │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘             │
│        │             │              │                    │
│        └─────────────┴──────────────┘                    │
│                      │                                   │
│              ┌───────▼───────┐                           │
│              │  Zustand      │  (Global State)           │
│              │  Store        │                           │
│              └───────┬───────┘                           │
└──────────────────────┼───────────────────────────────────┘
                       │ HTTP/JSON
┌──────────────────────▼───────────────────────────────────┐
│                 Backend (FastAPI)                        │
│  ┌────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  Album     │  │   User      │  │   Gemini    │       │
│  │  Routes    │  │   Routes    │  │   Service   │       │
│  └─────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
│        │                │                 │              │
│        └────────────────┴─────────────────┘              │
│                         │                                │
│                ┌────────▼────────┐                       │
│                │  SQLAlchemy     │  (ORM)                │
│                │  AsyncPG        │                       │
│                └────────┬────────┘                       │
└─────────────────────────┼──────────────────────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
┌───────▼────────┐              ┌───────────▼──────┐
│  PostgreSQL    │              │     Redis        │
│  (Main DB)     │              │   (Cache)        │
└────────────────┘              └──────────────────┘

External APIs:
┌────────────┐  ┌──────────────┐  ┌──────────────┐
│  Spotify   │  │ MusicBrainz  │  │   Gemini     │
│    API     │  │     API      │  │     API      │
└────────────┘  └──────────────┘  └──────────────┘
```

### 데이터 흐름

1. **앨범 로드**: Frontend → `GET /albums` → Backend → PostgreSQL → Frontend Store
2. **검색**: Frontend → Store 필터링 (로컬) + `POST /events` (로깅)
3. **앨범 선택**: Frontend → `GET /albums/{id}` → AI 리서치 → `POST /research`
4. **좋아요**: Frontend → `POST /me/likes` → PostgreSQL `user_likes` 테이블
5. **For You**: Frontend → `GET /me/likes` → PostgreSQL → Frontend

---

## 🗄️ 데이터베이스 스키마

> ✅ **Version 3.5.0**: Target Schema 마이그레이션 완료  
> `album_groups`, `creators`, `roles`, `album_credits`, `track_credits` 기반으로 동작합니다.  
> 자세한 구조는 [`TARGET_SCHEMA.md`](./TARGET_SCHEMA.md)를 참고하세요.

### 핵심 테이블 구조

#### 1. `album_groups` - 앨범 그룹 (기존 `albums` 대체)

```sql
CREATE TABLE album_groups (
    album_group_id VARCHAR PRIMARY KEY,  -- spotify:album:<id> 또는 local:album:<uuid>
    title VARCHAR NOT NULL,
    primary_artist_display VARCHAR NOT NULL,
    original_year INTEGER,
    country_code VARCHAR,
    primary_genre VARCHAR,
    popularity FLOAT DEFAULT 0.0,
    cover_url VARCHAR,
    is_anchor BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_album_groups_title ON album_groups(title);
CREATE INDEX idx_album_groups_year ON album_groups(original_year);
```

**예시 데이터:**
```json
{
  "id": "spotify:album:4LH4d3cOWNNsVw41Gqt2kv",
  "title": "The Dark Side of the Moon",
  "artist_name": "Pink Floyd",
  "year": 1973,
  "genre": "Rock",
  "genre_vibe": 0.5,
  "region_bucket": "Europe",
  "country": "United Kingdom",
  "popularity": 0.88,
  "cover_url": "https://i.scdn.co/image/..."
}
```

#### 2. `creators` - 크리에이터 통합 (아티스트/프로듀서/작사가 등)

```sql
CREATE TABLE creators (
    creator_id VARCHAR PRIMARY KEY,      -- spotify:artist:<id> 또는 local:creator:<uuid>
    display_name VARCHAR NOT NULL,
    bio TEXT,
    image_url VARCHAR,
    kind VARCHAR NOT NULL,               -- 'person', 'group', 'label'
    primary_role_tag VARCHAR,            -- 'artist', 'producer', etc.
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE creator_spotify_profile (
    creator_id VARCHAR PRIMARY KEY REFERENCES creators(creator_id),
    genres JSON DEFAULT '[]',
    popularity INTEGER,
    followers BIGINT,
    spotify_url TEXT
);
```

#### 3. `roles` - 역할 정규화 테이블
```sql
CREATE TABLE roles (
    role_id VARCHAR PRIMARY KEY,         -- local:role:<uuid>
    role_name VARCHAR UNIQUE NOT NULL,   -- 'Primary Artist', 'Producer', 'Engineer', etc.
    role_group VARCHAR NOT NULL,         -- 'artist', 'production', 'engineering', etc.
    importance_rank INTEGER DEFAULT 100
);
```

#### 4. `album_credits` - 앨범 레벨 크레딧
```sql
CREATE TABLE album_credits (
    album_group_id VARCHAR REFERENCES album_groups(album_group_id),
    creator_id VARCHAR REFERENCES creators(creator_id),
    role_id VARCHAR REFERENCES roles(role_id),
    credit_detail TEXT,
    credit_order SMALLINT,
    source_confidence SMALLINT DEFAULT 50,
    PRIMARY KEY (album_group_id, creator_id, role_id)
);
```

#### 5. `track_credits` - 트랙 레벨 크레딧
```sql
CREATE TABLE track_credits (
    track_id VARCHAR REFERENCES tracks(track_id),
    creator_id VARCHAR REFERENCES creators(creator_id),
    role_id VARCHAR REFERENCES roles(role_id),
    credit_detail TEXT,
    credit_order SMALLINT,
    PRIMARY KEY (track_id, creator_id, role_id)
);
```

### 6. `ai_research` - AI 생성 리서치 캐시

```sql
CREATE TABLE ai_research (
    id SERIAL PRIMARY KEY,
    album_group_id VARCHAR REFERENCES album_groups(album_group_id),
    lang VARCHAR NOT NULL,               -- 'en' or 'ko'
    summary_md TEXT,                     -- 마크다운 요약
    sources JSON,                        -- 출처 정보
    confidence FLOAT,                    -- 신뢰도 (0.0-1.0)
    cache_key VARCHAR UNIQUE NOT NULL,   -- 캐시 키
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ai_research_cache ON ai_research(cache_key);
```

### 7. `dev_users` - 개발용 유저 (Step 1 MVP)

```sql
CREATE TABLE dev_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**특징:**
- 이메일, 비밀번호 없음 (개발용)
- UUID만으로 식별
- 프론트엔드 localStorage에 저장
- 향후 Google OAuth로 전환 예정

### 8. `user_likes` - 사용자 좋아요

```sql
CREATE TABLE user_likes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES dev_users(id) NOT NULL,
    entity_type VARCHAR NOT NULL,        -- 'album' or 'artist'
    entity_id UUID NOT NULL,             -- 앨범/아티스트 UUID
    liked_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, entity_type, entity_id),
    CHECK(entity_type IN ('album', 'artist'))
);

CREATE INDEX idx_user_likes_user_entity ON user_likes(user_id, entity_type);
```

**예시 데이터:**
```json
{
  "id": 123,
  "user_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "entity_type": "album",
  "entity_id": "4LH4d3cOWNNsVw41Gqt2kv",
  "liked_at": "2026-01-19T10:30:00Z"
}
```

### 9. `user_events` - 사용자 이벤트 로그

```sql
CREATE TABLE user_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES dev_users(id) NOT NULL,
    event_type VARCHAR NOT NULL,         -- 'search', 'view_album', 'open_on_platform', etc.
    entity_type VARCHAR,                 -- 'album', 'artist' (nullable)
    entity_id UUID,                      -- UUID (nullable)
    payload JSONB,                       -- 추가 데이터
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_events_user_time ON user_events(user_id, created_at);
CREATE INDEX idx_user_events_type ON user_events(event_type);
```

**예시 데이터:**
```json
{
  "id": 456,
  "user_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "event_type": "search",
  "entity_type": null,
  "entity_id": null,
  "payload": {"query": "pink floyd"},
  "created_at": "2026-01-19T10:31:00Z"
}
```

### 10. `users` - 정식 유저 (향후 구현)

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    google_sub VARCHAR UNIQUE NOT NULL,  -- Google OAuth Sub
    email VARCHAR UNIQUE NOT NULL,
    name VARCHAR,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 11. `user_ratings` - 사용자 평점 (향후 구현)

```sql
CREATE TABLE user_ratings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    album_id VARCHAR REFERENCES albums(id),
    rating INTEGER NOT NULL,             -- 1-5
    note TEXT,                           -- 메모
    listened_at DATE,                    -- 청취 날짜
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, album_id)
);
```

---

## 📡 API 문서

### Base URL
- **프론트엔드**: `http://localhost:3000` (Vite 개발 서버)
- **백엔드**: `http://localhost:8000` (FastAPI)

### 인증 (개발용)
모든 인증 필요 엔드포인트는 헤더에 `X-User-Id` 필요:

```http
X-User-Id: f47ac10b-58cc-4372-a567-0e02b2c3d479
```

---

### 🎵 앨범 관련 API

#### 1. 앨범 목록 조회
```http
GET /albums?limit=2000&offset=0
```

**응답:**
```json
{
  "data": [
    {
      "id": "spotify:album:4LH4d3cOWNNsVw41Gqt2kv",
      "title": "The Dark Side of the Moon",
      "artist_name": "Pink Floyd",
      "year": 1973,
      "genre": "Rock",
      "genre_vibe": 0.5,
      "region_bucket": "Europe",
      "country": "United Kingdom",
      "popularity": 0.88,
      "cover_url": "https://i.scdn.co/image/...",
      "created_at": "2026-01-19T10:00:00Z"
    }
  ],
  "meta": null
}
```

#### 2. 앨범 검색
```http
GET /search?q=pink floyd
```

**응답:** 위와 동일 (최대 20개)

#### 3. 앨범 상세 조회
```http
GET /albums/{album_id}
```

**응답:**
```json
{
  "data": {
    "id": "spotify:album:4LH4d3cOWNNsVw41Gqt2kv",
    "title": "The Dark Side of the Moon",
    ...
  }
}
```

#### 4. 맵 포인트 조회 (LOD 지원)
```http
GET /map/points?yearFrom=1960&yearTo=2024&zoom=1.5
```

**zoom < 2.0 (그리드 집계):**
```json
{
  "data": [
    {
      "x": 1972.5,           // 평균 연도
      "y": 0.45,             // 평균 vibe
      "r": 12,               // 반경 (앨범 수 기반)
      "count": 25,           // 앨범 개수
      "color": "Europe",     // 지역
      "is_cluster": true
    }
  ]
}
```

**zoom ≥ 2.0 (개별 포인트):**
```json
{
  "data": [
    {
      "id": "spotify:album:4LH4d3cOWNNsVw41Gqt2kv",
      "x": 1973,
      "y": 0.5,
      "r": 8.8,              // popularity * 10 + 2
      "color": "Europe",
      "is_cluster": false,
      "label": "The Dark Side of the Moon"
    }
  ]
}
```

#### 5. AI 리서치
```http
POST /research
Content-Type: application/json

{
  "album_id": "spotify:album:4LH4d3cOWNNsVw41Gqt2kv",
  "lang": "ko"
}
```

**응답:**
```json
{
  "data": {
    "summary_md": "마크다운 형식 요약...",
    "sources": [
      {"url": "https://...", "title": "Rolling Stone Review"}
    ],
    "confidence": 0.85
  }
}
```

---

### 👤 사용자 관련 API

#### 1. 개발용 유저 생성
```http
POST /dev/users
```

**응답:**
```json
{
  "user_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**사용법:**
- 앱 최초 실행 시 자동 호출
- `localStorage`에 `devUserId` 저장
- 이후 모든 요청에 `X-User-Id` 헤더 포함

#### 2. 좋아요 추가
```http
POST /me/likes
Content-Type: application/json
X-User-Id: {user_id}

{
  "entity_type": "album",
  "entity_id": "4LH4d3cOWNNsVw41Gqt2kv"
}
```

**응답:**
```json
{
  "status": "liked"
}
```

**특징:**
- 멱등성: 이미 좋아요한 경우 중복 추가 안 됨
- entity_type: `"album"` 또는 `"artist"`

#### 3. 좋아요 삭제
```http
DELETE /me/likes
Content-Type: application/json
X-User-Id: {user_id}

{
  "entity_type": "album",
  "entity_id": "4LH4d3cOWNNsVw41Gqt2kv"
}
```

**응답:**
```json
{
  "status": "unliked"
}
```

#### 4. 좋아요 목록 조회
```http
GET /me/likes?entity_type=album
X-User-Id: {user_id}
```

**응답:**
```json
{
  "items": [
    {
      "entity_type": "album",
      "entity_id": "4LH4d3cOWNNsVw41Gqt2kv",
      "liked_at": "2026-01-19T10:30:00Z"
    }
  ]
}
```

**쿼리 파라미터:**
- `entity_type` (선택): `"album"` 또는 `"artist"` 필터링

#### 5. 이벤트 로깅
```http
POST /events
Content-Type: application/json
X-User-Id: {user_id}

{
  "event_type": "search",
  "entity_type": null,
  "entity_id": null,
  "payload": {"query": "pink floyd"}
}
```

**응답:**
```json
{
  "status": "ok",
  "event_id": 456
}
```

**event_type 종류:**
- `"search"`: 검색
- `"view_album"`: 앨범 상세 보기
- `"view_artist"`: 아티스트 상세 보기
- `"open_on_platform"`: Spotify 등으로 열기
- `"recommendation_click"`: 추천 클릭
- `"playlist_create"`: 플레이리스트 생성 (향후)

---

### 🔧 유틸리티 API

#### 헬스 체크
```http
GET /health
```

**응답:**
```json
{
  "status": "ok"
}
```

---

## 🚀 빠른 시작

### ⚡ 자동 셋업 (권장)

**한 줄로 시작하기:**

```bash
git clone <repository-url>
cd music-mapmap-1
chmod +x setup.sh && ./setup.sh
```

이 스크립트가 자동으로:
- ✅ 필수 요구사항 확인 (Docker, Node.js)
- ✅ 환경 변수 파일 생성 (`.env`, `frontend/.env.local`)
- ✅ 의존성 설치
- ✅ Docker 컨테이너 시작
- ✅ 데이터베이스 상태 확인

---

### 📋 수동 셋업 (상세)

#### 1. 사전 준비

**필수:**
- Node.js 18+ ([다운로드](https://nodejs.org/))
- Docker & Docker Compose ([다운로드](https://www.docker.com/))
- Git

#### 2. 저장소 클론

```bash
git clone <repository-url>
cd music-mapmap-1
```

#### 3. 환경 변수 설정

**프론트엔드 (`frontend/.env.local`):**

```bash
# Gemini API Key (https://aistudio.google.com/apikey)
VITE_API_KEY=your_gemini_api_key_here
```

**백엔드 (`.env`):**

```bash
# Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Spotify API (데이터 수집용, 선택사항)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# Database (기본값 사용 가능)
POSTGRES_USER=sonic
POSTGRES_PASSWORD=sonic_password
POSTGRES_DB=sonic_db
```

#### 4. Docker 시작

```bash
docker-compose up -d
```

**DB 시드 (새 환경에서 즉시 데이터 표시):**
- 이 프로젝트는 `db.Dockerfile` + `db-init.sql.gz`로 **시드된 PostgreSQL 이미지**를 사용합니다.
- 새 컴퓨터/새 환경에서는 `docker-compose up -d`만으로 초기 데이터가 자동 로드됩니다.
- 기존 볼륨이 있으면 시드가 다시 적용되지 않습니다. 새로 초기화하려면 볼륨을 삭제한 뒤 실행하세요.

**확인:**
- 백엔드: http://localhost:8000/health
- 프론트엔드는 아래에서 실행

#### 5. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 **http://localhost:5173** 접속

#### 6. 데이터베이스 채우기

> ✅ 새 환경에서는 기본 시드가 자동으로 들어갑니다.  
> 데이터가 없거나 갱신이 필요할 때만 아래 옵션을 사용하세요.

**옵션 A: 백업 복원 (가장 빠름, 백업 파일이 있는 경우)**

```bash
./scripts/db/restore.sh backup_name
```

**옵션 B: MusicBrainz 수집 (권장, ~10분, 500개 앨범)**

```bash
docker exec sonic_backend bash -c "PYTHONPATH=/app python scripts/fetch/musicbrainz.py"
```

**옵션 C: Spotify 수집 (API 키 필요, rate limit 주의)**

```bash
# .env에 SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET 설정 후
npm run fetch:spotify
```

#### 7. 정상 작동 확인

브라우저에서 확인:
- ✅ 지도에 앨범 노드들이 표시됨
- ✅ 검색창에서 앨범 검색 가능
- ✅ 앨범 클릭 시 상세 패널 열림
- ✅ AI 분석 생성 (Gemini API 키 필요)
- ✅ 좋아요 버튼 작동

---

### 💾 데이터베이스 백업/복원

**백업 생성:**

```bash
./scripts/db/backup.sh my_backup_name
# 파일 생성: ./backups/my_backup_name.sql.gz
```

**시드 이미지 업데이트 (새 환경용):**
1. 최신 DB 덤프를 `db-init.sql.gz`로 교체
2. `docker-compose build db`
3. 새 환경에서 `docker-compose up -d`

**백업 복원:**

```bash
./scripts/db/restore.sh my_backup_name
```

**다른 컴퓨터로 이동:**

1. `./backups/` 폴더를 복사
2. 새 환경에서 `./scripts/db/restore.sh backup_name` 실행

> 💡 **Tip**: Git에 작은 백업 파일 포함 가능 (권장: < 50MB)

---

### 🆘 문제 해결

**문제: Docker 컨테이너가 시작되지 않음**
```bash
docker-compose down
docker-compose up -d
docker ps  # 컨테이너 상태 확인
```

**문제: DB가 비어있음**
```bash
# MusicBrainz로 데이터 수집
docker exec sonic_backend bash -c "PYTHONPATH=/app python scripts/fetch/musicbrainz.py"
```

**문제: 프론트엔드가 백엔드에 연결 안됨**
- Backend 상태 확인: `docker logs sonic_backend`
- http://localhost:8000/health 접속해보기
- CORS 설정 확인 (`backend/app/main.py`)

**문제: AI 분석이 작동하지 않음**
- `frontend/.env.local`에 `VITE_API_KEY` 설정 확인
- Gemini API 키 발급: https://aistudio.google.com/apikey
- 브라우저 콘솔(F12)에서 에러 확인

---

## 🔄 데이터 파이프라인

### 전체 플로우

```
┌─────────────┐
│  Spotify    │
│    API      │  fetch_spotify_albums.mjs
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ v0.json     │  ← Raw data (primaryGenre, artistGenres, market)
└──────┬──────┘
       │ npm run step2:normalize
       ▼
┌─────────────┐
│ v1.json     │  ← Normalized (genreFamily, region_bucket)
└──────┬──────┘
       │ npm run step2.5:enrich-genre
       ▼
┌─────────────┐
│ v2.json     │  ← Genre enriched (MusicBrainz/Discogs)
└──────┬──────┘
       │ npm run step3:enrich-country
       ▼
┌─────────────┐
│ v3.json     │  ← Country enriched (final)
└──────┬──────┘
       │ npm run pipeline:import
       ▼
┌─────────────┐
│ PostgreSQL  │  ← Database (albums 테이블)
└─────────────┘
```

---

### Step 0: 데이터 수집 (Spotify API)

**스크립트:** `scripts/fetch/spotify.mjs`

**역할:**
- Spotify Web API로 앨범 메타데이터 수집
- 장르, 아티스트, 연도, 커버, 인기도 등

**실행:**
```bash
npm run fetch:spotify
# 또는
node scripts/fetch/spotify.mjs
```

**플레이리스트에서 수집:**
```bash
npm run fetch:playlists
# 또는
node scripts/fetch/playlists.mjs
```

**출력:** `out/albums_spotify_v0.json`

**주의:**
- Spotify API Rate Limit 존재
- 많은 양 수집 시 시간 소요 (1000개 기준 30분+)

---

### Step 1: 데이터 정규화

**스크립트:** `scripts/pipeline/normalize.mjs`

**역할:**
1. **genreFamily 매핑**: Spotify 세부 장르 → 13개 상위 카테고리
   - Pop, Rock, Hip Hop, R&B/Soul, Electronic, Jazz/Blues, Classical, Alternative/Indie, Metal, Folk/World, Latin, K-pop/Asia Pop, Unknown

2. **region_bucket 추정**: Market 코드 기반 지역 분류
   - North America, Europe, Asia, South America, Latin America, Caribbean, Oceania, Africa

3. **country 표준화**: 국가 필드 초기화 (Step 3에서 보강)

**실행:**
```bash
npm run pipeline:normalize
```

**입력:** `out/albums_spotify_v0.json`  
**출력:** `out/albums_spotify_v1.json`

**검증:**
```bash
npm run pipeline:validate
```

**품질 목표:**
- year: 100%
- genreFamily: 70%+
- region_bucket: 100%
- country: 0% (예상, Step 3에서 보강)

---

### Step 2: 장르 보강 (선택)

**스크립트:** `scripts/pipeline/enrich_genre.mjs`

**역할:**
- MusicBrainz/Discogs API로 장르 정보 추가 보강
- primaryGenre가 없는 앨범 위주

**실행:**
```bash
npm run pipeline:enrich-genre
```

**입력:** `out/albums_spotify_v1.json`  
**출력:** `out/albums_spotify_v2.json`

---

### Step 3: 국가 정보 보강 ⭐

**스크립트:** `scripts/pipeline/enrich_country.mjs`

**역할:**
1. **MusicBrainz API (1차)**: 아티스트 출신 국가 조회
2. **Discogs API (2차)**: 앨범 발매 국가 조회 (실패 시만)

**실행:**
```bash
npm run pipeline:enrich-country
```

**입력:** `out/albums_spotify_v2.json` (또는 v1)  
**출력:** `out/albums_spotify_v3.json`

**예상 소요 시간:** 1000개 기준 20-30분

**Rate Limit:**
- MusicBrainz: 1 req/sec
- Discogs: 60 req/min

**결과 예상:**
- country 채움률: 60-80%
- 출처 분포:
  - musicbrainz: 50-60%
  - discogs: 10-20%
  - unknown: 20-30%

**리포트 생성:**
```bash
npm run pipeline:report
```

---

### Step 4: PostgreSQL 임포트

**스크립트:** `backend/scripts/import_albums_v3.py`

**역할:**
- v3.json → PostgreSQL `albums` 테이블 임포트
- 중복 제거 (album_id 기준)

**실행:**
```bash
# Docker 볼륨 동기화 + 임포트
npm run pipeline:import
```

**DB 관련 추가 명령어:**
```bash
# 샘플 데이터 생성
npm run db:seed

# 클래식 명반 추가
npm run db:classics

# 또는 수동 실행
docker cp out/albums_spotify_v3.json sonic_backend:/out/albums_spotify_v3.json
docker exec sonic_backend python scripts/import_albums_v3.py
```

**결과 확인:**
```bash
# 앨범 수 확인
docker exec sonic_db psql -U sonic -d sonic_db -c "SELECT COUNT(*) FROM albums;"

# 연도별 분포
docker exec sonic_db psql -U sonic -d sonic_db -c "
SELECT year, COUNT(*) 
FROM albums 
GROUP BY year 
ORDER BY year;
"

# 국가별 분포
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

### 전체 파이프라인 한 번에 실행

```bash
# v0.json이 이미 있다고 가정
# normalize → genre → country → import
npm run pipeline:all
```

**이 명령어는:**
1. `npm run step2:normalize`
2. `npm run step2.5:enrich-genre`
3. `npm run step3:enrich-country`
4. `npm run pipeline:import`
를 순차 실행합니다.

---

## 🎨 프론트엔드 가이드

### 주요 컴포넌트

#### 1. `MapCanvas.tsx` - 2D 맵 시각화

**기술:**
- Deck.gl `ScatterplotLayer`: 앨범 노드 렌더링
- `OrthographicView`: 2D 직교 투영
- D3 `scaleLinear`: X축(연도), Y축(지역/국가) 스케일 변환

**주요 기능:**
- **동적 Y축 할당**: 지역별 앨범 수에 비례하여 Y축 공간 배분
- **국가별 세분화**: 60+ 국가를 각 지역 범위 내에서 배치
- **호버/클릭**: 앨범 선택 및 DetailPanel 열기
- **LOD 지원**: 줌 레벨에 따라 렌더링 방식 전환 (백엔드 API 연동)

**코드 위치:** `components/MapCanvas/MapCanvas.tsx`

#### 2. `DetailPanel.tsx` - 앨범 상세 정보

**기능:**
- Spotify 앨범 커버 표시
- AI 생성 요약 (Gemini API)
- 트랙리스트, 크레딧, 리뷰
- 좋아요 버튼 (Like/Unlike)
- Spotify로 열기 버튼

**코드 위치:** `components/DetailPanel/DetailPanel.tsx`

#### 3. `SearchBar.tsx` - 검색 및 자동완성

**기능:**
- 앨범명/아티스트명 실시간 검색
- 드롭다운 자동완성
- 검색 이벤트 로깅 (`POST /events`)

**코드 위치:** `components/SearchBar/SearchBar.tsx`

#### 4. `TimelineBar.tsx` - 연도 필터링

**기능:**
- 1960-2024 연도 범위 슬라이더
- 뷰포트 연동 (맵 드래그 시 자동 업데이트)

**코드 위치:** `components/TimelineBar/TimelineBar.tsx`

#### 5. `ForYouPanel.tsx` - 좋아요 목록

**기능:**
- `GET /me/likes` 호출하여 좋아요 앨범 표시
- 최근 10개 표시 (더 많으면 카운트 표시)
- 앨범 클릭 시 DetailPanel 열림
- 새로고침 버튼

**코드 위치:** `components/ForYouPanel/ForYouPanel.tsx`

#### 6. `MyLogsPanel.tsx` - 개인 로그 (향후 구현)

**예정 기능:**
- 평점 기록
- 메모 작성
- 청취 날짜 기록

**코드 위치:** `components/MyLogsPanel/MyLogsPanel.tsx`

---

### 상태 관리 (Zustand)

**Store 위치:** `state/store.ts`

**주요 상태:**
```typescript
interface AppState {
  albums: Album[];                      // 전체 앨범 데이터
  filteredAlbums: Album[];             // 필터링된 앨범
  selectedAlbumId: string | null;      // 선택된 앨범 ID
  searchQuery: string;                 // 검색어
  yearRange: [number, number];         // 연도 범위 필터
  activeRegions: Region[];             // 활성 지역 필터
  viewport: Viewport;                  // 맵 뷰포트 (x, y, k)
  loading: boolean;                    // 로딩 상태
}
```

**주요 액션:**
- `loadAlbums()`: 백엔드에서 앨범 로드
- `setYearRange(range)`: 연도 필터 변경
- `toggleRegion(region)`: 지역 필터 토글
- `selectAlbum(id)`: 앨범 선택
- `setSearchQuery(query)`: 검색어 변경
- `setViewport(viewport)`: 맵 뷰포트 변경

---

### 타입 정의

**파일:** `types.ts`

**주요 타입:**
```typescript
export interface Album {
  id: string;
  title: string;
  artist: string;
  year: number;
  vibe: number;                 // 0.0-1.0 (현재 미사용)
  popularity: number;
  region: Region;
  country?: string;
  coverUrl?: string;
  genres: string[];
}

export type Region = 
  | 'North America' 
  | 'Europe' 
  | 'Asia' 
  | 'South America' 
  | 'Latin America' 
  | 'Caribbean' 
  | 'Oceania' 
  | 'Africa';

export interface Viewport {
  x: number;                    // Center X (Year)
  y: number;                    // Center Y (Vibe/Region)
  k: number;                    // Zoom scale
}

export interface ExtendedAlbumData {
  summaryEn: string;
  summaryKo: string;
  tracklist: string[];
  credits: string[];
  creditDetails: CreditDetail[];
  reviews: ReviewDigest[];
}

export interface LikeItem {
  entity_type: string;
  entity_id: string;
  liked_at: string;
}
```

---

## 🐍 백엔드 가이드

### 프로젝트 구조

```
backend/
├── app/
│   ├── main.py              # FastAPI 메인 앱
│   ├── models.py            # SQLAlchemy 모델
│   ├── schemas.py           # Pydantic 스키마
│   ├── database.py          # DB 연결 설정
│   └── service_gemini.py    # Gemini AI 서비스
├── scripts/
│   ├── import_albums_v3.py        # DB 임포트
│   ├── seed_albums.py             # 샘플 데이터 생성
│   ├── insert_classic_albums.py   # 클래식 명반 삽입
│   ├── fetch_from_lastfm.py       # Last.fm API 수집
│   ├── fetch_from_musicbrainz.py  # MusicBrainz API 수집
│   ├── test_api.py                # API 테스트
│   └── debug_api.py               # API 디버그
├── Dockerfile
└── requirements.txt
```

---

### 주요 파일

#### 1. `main.py` - FastAPI 앱

**CORS 설정:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**주요 라우트:**
- `/health`: 헬스 체크
- `/albums`: 앨범 목록
- `/search`: 검색
- `/albums/{id}`: 상세 조회
- `/map/points`: LOD 맵 포인트
- `/research`: AI 리서치
- `/dev/users`: 개발용 유저 생성
- `/me/likes`: 좋아요 CRUD
- `/events`: 이벤트 로깅

#### 2. `models.py` - SQLAlchemy 모델

**주요 모델:**
- `Album`: 앨범 메타데이터
- `AlbumDetail`: 상세 정보 (1:1)
- `AiResearch`: AI 리서치 캐시
- `DevUser`: 개발용 유저
- `UserLike`: 좋아요
- `UserEvent`: 이벤트 로그

**관계:**
- `Album.details` → `AlbumDetail` (1:1)
- `DevUser.likes` → `UserLike[]` (1:N)
- `DevUser.events` → `UserEvent[]` (1:N)

#### 3. `schemas.py` - Pydantic 스키마

**주요 스키마:**
- `AlbumResponse`: 앨범 응답 DTO
- `MapPoint`: 맵 포인트 DTO
- `ResearchRequest/Response`: AI 리서치 DTO
- `LikeRequest/Response`: 좋아요 DTO
- `EventRequest/Response`: 이벤트 DTO

#### 4. `service_gemini.py` - Gemini AI 서비스

**함수:**
```python
async def get_ai_research(
    db: AsyncSession, 
    album_id: str, 
    lang: str
) -> ResearchResponse:
    """
    Gemini API로 앨범 리서치 생성
    - 캐시 확인 (cache_key)
    - 없으면 Gemini API 호출
    - DB에 저장 (캐시)
    """
```

---

### 데이터베이스 연결

**파일:** `database.py`

**설정:**
```python
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql+asyncpg://sonic:sonic_password@db:5432/sonic_db"
)

engine = create_async_engine(DATABASE_URL, echo=True)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with async_session() as session:
        yield session
```

---

### LOD 구현 (Level of Detail)

**위치:** `main.py` → `/map/points` 엔드포인트

**로직:**
```python
if zoom < 2.0:
    # 그리드 집계 (SQL GROUP BY)
    stmt = text("""
        SELECT 
            avg(year) as x, 
            avg(genre_vibe) as y, 
            count(*) as count,
            mode() WITHIN GROUP (ORDER BY region_bucket) as color
        FROM albums
        WHERE year BETWEEN :y1 AND :y2
        GROUP BY floor(year / 5), floor(genre_vibe * 10)
    """)
    # → MapPoint(is_cluster=True, count=25, ...)
else:
    # 개별 포인트 (최대 2000개)
    stmt = select(Album).where(...).limit(2000)
    # → MapPoint(is_cluster=False, label="Album Title", ...)
```

**성능 최적화:**
- 줌 아웃 → 그리드 집계로 데이터 전송량 감소
- 줌 인 → 개별 앨범 표시 (상세 정보)

---

## 👤 사용자 시스템

### 개발용 인증 (Step 1 MVP)

**특징:**
- **비밀번호 없음**: UUID만으로 식별
- **localStorage 저장**: 브라우저에 devUserId 캐싱
- **X-User-Id 헤더**: 모든 인증 필요 요청에 포함

**플로우:**
1. 앱 로드 시 `localStorage.getItem('devUserId')` 확인
2. 없으면 `POST /dev/users` 호출하여 UUID 생성
3. UUID를 localStorage에 저장
4. 이후 모든 인증 필요 요청에 `X-User-Id` 헤더 추가

**코드 위치:**
- 프론트엔드: `state/store.ts` → `ensureDevUserId()`
- 백엔드: `backend/app/main.py` → `get_current_user()` dependency

---

### 좋아요 시스템

**테이블:** `user_likes`

**특징:**
- 멱등성: 중복 좋아요 방지 (UNIQUE 제약)
- 엔티티 타입: 앨범 또는 아티스트
- CheckConstraint: `entity_type IN ('album', 'artist')`

**API:**
- `POST /me/likes`: 좋아요 추가
- `DELETE /me/likes`: 좋아요 삭제
- `GET /me/likes`: 좋아요 목록 조회

**프론트엔드 연동:**
- DetailPanel: Like 버튼 클릭 → API 호출
- ForYouPanel: 좋아요 목록 표시 → 새로고침 버튼

---

### 이벤트 로깅

**테이블:** `user_events`

**이벤트 타입:**
- `search`: 검색
- `view_album`: 앨범 상세 보기
- `view_artist`: 아티스트 상세 보기
- `open_on_platform`: Spotify 등으로 열기
- `recommendation_click`: 추천 클릭
- `playlist_create`: 플레이리스트 생성 (향후)

**Payload 예시:**
```json
{
  "event_type": "search",
  "payload": {"query": "pink floyd"}
}

{
  "event_type": "open_on_platform",
  "entity_type": "album",
  "entity_id": "4LH4d3cOWNNsVw41Gqt2kv",
  "payload": {"platform": "spotify"}
}
```

**용도:**
- 사용자 행동 분석
- 추천 알고리즘 개선
- A/B 테스트

---

### 향후: Google OAuth 전환

**예정 구현:**
1. `users` 테이블 활성화
2. Google OAuth 2.0 연동
3. JWT 토큰 발급
4. `dev_users` → `users` 데이터 마이그레이션

**환경 변수 준비됨:**
```bash
GOOGLE_CLIENT_ID=<your_client_id>
```

---

## 🤖 AI 기능

### Gemini API 연동

**모델:** `gemini-2.5-flash-lite` (빠른 응답)

**기능:**
1. **앨범 요약 생성** (한국어/영어)
2. **트랙리스트 제공**
3. **크레딧 정보 생성** (Producer, Engineer 등)
4. **리뷰 다이제스트** (Rolling Stone, Pitchfork, AllMusic)

---

### 프론트엔드 AI 서비스

**파일:** `services/geminiService.ts`

**함수:**
```typescript
export const getExtendedAlbumDetails = async (
  album: Album, 
  retries = 2
): Promise<ExtendedAlbumData | null>
```

**로직:**
1. API 키 확인 (`VITE_API_KEY`)
2. 사용자 언어 감지 (`navigator.language`)
3. Gemini API 호출 (프롬프트 엔지니어링)
4. JSON 응답 파싱
5. 재시도 로직 (최대 2회)

**프롬프트 예시:**
```
You are a music historian and critic. 
Provide comprehensive details about the album 
"The Dark Side of the Moon" by Pink Floyd (1973).

Response format: JSON
{
  "summaryEn": "...",
  "summaryKo": "...",
  "tracklist": [...],
  "creditDetails": [...]
}
```

---

### 백엔드 AI 서비스

**파일:** `backend/app/service_gemini.py`

**특징:**
- **캐시 시스템**: `ai_research` 테이블에 결과 저장
- **캐시 키**: `{album_id}:{lang}`
- **중복 방지**: 같은 앨범은 한 번만 생성

**함수:**
```python
async def get_ai_research(
    db: AsyncSession, 
    album_id: str, 
    lang: str
) -> dict:
    # 1. 캐시 확인
    cache_key = f"{album_id}:{lang}"
    cached = await db.execute(
        select(AiResearch).where(AiResearch.cache_key == cache_key)
    )
    if cached:
        return cached
    
    # 2. Gemini API 호출
    result = await gemini_client.generate(...)
    
    # 3. DB에 저장 (캐시)
    ai_research = AiResearch(
        album_id=album_id,
        lang=lang,
        summary_md=result.text,
        cache_key=cache_key
    )
    db.add(ai_research)
    await db.commit()
    
    return result
```

---

### API 키 설정

**프론트엔드:**
```bash
# .env.local
VITE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**백엔드 (선택):**
```bash
# .env
API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**발급 방법:**
https://ai.google.dev/ → "Get API Key"

---

## 🔧 환경 변수

### 프론트엔드 (`.env.local`)

```bash
# Gemini AI API 키 (필수)
VITE_API_KEY=your_gemini_api_key

# 백엔드 URL (선택, 기본값: http://localhost:8000)
VITE_BACKEND_URL=http://localhost:8000
```

### 백엔드 (`.env` 또는 `docker-compose.yml`)

```bash
# PostgreSQL 연결 (Docker Compose에서 자동 설정)
DATABASE_URL=postgresql+asyncpg://sonic:sonic_password@db:5432/sonic_db

# Redis 연결 (향후 활용)
REDIS_URL=redis://redis:6379/0

# Google Gemini API 키 (선택, 백엔드 AI 기능용)
API_KEY=your_gemini_api_key

# Google OAuth (향후 구현)
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com

# Last.fm API (선택, 데이터 수집용)
LASTFM_API_KEY=your_lastfm_api_key

# Discogs API (데이터 파이프라인 Step 3용)
DISCOGS_TOKEN=your_discogs_personal_access_token
```

---

## 🐛 트러블슈팅

### 1. 프론트엔드가 앨범을 로드하지 못함

**증상:**
- 지도에 노드가 표시되지 않음
- 콘솔에 "Failed to load albums" 에러

**원인:**
- 백엔드가 실행되지 않음
- DB에 데이터가 없음
- CORS 설정 문제

**해결:**
```bash
# 1. 백엔드 상태 확인
docker ps | grep sonic_backend

# 2. 백엔드 헬스 체크
curl http://localhost:8000/health

# 3. DB 앨범 수 확인
docker exec sonic_db psql -U sonic -d sonic_db -c "SELECT COUNT(*) FROM albums;"

# 4. 샘플 데이터 추가
docker exec sonic_backend python scripts/seed_albums.py

# 5. 프론트엔드 재시작
npm run dev
```

---

### 2. AI 기능이 작동하지 않음

**증상:**
- DetailPanel에서 "AI 분석 생성 실패"
- 콘솔에 "API key" 에러

**원인:**
- `VITE_API_KEY` 미설정
- Gemini API 키 유효하지 않음
- API 할당량 초과

**해결:**
```bash
# 1. .env.local 확인
cat .env.local
# VITE_API_KEY가 있는지 확인

# 2. API 키 재발급
# https://ai.google.dev/ 접속

# 3. .env.local 수정 후 재시작
npm run dev
```

---

### 3. 좋아요 기능이 작동하지 않음

**증상:**
- Like 버튼 클릭 시 반응 없음
- Network 탭에서 401 Unauthorized

**원인:**
- devUserId가 생성되지 않음
- 백엔드와 연결 끊김

**해결:**
```bash
# 1. localStorage 확인 (브라우저 개발자 도구)
localStorage.getItem('devUserId')
# null이면 삭제 후 새로고침

# 2. 백엔드 로그 확인
docker-compose logs -f backend

# 3. 수동으로 유저 생성 테스트
curl -X POST http://localhost:8000/dev/users
# → {"user_id":"..."}
```

---

### 4. 데이터 파이프라인 실패

**증상:**
- `npm run pipeline:all` 에러
- "File not found: out/albums_spotify_v0.json"

**원인:**
- v0.json이 없음
- 권한 문제

**해결:**
```bash
# 1. v0.json 생성 (Spotify API)
node fetch_spotify_albums.mjs

# 2. 또는 샘플 데이터 사용
# (v0.json을 수동으로 생성)

# 3. 권한 확인
ls -l out/albums_spotify_*.json

# 4. 단계별 실행
npm run step2:normalize
npm run step3:enrich-country
npm run pipeline:import
```

---

### 5. Docker 컨테이너 시작 실패

**증상:**
- `docker-compose up` 에러
- "port 5432 already in use"

**원인:**
- PostgreSQL이 이미 호스트에서 실행 중
- 포트 충돌

**해결:**
```bash
# 1. 기존 PostgreSQL 중지
# macOS:
brew services stop postgresql

# Linux:
sudo systemctl stop postgresql

# 2. 또는 docker-compose.yml의 포트 변경
# ports:
#   - "5433:5432"  # 5432 → 5433

# 3. 컨테이너 재시작
docker-compose down
docker-compose up -d
```

---

### 6. 맵 성능 저하

**증상:**
- 드래그/줌이 끊김
- FPS 30 이하

**원인:**
- 앨범 데이터가 너무 많음 (5000개+)
- LOD가 작동하지 않음

**해결:**
```bash
# 1. 브라우저 콘솔에서 현재 줌 확인
# store.viewport.k

# 2. LOD 확인 (zoom < 2.0이면 그리드 집계)
# /map/points?zoom=1.5 → is_cluster: true

# 3. 앨범 limit 조정 (backend/app/main.py)
# stmt = select(Album).limit(2000)  # → 1000으로 축소
```

---

### 7. MusicBrainz API Rate Limit

**증상:**
- Step 3 실행 시 "Rate limited" 메시지
- 진행이 매우 느림

**원인:**
- MusicBrainz는 1 req/sec 제한

**해결:**
```bash
# 1. 정상 동작 (느린 것이 정상)
# 1000개 앨범 기준: 약 20분 소요

# 2. 중단 후 재실행 가능하도록 개선 (향후)
# - 캐시 파일 저장
# - 이미 완료된 것은 스킵

# 3. Discogs 토큰 추가하여 보완
# .env에 DISCOGS_TOKEN 설정
```

---

## 🛠️ 개발 가이드

### 프로젝트 구조

```
music-mapmap-1/
├── app/
│   └── AppShell.tsx           # 앱 메인 레이아웃
├── components/                # React 컴포넌트
│   ├── DetailPanel/           # 앨범 상세 패널
│   ├── ForYouPanel/           # 좋아요 목록 패널
│   ├── MapCanvas/             # 2D 맵 시각화 (Deck.gl)
│   ├── MyLogsPanel/           # 개인 로그 패널
│   ├── MyPanel/               # My 패널 (통합)
│   ├── SearchBar/             # 검색 바
│   └── TimelineBar/           # 연도 필터 타임라인
├── state/
│   └── store.ts               # Zustand 전역 상태 관리
├── services/
│   └── geminiService.ts       # Gemini AI 서비스
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI 메인
│   │   ├── models.py          # SQLAlchemy 모델
│   │   ├── schemas.py         # Pydantic 스키마
│   │   ├── database.py        # DB 연결
│   │   └── service_gemini.py  # AI 서비스
│   └── scripts/
│       ├── import_albums_v3.py        # DB 임포트
│       ├── seed_albums.py             # 샘플 데이터
│       ├── insert_classic_albums.py   # 클래식 명반
│       ├── fetch_from_lastfm.py       # Last.fm 수집
│       ├── fetch_from_musicbrainz.py  # MusicBrainz 수집
│       ├── test_api.py                # API 테스트
│       └── debug_api.py               # API 디버그
├── scripts/
│   ├── fetchers/              # 🆕 데이터 수집 스크립트
│   │   ├── spotify.mjs            # Spotify API 앨범 수집
│   │   └── playlists.mjs          # 플레이리스트 기반 수집
│   └── pipeline/          # 🆕 데이터 파이프라인
│       ├── normalize.mjs          # 데이터 정규화
│       ├── validate.mjs           # 데이터 검증
│       ├── enrich_genre.mjs       # 장르 정보 보강
│       ├── enrich_country.mjs     # 국가 정보 보강
│       └── report_country.mjs     # 보강 결과 리포트
├── tests/                     # 🆕 테스트 파일
│   ├── test-frontend.html
│   ├── test-gemini-models.html
│   ├── list-models.html
│   └── test-data.json
├── out/                       # 데이터 출력 폴더
│   ├── albums_spotify_v0.json     # Raw 데이터
│   ├── albums_spotify_v1.json     # 정규화됨
│   ├── albums_spotify_v2.json     # 장르 보강
│   ├── albums_spotify_v3.json     # 국가 보강 (최종)
│   └── report_step3_country.json  # 리포트
├── public/                    # Public 에셋
├── types.ts                   # TypeScript 타입 정의
├── index.tsx                  # 앱 엔트리 포인트
├── App.tsx                    # 앱 루트 컴포넌트
├── docker-compose.yml         # Docker 설정
├── package.json               # NPM 패키지 설정
├── vite.config.ts             # Vite 설정
└── README.md                  # 📚 이 문서
```

---

### 새로운 컴포넌트 추가

1. `components/` 폴더에 새 폴더 생성
2. `ComponentName.tsx` 파일 생성
3. `AppShell.tsx`에 import 및 배치

**예시:**
```typescript
// components/NewPanel/NewPanel.tsx
import React from 'react';

export const NewPanel: React.FC = () => {
  return (
    <div className="panel">
      {/* UI */}
    </div>
  );
};
```

---

### 새로운 API 엔드포인트 추가

**백엔드 (`backend/app/main.py`):**
```python
@app.get("/new-endpoint", response_model=APIResponse)
async def new_endpoint(db: AsyncSession = Depends(get_db)):
    # 로직
    return APIResponse(data=result)
```

**프론트엔드 (`state/store.ts`):**
```typescript
const response = await fetch(`${BACKEND_URL}/new-endpoint`);
const data = await response.json();
```

---

### 새로운 데이터 필드 추가

1. **DB 마이그레이션** (수동, Alembic 미사용)
```sql
ALTER TABLE albums ADD COLUMN new_field VARCHAR;
```

2. **SQLAlchemy 모델 업데이트** (`backend/app/models.py`)
```python
class Album(Base):
    ...
    new_field = Column(String, nullable=True)
```

3. **Pydantic 스키마 업데이트** (`backend/app/schemas.py`)
```python
class AlbumResponse(BaseModel):
    ...
    new_field: Optional[str] = None
```

4. **TypeScript 타입 업데이트** (`types.ts`)
```typescript
export interface Album {
  ...
  newField?: string;
}
```

5. **데이터 파이프라인 업데이트** (`scripts/normalize_dataset_v1.mjs`)
```javascript
normalizedAlbum.newField = rawAlbum.someSource || null;
```

---

### 테스트

**프론트엔드 (브라우저 개발자 도구):**
```javascript
// 콘솔에서 Store 확인
console.log(window.useStore.getState());

// 앨범 수 확인
console.log(window.useStore.getState().albums.length);
```

**백엔드 (FastAPI Swagger):**
```
http://localhost:8000/docs
```
- 자동 생성된 API 문서에서 테스트 가능

**데이터베이스 (psql):**
```bash
docker exec -it sonic_db psql -U sonic -d sonic_db

# 쿼리 실행
SELECT * FROM albums LIMIT 10;
```

---

### 디버그 로그

**프론트엔드:**
- 콘솔 로그가 자동 출력됨 (개발 모드)
- 특정 기능 확인: `console.log('🔍 Debug:', data);`

**백엔드:**
- Docker 로그: `docker-compose logs -f backend`
- SQLAlchemy echo 활성화됨 (`engine = create_async_engine(..., echo=True)`)

---

### 성능 프로파일링

**프론트엔드 (React DevTools):**
1. Chrome Extension 설치: "React Developer Tools"
2. "Profiler" 탭에서 렌더링 성능 확인

**Deck.gl (FPS):**
```javascript
// MapCanvas.tsx
console.log('FPS:', deckRef.current?.deck?.animationLoop?.stats.fps);
```

**백엔드 (SQL 쿼리):**
- SQLAlchemy `echo=True`로 쿼리 로그 확인
- EXPLAIN ANALYZE 사용:
```sql
EXPLAIN ANALYZE
SELECT * FROM albums WHERE year BETWEEN 1970 AND 1980;
```

---

## 📚 참고 자료

### 공식 문서
- [React](https://reactjs.org/docs/)
- [TypeScript](https://www.typescriptlang.org/docs/)
- [Deck.gl](https://deck.gl/docs)
- [Zustand](https://github.com/pmndrs/zustand)
- [FastAPI](https://fastapi.tiangolo.com/)
- [SQLAlchemy](https://docs.sqlalchemy.org/en/20/)
- [PostgreSQL](https://www.postgresql.org/docs/)
- [Google Gemini AI](https://ai.google.dev/docs)

### 외부 API
- [Spotify Web API](https://developer.spotify.com/documentation/web-api/)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [Discogs API](https://www.discogs.com/developers)

---

## 🤝 기여 가이드

### 브랜치 전략
- `main`: 안정 버전
- `develop`: 개발 브랜치
- `feature/*`: 새로운 기능
- `fix/*`: 버그 수정

### 커밋 메시지
```
feat: Add For You panel
fix: Fix album search bug
docs: Update README
refactor: Refactor MapCanvas component
```

---

## 📄 라이센스

MIT License

---

## 📞 문의

문제가 발생하면:
1. [트러블슈팅](#-트러블슈팅) 섹션 확인
2. 백엔드 로그 확인: `docker-compose logs -f backend`
3. 브라우저 콘솔 확인 (F12)
4. GitHub Issues 생성

---

<div align="center">

**Built with ❤️ using React, FastAPI, Deck.gl, and Gemini AI**

🎵 Explore music like never before 🎵

</div>
