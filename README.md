# 🎵 Sonic Topography - Music Map

<div align="center">

**음악을 시간과 공간으로 탐험하는 인터랙티브 2D 맵**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-61dafb)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791)](https://www.postgresql.org/)
[![Deck.gl](https://img.shields.io/badge/Deck.gl-8.9-ff69b4)](https://deck.gl/)

**Version 5.5**

</div>

---

# KR

## 개요

Sonic Topography는 음악 앨범을 2D 공간에 배치해 탐색하는 웹 앱입니다.

- X축: 발매 연도
- Y축: 지역/국가
- 크기: 인기도
- 색상: 지역

---

## 페이지 & 핵심 기능

### 맵 페이지
- 2D 맵 탐색 (pan/zoom, hover preview, click detail)
- 연도/지역/검색어 필터
- 앨범 상세 패널 (메타데이터, 크레딧)

### 아카이브 페이지
- 그리드 기반 앨범 아카이브
- 장르/연도/국가 기준 필터 및 정렬
- 앨범 클릭 시 상세 정보 열기

### 유저 로그
- 사용자 행동 이벤트 수집 (search, view, click, open, like)
- 사용자 본인의 로그 데이터를 시각화된 뷰로 인식 가능

---

## 아키텍처

```
Frontend (React + Deck.gl)
  - Map page, Archive page, Detail panels
  - Zustand store
        |
        |  HTTP/JSON
        v
Backend (FastAPI)
  - Albums, search, likes, events
  - AI research service (Gemini)
        |
        v
PostgreSQL (primary data store)

External data sources
  - Spotify / MusicBrainz / Discogs
  - Gemini (AI summaries)

Optional
  - Redis (cache)
```

### 데이터 흐름 (상위 레벨)

1. 앨범/맵 포인트: Frontend → Backend → PostgreSQL → Frontend store
2. 검색: Frontend → Backend (search) + Event log
3. 앨범 상세: Frontend → Backend → (DB + AI research cache)
4. 좋아요: Frontend → Backend → PostgreSQL
5. 로그 시각화: Frontend → Backend → PostgreSQL

---

## 기술 스택 (요약)

- Frontend: React, TypeScript, Vite, Deck.gl, Zustand
- Backend: FastAPI, SQLAlchemy, AsyncPG
- DB: PostgreSQL
- Infra: Docker, Docker Compose
- External APIs: Spotify, MusicBrainz, Discogs, Gemini

---

## 빠른 시작 (3줄)

```bash
npm install
cd frontend && npm install
npm run dev:backend && npm run dev:frontend
```

---

## 변경 사항 (v5.5)

- Map UI: 타임라인/장르 필터 레이아웃 개선 및 가독성 조정
- Map interaction: 줌/패닝 범위 및 인디케이터 위치 튜닝
- Genre filter: 장르 선택 기반 강조(비선택 흐림) 및 좌측 고정 패널 추가
- Pipeline: PowerShell 전용 `pipeline-safe:ps` 스크립트 추가
- Spotify fetch: 연도 범위/필터 강화 옵션 반영

---

# EN

## Overview

Sonic Topography is a web app that maps music albums onto a 2D space.

- X axis: release year
- Y axis: region/country
- Size: popularity
- Color: region

---

## Changes (v5.5)

- Map UI: timeline/genre filter layout and readability tweaks
- Map interaction: zoom/pan bounds and indicator positioning tuned
- Genre filter: highlight selected genre with dimmed others + left docked panel
- Pipeline: PowerShell-friendly `pipeline-safe:ps` added
- Spotify fetch: year range and filtering adjustments

---

## Pages & Core Features

### Map Page
- Interactive 2D map (pan/zoom, hover preview, click detail)
- Filters by year/region/search
- Detail panel with album metadata and credits

### Archive Page
- Grid-based album archive
- Filter and sort by genre/year/country
- Click to open album details

### User Logs
- Collects user events (search, view, click, open, like)
- Users can recognize their own activity through visualized log views

---

## Architecture

```
Frontend (React + Deck.gl)
  - Map page, Archive page, Detail panels
  - Zustand store
        |
        |  HTTP/JSON
        v
Backend (FastAPI)
  - Albums, search, likes, events
  - AI research service (Gemini)
        |
        v
PostgreSQL (primary data store)

External data sources
  - Spotify / MusicBrainz / Discogs
  - Gemini (AI summaries)

Optional
  - Redis (cache)
```

### Data Flow (High Level)

1. Albums & map points: Frontend → Backend → PostgreSQL → Frontend store
2. Search: Frontend → Backend (search) + Event log
3. Album detail: Frontend → Backend → (DB + AI research cache)
4. Likes: Frontend → Backend → PostgreSQL
5. Logs visualization: Frontend → Backend → PostgreSQL

---

## Tech Stack (Short)

- Frontend: React, TypeScript, Vite, Deck.gl, Zustand
- Backend: FastAPI, SQLAlchemy, AsyncPG
- DB: PostgreSQL
- Infra: Docker, Docker Compose
- External APIs: Spotify, MusicBrainz, Discogs, Gemini

---

## Quick Start (3 lines)

```bash
npm install
cd frontend && npm install
npm run dev:backend && npm run dev:frontend
```
