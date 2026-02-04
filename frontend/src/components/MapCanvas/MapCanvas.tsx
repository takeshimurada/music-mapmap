import React, { useState, useMemo, useEffect } from 'react';
import { DeckGL } from '@deck.gl/react';
import { OrthographicView, LinearInterpolator } from '@deck.gl/core';
import { ScatterplotLayer, LineLayer, TextLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import { scaleLinear } from 'd3';
import { useStore } from '../../state/store';
import { Album } from '../../types';

// Easing ?⑥닔 (遺?쒕윭??媛먯냽)
const easeInOutCubic = (t: number) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const MIN_YEAR = 1950;
const MAX_YEAR = 2026;
const DAYS_PER_YEAR = 365;
const WORLD_WIDTH = 1200;  // 800 ??1200 (50% ?뺤옣)
const WORLD_HEIGHT = 900;  // 600 ??900 (50% ?뺤옣)

// Y異?諛곗튂: ?꾩뿉?쒕????꾪봽由ъ뭅 - ?쇳떞&?⑤? - 罹먮━鍮꾩븞 - 遺곷? - ?좊읇 - ?꾩떆??- ?ㅼ꽭?꾨땲??
// ?瑜??쒖꽌 ?뺤쓽
const REGION_ORDER = [
  'Africa',
  'South America', 
  'Caribbean',
  'North America',
  'Europe',
  'Asia',
  'Oceania'
];


// 湲곕낯 Y異?踰붿쐞 (?곗씠??濡쒕뱶 ??
let REGION_Y_RANGES: Record<string, { min: number; max: number; center: number }> = {
  'Africa': { min: 0.00, max: 0.08, center: 0.04 },
  'South America': { min: 0.08, max: 0.18, center: 0.13 },
  'Caribbean': { min: 0.18, max: 0.23, center: 0.205 },
  'North America': { min: 0.20, max: 0.53, center: 0.365 },  // 0.55 ??0.53 (鍮?怨듦컙 ?쒓굅)
  'Europe': { min: 0.53, max: 0.85, center: 0.69 },           // 0.55 ??0.53 (鍮?怨듦컙 ?쒓굅)
  'Asia': { min: 0.85, max: 0.93, center: 0.89 },
  'Oceania': { min: 0.93, max: 1.00, center: 0.965 },
};

// 援??蹂?Y異??꾩튂 (媛??瑜?踰붿쐞 ?댁뿉???몃텇??
const COUNTRY_Y_POSITION: Record<string, number> = {
  // Africa (0.00-0.08) - 理쒖긽??
  'Morocco': 0.01,
  'Senegal': 0.025,
  'Ghana': 0.035,
  'Nigeria': 0.045,
  'Kenya': 0.055,
  'Egypt': 0.02,
  'South Africa': 0.07,
  
  // South America (0.08-0.18)
  'Mexico': 0.085,              // 遺곸そ
  'Colombia': 0.095,
  'Venezuela': 0.10,
  'Brazil': 0.12,               // 以묒떖
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
  
  // North America (0.20-0.55) - ?곗씠??媛??留롮쓬, ?볦? 怨듦컙
  'Canada': 0.22,               // 遺곸そ
  'United States': 0.375,       // 以묒떖
  'USA': 0.375,
  'US': 0.375,
  
  // 誘멸뎅 ?꾩떆蹂??몃텇??(罹먮━鍮꾩븞??媛源뚯슫 怨??꾩そ)
  'Miami': 0.23,                // 罹먮━鍮꾩븞??媛源뚯?
  'New Orleans': 0.26,          // 罹먮━鍮꾩븞??媛源뚯?
  'Nashville': 0.30,
  'Chicago': 0.35,              // 以묐?
  'Detroit': 0.36,
  'New York': 0.49,             // ?숇?, ?좊읇??媛源뚯? (0.48 ??0.49)
  'Boston': 0.52,               // ?숇?, ?좊읇??媛源뚯? (0.50 ??0.52)
  'Los Angeles': 0.40,          // ?쒕?
  'San Francisco': 0.43,        // ?쒕? (0.42 ??0.43)
  'Seattle': 0.48,              // ?쒕? 遺곷? (0.45 ??0.48)
  
  // Europe (0.53-0.85) - ?곗씠??留롮쓬, ?볦? 怨듦컙
  'Iceland': 0.54,              // 遺곷???媛源뚯? (0.56 ??0.54)
  'Ireland': 0.56,              // ??쒖뼇 媛源뚯? (0.59 ??0.56)
  'United Kingdom': 0.58,       // ??쒖뼇 媛源뚯? (0.62 ??0.58)
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
  'Poland': 0.79,               // ?숈쑀?? ?꾩떆?꾩뿉 媛源뚯?
  'Russia': 0.82,               // ?꾩떆?꾩뿉 媛源뚯?
  'Turkey': 0.84,               // ?꾩떆?꾩뿉 媛源뚯?
  
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
  
  // Oceania (0.93-1.00) - 理쒗븯??
  'Australia': 0.95,
  'New Zealand': 0.975,
};


// 臾몄옄?댁쓣 ?レ옄濡?蹂??(?쒕뱶 ?앹꽦)
const hashCode = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

// 媛?곗떆???뺢퇋遺꾪룷) 蹂???⑥닔 (以묒떖 諛吏??④낵)
const gaussianTransform = (uniform: number, mean: number = 0.5, stdDev: number = 0.25): number => {
  // Box-Muller 蹂?섏쓣 ?ъ슜??媛?곗떆??遺꾪룷
  const u1 = uniform;
  const u2 = (hashCode(uniform.toString()) % 10000) / 10000;
  const z0 = Math.sqrt(-2.0 * Math.log(Math.max(u1, 0.0001))) * Math.cos(2.0 * Math.PI * u2);
  
  // ?뺢퇋??諛??대━??
  let gaussian = mean + z0 * stdDev;
  gaussian = Math.max(0, Math.min(1, gaussian));
  
  return gaussian;
};

// Y 醫뚰몴 ?앹꽦: 吏??紐낇솗??援щ텇 + 吏????以묒떖 諛吏?+ ?먯뿰?ㅻ윭??寃쎄퀎 釉붾젋??
const getY = (country: string | undefined, region: string, albumId: string, vibe: number): number => {
  // 1. ?대떦 吏??쓽 Y異?踰붿쐞 媛?몄삤湲?
  const range = REGION_Y_RANGES[region];
  if (!range) {
    return 0.5; // 湲곕낯媛?
  }
  
  const { min, max, center } = range;
  const regionSize = max - min;
  
  // 2. ?⑤쾾 ID 湲곕컲 洹좊벑 ?쒕뜡 (0~1)
  const seed = hashCode(albumId + 'y');
  const uniformRandom = (seed % 10000) / 10000;
  
  // 3. 媛?곗떆??遺꾪룷 ?곸슜 (以묒떖?쇰줈 諛吏? stdDev濡??쇱쭚 議곗젅)
  // stdDev = 0.2: 以묒떖??80% 諛吏? ???앹쑝濡??먯뿰?ㅻ읇寃?媛먯냼
  const gaussianY = gaussianTransform(uniformRandom, 0.5, 0.2);
  
  // 4. vibe 湲곕컲 誘몄꽭 議곗젙
  const vibeOffset = (vibe - 0.5) * 0.1; // -0.05 ~ +0.05
  
  // 5. 理쒖쥌 ?곷? ?꾩튂 (0~1, 以묒떖??諛吏?
  let relativeY = gaussianY + vibeOffset;
  
  // 6. 援?? ?뺣낫媛 ?덉쑝硫??쎄컙???명뼢 異붽? (5%)
  if (country && COUNTRY_Y_POSITION[country]) {
    const countryAbsoluteY = COUNTRY_Y_POSITION[country];
    // 援?? ?꾩튂瑜?吏?????곷? ?꾩튂濡?蹂??
    let countryBias = (countryAbsoluteY - min) / regionSize;
    countryBias = Math.max(0, Math.min(1, countryBias));
    relativeY = relativeY * 0.95 + countryBias * 0.05;
  }
  
  // 7. ?대━??(0~1)
  relativeY = Math.max(0, Math.min(1, relativeY));
  
  // 8. 理쒖쥌 Y 醫뚰몴: 吏??踰붿쐞 ???곷? ?꾩튂瑜??덈? ?꾩튂濡?蹂??
  const finalY = min + relativeY * regionSize;
  
  // 0-1 踰붿쐞 ?대줈 ?쒗븳
  return Math.max(0, Math.min(1, finalY));
};

// ?좎쭨瑜??곕룄 ??鍮꾩쑉濡?蹂??(0.0 ~ 1.0)
const getDayOfYearRatio = (dateString: string): number => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInYear = isLeapYear ? 366 : 365;
  return dayOfYear / daysInYear;
};

