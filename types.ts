// Region을 문자열 타입으로 변경 (백엔드와 일치)
export type Region = 'North America' | 'Europe' | 'Asia' | 'South America' | 'Latin America' | 'Caribbean' | 'Oceania' | 'Africa';

export interface Album {
  id: string;
  title: string;
  artist: string;
  year: number;
  vibe: number; // 0.0 (Calm) to 1.0 (Energetic)
  popularity: number; // Determines circle size
  region: Region;
  country?: string; // 국가별 세분화
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

export interface CreditDetail {
  name: string;
  role: string;
  description: string;
}

export interface ExtendedAlbumData {
  summaryEn: string;
  summaryKo: string;
  tracklist: string[];
  credits: string[];
  creditDetails: CreditDetail[];
  reviews: ReviewDigest[];
}

export interface UserLog {
  rating: number; // 0-5
  memo: string;
  updatedAt: string;
}

// --- Step 1: Like System Types ---

export interface LikeItem {
  entity_type: string;
  entity_id: string;
  liked_at: string;
}