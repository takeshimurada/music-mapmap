import React from 'react';
import { useStore } from '../../state/store';

const GENRE_COLORS: Record<string, string> = {
  Rock: '#ef4444',
  Metal: '#7f1d1d',
  Punk: '#f97316',
  Alternative: '#f97316',
  Pop: '#e11d48',
  Electronic: '#8b5cf6',
  'Hip Hop': '#3b82f6',
  'R&B': '#10b981',
  Soul: '#16a34a',
  Dance: '#f59e0b',
  Jazz: '#0ea5e9',
  Blues: '#1d4ed8',
  Country: '#84cc16',
  Folk: '#94a3b8',
  Classical: '#64748b',
  Ambient: '#22d3ee',
  Latin: '#f97316',
  Reggae: '#22c55e',
  World: '#a855f7',
  'K-Pop': '#ec4899',
  Unknown: '#9ca3af',
  Other: '#9ca3af'
};

const getGenreColor = (genre: string): string => {
  if (GENRE_COLORS[genre]) return GENRE_COLORS[genre];
  const lower = genre.toLowerCase();
  const matchedKey = Object.keys(GENRE_COLORS).find(key => key.toLowerCase() === lower);
  if (matchedKey) return GENRE_COLORS[matchedKey];
  const partial = Object.keys(GENRE_COLORS).find(key => lower.includes(key.toLowerCase()));
  if (partial) return GENRE_COLORS[partial];
  return GENRE_COLORS.Other;
};

export const GenreFilter: React.FC = () => {
  const { selectedGenre, setSelectedGenre, albums } = useStore();

  const toggleGenre = (genre: string) => {
    setSelectedGenre(selectedGenre === genre ? null : genre);
  };

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const album of albums) {
      const genre = album.genres?.[0] || 'Other';
      map.set(genre, (map.get(genre) || 0) + 1);
    }
    return map;
  }, [albums]);

  const orderedGenres = React.useMemo(() => {
    const items = Array.from(counts.entries());
    items.sort((a, b) => b[1] - a[1]);
    return items.map(([genre]) => genre);
  }, [counts]);

  return (
    <div className="genre-scroll w-full bg-white border border-gray-200 rounded-xl sm:rounded-2xl md:rounded-[2rem] px-2 py-3 shadow-lg max-h-[45vh] overflow-y-hidden hover:overflow-y-auto [direction:rtl]">
      <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-2 [direction:ltr]">Genres</div>
      <div className="flex flex-col gap-2 [direction:ltr]">
        <button
          onClick={() => setSelectedGenre(null)}
          className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition-all w-full text-left ${
            selectedGenre === null ? 'border-black text-black bg-white' : 'border-gray-200 text-gray-600 bg-gray-50 hover:border-gray-400'
          }`}
        >
          All
        </button>
        {orderedGenres.map(genre => {
          const active = selectedGenre === genre;
          return (
            <button
              key={genre}
              onClick={() => toggleGenre(genre)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition-all w-full justify-start ${
                active ? 'border-black text-black bg-white' : 'border-gray-200 text-gray-600 bg-gray-50 hover:border-gray-400'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getGenreColor(genre) }}
              />
              <span className="truncate">{genre}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
