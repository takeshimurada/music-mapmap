import { create } from 'zustand';
import { Album, Region, Viewport } from '../types';

interface AppState {
  albums: Album[];
  filteredAlbums: Album[];
  selectedAlbumId: string | null;
  brushedAlbumIds: string[]; // IDs selected via brush tool
  searchMatchedAlbumIds: string[]; // IDs matched by search (for highlighting)
  
  // Filters
  yearRange: [number, number];
  activeRegions: Region[];
  searchQuery: string;

  // Map View
  viewport: Viewport;
  viewportYearRange: [number, number]; // 현재 뷰포트에서 보이는 연도 범위
  
  // Loading state
  loading: boolean;
  
  // Actions
  loadAlbums: () => Promise<void>;
  setYearRange: (range: [number, number]) => void;
  setViewportYearRange: (range: [number, number]) => void;
  toggleRegion: (region: Region) => void;
  selectAlbum: (id: string | null) => void;
  setBrushedAlbums: (ids: string[]) => void;
  setSearchQuery: (query: string) => void;
  setViewport: (viewport: Viewport | ((prev: Viewport) => Viewport)) => void;
}

const MIN_YEAR = 1960;
const MAX_YEAR = 2024;

const ALL_REGIONS: Region[] = ['North America', 'Europe', 'Asia', 'South America', 'Latin America', 'Caribbean', 'Oceania', 'Africa'];

const applyFilters = (state: AppState): Album[] => {
  return state.albums.filter(album => {
    // 지역 필터만 적용, 연도 필터는 투명도로만 처리 (모든 노드 표시)
    const inRegion = state.activeRegions.includes(album.region);
    return inRegion;
  });
};

const getSearchMatchedIds = (state: AppState): string[] => {
  if (state.searchQuery === '') return [];
  
  return state.albums
    .filter(album => 
      album.title.toLowerCase().includes(state.searchQuery.toLowerCase()) || 
      album.artist.toLowerCase().includes(state.searchQuery.toLowerCase())
    )
    .map(album => album.id);
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// ========================================
// Step 1: 개발용 User ID 관리
// ========================================
const DEV_USER_ID_KEY = 'devUserId';
let cachedDevUserId: string | null = null;

/**
 * 개발용 유저 ID를 확보합니다 (localStorage + 캐시)
 * - localStorage에 없으면 백엔드에 생성 요청
 * - 실패 시 경고만 출력하고 빈 문자열 반환 (앱 실행 중단 방지)
 */
async function ensureDevUserId(): Promise<string> {
  // 1. 캐시 확인
  if (cachedDevUserId) return cachedDevUserId;
  
  // 2. localStorage 확인
  const stored = localStorage.getItem(DEV_USER_ID_KEY);
  if (stored) {
    cachedDevUserId = stored;
    return stored;
  }
  
  // 3. 백엔드에 새 유저 생성 요청
  try {
    console.log('🔐 Creating dev user...');
    const response = await fetch(`${BACKEND_URL}/dev/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create dev user: ${response.status}`);
    }
    
    const data = await response.json();
    const userId = data.user_id;
    
    localStorage.setItem(DEV_USER_ID_KEY, userId);
    cachedDevUserId = userId;
    console.log('✅ Dev user created:', userId);
    
    return userId;
  } catch (error) {
    console.error('❌ Failed to create dev user:', error);
    console.warn('⚠️ Continuing without authentication (Like/Event features may not work)');
    return '';
  }
}