// X 醫뚰몴 ?앹꽦: ?ㅼ젣 諛쒕ℓ??湲곕컲 (?좎쭨媛 ?놁쑝硫??곗쨷 ?쒕뜡 遺꾩궛)
const getX = (year: number, releaseDate: string | undefined, albumId: string): number => {
  if (releaseDate) {
    try {
      // ?뺥솗?섏? ?딆? ?좎쭨(01-01, 12-31)???쒕뜡 遺꾩궛
      const isApproximateDate = releaseDate.endsWith('-01-01') || releaseDate.endsWith('-12-31');
      
      if (isApproximateDate) {
        // ?곕룄留??덈뒗 寃쎌슦: ?곕룄 ?댁뿉???쒕뜡 遺꾩궛
        const seed = hashCode(albumId + 'x');
        const dayRatio = 0.1 + ((seed % 10000) / 10000) * 0.8;
        return year + dayRatio;
      } else {
        // ?뺥솗??諛쒕ℓ?쇱씠 ?덉쑝硫?洹??좎쭨 ?ъ슜
        const dayRatio = getDayOfYearRatio(releaseDate);
        return year + dayRatio;
      }
    } catch (e) {
      // ?좎쭨 ?뚯떛 ?ㅽ뙣 ???대갚
      console.warn(`Failed to parse release date: ${releaseDate}`, e);
    }
  }
  
  // ?좎쭨媛 ?놁쑝硫??곕룄 ?댁뿉???쒕뜡?섍쾶 遺꾩궛 (0.1 ~ 0.9)
  const seed = hashCode(albumId + 'x');
  const dayRatio = 0.1 + ((seed % 10000) / 10000) * 0.8;
  return year + dayRatio;
};

