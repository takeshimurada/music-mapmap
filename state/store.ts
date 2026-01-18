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

// 백엔드 응답을 프론트엔드 타입으로 변환
const transformAlbumData = (backendAlbum: any): Album => {
  return {
    id: backendAlbum.id,
    title: backendAlbum.title,
    artist: backendAlbum.artist_name,
    year: backendAlbum.year,
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
      console.log('🔄 Loading albums from:', `${BACKEND_URL}/albums?limit=2000`);
      
      const response = await fetch(`${BACKEND_URL}/albums?limit=2000`);
      
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