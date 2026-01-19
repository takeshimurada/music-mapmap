# Step 1.5: For You 최소 UI - 테스트 가이드

## 🎯 구현 완료 사항

### ✅ 1. SearchBar.tsx - 검색 이벤트 로깅
- 앨범/아티스트 선택 시 `POST /events` (event_type: "search") 호출
- payload에 검색어 포함

### ✅ 2. ForYouPanel.tsx - 새 컴포넌트
- `GET /me/likes?entity_type=album` 호출하여 좋아요 목록 표시
- 최근 10개 앨범 표시 (더 많으면 카운트 표시)
- 앨범 클릭 시 DetailPanel 열림
- 새로고침 버튼으로 수동 업데이트 가능

### ✅ 3. AppShell.tsx - For You 패널 배치
- 좌측 하단에 For You 패널 배치 (280x400px)
- 우측 상단에 토글 버튼 추가
- "My Logs"와 "For You" 버튼을 나란히 배치

### ✅ 4. types.ts - LikeItem 타입 추가
- 백엔드 응답에 맞는 타입 정의

---

## 🧪 테스트 시나리오

### 사전 준비
```bash
# 백엔드가 실행 중인지 확인
docker ps | grep sonic_backend

# 프론트엔드 실행
npm run dev
```

브라우저에서 http://localhost:5173 접속

---

## 📋 테스트 1: 검색 이벤트 로깅

### 단계:
1. **검색창에 앨범명 입력** (예: "Dark Side of the Moon")
2. **드롭다운에서 앨범 선택**
3. **개발자 도구 > Network 탭 확인**

### 예상 결과:
- ✅ `POST /events` 요청 발생
- ✅ Request Payload:
```json
{
  "event_type": "search",
  "entity_type": null,
  "entity_id": null,
  "payload": {
    "query": "Dark Side of the Moon"
  }
}
```
- ✅ Response: `{"status":"ok","event_id":...}`
- ✅ 콘솔에 "🔍 Search event logged: Dark Side of the Moon" 출력

---

## 📋 테스트 2: For You 패널 기본 동작

### 단계:
1. **앱 로드 시 좌측 하단에 "For You" 패널 확인**
2. **초기 상태: "No liked albums yet" 메시지 표시**
3. **우측 상단 "For You" 버튼 클릭 → 패널 토글**

### 예상 결과:
- ✅ 좌측 하단에 280x400px 핑크 테마 패널 표시
- ✅ 헤더: ❤️ "For You" + 새로고침 버튼
- ✅ 비어있을 때: 하트 아이콘 + 안내 메시지
- ✅ 토글 버튼으로 패널 표시/숨김

---

## 📋 테스트 3: 좋아요 추가 → For You 패널 업데이트

### 단계:
1. **지도에서 앨범 클릭 → DetailPanel 열림**
2. **"Like" 버튼 클릭 (하트 아이콘)**
3. **Network 탭에서 `POST /me/likes` 확인**
4. **For You 패널의 새로고침 버튼(↻) 클릭**

### 예상 결과:
- ✅ DetailPanel에서 하트 버튼이 빨간색으로 채워짐
- ✅ Network: `POST /me/likes` 요청
```json
Request:
{
  "entity_type": "album",
  "entity_id": "abc123..."
}

Response:
{
  "status": "liked"
}
```
- ✅ For You 패널 새로고침 후:
  - "You liked N albums" 통계 표시
  - 좋아요한 앨범이 리스트에 나타남
  - 앨범 커버, 제목, 아티스트, 연도, 지역 표시

---

## 📋 테스트 4: For You에서 앨범 클릭 → DetailPanel 열림

### 단계:
1. **For You 패널에서 좋아요한 앨범 클릭**
2. **DetailPanel이 우측에 열리는지 확인**
3. **지도에서 해당 앨범이 선택되는지 확인**

### 예상 결과:
- ✅ 클릭한 앨범의 DetailPanel이 우측에 나타남
- ✅ 콘솔에 "📀 Selected liked album: ..." 출력
- ✅ DetailPanel에서 앨범 정보 확인 가능
- ✅ 이미 Like 상태이므로 하트 버튼이 채워진 상태

---

## 📋 테스트 5: 좋아요 취소 → For You 패널 업데이트

### 단계:
1. **DetailPanel에서 Like 버튼 다시 클릭 (Unlike)**
2. **Network 탭에서 `DELETE /me/likes` 확인**
3. **For You 패널 새로고침**