/**
 * X-User-Id 헤더를 포함한 fetch 옵션 반환
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const userId = await ensureDevUserId();
  return userId ? { 'X-User-Id': userId } : {};
}

// 백엔드 응답을 프론트엔드 타입으로 변환
const transformAlbumData = (backendAlbum: any): Album => {
  return {
    id: backendAlbum.id,
    title: backendAlbum.title,
    artist: backendAlbum.artist_name,
    year: backendAlbum.year,
    releaseDate: backendAlbum.release_date || undefined, // 실제 발매일 (YYYY-MM-DD)
    vibe: backendAlbum.genre_vibe,
    popularity: backendAlbum.popularity,
    region: backendAlbum.region_bucket as Region,
    country: backendAlbum.country || undefined, // 국가 정보 (없으면 undefined)
    coverUrl: backendAlbum.cover_url,
    genres: [backendAlbum.genre],
  };
};

export const useStore = create<AppState>((set, get) => ({
  albums: [],
  filteredAlbums: [],
  selectedAlbumId: null,
  brushedAlbumIds: [],
  searchMatchedAlbumIds: [],
  yearRange: [MIN_YEAR, MAX_YEAR],
  activeRegions: ALL_REGIONS,
  searchQuery: '',
  viewport: { x: (MIN_YEAR + MAX_YEAR) / 2, y: 0.5, k: 1 },
  viewportYearRange: [MIN_YEAR, MAX_YEAR],
  loading: true,

  loadAlbums: async () => {
    try {
      set({ loading: true });
      
      // Step 1: 개발용 유저 ID 확보 (에러가 나도 albums 로딩은 계속)
      await ensureDevUserId().catch(err => {
        console.warn('⚠️ Dev user initialization failed, but continuing:', err);
      });
      
      console.log('🔄 Loading albums from:', `${BACKEND_URL}/albums?limit=50000`);
      
      const response = await fetch(`${BACKEND_URL}/albums?limit=50000`);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ HTTP ${response.status} Error:`, errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('📦 API Response:', data);
      
      // 백엔드 응답 검증
      if (!data || !data.data || !Array.isArray(data.data)) {
        console.error('❌ Invalid API response format:', data);
        throw new Error('Invalid API response format');
      }
      
      // 백엔드 응답을 프론트엔드 타입으로 변환
      const albums: Album[] = data.data.map(transformAlbumData);
      console.log(`✅ Loaded ${albums.length} albums`);
      
      const state = get();
      const newState = { ...state, albums, loading: false };
      const filtered = applyFilters(newState as AppState);
      console.log(`🔍 Filtered albums: ${filtered.length} (activeRegions: ${state.activeRegions.length}, viewportYearRange: [${state.viewportYearRange[0]}, ${state.viewportYearRange[1]}])`);
      
      set({ 
        ...newState,
        filteredAlbums: filtered,
        loading: false 
      });
    } catch (error) {
      console.error('❌ Failed to load albums:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));
      set({ loading: false, albums: [], filteredAlbums: [] });
    }
  },

  setYearRange: (range) => set((state) => {
    const newState = { ...state, yearRange: range };
    return { ...newState, filteredAlbums: applyFilters(newState as AppState) };
  }),

  setViewportYearRange: (range) => set((state) => {
    const newState = { ...state, viewportYearRange: range };
    return { ...newState, filteredAlbums: applyFilters(newState as AppState) };
  }),

  toggleRegion: (region) => set((state) => {
    const newRegions = state.activeRegions.includes(region)
      ? state.activeRegions.filter(r => r !== region)
      : [...state.activeRegions, region];
    const newState = { ...state, activeRegions: newRegions };
    return { ...newState, filteredAlbums: applyFilters(newState as AppState) };
  }),

  setSearchQuery: (query) => set((state) => {
    const newState = { ...state, searchQuery: query };
    const filtered = applyFilters(newState as AppState);
    const searchMatched = getSearchMatchedIds(newState as AppState);
    return { 
      ...newState, 
      filteredAlbums: filtered,
      searchMatchedAlbumIds: searchMatched,
    };
  }),

  selectAlbum: (id) => set({ selectedAlbumId: id }),
  setBrushedAlbums: (ids) => set({ brushedAlbumIds: ids }),
  
  setViewport: (vp) => set((state) => ({
    viewport: typeof vp === 'function' ? vp(state.viewport) : vp
  })),
}));

// ========================================
// Step 1: Export 헬퍼 함수 (DetailPanel 등에서 사용)
// ========================================
export { BACKEND_URL, ensureDevUserId, getAuthHeaders };