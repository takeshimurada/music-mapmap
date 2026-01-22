/**
 * Zoom-based Tile Sampling System
 * 
 * 설계 원칙:
 * 1. 노드 좌표는 절대 변경하지 않음 (의미 축 보존)
 * 2. 줌 레벨에 따라 "보여줄 노드" 선택
 * 3. Tile 기반 popularity sampling
 * 4. 히스테리시스로 안정화
 */

export interface SamplingConfig {
  // Zoom 구간별 타일 크기 (픽셀)
  tileSizeByZoom: { maxZoom: number; tileSize: number }[];
  // Zoom 구간별 타일당 최대 노드 수
  topKByZoom: { maxZoom: number; topK: number }[];
  // 재계산 히스테리시스
  zoomHysteresis: number;
  panHysteresis: number; // 타일 단위
}

export const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  tileSizeByZoom: [
    { maxZoom: 0.8, tileSize: 96 },
    { maxZoom: 1.4, tileSize: 72 },
    { maxZoom: 2.2, tileSize: 56 },
    { maxZoom: Infinity, tileSize: 40 }
  ],
  topKByZoom: [
    { maxZoom: 0.8, topK: 2 },
    { maxZoom: 1.4, topK: 5 },
    { maxZoom: 2.2, topK: 12 },
    { maxZoom: Infinity, topK: 9999 }
  ],
  zoomHysteresis: 0.1,
  panHysteresis: 2.0
};

export interface Node {
  id: string;
  x: number;        // 월드 좌표
  y: number;        // 월드 좌표
  popularity: number; // 0~1
}

export interface SamplingResult {
  visibleNodeIds: Set<string>;
  tileSize: number;
  topK: number;
}

/**
 * Deterministic hash for stable tiebreaking
 */
function stableHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * ZoomSampler: 줌 레벨에 따라 보여줄 노드 선택
 */
export class ZoomSampler {
  private config: SamplingConfig;
  private lastSampleZoom: number = 0;
  private lastSampleCenter: [number, number] = [0, 0];
  private lastResult: SamplingResult | null = null;

  constructor(config: SamplingConfig = DEFAULT_SAMPLING_CONFIG) {
    this.config = config;
  }

  /**
   * 현재 줌 레벨에 적합한 타일 크기 반환
   */
  private getTileSize(zoom: number): number {
    for (const { maxZoom, tileSize } of this.config.tileSizeByZoom) {
      if (zoom < maxZoom) return tileSize;
    }
    return this.config.tileSizeByZoom[this.config.tileSizeByZoom.length - 1].tileSize;
  }

  /**
   * 현재 줌 레벨에 적합한 Top-K 값 반환
   */
  private getTopK(zoom: number): number {
    for (const { maxZoom, topK } of this.config.topKByZoom) {
      if (zoom < maxZoom) return topK;
    }
    return this.config.topKByZoom[this.config.topKByZoom.length - 1].topK;
  }

  /**
   * 재샘플링이 필요한지 확인 (히스테리시스)
   */
  private needsResampling(
    zoom: number,
    viewportCenter: [number, number],
    tileSize: number
  ): boolean {
    // 줌 변화 체크
    const zoomDiff = Math.abs(zoom - this.lastSampleZoom);
    if (zoomDiff > this.config.zoomHysteresis) {
      return true;
    }

    // 팬 변화 체크 (타일 단위)
    const [cx, cy] = viewportCenter;
    const [lastCx, lastCy] = this.lastSampleCenter;
    const panDist = Math.sqrt(
      Math.pow(cx - lastCx, 2) + Math.pow(cy - lastCy, 2)
    );
    const panThreshold = tileSize * this.config.panHysteresis;
    
    return panDist > panThreshold;
  }

  /**
   * 메인 샘플링 함수
   * 
   * @param nodes 전체 노드 목록
   * @param viewport { zoom, center, width, height }
   * @param worldToScreen 월드 좌표 → 스크린 좌표 변환 함수
   * @returns 보여줄 노드 ID 집합
   */
  public sample(
    nodes: Node[],
    viewport: {
      zoom: number;
      center: [number, number];
      width: number;
      height: number;
    },
    worldToScreen: (x: number, y: number) => [number, number]
  ): SamplingResult {
    const { zoom, center } = viewport;
    const tileSize = this.getTileSize(zoom);
    const topK = this.getTopK(zoom);

    // 히스테리시스 체크
    if (
      this.lastResult &&
      !this.needsResampling(zoom, center, tileSize)
    ) {
      return this.lastResult;
    }

    // 타일별로 노드 분류
    const tiles = new Map<string, Node[]>();

    for (const node of nodes) {
      const [sx, sy] = worldToScreen(node.x, node.y);
      
      // 타일 좌표 계산
      const tileX = Math.floor(sx / tileSize);
      const tileY = Math.floor(sy / tileSize);
      const tileKey = `${tileX},${tileY}`;

      if (!tiles.has(tileKey)) {
        tiles.set(tileKey, []);
      }
      tiles.get(tileKey)!.push(node);
    }

    // 각 타일에서 Top-K 선택
    const visibleNodeIds = new Set<string>();

    for (const tileNodes of tiles.values()) {
      // Popularity 내림차순 정렬 (동점 시 stable hash로 타이브레이크)
      const sorted = tileNodes.sort((a, b) => {
        const popDiff = b.popularity - a.popularity;
        if (Math.abs(popDiff) > 1e-6) return popDiff;
        return stableHash(a.id) - stableHash(b.id);
      });

      // Top-K 선택
      for (let i = 0; i < Math.min(topK, sorted.length); i++) {
        visibleNodeIds.add(sorted[i].id);
      }
    }

    // 결과 캐싱
    this.lastSampleZoom = zoom;
    this.lastSampleCenter = center;
    this.lastResult = {
      visibleNodeIds,
      tileSize,
      topK
    };

    return this.lastResult;
  }

  /**
   * 타일 기반 hover picking
   * 마우스 위치 주변 타일만 검색
   */
  public pickNearestNode(
    mouseScreen: [number, number],
    nodes: Node[],
    worldToScreen: (x: number, y: number) => [number, number],
    maxDistance: number = 20
  ): Node | null {
    const [mx, my] = mouseScreen;
    const tileSize = this.getTileSize(this.lastSampleZoom);

    // 마우스가 속한 타일 + 이웃 타일
    const centerTileX = Math.floor(mx / tileSize);
    const centerTileY = Math.floor(my / tileSize);

    let closestNode: Node | null = null;
    let closestDist = maxDistance;

    // 3x3 타일 영역 검색
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tileX = centerTileX + dx;
        const tileY = centerTileY + dy;

        // 해당 타일 내 노드만 검색
        for (const node of nodes) {
          // 현재 보이는 노드만 hover 대상
          if (this.lastResult && !this.lastResult.visibleNodeIds.has(node.id)) {
            continue;
          }

          const [sx, sy] = worldToScreen(node.x, node.y);
          const nodeTileX = Math.floor(sx / tileSize);
          const nodeTileY = Math.floor(sy / tileSize);

          if (nodeTileX !== tileX || nodeTileY !== tileY) continue;

          const dist = Math.sqrt(
            Math.pow(sx - mx, 2) + Math.pow(sy - my, 2)
          );

          if (dist < closestDist) {
            closestDist = dist;
            closestNode = node;
          }
        }
      }
    }

    return closestNode;
  }
}