### 예상 결과:
- ✅ 하트 버튼이 빈 상태로 돌아감
- ✅ Network: `DELETE /me/likes` 요청
```json
Request:
{
  "entity_type": "album",
  "entity_id": "abc123..."
}

Response:
{
  "status": "unliked"
}
```
- ✅ For You 패널에서 해당 앨범 제거됨
- ✅ 카운트 감소

---

## 📋 테스트 6: 여러 앨범 좋아요 → 10개 제한

### 단계:
1. **12개 이상의 앨범에 좋아요**
2. **For You 패널 새로고침**

### 예상 결과:
- ✅ 최근 10개만 표시
- ✅ 패널 하단에 "Showing 10 of 12 liked albums" 메시지
- ✅ 스크롤 가능

---

## 🔍 Network 탭 확인 포인트

### 검색 이벤트
```http
POST http://localhost:8000/events
Headers:
  Content-Type: application/json
  X-User-Id: <devUserId>

Body:
{
  "event_type": "search",
  "entity_type": null,
  "entity_id": null,
  "payload": {"query": "검색어"}
}
```

### 좋아요 추가
```http
POST http://localhost:8000/me/likes
Headers:
  Content-Type: application/json
  X-User-Id: <devUserId>

Body:
{
  "entity_type": "album",
  "entity_id": "<album-uuid>"
}
```

### 좋아요 목록 조회
```http
GET http://localhost:8000/me/likes?entity_type=album
Headers:
  X-User-Id: <devUserId>

Response:
{
  "items": [
    {
      "entity_type": "album",
      "entity_id": "<uuid>",
      "liked_at": "2026-01-19T02:30:00.000Z"
    }
  ]
}
```

### 좋아요 삭제
```http
DELETE http://localhost:8000/me/likes
Headers:
  Content-Type: application/json
  X-User-Id: <devUserId>

Body:
{
  "entity_type": "album",
  "entity_id": "<album-uuid>"
}
```

---

## 🎨 UI 확인 포인트

### For You 패널 (좌측 하단)
- ✅ 280x400px 크기
- ✅ 핑크 테마 (border-pink-500/30)
- ✅ Glass Material 효과
- ✅ 헤더: ❤️ "For You" + 새로고침 버튼
- ✅ 통계 카드: "You liked N albums"
- ✅ 앨범 리스트: 커버, 제목, 아티스트, 연도, 지역
- ✅ 호버 효과: 핑크 하이라이트 + 확대
- ✅ 빈 상태: 하트 아이콘 + 안내 메시지

### 우측 상단 버튼
- ✅ "My Logs" 버튼 (파란색 테마)
- ✅ "For You" 버튼 (핑크 테마, 활성화 시 채워진 하트)
- ✅ 버튼 클릭 시 패널 토글

---

## 🐛 알려진 이슈 & 주의사항

### devUserId 발급 실패
- localStorage에 devUserId가 없고 백엔드가 꺼져있으면?
  → 콘솔에 경고만 출력, 앱은 정상 작동
  → For You 패널은 빈 상태 유지

### 앨범이 store에 로드되지 않은 경우
- likes 응답의 entity_id가 store.albums에 없으면?
  → "Album not loaded" 메시지 표시
  → UUID 일부(8자) 표시

### 타이밍 이슈
- 좋아요 직후 For You 패널에 바로 반영 안됨
  → 새로고침 버튼(↻) 클릭 필요
  → 자동 업데이트는 Step 2에서 WebSocket/Polling으로 구현 예정

---

## ✅ 최종 체크리스트

- [ ] 검색 시 `/events` (search) 요청 발생
- [ ] 좋아요 시 `/me/likes` POST 요청 발생
- [ ] 좋아요 취소 시 `/me/likes` DELETE 요청 발생
- [ ] For You 패널이 좌측 하단에 표시됨
- [ ] For You 패널에 좋아요 목록이 표시됨
- [ ] For You에서 앨범 클릭 시 DetailPanel 열림
- [ ] 토글 버튼으로 For You 패널 숨김/표시 가능
- [ ] 새로고침 버튼으로 좋아요 목록 업데이트
- [ ] 콘솔에 이벤트 로그 출력 확인
- [ ] Network 탭에서 API 요청/응답 확인

---

## 🚀 다음 단계 (Step 2)

Step 1.5가 완료되면 다음을 준비할 수 있습니다:

1. **추천 시스템**: 좋아요 기반 AI 추천
2. **WebSocket**: 실시간 좋아요 업데이트
3. **Spotify 연동**: Play on Spotify 버튼 실제 동작
4. **분석 대시보드**: 이벤트 로그 시각화

Step 1.5 완료! 🎉
