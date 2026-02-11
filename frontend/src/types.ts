// Region을 문자열 타입으로 변경 (백엔드와 일치)
export type Region = 'North America' | 'Europe' | 'Asia' | 'South America' | 'Caribbean' | 'Oceania' | 'Africa';

export interface Album {
  id: string;
  title: string;
  artist: string;
  year: number;
  releaseDate?: string; // ISO date string (YYYY-MM-DD), 실제 발매일
  vibe: number; // 0.0 (Calm) to 1.0 (Energetic)
  popularity: number; // Determines circle size
  region: Region;
  country?: string; // 국가별 세분화
  coverUrl?: string;
  genres: string[];
}

export interface ArtistNode {
  creator_id: string;
  display_name: string;
  x: number;
  y: number;
  size: number;
  album_count?: number;
  genres?: string[];
  country_code?: string | null;
  popularity?: number | null;
  image_url?: string | null;
}

export interface ArtistEdge {
  source_creator_id: string;
  target_creator_id: string;
  weight: number;
  components?: Record<string, number> | null;
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

// --- Metadata Detail Types ---
export interface AlbumLink {
  provider: string;
  url: string;
  external_id?: string | null;
  is_primary: boolean;
}

export interface CreatorRef {
  creator_id: string;
  display_name: string;
  image_url?: string | null;
}

export interface RoleRef {
  role_id: string;
  role_name: string;
  role_group: string;
}

export interface AlbumCredit {
  creator: CreatorRef;
  role: RoleRef;
  credit_detail?: string | null;
  credit_order?: number | null;
}

export interface TrackCredit extends AlbumCredit {}

export interface TrackInfo {
  track_id: string;
  disc_no: number;
  track_no: number;
  title: string;
  duration_ms?: number | null;
  isrc?: string | null;
}

export interface AlbumDetailMeta {
  tracks: TrackInfo[];
  album_credits: AlbumCredit[];
  track_credits: TrackCredit[];
  album_links: AlbumLink[];
}

// --- Step 1: Like System Types ---

export interface LikeItem {
  entity_type: string;
  entity_id: string;
  liked_at: string;
}