// ?λⅤ蹂??됱긽 留ㅽ븨
const GENRE_RGB: Record<string, [number, number, number]> = {
  // 濡?硫뷀깉
  'Rock': [239, 68, 68],           // 鍮④컯
  'Hard Rock': [220, 38, 38],
  'Metal': [127, 29, 29],
  'Alternative': [251, 146, 60],    // 二쇳솴
  'Indie': [253, 186, 116],
  'Punk': [234, 88, 12],
  'Alternative/Indie': [251, 146, 60], // DB ?ㅼ젣 ?λⅤ
  
  // ???꾩뒪
  'Pop': [236, 72, 153],            // ?묓겕
  'Dance': [219, 39, 119],
  'Electronic': [168, 85, 247],     // 蹂대씪
  'EDM': [147, 51, 234],
  'House': [126, 34, 206],
  'Techno': [107, 33, 168],
  
  // ?숉빀/R&B
  'Hip Hop': [234, 179, 8],         // 湲덉깋
  'Rap': [202, 138, 4],
  'R&B': [132, 204, 22],            // ?쇱엫
  'Soul': [101, 163, 13],
  'R&B/Soul': [132, 204, 22],       // DB ?ㅼ젣 ?λⅤ
  
  // ?ъ쫰/釉붾（??
  'Jazz': [59, 130, 246],           // ?뚮옉
  'Blues': [37, 99, 235],
  'Funk': [29, 78, 216],
  'Jazz/Blues': [59, 130, 246],     // DB ?ㅼ젣 ?λⅤ
  
  // ?대옒???ы겕
  'Classical': [167, 139, 250],     // ?곕낫??(?곗븘??
  'Folk': [134, 239, 172],          // 誘쇳듃
  'Country': [74, 222, 128],        // 珥덈줉
  'Folk/World': [134, 239, 172],    // DB ?ㅼ젣 ?λⅤ
  
  // ?붾뱶/湲고?
  'World': [251, 191, 36],          // ?몃옉
  'Latin': [245, 158, 11],
  'Reggae': [20, 184, 166],         // 泥?줉
  'K-Pop': [244, 114, 182],         // ?묓겕
  'J-Pop': [217, 70, 239],          // ?먯＜??
  'K-pop/Asia Pop': [244, 114, 182], // DB ?ㅼ젣 ?λⅤ
  
  // Unknown
  'Unknown': [148, 163, 184],       // ?뚯깋
  
  // 湲곕낯媛?
  'Other': [148, 163, 184],         // ?뚯깋
};

// ?렓 ?λⅤ ?됱긽 留ㅼ묶 ?ы띁 (?ㅻ쭏??留ㅼ묶)
const getGenreColor = (genre: string | undefined | null): [number, number, number] => {
  if (!genre) return GENRE_RGB['Other'];
  
  // 1. ?뺥솗??留ㅼ묶 (??뚮Ц??援щ텇)
  if (GENRE_RGB[genre]) return GENRE_RGB[genre];
  
  // 2. ??뚮Ц??臾댁떆 留ㅼ묶
  const lowerGenre = genre.toLowerCase();
  const matchedKey = Object.keys(GENRE_RGB).find(key => key.toLowerCase() === lowerGenre);
  if (matchedKey) return GENRE_RGB[matchedKey];
  
  // 3. ?щ옒??/) 遺꾨━??寃쎌슦 泥?踰덉㎏ ?λⅤ ?ъ슜
  if (genre.includes('/')) {
    const firstGenre = genre.split('/')[0].trim();
    if (GENRE_RGB[firstGenre]) return GENRE_RGB[firstGenre];
    
    // ??뚮Ц??臾댁떆 ?ъ떆??
    const matchedFirst = Object.keys(GENRE_RGB).find(key => key.toLowerCase() === firstGenre.toLowerCase());
    if (matchedFirst) return GENRE_RGB[matchedFirst];
  }
  
  // 4. 遺遺?留ㅼ묶 (?ы븿 愿怨?
  const partialMatch = Object.keys(GENRE_RGB).find(key => 
    lowerGenre.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerGenre)
  );
  if (partialMatch) return GENRE_RGB[partialMatch];
  
  // 5. 湲곕낯媛?
  return GENRE_RGB['Other'];
};

