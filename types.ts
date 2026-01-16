export enum Region {
  NORTH_AMERICA = 'North America',
  EUROPE = 'Europe',
  ASIA = 'Asia',
  LATIN_AMERICA = 'Latin America',
  AFRICA = 'Africa'
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  year: number;
  vibe: number; // 0.0 (Calm) to 1.0 (Energetic)
  popularity: number; // Determines circle size
  region: Region;
  coverUrl?: string;
  genres: string[];
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface Viewport {
  x: number; // Center X (Year)
  y: number; // Center Y (Vibe)
  k: number; // Zoom scale
}

export interface SimulationConfig {
  minYear: number;
  maxYear: number;
  minVibe: 0;
  maxVibe: 1;
}

// --- New Types for Detail Panel ---

export interface ReviewDigest {
  source: string;
  excerpt: string;
  url: string; // Simulated link
}

export interface ExtendedAlbumData {
  summaryEn: string;
  summaryKo: string;
  tracklist: string[];
  credits: string[];
  reviews: ReviewDigest[];
}

export interface UserLog {
  rating: number; // 0-5
  memo: string;
  updatedAt: string;
}