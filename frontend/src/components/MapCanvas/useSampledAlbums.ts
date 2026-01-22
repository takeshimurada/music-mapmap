/**
 * React Hook: Zoom-based Album Sampling
 * 
 * DeckGL과 통합하여 줌 레벨에 따라 보여줄 앨범 필터링
 */

import { useMemo, useRef, useCallback } from 'react';
import { Album } from '../../types';
import { ZoomSampler, Node, DEFAULT_SAMPLING_CONFIG } from './ZoomSampler';

interface ViewState {
  target: [number, number, number];
  zoom: number;
}

interface UseSampledAlbumsOptions {
  enabled?: boolean; // false면 샘플링 비활성화 (모든 앨범 표시)
  minZoomForSampling?: number; // 이 줌 레벨 이하에서만 샘플링 적용
}

/**
 * 앨범 데이터를 줌 레벨에 따라 샘플링하는 훅
 */
export function useSampledAlbums(
  albums: Album[],
  viewState: ViewState,
  worldToScreen: (x: number, y: number) => [number, number],
  viewportDimensions: { width: number; height: number },
  options: UseSampledAlbumsOptions = {}
) {
  const {
    enabled = true,
    minZoomForSampling = 1.5
  } = options;

  // ZoomSampler 인스턴스 (싱글톤)
  const samplerRef = useRef<ZoomSampler>();
  if (!samplerRef.current) {
    samplerRef.current = new ZoomSampler(DEFAULT_SAMPLING_CONFIG);
  }

  // 앨범 → Node 변환 (메모이제이션)
  const nodes = useMemo<Node[]>(() => {
    return albums.map(album => ({
      id: album.id,
      x: 0, // 실제 x 좌표는 별도로 계산됨
      y: 0, // 실제 y 좌표는 별도로 계산됨
      popularity: album.popularity || 0.5
    }));
  }, [albums]);

  // 샘플링 결과
  const sampledAlbums = useMemo(() => {
    // 샘플링 비활성화 또는 줌이 충분히 큰 경우
    if (!enabled || viewState.zoom >= minZoomForSampling) {
      return albums;
    }

    // 노드 좌표 업데이트 (앨범의 실제 좌표 사용)
    const nodesWithCoords = albums.map((album, i) => {
      // getPosition과 동일한 로직으로 x, y 계산
      // 여기서는 albums 배열 순서가 보존된다고 가정
      return {
        ...nodes[i],
        x: album.x || 0, // 실제 앨범의 x 좌표
        y: album.y || 0  // 실제 앨범의 y 좌표
      };
    });

    // 샘플링 수행
    const result = samplerRef.current!.sample(
      nodesWithCoords,
      {
        zoom: viewState.zoom,
        center: [viewState.target[0], viewState.target[1]],
        width: viewportDimensions.width,
        height: viewportDimensions.height
      },
      worldToScreen
    );

    // 보이는 노드만 필터링
    return albums.filter(album => 
      result.visibleNodeIds.has(album.id)
    );
  }, [
    albums,
    nodes,
    viewState.zoom,
    viewState.target,
    viewportDimensions.width,
    viewportDimensions.height,
    worldToScreen,
    enabled,
    minZoomForSampling
  ]);

  // Hover picking (타일 기반)
  const pickNearestAlbum = useCallback(
    (mouseScreen: [number, number]): Album | null => {
      if (!enabled) {
        // 샘플링 비활성화 시 기본 picking (전체 검색)
        return null; // DeckGL의 기본 picking 사용
      }

      // 노드 좌표 업데이트
      const nodesWithCoords = albums.map((album, i) => ({
        ...nodes[i],
        x: album.x || 0,
        y: album.y || 0
      }));

      const pickedNode = samplerRef.current!.pickNearestNode(
        mouseScreen,
        nodesWithCoords,
        worldToScreen,
        20 // maxDistance
      );

      if (!pickedNode) return null;

      return albums.find(a => a.id === pickedNode.id) || null;
    },
    [albums, nodes, worldToScreen, enabled]
  );

  return {
    sampledAlbums,
    pickNearestAlbum,
    samplingActive: enabled && viewState.zoom < minZoomForSampling
  };
}
