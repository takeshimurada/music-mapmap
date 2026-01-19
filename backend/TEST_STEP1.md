# Step 1: 유저 Like & 이벤트 로그 시스템 테스트

## 환경 설정
```bash
export BACKEND_URL="http://localhost:8000"
```

## 1️⃣ 개발용 유저 생성
```bash
curl -X POST "${BACKEND_URL}/dev/users" \
  -H "Content-Type: application/json"
```

**예상 응답:**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**다음 테스트를 위해 USER_ID 저장:**
```bash
export USER_ID="<위에서 받은 user_id>"
```

---

## 2️⃣ 좋아요 추가 (POST /me/likes)
```bash
curl -X POST "${BACKEND_URL}/me/likes" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: ${USER_ID}" \
  -d '{
    "entity_type": "album",
    "entity_id": "550e8400-e29b-41d4-a716-446655440001"
  }'
```

**예상 응답:**
```json
{
  "status": "liked"
}
```

**멱등성 테스트 (같은 요청 재실행):**
```bash
# 위 curl 명령어를 다시 실행하면 동일하게 "liked" 반환
```

---

## 3️⃣ 좋아요 목록 조회 (GET /me/likes)

**전체 조회:**
```bash
curl -X GET "${BACKEND_URL}/me/likes" \
  -H "X-User-Id: ${USER_ID}"
```

**예상 응답:**
```json
{
  "items": [
    {
      "entity_type": "album",
      "entity_id": "550e8400-e29b-41d4-a716-446655440001",
      "liked_at": "2026-01-19T12:34:56.789Z"
    }
  ]
}
```

**앨범만 필터링:**
```bash
curl -X GET "${BACKEND_URL}/me/likes?entity_type=album" \
  -H "X-User-Id: ${USER_ID}"
```

---

## 4️⃣ 좋아요 삭제 (DELETE /me/likes)
```bash
curl -X DELETE "${BACKEND_URL}/me/likes" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: ${USER_ID}" \
  -d '{
    "entity_type": "album",
    "entity_id": "550e8400-e29b-41d4-a716-446655440001"
  }'
```

**예상 응답:**
```json
{
  "status": "unliked"
}
```

**멱등성 테스트 (이미 없는 항목 삭제):**
```bash
# 위 curl 명령어를 다시 실행해도 "unliked" 반환
```

---

## 5️⃣ 이벤트 로그 생성 (POST /events)

**앨범 조회 이벤트:**
```bash
curl -X POST "${BACKEND_URL}/events" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: ${USER_ID}" \
  -d '{
    "event_type": "view_album",
    "entity_type": "album",
    "entity_id": "550e8400-e29b-41d4-a716-446655440001",
    "payload": null
  }'
```

**예상 응답:**
```json
{
  "status": "ok",
  "event_id": 1
}
```

**플랫폼 열기 이벤트 (payload 포함):**
```bash
curl -X POST "${BACKEND_URL}/events" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: ${USER_ID}" \
  -d '{
    "event_type": "open_on_platform",
    "entity_type": "album",
    "entity_id": "550e8400-e29b-41d4-a716-446655440001",
    "payload": {
      "platform": "spotify",
      "url": "https://open.spotify.com/album/abc123"
    }
  }'
```

**검색 이벤트 (entity 없음):**
```bash
curl -X POST "${BACKEND_URL}/events" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: ${USER_ID}" \
  -d '{
    "event_type": "search",
    "entity_type": null,
    "entity_id": null,
    "payload": {
      "query": "pink floyd"
    }
  }'
```

---

## 6️⃣ DB에서 직접 확인 (SQL)

**Docker 컨테이너 접속:**
```bash
docker exec -it <postgres_container_name> psql -U sonic -d sonic_db
```

**또는 docker-compose 사용 시:**
```bash
docker-compose exec db psql -U sonic -d sonic_db
```

**개발용 유저 확인:**
```sql
SELECT * FROM dev_users ORDER BY created_at DESC LIMIT 5;
```

**좋아요 목록 확인:**
```sql
SELECT 
  ul.id,
  ul.user_id,
  ul.entity_type,
  ul.entity_id,
  ul.liked_at
FROM user_likes ul
ORDER BY ul.liked_at DESC
LIMIT 10;
```

**이벤트 로그 확인:**
```sql
SELECT 
  ue.id,
  ue.user_id,
  ue.event_type,
  ue.entity_type,
  ue.entity_id,
  ue.payload,
  ue.created_at
FROM user_events ue
ORDER BY ue.created_at DESC
LIMIT 10;
```

**사용자별 이벤트 통계:**
```sql
SELECT 
  event_type,
  COUNT(*) as count
FROM user_events
WHERE user_id = '<YOUR_USER_ID>'
GROUP BY event_type
ORDER BY count DESC;
```

**최근 7일간 이벤트 집계:**
```sql
SELECT 
  DATE(created_at) as date,
  event_type,
  COUNT(*) as count
FROM user_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), event_type
ORDER BY date DESC, count DESC;
```

---

## 🧪 전체 워크플로우 테스트

```bash
#!/bin/bash
# Step 1 통합 테스트 스크립트

BACKEND_URL="http://localhost:8000"

# 1. 유저 생성
echo "1️⃣ Creating dev user..."
RESPONSE=$(curl -s -X POST "${BACKEND_URL}/dev/users" -H "Content-Type: application/json")
USER_ID=$(echo $RESPONSE | grep -o '"user_id":"[^"]*' | cut -d'"' -f4)
echo "✅ User created: ${USER_ID}"

# 2. 좋아요 추가
echo ""
echo "2️⃣ Adding like..."
curl -s -X POST "${BACKEND_URL}/me/likes" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: ${USER_ID}" \
  -d '{"entity_type":"album","entity_id":"550e8400-e29b-41d4-a716-446655440001"}' | jq .

# 3. 좋아요 목록 조회
echo ""
echo "3️⃣ Getting likes..."
curl -s -X GET "${BACKEND_URL}/me/likes" \
  -H "X-User-Id: ${USER_ID}" | jq .

# 4. 이벤트 로그
echo ""
echo "4️⃣ Logging event..."
curl -s -X POST "${BACKEND_URL}/events" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: ${USER_ID}" \
  -d '{"event_type":"view_album","entity_type":"album","entity_id":"550e8400-e29b-41d4-a716-446655440001"}' | jq .

# 5. 좋아요 삭제
echo ""
echo "5️⃣ Removing like..."
curl -s -X DELETE "${BACKEND_URL}/me/likes" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: ${USER_ID}" \
  -d '{"entity_type":"album","entity_id":"550e8400-e29b-41d4-a716-446655440001"}' | jq .

echo ""
echo "✅ All tests completed!"
echo "User ID: ${USER_ID}"
```

**스크립트 실행:**
```bash
chmod +x test_step1.sh
./test_step1.sh
```

---

## ⚠️ 오류 처리 테스트

**잘못된 X-User-Id (401 에러):**
```bash
curl -X GET "${BACKEND_URL}/me/likes" \
  -H "X-User-Id: invalid-uuid"
# 예상: {"detail":"Invalid X-User-Id format"}
```

**X-User-Id 누락 (422 에러):**
```bash
curl -X GET "${BACKEND_URL}/me/likes"
# 예상: {"detail":[{"type":"missing","loc":["header","X-User-Id"],...}]}
```

**존재하지 않는 유저 (401 에러):**
```bash
curl -X GET "${BACKEND_URL}/me/likes" \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000000"
# 예상: {"detail":"User not found"}
```
