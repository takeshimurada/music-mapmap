import React, { useState, useMemo, useEffect } from 'react';
import { DeckGL } from '@deck.gl/react';
import { OrthographicView, LinearInterpolator } from '@deck.gl/core';
import { ScatterplotLayer, LineLayer, TextLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import { scaleLinear } from 'd3';
import { useStore } from '../../state/store';
import { Album, Region } from '../../types';

// Easing 함수 (부드러운 감속)
const easeInOutCubic = (t: number) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const MIN_YEAR = 1960;
const MAX_YEAR = 2024;
const DAYS_PER_YEAR = 365;
const WORLD_WIDTH = 1200;  // 800 → 1200 (50% 확장)
const WORLD_HEIGHT = 900;  // 600 → 900 (50% 확장)

// Y축 배치: 위에서부터 아프리카 - 라틴&남미 - 캐리비안 - 북미 - 유럽 - 아시아 - 오세아니아
// 대륙 순서 정의
const REGION_ORDER = [
  'Africa',
  'Latin America',
  'South America', 
  'Caribbean',
  'North America',
  'Europe',
  'Asia',
  'Oceania'
];

// 동적 Y축 범위 계산 함수 (중앙 밀집 + 노드 양에 따른 동적 할당)
const calculateDynamicRegionRanges = (albums: Album[]): Record<string, { min: number; max: number; center: number }> => {
  // 1. 각 지역별 앨범 수 계산
  const regionCounts: Record<string, number> = {};
  albums.forEach(album => {
    const region = album.region;
    regionCounts[region] = (regionCounts[region] || 0) + 1;
  });
  
  // 2. 총 앨범 수
  const totalAlbums = albums.length;
  
  // 3. 중앙 밀집 범위 설정 (0.15 ~ 0.85 = 70% 영역만 사용, 위아래 빈 공간 제거)
  const COMPRESSED_MIN = 0.15;
  const COMPRESSED_MAX = 0.85;
  const usableRange = COMPRESSED_MAX - COMPRESSED_MIN;
  
  // 4. 각 지역에 Y축 공간 비례적으로 할당 (앨범이 없는 지역은 제외)
  const ranges: Record<string, { min: number; max: number; center: number }> = {};
  let currentRelativeY = 0.0; // 0~1 상대 위치
  
  REGION_ORDER.forEach(region => {
    const count = regionCounts[region] || 0;
    if (count === 0) {
      // 앨범이 없는 지역은 공간 할당하지 않음
      return;
    }
    
    // 비율 계산 (정확히 비례)
    const ratio = count / totalAlbums;
    
    // 상대 위치(0~1)를 실제 압축된 Y 좌표로 변환
    const actualMin = COMPRESSED_MIN + currentRelativeY * usableRange;
    const actualMax = COMPRESSED_MIN + (currentRelativeY + ratio) * usableRange;
    
    ranges[region] = {
      min: actualMin,
      max: actualMax,
      center: (actualMin + actualMax) / 2
    };
    
    currentRelativeY += ratio;
  });
  
  return ranges;
};

// 기본 Y축 범위 (데이터 로드 전)
let REGION_Y_RANGES: Record<string, { min: number; max: number; center: number }> = {
  'Africa': { min: 0.00, max: 0.08, center: 0.04 },
  'Latin America': { min: 0.08, max: 0.15, center: 0.115 },
  'South America': { min: 0.08, max: 0.15, center: 0.115 },
  'Caribbean': { min: 0.15, max: 0.20, center: 0.175 },
  'North America': { min: 0.20, max: 0.53, center: 0.365 },  // 0.55 → 0.53 (빈 공간 제거)
  'Europe': { min: 0.53, max: 0.85, center: 0.69 },           // 0.55 → 0.53 (빈 공간 제거)
  'Asia': { min: 0.85, max: 0.93, center: 0.89 },
  'Oceania': { min: 0.93, max: 1.00, center: 0.965 },
};

// 국가별 Y축 위치 (각 대륙 범위 내에서 세분화)
const COUNTRY_Y_POSITION: Record<string, number> = {
  // Africa (0.00-0.08) - 최상단
  'Morocco': 0.01,
  'Senegal': 0.025,
  'Ghana': 0.035,
  'Nigeria': 0.045,
  'Kenya': 0.055,
  'Egypt': 0.02,
  'South Africa': 0.07,
  
  // Latin America & South America (0.08-0.15)
  'Mexico': 0.085,              // 북쪽
  'Colombia': 0.095,
  'Venezuela': 0.10,
  'Brazil': 0.12,               // 중심
  'Peru': 0.115,
  'Chile': 0.135,
  'Argentina': 0.14,
  'Uruguay': 0.145,
  
  // Caribbean (0.15-0.20)
  'Cuba': 0.155,
  'Jamaica': 0.165,
  'Dominican Republic': 0.170,
  'Puerto Rico': 0.175,
  'Trinidad and Tobago': 0.19,
  
  // North America (0.20-0.55) - 데이터 가장 많음, 넓은 공간
  'Canada': 0.22,               // 북쪽
  'United States': 0.375,       // 중심
  'USA': 0.375,
  'US': 0.375,
  
  // 미국 도시별 세분화 (캐리비안에 가까운 곳 위쪽)
  'Miami': 0.23,                // 캐리비안에 가까움
  'New Orleans': 0.26,          // 캐리비안에 가까움
  'Nashville': 0.30,
  'Chicago': 0.35,              // 중부
  'Detroit': 0.36,
  'New York': 0.49,             // 동부, 유럽에 가까움 (0.48 → 0.49)
  'Boston': 0.52,               // 동부, 유럽에 가까움 (0.50 → 0.52)
  'Los Angeles': 0.40,          // 서부
  'San Francisco': 0.43,        // 서부 (0.42 → 0.43)
  'Seattle': 0.48,              // 서부 북부 (0.45 → 0.48)
  
  // Europe (0.53-0.85) - 데이터 많음, 넓은 공간
  'Iceland': 0.54,              // 북미에 가까움 (0.56 → 0.54)
  'Ireland': 0.56,              // 대서양 가까움 (0.59 → 0.56)
  'United Kingdom': 0.58,       // 대서양 가까움 (0.62 → 0.58)
  'UK': 0.58,
  'England': 0.58,
  'Portugal': 0.65,
  'Spain': 0.66,
  'France': 0.68,
  'Belgium': 0.70,
  'Netherlands': 0.71,
  'Germany': 0.72,
  'Switzerland': 0.73,
  'Austria': 0.73,
  'Italy': 0.74,
  'Denmark': 0.75,
  'Norway': 0.76,
  'Sweden': 0.77,
  'Finland': 0.78,
  'Poland': 0.79,               // 동유럽, 아시아에 가까움
  'Russia': 0.82,               // 아시아에 가까움
  'Turkey': 0.84,               // 아시아에 가까움
  
  // Asia (0.85-0.93)
  'Pakistan': 0.855,
  'India': 0.865,
  'China': 0.875,
  'South Korea': 0.885,
  'Korea': 0.885,
  'Japan': 0.89,
  'Taiwan': 0.895,
  'Hong Kong': 0.90,
  'Thailand': 0.905,
  'Vietnam': 0.91,
  'Philippines': 0.915,
  'Malaysia': 0.92,
  'Singapore': 0.925,
  'Indonesia': 0.925,
  
  // Oceania (0.93-1.00) - 최하단
  'Australia': 0.95,
  'New Zealand': 0.975,
};

// 지역별 기본 Y 위치 (국가 정보가 없을 때 사용)
const REGION_DEFAULT_Y: Record<string, number> = {
  'Africa': 0.04,
  'Latin America': 0.115,
  'South America': 0.115,
  'Caribbean': 0.175,
  'North America': 0.375,
  'Europe': 0.70,
  'Asia': 0.89,
  'Oceania': 0.965,
};

// 문자열을 숫자로 변환 (시드 생성)
const hashCode = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

// 가우시안(정규분포) 변환 함수 (중심 밀집 효과)
const gaussianTransform = (uniform: number, mean: number = 0.5, stdDev: number = 0.25): number => {
  // Box-Muller 변환을 사용한 가우시안 분포
  const u1 = uniform;
  const u2 = (hashCode(uniform.toString()) % 10000) / 10000;
  const z0 = Math.sqrt(-2.0 * Math.log(Math.max(u1, 0.0001))) * Math.cos(2.0 * Math.PI * u2);
  
  // 정규화 및 클리핑
  let gaussian = mean + z0 * stdDev;
  gaussian = Math.max(0, Math.min(1, gaussian));
  
  return gaussian;
};

// Y 좌표 생성: 지역 명확히 구분 + 지역 내 중심 밀집 + 자연스러운 경계 블렌딩
const getY = (country: string | undefined, region: string, albumId: string, vibe: number): number => {
  // 1. 해당 지역의 Y축 범위 가져오기
  const range = REGION_Y_RANGES[region];
  if (!range) {
    return 0.5; // 기본값
  }
  
  const { min, max, center } = range;
  const regionSize = max - min;
  
  // 2. 앨범 ID 기반 균등 랜덤 (0~1)
  const seed = hashCode(albumId + 'y');
  const uniformRandom = (seed % 10000) / 10000;
  
  // 3. 가우시안 분포 적용 (중심으로 밀집, stdDev로 퍼짐 조절)
  // stdDev = 0.2: 중심에 80% 밀집, 양 끝으로 자연스럽게 감소
  const gaussianY = gaussianTransform(uniformRandom, 0.5, 0.2);
  
  // 4. vibe 기반 미세 조정
  const vibeOffset = (vibe - 0.5) * 0.1; // -0.05 ~ +0.05
  
  // 5. 최종 상대 위치 (0~1, 중심에 밀집)
  let relativeY = gaussianY + vibeOffset;
  
  // 6. 국가 정보가 있으면 약간의 편향 추가 (5%)
  if (country && COUNTRY_Y_POSITION[country]) {
    const countryAbsoluteY = COUNTRY_Y_POSITION[country];
    // 국가 위치를 지역 내 상대 위치로 변환
    let countryBias = (countryAbsoluteY - min) / regionSize;
    countryBias = Math.max(0, Math.min(1, countryBias));
    relativeY = relativeY * 0.95 + countryBias * 0.05;
  }
  
  // 7. 클리핑 (0~1)
  relativeY = Math.max(0, Math.min(1, relativeY));
  
  // 8. 최종 Y 좌표: 지역 범위 내 상대 위치를 절대 위치로 변환
  const finalY = min + relativeY * regionSize;
  
  // 0-1 범위 내로 제한
  return Math.max(0, Math.min(1, finalY));
};

// X 좌표 생성: 연도 + 더 넓은 분산 (경계 밖으로 살짝 나가게)
const getX = (year: number, albumId: string): number => {
  const seed = hashCode(albumId + 'x');
  // 연도 내에서 -0.2 ~ 1.2 범위로 분산 (경계 넘어가게!)
  const dayRatio = ((seed % 10000) / 10000 - 0.1) * 1.4; // -0.14 ~ 1.26
  return year + dayRatio;
};

// 장르별 색상 매핑
const GENRE_RGB: Record<string, [number, number, number]> = {
  // 록/메탈
  'Rock': [239, 68, 68],           // 빨강
  'Hard Rock': [220, 38, 38],
  'Metal': [127, 29, 29],
  'Alternative': [251, 146, 60],    // 주황
  'Indie': [253, 186, 116],
  'Punk': [234, 88, 12],
  
  // 팝/댄스
  'Pop': [236, 72, 153],            // 핑크
  'Dance': [219, 39, 119],
  'Electronic': [168, 85, 247],     // 보라
  'EDM': [147, 51, 234],
  'House': [126, 34, 206],
  'Techno': [107, 33, 168],
  
  // 힙합/R&B
  'Hip Hop': [234, 179, 8],         // 금색
  'Rap': [202, 138, 4],
  'R&B': [132, 204, 22],            // 라임
  'Soul': [101, 163, 13],
  
  // 재즈/블루스
  'Jazz': [59, 130, 246],           // 파랑
  'Blues': [37, 99, 235],
  'Funk': [29, 78, 216],
  
  // 클래식/포크
  'Classical': [156, 163, 175],     // 회색
  'Folk': [134, 239, 172],          // 민트
  'Country': [74, 222, 128],        // 초록
  
  // 월드/기타
  'World': [251, 191, 36],          // 노랑
  'Latin': [245, 158, 11],
  'Reggae': [20, 184, 166],         // 청록
  'K-Pop': [244, 114, 182],         // 핑크
  'J-Pop': [217, 70, 239],          // 자주색
  
  // 기본값
  'Other': [148, 163, 184],         // 회색
};

export const MapCanvas: React.FC = () => {
  const { 
    filteredAlbums, 
    selectedAlbumId, 
    selectAlbum,
    brushedAlbumIds,
    searchMatchedAlbumIds,
    searchQuery,
    viewport,
    setViewportYearRange,
    viewportYearRange,
    albums,
  } = useStore();

  const [hoverInfo, setHoverInfo] = useState<{x: number, y: number, object: Album} | null>(null);
  const [clickedAlbum, setClickedAlbum] = useState<{x: number, y: number, album: Album} | null>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  
  const [viewState, setViewState] = useState({
    target: [WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 0] as [number, number, number],
    zoom: -0.5,  // 더 줌아웃 (넓은 영역 대응)
    transitionDuration: 0,
    transitionInterpolator: null as any
  });

  // 데이터 변경 시 동적으로 Y축 범위 업데이트
  useEffect(() => {
    if (albums.length > 0) {
      REGION_Y_RANGES = calculateDynamicRegionRanges(albums);
      console.log('📊 Dynamic Y-axis ranges (center-compressed 15%-85%, node density adaptive):');
      Object.entries(REGION_Y_RANGES).forEach(([region, range]) => {
        const size = ((range.max - range.min) * 100).toFixed(1);
        console.log(`  ${region}: ${(range.min * 100).toFixed(1)}% - ${(range.max * 100).toFixed(1)}% (size: ${size}%)`);
      });
    }
  }, [albums]);

  // 외부 클릭 감지 - 팝업 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setClickedAlbum(null);
      }
    };
    if (clickedAlbum) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [clickedAlbum]);

  // scales를 먼저 정의
  const scales = useMemo(() => {
    // X축: 년도+날짜 (소수점 포함)
    const xScale = scaleLinear().domain([MIN_YEAR, MAX_YEAR + 1]).range([0, WORLD_WIDTH]);
    // Y축: 0-1 범위 (국가별 Y 좌표)
    const yScale = scaleLinear().domain([0, 1]).range([WORLD_HEIGHT, 0]); 
    return { xScale, yScale };
  }, []);

  // 경계 설정 (연도 범위 밖으로 못 나감)
  const bounds = useMemo(() => {
    return {
      minX: 0,
      maxX: WORLD_WIDTH,
      minY: 0,
      maxY: WORLD_HEIGHT
    };
  }, []);

  // 자동 페이드아웃 타이머
  const [showGrid, setShowGrid] = useState(true);
  const fadeTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // 화면이 바뀌면 그리드 표시
    setShowGrid(true);
    
    // 기존 타이머 클리어
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
    }
    
    // 3초 후 페이드아웃
    fadeTimerRef.current = setTimeout(() => {
      setShowGrid(false);
    }, 3000);
    
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
      }
    };
  }, [viewState.zoom, viewState.target]);

  // 디버깅: 데이터 확인 (scales 정의 후)
  useEffect(() => {
    console.log('🗺️ MapCanvas Debug:');
    console.log('  - Total albums:', filteredAlbums.length);
    console.log('  - ViewState zoom:', viewState.zoom.toFixed(2));
    if (filteredAlbums.length > 0 && scales) {
      const sample = filteredAlbums[0];
      const xValue = getX(sample.year, sample.id);
      const yValue = getY(sample.country, sample.region as string, sample.id, sample.vibe);
      console.log('  - Sample album:', sample.title);
      console.log('  - X:', xValue.toFixed(3), '| Y:', yValue.toFixed(3));
      console.log('  - Country:', sample.country, '| Region:', sample.region, '| Genre:', sample.genres[0]);
    }
  }, [filteredAlbums.length, viewState.zoom, scales]);

  // viewport 변경 감지 (검색 시 부드러운 이동)
  const [isAnimating, setIsAnimating] = React.useState(false);
  const [showRegionLabels, setShowRegionLabels] = React.useState(false);
  const regionLabelTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    console.log('📍 Viewport update:', viewport);
    
    if (viewport.k > 1) {
       // 앨범 좌표를 픽셀 좌표로 변환
       const targetX = scales.xScale(viewport.x);
       const targetY = scales.yScale(viewport.y);
       const targetZoom = Math.log2(viewport.k);
       
       // 선택된 앨범의 실제 렌더링 위치 계산 (디버그용)
       if (selectedAlbumId) {
         const selectedAlbum = albums.find(a => a.id === selectedAlbumId);
         if (selectedAlbum) {
           const albumXValue = getX(selectedAlbum.year, selectedAlbum.id);
          const albumYValue = getY(selectedAlbum.country, selectedAlbum.region as string, selectedAlbum.id, selectedAlbum.vibe);
           const albumPixelX = scales.xScale(albumXValue);
           const albumPixelY = scales.yScale(albumYValue);
           
           console.log('🎯 Selected album actual position:', {
             'albumXValue (year+offset)': albumXValue,
             'albumYValue (region+vibe)': albumYValue,
             'albumPixelX': albumPixelX,
             'albumPixelY': albumPixelY,
             'targetX (목표)': targetX,
             'targetY (목표)': targetY,
             'diff': {
               x: Math.abs(albumPixelX - targetX),
               y: Math.abs(albumPixelY - targetY)
             }
           });
         }
       }
       
       console.log('🚀 Animation details:', { 
         'viewport.x (year)': viewport.x,
         'viewport.y (vibe)': viewport.y,
         'viewport.k (zoom)': viewport.k,
         'targetX (pixel)': targetX,
         'targetY (pixel)': targetY,
         'targetZoom (log2)': targetZoom,
         'WORLD_WIDTH': WORLD_WIDTH,
         'WORLD_HEIGHT': WORLD_HEIGHT,
         'currentTarget': viewState.target,
         'currentZoom': viewState.zoom 
       });
       
       setIsAnimating(true);
       
       // 부드러운 애니메이션
       const newViewState = {
         target: [targetX, targetY, 0] as [number, number, number],
         zoom: targetZoom,
         transitionDuration: 2000,
         transitionEasing: easeInOutCubic,
         transitionInterpolator: new LinearInterpolator(['target', 'zoom']) as any
       };
       
       console.log('✅ Setting viewState:', newViewState);
       setViewState(newViewState);
       
       // 애니메이션 종료 후 플래그 리셋
       setTimeout(() => {
         console.log('✅ Animation complete');
         setIsAnimating(false);
       }, 2000);
    }
  }, [viewport.x, viewport.y, viewport.k, scales, selectedAlbumId, albums]);

  const layers = useMemo(() => {
    console.log('🎨 Creating layers with', filteredAlbums.length, 'albums');
    
    // 부드러운 페이드를 위해 0-1 범위로 계산
    const gridVisible = showGrid ? 1.0 : 0.0;
    
    return [
      // 지역 구분선 (가로선)
      new LineLayer({
        id: 'region-lines',
        data: (() => {
          const lines = [];
          for (let i = 0; i < REGION_ORDER.length - 1; i++) {
            const region = REGION_ORDER[i];
            const nextRegion = REGION_ORDER[i + 1];
            const range = REGION_Y_RANGES[region];
            if (range && range.max) {
              lines.push({
                id: `${region}-${nextRegion}`,
                y: range.max
              });
            }
          }
          return lines;
        })(),
        getSourcePosition: (d: any) => [0, scales.yScale(d.y), 0],
        getTargetPosition: (d: any) => [WORLD_WIDTH, scales.yScale(d.y), 0],
        getColor: [148, 163, 184],
        getWidth: 1.5,
        opacity: gridVisible,
        transitions: {
          opacity: {
            duration: 1200,
            easing: easeInOutCubic
          }
        },
        updateTriggers: {
          opacity: [gridVisible],
          getData: [albums.length]
        }
      }),
      
      // 연도 구분선 (세로선, 줌 레벨에 따라 동적) - 10년 단위는 항상 유지
      new LineLayer({
        id: 'year-lines',
        data: (() => {
          // 뷰포트에서 보이는 연도 범위 계산
          const visibleYearRange = viewportYearRange[1] - viewportYearRange[0];
          
          // 줌 레벨에 따른 기본 선 간격 결정
          let yearInterval = 10; // 기본 10년 단위 (50년 이상)
          if (visibleYearRange <= 20) {
            yearInterval = 1; // 20년 이하: 1년 단위
          } else if (visibleYearRange <= 50) {
            yearInterval = 5; // 20-50년: 5년 단위
          }
          
          const lines = [];
          const startYear = Math.floor(viewportYearRange[0] / 10) * 10; // 10년 단위로 시작
          const endYear = Math.ceil(viewportYearRange[1] / 10) * 10;
          
          // 10년 단위는 항상 추가 (밝게 유지)
          for (let year = startYear; year <= endYear; year += 10) {
            if (year >= MIN_YEAR && year <= MAX_YEAR) {
              lines.push({ 
                year, 
                isDecade: true,
                interval: 10,
                baseOpacity: 1.0  // 항상 밝게
              });
            }
          }
          
          // 추가 세밀한 선들 (5년 또는 1년 단위)
          if (yearInterval < 10) {
            const fineStart = Math.floor(viewportYearRange[0] / yearInterval) * yearInterval;
            const fineEnd = Math.ceil(viewportYearRange[1] / yearInterval) * yearInterval;
            
            for (let year = fineStart; year <= fineEnd; year += yearInterval) {
              // 10년 단위는 이미 추가했으므로 건너뛰기
              if (year % 10 === 0) continue;
              
              if (year >= MIN_YEAR && year <= MAX_YEAR) {
                const baseOpacity = yearInterval === 1 ? 0.3 : 1.0; // 1년 단위는 투명하게
                lines.push({ 
                  year, 
                  isDecade: false,
                  interval: yearInterval,
                  baseOpacity: baseOpacity
                });
              }
            }
          }
          
          return lines;
        })(),
        getSourcePosition: (d: any) => [scales.xScale(d.year), 0, 0],
        getTargetPosition: (d: any) => [scales.xScale(d.year), WORLD_HEIGHT, 0],
        getColor: (d: any) => {
          const opacity = d.baseOpacity * gridVisible * 255;  // gridVisible 적용
          return [148, 163, 184, opacity];
        },
        getWidth: (d: any) => {
          if (d.isDecade) return 2.0; // 10년 단위: 굵게
          if (d.interval === 1) return 0.5; // 1년 단위: 가장 얇게
          return 1.0; // 5년 단위: 중간
        },
        transitions: {
          getColor: {
            duration: 1200,
            easing: easeInOutCubic
          }
        },
        updateTriggers: {
          getData: [viewportYearRange],
          getColor: [viewportYearRange, gridVisible],
          getWidth: [viewportYearRange]
        }
      }),
      
      // 연도 레이블 (최소 속성만 사용)
      new TextLayer({
        id: 'year-labels',
        data: (() => {
          const visibleYearRange = viewportYearRange[1] - viewportYearRange[0];
          
          // 레이블은 10년 단위로만 표시 (1년 단위일 때도)
          let labelInterval = 10;
          if (visibleYearRange <= 20) {
            labelInterval = 5; // 20년 이하: 5년 단위 레이블
          }
          
          const labels = [];
          const startYear = Math.floor(viewportYearRange[0] / labelInterval) * labelInterval;
          const endYear = Math.ceil(viewportYearRange[1] / labelInterval) * labelInterval;
          
          for (let year = startYear; year <= endYear; year += labelInterval) {
            if (year >= MIN_YEAR && year <= MAX_YEAR) {
              labels.push({ year });
            }
          }
          return labels;
        })(),
        getPosition: (d: any) => {
          // 화면 상단에 고정되도록 viewport 따라가기
          const zoomScale = Math.pow(2, viewState.zoom);
          const visibleWorldHeight = WORLD_HEIGHT / zoomScale;
          const topEdgeY = viewState.target[1] - visibleWorldHeight / 2;
          return [scales.xScale(d.year), topEdgeY + 40, 0];  // 상단에서 40px 아래
        },
        getText: (d: any) => String(d.year),
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        opacity: gridVisible,
        transitions: {
          opacity: {
            duration: 1200,
            easing: easeInOutCubic
          }
        },
        updateTriggers: {
          getData: [viewportYearRange],
          getPosition: [viewState.zoom, viewState.target, viewportYearRange],
          opacity: [gridVisible]
        }
      }),
      
      // 지역 레이블 (각 지역 범위의 중심에 배치)
      new TextLayer({
        id: 'region-labels',
        data: (() => {
          const labels = [];
          const regionNames: Record<string, string> = {
            'Africa': 'AFRICA',
            'Latin America': 'LATIN AMERICA',
            'South America': 'SOUTH AMERICA',
            'Caribbean': 'CARIBBEAN',
            'North America': 'NORTH AMERICA',
            'Europe': 'EUROPE',
            'Asia': 'ASIA',
            'Oceania': 'OCEANIA'
          };
          
          REGION_ORDER.forEach(region => {
            const range = REGION_Y_RANGES[region];
            if (range && range.center) {
              labels.push({
                id: region.toLowerCase().replace(/\s+/g, '-'),
                text: regionNames[region] || region.toUpperCase(),
                y: range.center
              });
            }
          });
          
          return labels;
        })(),
        getPosition: (d: any): [number, number, number] => {
          const zoomScale = Math.pow(2, viewState.zoom);
          const visibleWorldWidth = WORLD_WIDTH / zoomScale;
          const leftEdgeX = viewState.target[0] - visibleWorldWidth / 2;
          const rightEdgeX = viewState.target[0] + visibleWorldWidth / 2;
          const regionY = scales.yScale(d.y);
          
          // 노드 영역 시작점
          const nodeStartX = 0;
          
          let labelX: number;
          
          // 노드 시작점(X=0)이 화면에 실제로 보이는지 확인
          if (leftEdgeX < nodeStartX && rightEdgeX > nodeStartX) {
            // 노드 시작점이 화면에 보임 (아직 가득 안 참)
            // → 노드 바로 옆(-30)에 고정 (텍스트는 왼쪽으로 뻗어나감)
            labelX = -30;
          } else if (leftEdgeX >= nodeStartX) {
            // 노드 시작점이 화면 왼쪽 밖 (노드로 가득 찬 상태)
            // → 화면 안쪽 100px 지점 (텍스트는 왼쪽으로 뻗어나감)
            labelX = leftEdgeX + 100;
          } else {
            // 노드 시작점이 화면 오른쪽 밖 (줌아웃 극한)
            // → 노드 바로 옆(-30)에 고정
            labelX = -30;
          }
          
          return [labelX, regionY, 0];
        },
        getText: (d: any): string => d.text,
        getColor: [255, 255, 255, 255],
        getSize: 14,
        outlineWidth: 3,
        outlineColor: [0, 0, 0, 255],
        getTextAnchor: 'end' as const,  // 오른쪽 끝 기준 (왼쪽으로 뻗어나감)
        getAlignmentBaseline: 'center' as const,
        opacity: gridVisible,
        transitions: {
          opacity: {
            duration: 1200,
            easing: easeInOutCubic
          }
        },
        updateTriggers: {
          getPosition: [viewState.zoom, viewState.target, albums.length],
          opacity: [gridVisible],
          getData: [albums.length]
        }
      }),
      
      new ScatterplotLayer({
        id: 'albums-layer',
        data: filteredAlbums,
        getPosition: (d: Album) => {
          // X축: 연도 + 분산 (전체 활용)
          const xValue = getX(d.year, d.id);
          const x = scales.xScale(xValue);
          
          // Y축: 국가 위도 기반 + 약간의 분산
          const yValue = getY(d.country, d.region as string, d.id, d.vibe);
          const y = scales.yScale(yValue);
          
          return [x, y, 0];
        },
        getFillColor: (d: Album): [number, number, number, number] => {
          const isBrushed = brushedAlbumIds.includes(d.id);
          const isSelected = selectedAlbumId === d.id;
          const isSearchMatched = searchMatchedAlbumIds.includes(d.id);
          const hasSearchQuery = searchQuery.trim().length > 0;
          
          // 장르 기반 색상
          const genre = d.genres[0] || 'Other';
          const baseColor = GENRE_RGB[genre] || GENRE_RGB['Other'];
          
          // 선택된 앨범: 가장 밝게 + 강조
          if (isSelected) {
            return [...baseColor, 255] as [number, number, number, number];
          }
          
          // 검색 중일 때
          if (hasSearchQuery) {
            // 검색 매칭된 앨범: 밝게 강조
            if (isSearchMatched) {
              return [...baseColor, 255] as [number, number, number, number];
            }
            // 검색 매칭 안된 앨범: 블러 처리 (매우 투명하게)
            return [...baseColor, 60] as [number, number, number, number];
          }
          
          // 브러시된 앨범: 매우 밝게 (아티스트 검색 시)
          if (isBrushed) {
            return [...baseColor, 240] as [number, number, number, number];
          }
          
          // 뷰포트 밖의 앨범: 약간 투명하게 (끊기지 않고 계속 보이게)
          const inViewport = d.year >= viewportYearRange[0] && d.year <= viewportYearRange[1];
          if (!inViewport) {
            return [...baseColor, 100] as [number, number, number, number];
          }
          
          // 다른 앨범이 선택/브러시된 경우: 살짝만 어둡게 (배경화, 하지만 여전히 보임)
          if (selectedAlbumId || brushedAlbumIds.length > 0) {
            return [...baseColor, 180] as [number, number, number, number];
          }
          
          // 기본 상태: 밝게 표시
          return [...baseColor, 220] as [number, number, number, number];
        },
        getLineColor: [255, 255, 255],
        getLineWidth: (d: Album) => d.id === selectedAlbumId ? 2 : 0,
        getRadius: (d: Album) => {
          const base = (d.popularity || 0.5) * 2.5 + 2; // 약간 작게
          return d.id === selectedAlbumId ? base * 2 : base;
        },
        pickable: true,
        stroked: true,
        radiusScale: 1,
        radiusMinPixels: 3,  // 최소 크기 더 작게 (더 많이 보임)
        radiusMaxPixels: 25, // 최대 크기도 줄임
        opacity: 0.85,
      onHover: (info: PickingInfo) => {
        if (info.object) {
          setHoverInfo({ x: info.x, y: info.y, object: info.object as Album });
        } else {
          setHoverInfo(null);
        }
      },
      onClick: (info: PickingInfo) => {
        if (info.object) {
          const album = info.object as Album;
          // 작은 팝업만 표시 (selectAlbum 호출 안함)
          setClickedAlbum({ x: info.x, y: info.y, album });
        } else {
          setClickedAlbum(null);
        }
      },
      updateTriggers: {
        getFillColor: [selectedAlbumId, brushedAlbumIds, viewportYearRange, searchMatchedAlbumIds, searchQuery],
        getLineWidth: [selectedAlbumId],
        getRadius: [selectedAlbumId],
        getPosition: [scales]
      }
    })];
  }, [filteredAlbums, selectedAlbumId, brushedAlbumIds, viewportYearRange, scales, selectAlbum, showGrid, searchMatchedAlbumIds, searchQuery]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* 구(Sphere) 형태 블러 - 입체감 */}
      <div className="absolute inset-0 pointer-events-none z-30">
        {/* Radial gradient로 구형 블러 */}
        <div 
          className="absolute inset-0" 
          style={{
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.7) 85%, black 100%)'
          }}
        />
        {/* 추가 좌우 블러 (강화) */}
        <div className="absolute top-0 left-0 bottom-0 w-64 bg-gradient-to-r from-black via-black/70 to-transparent" />
        <div className="absolute top-0 right-0 bottom-0 w-64 bg-gradient-to-l from-black via-black/70 to-transparent" />
        {/* 추가 상하 블러 (깊이감) */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      <div className="w-full h-full relative">
        <DeckGL
          width="100%"
          height="100%"
          viewState={viewState}
          onViewStateChange={({ viewState: newViewState }: any) => {
            // 그리드 표시 (줌/팬 중)
            setShowGrid(true);
            if (fadeTimerRef.current) {
              clearTimeout(fadeTimerRef.current);
            }
            fadeTimerRef.current = setTimeout(() => {
              setShowGrid(false);
            }, 3000);
            
            // 애니메이션 중이면 업데이트 무시
            if (isAnimating) {
              console.log('⏸️ Skipping update during animation');
              return;
            }
            
            // Zoom 제한 적용
            let zoom = newViewState.zoom;
            zoom = Math.max(0.2, Math.min(4, zoom));
            
            // 경계 제한 (드래그만 제한, 줌은 자유롭게)
            const zoomScale = Math.pow(2, zoom);
            const visibleWorldWidth = WORLD_WIDTH / zoomScale;
            const visibleWorldHeight = WORLD_HEIGHT / zoomScale;
            
            // X축 경계 제한 (부드럽게)
            let targetX = newViewState.target[0];
            const halfVisibleX = visibleWorldWidth / 2;
            if (halfVisibleX < WORLD_WIDTH / 2) {
              // 줌인 상태: 범위 내로 제한
              targetX = Math.max(halfVisibleX, Math.min(WORLD_WIDTH - halfVisibleX, targetX));
            } else {
              // 줌아웃 상태: 중앙 고정
              targetX = WORLD_WIDTH / 2;
            }
            
            // Y축 경계 제한 (부드럽게)
            let targetY = newViewState.target[1];
            const halfVisibleY = visibleWorldHeight / 2;
            if (halfVisibleY < WORLD_HEIGHT / 2) {
              targetY = Math.max(halfVisibleY, Math.min(WORLD_HEIGHT - halfVisibleY, targetY));
            } else {
              targetY = WORLD_HEIGHT / 2;
            }
            
            // 일반 줌/팬: 즉시 반응
            setViewState({
              target: [targetX, targetY, 0] as [number, number, number],
              zoom: zoom,
              transitionDuration: 0,
              transitionInterpolator: undefined as any
            });
              
            // 뷰포트에서 보이는 연도 범위 계산
            const leftX = Math.max(0, targetX - halfVisibleX);
            const rightX = Math.min(WORLD_WIDTH, targetX + halfVisibleX);
            
            const yearScale = (x: number) => MIN_YEAR + (x / WORLD_WIDTH) * (MAX_YEAR - MIN_YEAR);
            const minVisibleYear = Math.max(MIN_YEAR, Math.floor(yearScale(leftX)));
            const maxVisibleYear = Math.min(MAX_YEAR, Math.ceil(yearScale(rightX)));
            
            setViewportYearRange([minVisibleYear, maxVisibleYear]);
          }}
          controller={{
            scrollZoom: { speed: 0.005, smooth: true },
            inertia: 600,
            dragPan: true,
            dragRotate: false,
            doubleClickZoom: false,
            keyboard: false,
            touchRotate: false
          }}
          layers={layers}
          views={new OrthographicView({ 
            id: 'ortho',
            controller: {
              scrollZoom: { speed: 0.005, smooth: true }
            }
          })}
          getCursor={() => 'grab'}
          parameters={{
            clearColor: [0, 0, 0, 0]
          }}
        >
          {hoverInfo && !clickedAlbum && (
            <div className="absolute z-50 bg-panel border border-slate-600 p-2 rounded shadow-lg pointer-events-none text-xs" style={{ left: hoverInfo.x + 10, top: hoverInfo.y + 10 }}>
              <div className="font-bold text-white">{hoverInfo.object.title}</div>
              <div className="text-slate-400">{hoverInfo.object.artist} ({hoverInfo.object.year})</div>
            </div>
          )}
          
          {/* Clicked Album Popup (SearchBar와 동일한 스타일) */}
          {clickedAlbum && (
            <div 
              ref={popupRef}
              className="absolute z-50 w-[280px] bg-[#12131D]/98 backdrop-blur-3xl border border-accent/40 rounded-xl shadow-[0_20px_60px_-10px_rgba(99,102,241,0.5)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300"
              style={{ 
                left: Math.min(clickedAlbum.x + 20, window.innerWidth - 300), 
                top: Math.min(clickedAlbum.y, window.innerHeight - 250) 
              }}
            >
              <div className="p-4">
                <div className="flex items-start gap-4 mb-4">
                  <img 
                    src={clickedAlbum.album.coverUrl} 
                    className="w-20 h-20 rounded-lg border border-white/20 shadow-lg" 
                    alt={clickedAlbum.album.title} 
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white mb-1 truncate">{clickedAlbum.album.title}</h3>
                    <p className="text-xs text-slate-400 truncate">{clickedAlbum.album.artist}</p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
                      <span>{clickedAlbum.album.year}</span>
                      <span>•</span>
                      <span>{clickedAlbum.album.region}</span>
                      <span>•</span>
                      <span>{clickedAlbum.album.genres.slice(0, 2).join(', ')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // View Detail 클릭: selectAlbum 호출하고 팝업 닫기
                      selectAlbum(clickedAlbum.album.id);
                      setClickedAlbum(null);
                    }}
                    className="flex-1 px-4 py-2 bg-accent hover:bg-accent/80 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    View Detail
                  </button>
                  <button
                    onClick={() => {
                      setClickedAlbum(null);
                    }}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold rounded-lg transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </DeckGL>
      </div>
    </div>
  );
};