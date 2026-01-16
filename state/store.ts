import { create } from 'zustand';
import { Album, Region, Viewport } from '../types';
import { MOCK_ALBUMS } from '../data/mockAlbums';

interface AppState {
  albums: Album[];
  filteredAlbums: Album[];
  selectedAlbumId: string | null;
  brushedAlbumIds: string[]; // IDs selected via brush tool
  
  // Filters
  yearRange: [number, number];
  activeRegions: Region[];
  searchQuery: string;

  // Map View
  viewport: Viewport;
  
  // Actions
  setYearRange: (range: [number, number]) => void;
  toggleRegion: (region: Region) => void;
  selectAlbum: (id: string | null) => void;
  setBrushedAlbums: (ids: string[]) => void;
  setSearchQuery: (query: string) => void;
  setViewport: (viewport: Viewport | ((prev: Viewport) => Viewport)) => void;
}

const MIN_YEAR = 1960;
const MAX_YEAR = 2024;

const applyFilters = (state: AppState): Album[] => {
  return state.albums.filter(album => {
    const inYear = album.year >= state.yearRange[0] && album.year <= state.yearRange[1];
    const inRegion = state.activeRegions.includes(album.region);
    const inSearch = state.searchQuery === '' || 
                     album.title.toLowerCase().includes(state.searchQuery.toLowerCase()) || 
                     album.artist.toLowerCase().includes(state.searchQuery.toLowerCase());
    return inYear && inRegion && inSearch;
  });
};

export const useStore = create<AppState>((set, get) => ({
  albums: MOCK_ALBUMS,
  filteredAlbums: MOCK_ALBUMS,
  selectedAlbumId: null,
  brushedAlbumIds: [],
  yearRange: [MIN_YEAR, MAX_YEAR],
  activeRegions: Object.values(Region),
  searchQuery: '',
  viewport: { x: (MIN_YEAR + MAX_YEAR) / 2, y: 0.5, k: 1 },

  setYearRange: (range) => set((state) => {
    const newState = { ...state, yearRange: range };
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
    return { 
      ...newState, 
      filteredAlbums: filtered,
    };
  }),

  selectAlbum: (id) => set({ selectedAlbumId: id }),
  setBrushedAlbums: (ids) => set({ brushedAlbumIds: ids }),
  
  setViewport: (vp) => set((state) => ({
    viewport: typeof vp === 'function' ? vp(state.viewport) : vp
  })),
}));