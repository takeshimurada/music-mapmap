# Zoom-based Tile Sampling 통합 가이드

## 📦 생성된 파일

### 1. `ZoomSampler.ts` - 핵심 샘플링 엔진
- 줌 레벨별 타일 크기 결정
- Tile 기반 Top-K 노드 선택
- Popularity 기반 정렬 (deterministic)
- 히스테리시스로 재계산 안정화
- 타일 기반 hover picking

### 2. `useSampledAlbums.ts` - React Hook
- DeckGL과 통합하기 위한 React Hook
- ViewState에 따라 자동으로 샘플링
- 타일 기반 picking 제공

## 🔄 MapCanvas.tsx 통합 방법

### Step 1: Import

```typescript
import { useSampledAlbums } from './useSampledAlbums';
```

### Step 2: 샘플링 적용

기존 코드:
```typescript
const layers = useMemo(() => {
  return [
    new ScatterplotLayer({
      id: 'albums-layer',
      data: filteredAlbums,  // ← 전체 앨범
      // ...
    })
  ];
}, [filteredAlbums, ...]);
```

수정 후:
```typescript
// 1. ViewState에서 worldToScreen 함수 생성
const worldToScreen = useCallback((x: number, y: number): [number, number] => {
  // DeckGL의 viewport를 사용하여 월드 → 스크린 변환
  // 간단한 구현:
  const screenX = (x - viewState.target[0]) * viewState.zoom + viewportWidth / 2;
  const screenY = (y - viewState.target[1]) * viewState.zoom + viewportHeight / 2;
  return [screenX, screenY];
}, [viewState, viewportWidth, viewportHeight]);

// 2. 샘플링 Hook 사용
const { sampledAlbums, samplingActive } = useSampledAlbums(
  filteredAlbums,
  viewState,
  worldToScreen,
  { width: viewportWidth, height: viewportHeight },
  {
    enabled: true,
    minZoomForSampling: 1.5  // 줌 1.5 이하에서만 샘플링
  }
);

// 3. Layer에 샘플링된 앨범 전달
const layers = useMemo(() => {
  return [
    new ScatterplotLayer({
      id: 'albums-layer',
      data: sampledAlbums,  // ← 샘플링된 앨범만
      // ...
    })
  ];
}, [sampledAlbums, ...]);
```

### Step 3: Reveal 효과 (선택 사항)

샘플링된 노드가 부드럽게 나타나도록 alpha 전환:

```typescript
new ScatterplotLayer({
  id: 'albums-layer',
  data: sampledAlbums,
  // ...
  opacity: samplingActive ? 0.9 : 0.85,  // 샘플링 활성화 시 약간 더 불투명
  // 또는 개별 노드에 alphaTarget 적용 (고급)
})
```

## 🎯 예상 효과

### 성능
- **줌아웃 시**: 수만 개 → 수백~수천 개로 렌더링 노드 감소
- **줌인 시**: 타일당 노드 수 증가로 자연스럽게 reveal
- **히스테리시스**: 미세한 줌/팬에서 재계산 안 함 (안정적)

### 사용자 경험
- **과밀 구간**: 중요한 앨범(popularity 높음)만 표시
- **줌인**: 숨겨진 앨범들이 점진적으로 드러남
- **의미 축 보존**: x(시간), y(지역) 좌표 절대 변경 안 됨

## 🔧 설정 조정

`ZoomSampler.ts`의 `DEFAULT_SAMPLING_CONFIG`:

```typescript
{
  tileSizeByZoom: [
    { maxZoom: 0.8, tileSize: 96 },   // 매우 줌아웃: 큰 타일
    { maxZoom: 1.4, tileSize: 72 },
    { maxZoom: 2.2, tileSize: 56 },
    { maxZoom: Infinity, tileSize: 40 }  // 줌인: 작은 타일
  ],
  topKByZoom: [
    { maxZoom: 0.8, topK: 2 },        // 매우 줌아웃: 타일당 2개만
    { maxZoom: 1.4, topK: 5 },
    { maxZoom: 2.2, topK: 12 },
    { maxZoom: Infinity, topK: 9999 }    // 줌인: 제한 없음
  ],
  zoomHysteresis: 0.1,  // 줌 변화 임계값
  panHysteresis: 2.0    // 팬 변화 임계값 (타일 단위)
}
```

### 조정 가이드:
- **데이터 밀도 높음** (예: 1960-1970년대): `topK` 감소
- **빠른 반응 원함**: `zoomHysteresis` 감소
- **안정성 우선**: `zoomHysteresis` 증가

## 🚀 추가 최적화 (선택 사항)

### 1. GPU 기반 Alpha Transition

현재는 CPU에서 노드를 필터링하지만, 더 나은 방법:

```typescript
// 모든 노드를 GPU로 전송하되, shader에서 alpha 제어
new ScatterplotLayer({
  data: allAlbums,  // 전체 앨범
  getPosition: ...,
  getFillColor: (d: Album) => {
    const isVisible = sampledNodeIds.has(d.id);
    return isVisible 
      ? [vibeColor.r, vibeColor.g, vibeColor.b]
      : [vibeColor.r, vibeColor.g, vibeColor.b, 0];  // alpha = 0
  },
  // DeckGL이 alpha=0 노드를 자동으로 skip
})
```

### 2. Custom Shader (고급)

완전한 제어를 위해 custom shader 작성:
- `alphaTarget` uniform 추가
- 줌 변화 시에만 lerp
- `discard` 키워드로 invisible 노드 조기 종료

## 📊 디버깅

샘플링 상태 확인:

```typescript
const { sampledAlbums, samplingActive } = useSampledAlbums(...);

console.log('Sampling:', {
  active: samplingActive,
  total: filteredAlbums.length,
  visible: sampledAlbums.length,
  ratio: (sampledAlbums.length / filteredAlbums.length * 100).toFixed(1) + '%'
});
```

## ✅ 체크리스트

- [ ] `ZoomSampler.ts` 파일 확인
- [ ] `useSampledAlbums.ts` 파일 확인
- [ ] `MapCanvas.tsx`에 통합
- [ ] `worldToScreen` 함수 구현
- [ ] 줌아웃 테스트 (노드 개수 감소 확인)
- [ ] 줌인 테스트 (노드 reveal 확인)
- [ ] 성능 측정 (FPS, 렌더링 시간)
- [ ] 설정 조정 (필요 시)

## 🎨 현재 구현과의 호환성

- ✅ **DeckGL 유지**: 기존 ScatterplotLayer 그대로 사용
- ✅ **점진적 적용**: `enabled` 옵션으로 on/off 가능
- ✅ **기존 필터링 보존**: `filteredAlbums`에 샘플링만 추가
- ✅ **Hover/Select 유지**: DeckGL의 기본 picking 또는 타일 기반 picking 선택 가능

## 다음 단계

1. **통합 테스트**: 실제로 `MapCanvas.tsx`에 통합
2. **성능 측정**: 50,000개 노드에서 FPS 확인
3. **UX 조정**: `topK`, `tileSize` 값 튜닝
4. **Reveal 효과**: alpha 전환 부드럽게 조정

---

**중요**: 이 시스템은 **의미 축(x=시간, y=지역)을 절대 왜곡하지 않습니다**.  
노드 위치는 변경되지 않고, 단지 "보이는/안 보이는" 상태만 제어합니다.
