import { Album, Region } from '../types';

const ARTIST_PREFIXES = ['The', 'Electric', 'Neon', 'Velvet', 'Cosmic', 'Dark', 'Golden', 'Silent', 'Future', 'Retro'];
const ARTIST_NOUNS = ['Dreams', 'Machines', 'Pilots', 'Surfers', 'Monks', 'Boys', 'Girls', 'Sisters', 'Waves', 'Lions'];
const ALBUM_ADJECTIVES = ['Lost', 'Found', 'Eternal', 'Temporary', 'Blue', 'Red', 'Broken', 'Glass', 'Heavy', 'Soft'];
const ALBUM_NOUNS = ['Memories', 'Highways', 'Visions', 'Systems', 'Romance', 'Days', 'Nights', 'Echoes', 'Clouds', 'Stars'];

const GENRES = ['Rock', 'Jazz', 'Pop', 'Electronic', 'Hip Hop', 'Classical', 'Ambient', 'Folk'];

function randomEnum<T>(anEnum: T): T[keyof T] {
  const enumValues = Object.keys(anEnum as any)
    .map(n => Number.parseInt(n))
    .filter(n => !Number.isNaN(n)) as unknown as T[keyof T][];
  const keys = Object.keys(anEnum as any).filter(k => isNaN(Number(k)));
  const randomIndex = Math.floor(Math.random() * keys.length);
  return (anEnum as any)[keys[randomIndex]];
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const generateMockAlbums = (count: number): Album[] => {
  const albums: Album[] = [];
  
  for (let i = 0; i < count; i++) {
    const yearBase = Math.floor(Math.random() * (2024 - 1960 + 1)) + 1960;
    
    // Create clusters based on decades for "Map" feeling
    let vibeBase = Math.random();
    if (yearBase < 1970) vibeBase = vibeBase * 0.6 + 0.2; // Mid vibe
    else if (yearBase > 1980 && yearBase < 1990) vibeBase = Math.min(1, vibeBase + 0.3); // High energy
    
    const artist = `${ARTIST_PREFIXES[Math.floor(Math.random() * ARTIST_PREFIXES.length)]} ${ARTIST_NOUNS[Math.floor(Math.random() * ARTIST_NOUNS.length)]}`;
    const title = `${ALBUM_ADJECTIVES[Math.floor(Math.random() * ALBUM_ADJECTIVES.length)]} ${ALBUM_NOUNS[Math.floor(Math.random() * ALBUM_NOUNS.length)]}`;
    
    albums.push({
      id: generateId(),
      title,
      artist,
      year: yearBase,
      vibe: vibeBase,
      popularity: Math.random() * 0.8 + 0.2,
      region: randomEnum(Region),
      genres: [GENRES[Math.floor(Math.random() * GENRES.length)]],
      coverUrl: `https://picsum.photos/seed/${i}/200`
    });
  }
  
  // Add some famous specific nodes for demo purposes
  albums.push({
    id: 'legend-1',
    title: 'Dark Side of the Moon',
    artist: 'Pink Floyd',
    year: 1973,
    vibe: 0.3,
    popularity: 1.0,
    region: Region.EUROPE,
    genres: ['Rock', 'Psychedelic'],
    coverUrl: 'https://picsum.photos/seed/pinkfloyd/200'
  });

  albums.push({
    id: 'legend-2',
    title: 'Thriller',
    artist: 'Michael Jackson',
    year: 1982,
    vibe: 0.9,
    popularity: 1.0,
    region: Region.NORTH_AMERICA,
    genres: ['Pop', 'R&B'],
    coverUrl: 'https://picsum.photos/seed/mj/200'
  });

  albums.push({
    id: 'legend-3',
    title: 'Kid A',
    artist: 'Radiohead',
    year: 2000,
    vibe: 0.25,
    popularity: 0.9,
    region: Region.EUROPE,
    genres: ['Electronic', 'Rock'],
    coverUrl: 'https://picsum.photos/seed/radiohead/200'
  });

  return albums.sort((a, b) => a.year - b.year);
};

export const MOCK_ALBUMS = generateMockAlbums(1500);
