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

const MIN_YEAR = 1950;
const MAX_YEAR = 2024;
const DAYS_PER_YEAR = 365;
const WORLD_WIDTH = 1200;  // 800 → 1200 (50% 확장)
const WORLD_HEIGHT = 900;  // 600 → 900 (50% 확장)

// Y축 배치: 위에서부터 아프리카 - 라틴&남미 - 캐리비안 - 북미 - 유럽 - 아시아 - 오세아니아
// 대륙 순서 정의
const REGION_ORDER = [
  'Africa',
  'South America', 
  'Caribbean',
  'North America',
  'Europe',
  'Asia',
  'Oceania'
];

// 동적 Y축 범위 계산 함수 (중앙 밀집 + 노드 양에 따른 동적 할당 + 최소 영역 보장)
const calculateDynamicRegionRanges = (albums: Album[]): Record<string, { min: number; max: number; center: number }> => {
  // 1. 각 지역별 앨범 수 계산
  const regionCounts: Record<string, number> = {};
  albums.forEach(album => {
    const region = album.region;
    regionCounts[region] = (regionCounts[region] || 0) + 1;
  });
  
  // 2. 총 앨범 수
  const totalAlbums = albums.length;
  
  // 3. 중앙 밀집 범위 설정 (0~100% 범위 내에서 사용)
  const COMPRESSED_MIN = 0.05;
  const COMPRESSED_MAX = 0.95;
  const usableRange = COMPRESSED_MAX - COMPRESSED_MIN;
  
  // 4. 최소 영역 크기 설정 (전체의 2% 이상)
  const MIN_REGION_RATIO = 0.02;
  
  // 5. 앨범이 있는 지역과 조정된 비율 계산
  const activeRegions: { region: string; count: number; ratio: number }[] = [];
  let totalRatio = 0;
  
  REGION_ORDER.forEach(region => {
    const count = regionCounts[region] || 0;
    if (count > 0) {
      // 비율 계산 (최소값 적용)
      const rawRatio = count / totalAlbums;
      const adjustedRatio = Math.max(rawRatio, MIN_REGION_RATIO);
      activeRegions.push({ region, count, ratio: adjustedRatio });
      totalRatio += adjustedRatio;
    }
  });
  
  // 6. 비율 정규화 (합이 1이 되도록)
  activeRegions.forEach(r => {
    r.ratio = r.ratio / totalRatio;
  });
  
  // 7. 각 지역에 Y축 공간 할당
  const ranges: Record<string, { min: number; max: number; center: number }> = {};
  let currentRelativeY = 0.0;
  
  activeRegions.forEach(({ region, ratio }) => {
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
  'South America': { min: 0.08, max: 0.18, center: 0.13 },
  'Caribbean': { min: 0.18, max: 0.23, center: 0.205 },
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
  
  // South America (0.08-0.18)
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
  'South America': 0.13,
  'Caribbean': 0.205,
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

// 날짜를 연도 내 비율로 변환 (0.0 ~ 1.0)
const getDayOfYearRatio = (dateString: string): number => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInYear = isLeapYear ? 366 : 365;
  return dayOfYear / daysInYear;
};

// X 좌표 생성: 실제 발매일 기반 (날짜가 없으면 연중 랜덤 분산)
const getX = (year: number, releaseDate: string | undefined, albumId: string): number => {
  if (releaseDate) {
    try {
      // 정확하지 않은 날짜(01-01, 12-31)는 랜덤 분산
      const isApproximateDate = releaseDate.endsWith('-01-01') || releaseDate.endsWith('-12-31');
      
      if (isApproximateDate) {
        // 연도만 있는 경우: 연도 내에서 랜덤 분산
        const seed = hashCode(albumId + 'x');
        const dayRatio = 0.1 + ((seed % 10000) / 10000) * 0.8;
        return year + dayRatio;
      } else {
        // 정확한 발매일이 있으면 그 날짜 사용
        const dayRatio = getDayOfYearRatio(releaseDate);
        return year + dayRatio;
      }
    } catch (e) {
      // 날짜 파싱 실패 시 폴백
      console.warn(`Failed to parse release date: ${releaseDate}`, e);
    }
  }
  
  // 날짜가 없으면 연도 내에서 랜덤하게 분산 (0.1 ~ 0.9)
  const seed = hashCode(albumId + 'x');
  const dayRatio = 0.1 + ((seed % 10000) / 10000) * 0.8;
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
  'Alternative/Indie': [251, 146, 60], // DB 실제 장르
  
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
  'R&B/Soul': [132, 204, 22],       // DB 실제 장르
  
  // 재즈/블루스
  'Jazz': [59, 130, 246],           // 파랑
  'Blues': [37, 99, 235],
  'Funk': [29, 78, 216],
  'Jazz/Blues': [59, 130, 246],     // DB 실제 장르
  
  // 클래식/포크
  'Classical': [167, 139, 250],     // 연보라 (우아함)
  'Folk': [134, 239, 172],          // 민트
  'Country': [74, 222, 128],        // 초록
  'Folk/World': [134, 239, 172],    // DB 실제 장르
  
  // 월드/기타
  'World': [251, 191, 36],          // 노랑
  'Latin': [245, 158, 11],
  'Reggae': [20, 184, 166],         // 청록
  'K-Pop': [244, 114, 182],         // 핑크
  'J-Pop': [217, 70, 239],          // 자주색
  'K-pop/Asia Pop': [244, 114, 182], // DB 실제 장르
  
  // Unknown
  'Unknown': [148, 163, 184],       // 회색
  
  // 기본값
  'Other': [148, 163, 184],         // 회색
};

// 🎨 장르 색상 매칭 헬퍼 (스마트 매칭)
const getGenreColor = (genre: string | undefined | null): [number, number, number] => {
  if (!genre) return GENRE_RGB['Other'];
  
  // 1. 정확한 매칭 (대소문자 구분)
  if (GENRE_RGB[genre]) return GENRE_RGB[genre];
  
  // 2. 대소문자 무시 매칭
  const lowerGenre = genre.toLowerCase();
  const matchedKey = Object.keys(GENRE_RGB).find(key => key.toLowerCase() === lowerGenre);
  if (matchedKey) return GENRE_RGB[matchedKey];
  
  // 3. 슬래시(/) 분리된 경우 첫 번째 장르 사용
  if (genre.includes('/')) {
    const firstGenre = genre.split('/')[0].trim();
    if (GENRE_RGB[firstGenre]) return GENRE_RGB[firstGenre];
    
    // 대소문자 무시 재시도
    const matchedFirst = Object.keys(GENRE_RGB).find(key => key.toLowerCase() === firstGenre.toLowerCase());
    if (matchedFirst) return GENRE_RGB[matchedFirst];
  }
  
  // 4. 부분 매칭 (포함 관계)
  const partialMatch = Object.keys(GENRE_RGB).find(key => 
    lowerGenre.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerGenre)
  );
  if (partialMatch) return GENRE_RGB[partialMatch];
  
  // 5. 기본값
  return GENRE_RGB['Other'];
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
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  
  const [viewState, setViewState] = useState({
    target: [WORLD_WIDTH / 2, WORLD_HEIGHT * 0.45, 0] as [number, number, number],  // 실제 노드 중심 (0.15~0.75의 중심 = 0.45)
    zoom: -0.5,  // 더 줌아웃 (넓은 영역 대응)
    transitionDuration: 0,
    transitionInterpolator: null as any
  });

  // 화면 크기 감지 및 초기 zoom 조정
  const [isInitialLoad, setIsInitialLoad] = React.useState(true);
  
  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setContainerSize({ width, height });
      
      // 초기 로드 시에만 zoom 조정
      if (isInitialLoad) {
        // UI 요소들의 공간을 고려 (우측 320px, 하단 150px 정도)
        const effectiveWidth = width - (width > 640 ? 340 : 300);
        const effectiveHeight = height - 180;
        
        // 화면 aspect ratio에 맞는 초기 zoom 계산
        const widthRatio = effectiveWidth / WORLD_WIDTH;
        const heightRatio = effectiveHeight / WORLD_HEIGHT;
        const minRatio = Math.min(widthRatio, heightRatio);
        
        // 초기 zoom: 전체 맵이 보이도록 (약간의 여백 포함)
        const initialZoom = Math.log2(minRatio * 0.85);
        
        setViewState(prev => ({
          ...prev,
          zoom: initialZoom,
          target: [WORLD_WIDTH / 2, WORLD_HEIGHT * 0.45, 0]  // 실제 노드 중심
        }));
        
        setIsInitialLoad(false);
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [isInitialLoad]);

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

  // DetailPanel이 닫힐 때 clickedAlbum도 초기화 (노드 원상태 복구)
  // selectedAlbumId가 "있었다가 없어질 때"만 초기화 (이전 값 추적)
  const prevSelectedAlbumIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    // 이전에 선택된 앨범이 있었는데 지금 없어진 경우에만 초기화
    if (prevSelectedAlbumIdRef.current && !selectedAlbumId && clickedAlbum) {
      setClickedAlbum(null);
    }
    prevSelectedAlbumIdRef.current = selectedAlbumId;
  }, [selectedAlbumId, clickedAlbum]);

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

  // 그리드 자동 페이드아웃
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
      const xValue = getX(sample.year, sample.releaseDate, sample.id);
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
           const albumXValue = getX(selectedAlbum.year, selectedAlbum.releaseDate, selectedAlbum.id);
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
        getColor: [209, 213, 219],  // gray-300
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
      
      // 1950년 기준선 (시작 기준선, 은은하게)
      new LineLayer({
        id: 'baseline-1950',
        data: [{ year: 1950 }],
        getSourcePosition: (d: any) => [scales.xScale(d.year), 0, 0],
        getTargetPosition: (d: any) => [scales.xScale(d.year), WORLD_HEIGHT, 0],
        getColor: [0, 0, 0, 150], // 검은색
        getWidth: 1.5,
        opacity: gridVisible * 0.8,
        transitions: {
          opacity: {
            duration: 1200,
            easing: easeInOutCubic
          }
        },
        updateTriggers: {
          opacity: [gridVisible]
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
          let showMonths = false; // 월 단위 표시 여부
          
          if (visibleYearRange <= 3) {
            yearInterval = 1; // 3년 이하: 1년 단위
            showMonths = true; // 월 단위도 표시
          } else if (visibleYearRange <= 20) {
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
          
          // 월 단위 라인 추가 (3년 이하일 때만)
          if (showMonths) {
            const monthStart = Math.floor(viewportYearRange[0]);
            const monthEnd = Math.ceil(viewportYearRange[1]);
            
            for (let year = monthStart; year <= monthEnd; year++) {
              if (year >= MIN_YEAR && year <= MAX_YEAR) {
                // 각 연도의 12개월 (1월부터 11월까지, 12월은 다음 해 1월과 겹침)
                for (let month = 1; month < 12; month++) {
                  const monthYear = year + month / 12;
                  lines.push({
                    year: monthYear,
                    isDecade: false,
                    interval: 1/12,
                    baseOpacity: 0.15  // 매우 투명하게
                  });
                }
              }
            }
          }
          
          return lines;
        })(),
        getSourcePosition: (d: any) => [scales.xScale(d.year), 0, 0],
        getTargetPosition: (d: any) => [scales.xScale(d.year), WORLD_HEIGHT, 0],
        getColor: (d: any) => {
          const opacity = d.baseOpacity * gridVisible * 255;  // gridVisible 적용
          return [209, 213, 219, opacity];  // gray-300
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
        getColor: [0, 0, 0, 255],  // 검은색 텍스트
        getSize: containerSize.width < 640 ? 10 : containerSize.width < 1024 ? 11 : 12,
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
          opacity: [gridVisible],
          getSize: [containerSize.width]
        }
      }),
      
      // 지역 레이블 (각 지역 범위의 중심에 배치)
      new TextLayer({
        id: 'region-labels',
        data: (() => {
          const labels = [];
          const regionNames: Record<string, string> = {
            'Africa': 'AFRICA',
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
          
          // 노드 영역 시작점 (X=0)
          const nodeStartX = 0;
          
          // 항상 노드 영역 왼쪽 밖에 고정 (-30)
          // 줌인되면 자연스럽게 화면 안으로 들어옴
          const labelX = nodeStartX - 30;
          
          return [labelX, regionY, 0];
        },
        getText: (d: any): string => containerSize.width < 640 ? d.text.split(' ')[0] : d.text, // 작은 화면에서는 첫 단어만
        getColor: [0, 0, 0, 255],  // 검은색 텍스트
        getSize: containerSize.width < 640 ? 10 : containerSize.width < 1024 ? 12 : 14,
        outlineWidth: containerSize.width < 640 ? 2 : 3,
        outlineColor: [255, 255, 255, 255],  // 흰색 outline
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
          getData: [albums.length],
          getSize: [containerSize.width],
          getText: [containerSize.width]
        }
      }),
      
      new ScatterplotLayer({
        id: 'albums-layer',
        data: filteredAlbums,
        getPosition: (d: Album) => {
          // X축: 실제 발매일 기반 배치
          const xValue = getX(d.year, d.releaseDate, d.id);
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
          
          // 🎨 장르 기반 색상 (스마트 매칭)
          const genre = d.genres[0];
          const baseColor = getGenreColor(genre);
          
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
          
          // 타임슬라이드 범위 밖의 앨범: 블러 처리
          const inViewport = d.year >= viewportYearRange[0] && d.year <= viewportYearRange[1];
          if (!inViewport) {
            return [...baseColor, 80] as [number, number, number, number];
          }
          
          // 다른 앨범이 선택/브러시된 경우: 살짝만 어둡게 (배경화, 하지만 여전히 보임)
          if (selectedAlbumId || brushedAlbumIds.length > 0) {
            return [...baseColor, 180] as [number, number, number, number];
          }
          
          // 기본 상태: 밝게 표시
          return [...baseColor, 220] as [number, number, number, number];
        },
        getLineColor: [0, 0, 0, 255],
        getLineWidth: (d: Album) => {
          const isClicked = clickedAlbum?.album.id === d.id;
          const isSelected = d.id === selectedAlbumId;
          return (isClicked || isSelected) ? 0.5 : 0;
        },
        getRadius: (d: Album) => {
          const base = (d.popularity || 0.5) * 2.5 + 2;
          // clickedAlbum이나 selectedAlbumId일 때 모두 크게 표시
          const isClicked = clickedAlbum?.album.id === d.id;
          const isSelected = d.id === selectedAlbumId;
          return (isClicked || isSelected) ? base * 1.8 : base;
        },
        pickable: true,
        stroked: true,
        radiusScale: 1,
        radiusMinPixels: 3,
        radiusMaxPixels: 30,
        opacity: 0.85,
      onHover: (info: PickingInfo) => {
        if (info.object) {
          setHoverInfo({ x: info.x, y: info.y, object: info.object as Album });
        } else {
          setHoverInfo(null);
        }
      },
      onClick: (info: PickingInfo) => {
        console.log('🖱️ Click event:', info);
        if (info.object) {
          const album = info.object as Album;
          console.log('🎵 Clicked album:', album.title, album.id);
          // 작은 팝업만 표시 (selectAlbum 호출 안함)
          setClickedAlbum({ x: info.x, y: info.y, album });
        } else {
          console.log('🖱️ Clicked empty area');
          setClickedAlbum(null);
        }
      },
      updateTriggers: {
        getFillColor: [selectedAlbumId, brushedAlbumIds, viewportYearRange, searchMatchedAlbumIds, searchQuery],
        getLineWidth: [selectedAlbumId, clickedAlbum],
        getRadius: [selectedAlbumId, clickedAlbum],
        getPosition: [scales]
      }
    })];
  }, [filteredAlbums, selectedAlbumId, brushedAlbumIds, viewportYearRange, scales, selectAlbum, showGrid, searchMatchedAlbumIds, searchQuery, clickedAlbum]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Vignette Effect - 완전 투명 (제거됨) */}
    

      <div className="w-full h-full relative">
        <DeckGL
          width="100%"
          height="100%"
          viewState={viewState}
          eventRecognizerOptions={{
            pan: { threshold: 10 },  // 10픽셀 이상 움직여야 드래그로 인식
            tap: { threshold: 10 },  // 클릭 허용 범위
          }}
          onViewStateChange={({ viewState: newViewState }: any) => {
            // 드래그/줌 시 DetailPanel 자동 닫기
            if (selectedAlbumId) {
              selectAlbum(null);
            }
            
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
            
            // Zoom 제한 적용 (최대 6 = 약 1년이 화면에 꽉 참)
            let zoom = newViewState.zoom;
            zoom = Math.max(0.2, Math.min(6, zoom));
            
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
          onClick={(info: PickingInfo) => {
            console.log('🔥 DeckGL onClick:', info);
            if (info.object) {
              const album = info.object as Album;
              console.log('🎵 Clicked album:', album.title);
              setClickedAlbum({ x: info.x, y: info.y, album });
            } else {
              setClickedAlbum(null);
            }
          }}
          getCursor={() => 'grab'}
          parameters={{
            clearColor: [1, 1, 1, 1]  // 흰색 배경
          }}
        >
          {hoverInfo && !clickedAlbum && (
            <div className="absolute z-50 bg-white border border-gray-200 p-2 rounded shadow-lg pointer-events-none text-xs" style={{ left: hoverInfo.x + 10, top: hoverInfo.y + 10 }}>
              <div className="font-bold text-black">{hoverInfo.object.title}</div>
              <div className="text-gray-600">{hoverInfo.object.artist} ({hoverInfo.object.year})</div>
            </div>
          )}
          
          {/* Clicked Album Popup (반응형, 크기 키움) */}
          {clickedAlbum && (
            <div 
              ref={popupRef}
              className="absolute z-50 w-[320px] sm:w-[360px] md:w-[400px] lg:w-[440px] bg-white backdrop-blur-3xl border border-gray-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300"
              style={{ 
                left: Math.min(clickedAlbum.x + 20, window.innerWidth - 340), 
                top: Math.min(clickedAlbum.y, window.innerHeight - 280) 
              }}
            >
              <div className="p-4 sm:p-5 md:p-6">
                <div className="flex items-start gap-3 sm:gap-4 md:gap-5 mb-4">
                  <img 
                    src={clickedAlbum.album.coverUrl} 
                    className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-lg border border-white/20 shadow-lg" 
                    alt={clickedAlbum.album.title} 
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base md:text-lg font-bold text-black mb-1 truncate">{clickedAlbum.album.title}</h3>
                    <p className="text-xs sm:text-sm md:text-base text-gray-600 truncate">{clickedAlbum.album.artist}</p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] sm:text-xs md:text-sm text-gray-500">
                      <span>{clickedAlbum.album.year}</span>
                      <span>•</span>
                      <span>{clickedAlbum.album.country}</span>
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
                    className="flex-1 px-3 py-2 sm:px-4 sm:py-2.5 md:px-5 md:py-3 bg-black hover:bg-gray-800 text-white text-xs sm:text-sm md:text-base font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    View Detail
                  </button>
                  <button
                    onClick={() => {
                      setClickedAlbum(null);
                    }}
                    className="px-3 py-2 sm:px-4 sm:py-2.5 md:px-5 md:py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-black text-xs sm:text-sm md:text-base font-bold rounded-lg transition-all"
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