export const MapCanvas: React.FC = () => {
  const { 
    filteredAlbums, 
    selectedAlbumId, 
    selectAlbum,
    selectedArtist,
    selectArtist,
    brushedAlbumIds,
    searchMatchedAlbumIds,
    searchQuery,
    selectedGenre,
    viewport,
    setViewportYearRange,
    viewportYearRange,
    albums,
  } = useStore();

  const [hoverInfo, setHoverInfo] = useState<{x: number, y: number, object: Album} | null>(null);
  const [clickedAlbum, setClickedAlbum] = useState<{x: number, y: number, album: Album} | null>(null);
  const [popupAlbum, setPopupAlbum] = useState<{x: number, y: number, album: Album} | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const popupCloseTimerRef = React.useRef<number | null>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const lastViewStateRef = React.useRef<{ target: [number, number, number]; zoom: number } | null>(null);
  const panelCloseRef = React.useRef({ baseZoom: 0, baseTarget: [0, 0, 0] as [number, number, number], active: false });

  useEffect(() => {
    if (clickedAlbum) {
      if (popupCloseTimerRef.current) {
        window.clearTimeout(popupCloseTimerRef.current);
        popupCloseTimerRef.current = null;
      }
      setPopupAlbum(clickedAlbum);
      setPopupVisible(true);
      return;
    }

    if (popupAlbum) {
      setPopupVisible(false);
      popupCloseTimerRef.current = window.setTimeout(() => {
        setPopupAlbum(null);
        popupCloseTimerRef.current = null;
      }, 260);
    }
  }, [clickedAlbum, popupAlbum]);

  // Panel close baseline for large movements
  useEffect(() => {
    if (selectedAlbumId || clickedAlbum || selectedArtist) {
      panelCloseRef.current = {
        baseZoom: viewState.zoom,
        baseTarget: viewState.target as [number, number, number],
        active: true
      };
    } else {
      panelCloseRef.current.active = false;
    }
  }, [selectedAlbumId, clickedAlbum, selectedArtist]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const minZoomRef = React.useRef(-1.6);
  const baseTargetRef = React.useRef<[number, number, number]>([
    WORLD_WIDTH / 2,
    WORLD_HEIGHT * 0.6,
    0
  ]);
  
  const [viewState, setViewState] = useState({
    target: [WORLD_WIDTH / 2, WORLD_HEIGHT * 0.5, 0] as [number, number, number],  // centered
    zoom: -0.2,  // less zoomed out on entry
    transitionDuration: 0,
    transitionInterpolator: null as any
  });

  const showGrid = true;

  // scales瑜?癒쇱? ?뺤쓽
  const scales = useMemo(() => {
    const xScale = scaleLinear().domain([MIN_YEAR, MAX_YEAR + 1]).range([0, WORLD_WIDTH]);
    const yScale = scaleLinear().domain([0, 1]).range([WORLD_HEIGHT, 0]);
    return { xScale, yScale };
  }, []);

  // ?붾㈃ ?ш린 媛먯? 諛?珥덇린 zoom 議곗젙
  const [isInitialLoad, setIsInitialLoad] = React.useState(true);

  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setContainerSize({ width, height });

      if (isInitialLoad) {
        const effectiveWidth = width - (width > 640 ? 340 : 300);
        const effectiveHeight = height - 180;
        const widthRatio = effectiveWidth / WORLD_WIDTH;
        const heightRatio = effectiveHeight / WORLD_HEIGHT;
        const minRatio = Math.min(widthRatio, heightRatio);

        // Fit world to viewport with extra padding so the node field starts more zoomed-out.
        const paddingScale = width < 640 ? 0.6 : 0.7;
        const fitZoom = Math.log2(minRatio * paddingScale);
        const aspect = width / height;
        const aspectBias =
          aspect >= 1.6 ? 0.25 :
          aspect <= 0.85 ? -0.2 :
          (aspect - 1.0) * 0.2;
        const adjustedInitialZoom = fitZoom + aspectBias;
        const cappedInitialZoom = Math.max(Math.min(adjustedInitialZoom, 0.1), -2.2);
        minZoomRef.current = cappedInitialZoom;
        baseTargetRef.current = [WORLD_WIDTH / 2, WORLD_HEIGHT * 0.5, 0];

        setViewState(prev => ({
          ...prev,
          zoom: cappedInitialZoom,
          target: baseTargetRef.current
        }));

        setIsInitialLoad(false);
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [isInitialLoad]);

  

  // ?붾쾭源? ?곗씠???뺤씤 (scales ?뺤쓽 ??
  useEffect(() => {
    console.log('?뿺截?MapCanvas Debug:');
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

  // viewport 蹂寃?媛먯? (寃????遺?쒕윭???대룞)
  const [isAnimating, setIsAnimating] = React.useState(false);
  
  useEffect(() => {
    console.log('?뱧 Viewport update:', viewport);
    
    if (viewport.k > 1) {
       // ?⑤쾾 醫뚰몴瑜??쎌? 醫뚰몴濡?蹂??
       const targetX = scales.xScale(viewport.x);
       const targetY = scales.yScale(viewport.y);
       const targetZoom = Math.log2(viewport.k);
       
       // ?좏깮???⑤쾾???ㅼ젣 ?뚮뜑留??꾩튂 怨꾩궛 (?붾쾭洹몄슜)
       if (selectedAlbumId) {
         const selectedAlbum = albums.find(a => a.id === selectedAlbumId);
         if (selectedAlbum) {
           const albumXValue = getX(selectedAlbum.year, selectedAlbum.releaseDate, selectedAlbum.id);
          const albumYValue = getY(selectedAlbum.country, selectedAlbum.region as string, selectedAlbum.id, selectedAlbum.vibe);
           const albumPixelX = scales.xScale(albumXValue);
           const albumPixelY = scales.yScale(albumYValue);
           
           console.log('?렞 Selected album actual position:', {
             'albumXValue (year+offset)': albumXValue,
             'albumYValue (region+vibe)': albumYValue,
             'albumPixelX': albumPixelX,
             'albumPixelY': albumPixelY,
             'targetX (紐⑺몴)': targetX,
             'targetY (紐⑺몴)': targetY,
             'diff': {
               x: Math.abs(albumPixelX - targetX),
               y: Math.abs(albumPixelY - targetY)
             }
           });
         }
       }
       
       console.log('?? Animation details:', { 
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
       
       // 遺?쒕윭???좊땲硫붿씠??
       const newViewState = {
         target: [targetX, targetY, 0] as [number, number, number],
         zoom: targetZoom,
         transitionDuration: 2000,
         transitionEasing: easeInOutCubic,
         transitionInterpolator: new LinearInterpolator(['target', 'zoom']) as any
       };
       
       console.log('??Setting viewState:', newViewState);
       setViewState(newViewState);
       
       // ?좊땲硫붿씠??醫낅즺 ???뚮옒洹?由ъ뀑
       setTimeout(() => {
         console.log('??Animation complete');
         setIsAnimating(false);
       }, 2000);
    }
  }, [viewport.x, viewport.y, viewport.k, scales, selectedAlbumId, albums]);

  const layers = useMemo(() => {
    console.log('?렓 Creating layers with', filteredAlbums.length, 'albums');
    
    // 遺?쒕윭???섏씠?쒕? ?꾪빐 0-1 踰붿쐞濡?怨꾩궛
    const gridVisible = showGrid ? 1.0 : 0.0;
    
    return [
      // 吏??援щ텇??(媛濡쒖꽑)
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
      
      // 1950??湲곗???(?쒖옉 湲곗??? ???섍쾶)
      new LineLayer({
        id: 'baseline-1950',
        data: [{ year: 1950 }],
        getSourcePosition: (d: any) => [scales.xScale(d.year), 0, 0],
        getTargetPosition: (d: any) => [scales.xScale(d.year), WORLD_HEIGHT, 0],
        getColor: [0, 0, 0, 150], // 寃???
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
      
      // ?곕룄 援щ텇??(?몃줈?? 以??덈꺼???곕씪 ?숈쟻) - 10???⑥쐞????긽 ?좎?
      new LineLayer({
        id: 'year-lines',
        data: (() => {
          // 酉고룷?몄뿉??蹂댁씠???곕룄 踰붿쐞 怨꾩궛
          const visibleYearRange = viewportYearRange[1] - viewportYearRange[0];
          
          // 以??덈꺼???곕Ⅸ 湲곕낯 ??媛꾧꺽 寃곗젙
          let yearInterval = 10; // 湲곕낯 10???⑥쐞 (50???댁긽)
          let showMonths = false; // ???⑥쐞 ?쒖떆 ?щ?
          
          if (visibleYearRange <= 3) {
            yearInterval = 1; // 3???댄븯: 1???⑥쐞
            showMonths = true; // ???⑥쐞???쒖떆
          } else if (visibleYearRange <= 20) {
            yearInterval = 1; // 20???댄븯: 1???⑥쐞
          } else if (visibleYearRange <= 50) {
            yearInterval = 5; // 20-50?? 5???⑥쐞
          }
          
          const lines = [];
          const startYear = Math.floor(viewportYearRange[0] / 10) * 10; // 10???⑥쐞濡??쒖옉
          const endYear = Math.ceil(viewportYearRange[1] / 10) * 10;
          
          // 10???⑥쐞????긽 異붽? (諛앷쾶 ?좎?)
          for (let year = startYear; year <= endYear; year += 10) {
            if (year >= MIN_YEAR && year <= MAX_YEAR) {
              lines.push({ 
                year, 
                isDecade: true,
                interval: 10,
                baseOpacity: 1.0  // ??긽 諛앷쾶
              });
            }
          }
          
          // 異붽? ?몃????좊뱾 (5???먮뒗 1???⑥쐞)
          if (yearInterval < 10) {
            const fineStart = Math.floor(viewportYearRange[0] / yearInterval) * yearInterval;
            const fineEnd = Math.ceil(viewportYearRange[1] / yearInterval) * yearInterval;
            
            for (let year = fineStart; year <= fineEnd; year += yearInterval) {
              // 10???⑥쐞???대? 異붽??덉쑝誘濡?嫄대꼫?곌린
              if (year % 10 === 0) continue;
              
              if (year >= MIN_YEAR && year <= MAX_YEAR) {
                const baseOpacity = yearInterval === 1 ? 0.3 : 1.0; // 1???⑥쐞???щ챸?섍쾶
                lines.push({ 
                  year, 
                  isDecade: false,
                  interval: yearInterval,
                  baseOpacity: baseOpacity
                });
              }
            }
          }
          
          // ???⑥쐞 ?쇱씤 異붽? (3???댄븯???뚮쭔)
          if (showMonths) {
            const monthStart = Math.floor(viewportYearRange[0]);
            const monthEnd = Math.ceil(viewportYearRange[1]);
            
            for (let year = monthStart; year <= monthEnd; year++) {
              if (year >= MIN_YEAR && year <= MAX_YEAR) {
                // 媛??곕룄??12媛쒖썡 (1?붾???11?붽퉴吏, 12?붿? ?ㅼ쓬 ??1?붽낵 寃뱀묠)
                for (let month = 1; month < 12; month++) {
                  const monthYear = year + month / 12;
                  lines.push({
                    year: monthYear,
                    isDecade: false,
                    interval: 1/12,
                    baseOpacity: 0.15  // 留ㅼ슦 ?щ챸?섍쾶
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
          const opacity = d.baseOpacity * gridVisible * 255;  // gridVisible ?곸슜
          return [209, 213, 219, opacity];  // gray-300
        },
        getWidth: (d: any) => {
          if (d.isDecade) return 2.0; // 10???⑥쐞: 援듦쾶
          if (d.interval === 1) return 0.5; // 1???⑥쐞: 媛???뉕쾶
          return 1.0; // 5???⑥쐞: 以묎컙
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
      
      // ?곕룄 ?덉씠釉?(理쒖냼 ?띿꽦留??ъ슜)
      new TextLayer({
        id: 'year-labels',
        data: (() => {
          const visibleYearRange = viewportYearRange[1] - viewportYearRange[0];
          
          // ?덉씠釉붿? 10???⑥쐞濡쒕쭔 ?쒖떆 (1???⑥쐞???뚮룄)
          let labelInterval = 10;
          if (visibleYearRange <= 20) {
            labelInterval = 5; // 20???댄븯: 5???⑥쐞 ?덉씠釉?
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
          // ?붾㈃ ?곷떒??怨좎젙?섎룄濡?viewport ?곕씪媛湲?
          const zoomScale = Math.pow(2, viewState.zoom);
          const visibleWorldHeight = WORLD_HEIGHT / zoomScale;

            const panPaddingX = WORLD_WIDTH * 0.22;
            const panPaddingY = WORLD_HEIGHT * 0.12;
          const topEdgeY = viewState.target[1] - visibleWorldHeight / 2;
          const minLabelY = WORLD_HEIGHT * 0.0004;
          const labelY = Math.max(minLabelY, topEdgeY - 2);
          return [scales.xScale(d.year), labelY, 0];
        },
        getText: (d: any) => String(d.year),
        getColor: [0, 0, 0, 255],  // 寃????띿뒪??
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
      
      // 吏???덉씠釉?(媛?吏??踰붿쐞??以묒떖??諛곗튂)
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
          
          // ?몃뱶 ?곸뿭 ?쒖옉??(X=0)
          const nodeStartX = 0;
          
          // ??긽 ?몃뱶 ?곸뿭 ?쇱そ 諛뽰뿉 怨좎젙 (-30)
          // 以뚯씤?섎㈃ ?먯뿰?ㅻ읇寃??붾㈃ ?덉쑝濡??ㅼ뼱??
          const labelX = nodeStartX - 30;
          
          return [labelX, regionY, 0];
        },
        getText: (d: any): string => containerSize.width < 640 ? d.text.split(' ')[0] : d.text, // ?묒? ?붾㈃?먯꽌??泥??⑥뼱留?
        getColor: [0, 0, 0, 255],  // 寃????띿뒪??
        getSize: containerSize.width < 640 ? 10 : containerSize.width < 1024 ? 12 : 14,
        outlineWidth: containerSize.width < 640 ? 2 : 3,
        outlineColor: [255, 255, 255, 255],  // ?곗깋 outline
        getTextAnchor: 'end' as const,  // ?ㅻⅨ履???湲곗? (?쇱そ?쇰줈 六쀬뼱?섍컧)
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
          // X異? ?ㅼ젣 諛쒕ℓ??湲곕컲 諛곗튂
          const xValue = getX(d.year, d.releaseDate, d.id);
          const x = scales.xScale(xValue);
          
          // Y異? 援?? ?꾨룄 湲곕컲 + ?쎄컙??遺꾩궛
          const yValue = getY(d.country, d.region as string, d.id, d.vibe);
          const y = scales.yScale(yValue);
          
          return [x, y, 0];
        },
        getFillColor: (d: Album): [number, number, number, number] => {
          const isBrushed = brushedAlbumIds.includes(d.id);
          const isSelected = selectedAlbumId === d.id;
          const isSearchMatched = searchMatchedAlbumIds.includes(d.id);
          const hasSearchQuery = searchQuery.trim().length > 0;
          
          // ?렓 ?λⅤ 湲곕컲 ?됱긽 (?ㅻ쭏??留ㅼ묶)
          const genre = d.genres[0];
          const baseColor = getGenreColor(genre);
          
          // ?좏깮???⑤쾾: 媛??諛앷쾶 + 媛뺤“
          if (isSelected) {
            return [...baseColor, 255] as [number, number, number, number];
          }
          
          // 寃??以묒씪 ??
          if (hasSearchQuery) {
            // 寃??留ㅼ묶???⑤쾾: 諛앷쾶 媛뺤“
            if (isSearchMatched) {
              return [...baseColor, 255] as [number, number, number, number];
            }
            // 寃??留ㅼ묶 ?덈맂 ?⑤쾾: 釉붾윭 泥섎━ (留ㅼ슦 ?щ챸?섍쾶)
            return [...baseColor, 60] as [number, number, number, number];
          }
          
          // 釉뚮윭?쒕맂 ?⑤쾾: 留ㅼ슦 諛앷쾶 (?꾪떚?ㅽ듃 寃????
          if (isBrushed) {
            return [...baseColor, 240] as [number, number, number, number];
          }
          
          // ??꾩뒳?쇱씠??踰붿쐞 諛뽰쓽 ?⑤쾾: 釉붾윭 泥섎━
          const inViewport = d.year >= viewportYearRange[0] && d.year <= viewportYearRange[1];
          if (!inViewport) {
            return [...baseColor, 80] as [number, number, number, number];
          }
          
          // ?ㅻⅨ ?⑤쾾???좏깮/釉뚮윭?쒕맂 寃쎌슦: ?댁쭩留??대몼寃?(諛곌꼍?? ?섏?留??ъ쟾??蹂댁엫)
          if (selectedAlbumId || brushedAlbumIds.length > 0) {
            return [...baseColor, 180] as [number, number, number, number];
          }
          
          // 湲곕낯 ?곹깭: 諛앷쾶 ?쒖떆
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
          // clickedAlbum?대굹 selectedAlbumId????紐⑤몢 ?ш쾶 ?쒖떆
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
        console.log('?뼮截?Click event:', info);
        if (info.object) {
          const album = info.object as Album;
          console.log('?렦 Clicked album:', album.title, album.id);
          // ?묒? ?앹뾽留??쒖떆 (selectAlbum ?몄텧 ?덊븿)
          setClickedAlbum({ x: info.x, y: info.y, album });
        } else {
          console.log('?뼮截?Clicked empty area');
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
  }, [filteredAlbums, selectedAlbumId, brushedAlbumIds, viewportYearRange, scales, selectAlbum, searchMatchedAlbumIds, searchQuery, clickedAlbum, selectedGenre]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Vignette Effect - ?꾩쟾 ?щ챸 (?쒓굅?? */}
    

      <div className="w-full h-full relative">
        <DeckGL
          width="100%"
          height="100%"
          viewState={viewState}
          eventRecognizerOptions={{
            pan: { threshold: 10 },  // 10?쎌? ?댁긽 ?吏곸뿬???쒕옒洹몃줈 ?몄떇
            tap: { threshold: 10 },  // ?대┃ ?덉슜 踰붿쐞
          }}
          onViewStateChange={({ viewState: newViewState, interactionState }: any) => {
            // ??? ?/??? ?, ?? ?? ???? ?? ?? ??
            const isUserMove = !!(interactionState?.isDragging || interactionState?.isPanning || interactionState?.isZooming);
            if (isUserMove && panelCloseRef.current.active) {
              const base = panelCloseRef.current;
              const zoomDelta = Math.abs(newViewState.zoom - base.baseZoom);
              const dx = Math.abs(newViewState.target[0] - base.baseTarget[0]);
              const dy = Math.abs(newViewState.target[1] - base.baseTarget[1]);
              const panDist = Math.sqrt(dx * dx + dy * dy);

              const zoomThreshold = 0.8;
              const panThreshold = 150;

              if ((selectedAlbumId || clickedAlbum || selectedArtist) && (zoomDelta > zoomThreshold || panDist > panThreshold)) {
                if (selectedAlbumId) selectAlbum(null);
                if (clickedAlbum) setClickedAlbum(null);
                if (selectedArtist) selectArtist(null);
                panelCloseRef.current.active = false;
              }
            }
            
            // 洹몃━???쒖떆 (以???以?
            
            // ?좊땲硫붿씠??以묒씠硫??낅뜲?댄듃 臾댁떆
            if (isAnimating) {
              console.log('?몌툘 Skipping update during animation');
              return;
            }
            
            // Zoom ?쒗븳 ?곸슜 (理쒕? 6 = ??1?꾩씠 ?붾㈃??苑?李?
            let zoom = newViewState.zoom;
            const minZoom = minZoomRef.current ?? -2;
            zoom = Math.max(minZoom, Math.min(6, zoom));
            
            // 寃쎄퀎 ?쒗븳 (?쒕옒洹몃쭔 ?쒗븳, 以뚯? ?먯쑀濡?쾶)
            const zoomScale = Math.pow(2, zoom);
            const visibleWorldWidth = WORLD_WIDTH / zoomScale;
            const visibleWorldHeight = WORLD_HEIGHT / zoomScale;

            const panPaddingX = WORLD_WIDTH * 0.35;
            const panPaddingY = WORLD_HEIGHT * 0.2;
            const allowPanAtZoom = true;
            
            // X異?寃쎄퀎 ?쒗븳 (遺?쒕읇寃?
            let targetX = newViewState.target[0];
            const halfVisibleX = visibleWorldWidth / 2;
            if (allowPanAtZoom && halfVisibleX < WORLD_WIDTH / 2) {
              // 以뚯씤 ?곹깭: 踰붿쐞 ?대줈 ?쒗븳
              targetX = Math.max(halfVisibleX - panPaddingX, Math.min(WORLD_WIDTH - halfVisibleX + panPaddingX, targetX));
            } else {
              // 以뚯븘???곹깭: 以묒븰 怨좎젙
              targetX = baseTargetRef.current[0];
            }
            
            // Y異?寃쎄퀎 ?쒗븳 (遺?쒕읇寃?
            let targetY = newViewState.target[1];
            const halfVisibleY = visibleWorldHeight / 2;
            if (allowPanAtZoom && halfVisibleY < WORLD_HEIGHT / 2) {
              targetY = Math.max(halfVisibleY - panPaddingY, Math.min(WORLD_HEIGHT - halfVisibleY + panPaddingY, targetY));
            } else {
              targetY = baseTargetRef.current[1];
            }
            
            // ?쇰컲 以??? 利됱떆 諛섏쓳
            setViewState({
              target: [targetX, targetY, 0] as [number, number, number],
              zoom: zoom,
              transitionDuration: 0,
              transitionInterpolator: undefined as any
            });
              
            // 酉고룷?몄뿉??蹂댁씠???곕룄 踰붿쐞 怨꾩궛
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
            zoomAroundPointer: true,
            dragRotate: false,
            doubleClickZoom: false,
            keyboard: false,
            touchRotate: false
          }}
          layers={layers}
          views={new OrthographicView({ 
            id: 'ortho',
            controller: {
              scrollZoom: { speed: 0.005, smooth: true },
              zoomAroundPointer: true
            }
          })}
          onClick={(info: PickingInfo) => {
            console.log('?? DeckGL onClick:', info);
            if (info.object) {
              const album = info.object as Album;
              console.log('?? Clicked album:', album.title);
              if (selectedAlbumId) {
                setClickedAlbum(null);
                selectAlbum(album.id);
              } else {
                setClickedAlbum({ x: info.x, y: info.y, album });
              }
            } else {
              setClickedAlbum(null);
              if (selectedGenre) {
                useStore.getState().setSelectedGenre(null);
              }
            }
          }}
          getCursor={() => 'grab'}
          parameters={{
            clearColor: [1, 1, 1, 1]  // ?곗깋 諛곌꼍
          }}
        >
          {hoverInfo && !clickedAlbum && (
            <div className="absolute z-50 bg-white border border-gray-200 p-2 rounded shadow-lg pointer-events-none text-xs" style={{ left: hoverInfo.x + 10, top: hoverInfo.y + 10 }}>
              <div className="font-bold text-black">{hoverInfo.object.title}</div>
              <div className="text-gray-600">{hoverInfo.object.artist} ({hoverInfo.object.year})</div>
            </div>
          )}
          
          {/* Clicked Album Popup (諛섏쓳?? ?ш린 ?ㅼ?) */}
          {popupAlbum && (
            <div 
              ref={popupRef}
              className={"absolute z-50 w-[320px] sm:w-[360px] md:w-[400px] lg:w-[440px] bg-white backdrop-blur-3xl border border-gray-200 rounded-xl shadow-2xl overflow-hidden transition-all duration-300 " + (popupVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none') }
              style={{ 
                left: Math.min(popupAlbum.x + 20, window.innerWidth - 340), 
                top: Math.min(popupAlbum.y, window.innerHeight - 280) 
              }}
            >
              <div className="p-4 sm:p-5 md:p-6">
                <div className="flex items-start gap-3 sm:gap-4 md:gap-5 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      selectAlbum(popupAlbum.album.id);
                      setClickedAlbum(null);
                    }}
                    className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-lg border border-white/20 shadow-lg overflow-hidden flex-shrink-0 hover:scale-105 transition-transform"
                    title="View detail"
                  >
                    <img 
                      src={popupAlbum.album.coverUrl} 
                      className="w-full h-full object-cover" 
                      alt={popupAlbum.album.title} 
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base md:text-lg font-bold text-black mb-1 truncate">{popupAlbum.album.title}</h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        selectAlbum(null);
                        selectArtist(popupAlbum.album.artist);
                      }}
                      className="group relative text-xs sm:text-sm md:text-base text-gray-800 font-medium truncate"
                      title="View artist"
                    >
                      <span className="inline-flex items-center gap-2 border-b border-transparent group-hover:border-black transition-colors">
                        {popupAlbum.album.artist}
                        <span className="text-[10px] uppercase tracking-[0.2em] text-gray-400 group-hover:text-gray-700">Artist</span>
                      </span>
                    </button>
                    <div className="flex items-center gap-2 mt-2 text-[10px] sm:text-xs md:text-sm text-gray-500">
                      <span>{popupAlbum.album.year}</span>
                      <span>·</span>
                      <span>{popupAlbum.album.country}</span>
                      <span>·</span>
                      <span>{popupAlbum.album.genres.slice(0, 2).join(', ')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // View Detail ?대┃: selectAlbum ?몄텧?섍퀬 ?앹뾽 ?リ린
                      selectAlbum(popupAlbum.album.id);
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


