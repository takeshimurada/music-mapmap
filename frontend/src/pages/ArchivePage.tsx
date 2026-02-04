import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useStore } from '../state/store';
import { Album } from '../types';
import { ChevronDown, Music2 } from 'lucide-react';

const YEAR_MIN = 1950;
const YEAR_MAX = 2026;

// ?λⅤ 紐⑸줉 (DB ?ㅼ젣 ?λⅤ)
const GENRES = [
  'All',
  'Rock',
  'Jazz/Blues',
  'Jazz',
  'Pop',
  'Classical',
  'R&B/Soul',
  'Hip Hop',
  'Folk/World',
  'Latin',
  'Country',
  'Electronic',
  'Alternative/Indie',
  'Metal',
  'Reggae',
  'K-pop/Asia Pop',
  'Unknown'
];

// ?뺣젹 ?듭뀡
const SORT_OPTIONS = [
  { value: 'genre-random', label: 'Genre (Random)' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'newest', label: 'Newest ??Oldest' },
  { value: 'oldest', label: 'Oldest ??Newest' },
  { value: 'title-asc', label: 'Title (A ??Z)' },
  { value: 'title-desc', label: 'Title (Z ??A)' },
  { value: 'artist-asc', label: 'Artist (A ??Z)' },
  { value: 'artist-desc', label: 'Artist (Z ??A)' },
];

// ?⑤쾾 移대뱶 而댄룷?뚰듃 (React.memo濡?理쒖쟻??
const AlbumCard: React.FC<{ album: Album; onClick: () => void }> = React.memo(({ album, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer bg-white border border-gray-200 rounded overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
    >
      {/* ?⑤쾾 而ㅻ쾭 */}
      <div className="relative aspect-square bg-gray-100 overflow-hidden">
        {album.coverUrl ? (
          <img
            src={album.coverUrl}
            alt={album.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music2 size={48} className="text-gray-300" />
          </div>
        )}
        
        {/* ?곕룄 諛곗? */}
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-white/90 rounded text-[10px] font-medium text-black">
          {album.year}
        </div>
      </div>

      {/* ?뺣낫 */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-black mb-1 line-clamp-2">
          {album.title}
        </h3>
        <p className="text-xs text-gray-500 line-clamp-1">
          {album.artist}
        </p>
        
        {/* ?λⅤ & 援?? */}
        <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
          {album.genres[0] && (
            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
              {album.genres[0]}
            </span>
          )}
          {album.country && (
            <span className="truncate">{album.country}</span>
          )}
        </div>
      </div>
    </div>
  );
});

export const ArchivePage: React.FC = () => {
  const { albums, selectAlbum, searchQuery } = useStore();
  
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [yearRange, setYearRange] = useState<[number, number]>([YEAR_MIN, YEAR_MAX]);
  const [selectedCountry, setSelectedCountry] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('genre-random');
  const [randomSeed, setRandomSeed] = useState<number>(() => Date.now());
  const [displayCount, setDisplayCount] = useState(50); // 珥덇린 ?쒖떆 媛쒖닔 (50媛쒕줈 媛먯냼)
  const [draggingHandle, setDraggingHandle] = useState<'min' | 'max' | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Intersection Observer??ref
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSortBy('genre-random');
    setRandomSeed(Date.now());
  }, []);

  // ?⑤쾾 ?대┃ ?몃뱾??理쒖쟻??
  const handleAlbumClick = useCallback((albumId: string) => {
    selectAlbum(albumId);
  }, [selectAlbum]);

  // Load More ?몃뱾??
  const loadMore = useCallback(() => {
    setDisplayCount(prev => prev + 50);
  }, []);
  const clampYear = useCallback((value: number) => {
    return Math.min(YEAR_MAX, Math.max(YEAR_MIN, value));
  }, []);

  const pointerToYear = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const relativeX = Math.min(rect.width, Math.max(0, clientX - rect.left));
    const ratio = rect.width === 0 ? 0 : relativeX / rect.width;
    return clampYear(Math.round(YEAR_MIN + ratio * (YEAR_MAX - YEAR_MIN)));
  }, [clampYear]);

  const updateRange = useCallback((handle: 'min' | 'max', nextValue: number) => {
    setYearRange(prev => {
      const clamped = clampYear(nextValue);
      if (handle === 'min') {
        return [Math.min(clamped, prev[1]), prev[1]];
      }
      return [prev[0], Math.max(clamped, prev[0])];
    });
  }, [clampYear]);

  const handleTrackPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nextYear = pointerToYear(event.clientX);
    if (nextYear === null) return;
    const distToMin = Math.abs(nextYear - yearRange[0]);
    const distToMax = Math.abs(nextYear - yearRange[1]);
    const handle = distToMin <= distToMax ? 'min' : 'max';
    setDraggingHandle(handle);
    updateRange(handle, nextYear);
  }, [pointerToYear, yearRange, updateRange]);

  const handlePointerDown = useCallback((event: React.PointerEvent, handle: 'min' | 'max') => {
    event.stopPropagation();
    event.preventDefault();
    setDraggingHandle(handle);
    const nextYear = pointerToYear(event.clientX);
    if (nextYear !== null) {
      updateRange(handle, nextYear);
    }
  }, [pointerToYear, updateRange]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingHandle) return;
      event.preventDefault();
      const nextYear = pointerToYear(event.clientX);
      if (nextYear === null) return;
      updateRange(draggingHandle, nextYear);
    };

    const handlePointerUp = () => {
      setDraggingHandle(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointerleave', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointerleave', handlePointerUp);
    };
  }, [draggingHandle, pointerToYear, updateRange]);


  // 援?? 紐⑸줉 ?앹꽦 (?⑤쾾???덈뒗 援??留?
  const countries = useMemo(() => {
    const countrySet = new Set(albums.map(a => a.country).filter(c => c));
    return ['All', ...Array.from(countrySet).sort()];
  }, [albums]);

  const randomOrder = useMemo(() => {
    const order = new Map<string, number>();
    albums.forEach(album => {
      order.set(album.id, Math.random());
    });
    return order;
  }, [albums, randomSeed]);

  const genreOrder = useMemo(() => {
    const order = new Map<string, number>();
    const genres = new Set<string>();
    albums.forEach(album => {
      const g = album.genres[0] || 'Unknown';
      genres.add(g);
    });
    genres.forEach(genre => {
      order.set(genre, Math.random());
    });
    return order;
  }, [albums, randomSeed]);

  // ?꾪꽣留?& ?뺣젹
  const filteredAlbums = useMemo(() => {
    let filtered = [...albums];

    // ?λⅤ ?꾪꽣
    if (selectedGenre !== 'All') {
      filtered = filtered.filter(album => album.genres[0] === selectedGenre);
    }

    // ?곕룄 ?꾪꽣
    if (yearRange[0] !== YEAR_MIN || yearRange[1] !== YEAR_MAX) {
      filtered = filtered.filter(album => album.year >= yearRange[0] && album.year <= yearRange[1]);
    }
    // country filter
    if (selectedCountry !== 'All') {
      filtered = filtered.filter(album => album.country === selectedCountry);
    }

    // search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(album =>
        album.title.toLowerCase().includes(q) ||
        album.artist.toLowerCase().includes(q)
      );
    }


    // sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'genre-random': {
          const genreA = a.genres[0] || 'Unknown';
          const genreB = b.genres[0] || 'Unknown';
          if (genreA !== genreB) {
            const orderA = genreOrder.get(genreA) ?? 0;
            const orderB = genreOrder.get(genreB) ?? 0;
            if (orderA !== orderB) return orderA - orderB;
            return genreA.localeCompare(genreB);
          }
          const ra = randomOrder.get(a.id) ?? 0;
          const rb = randomOrder.get(b.id) ?? 0;
          return ra - rb;
        }
        case 'popularity':
          return (b.popularity || 0) - (a.popularity || 0);
        case 'newest':
          return b.year - a.year;
        case 'oldest':
          return a.year - b.year;
        case 'title-asc':
          return a.title.localeCompare(b.title);
        case 'title-desc':
          return b.title.localeCompare(a.title);
        case 'artist-asc':
          return a.artist.localeCompare(b.artist);
        case 'artist-desc':
          return b.artist.localeCompare(a.artist);
        default:
          return 0;
      }
    });

    // ?꾪꽣 蹂寃???displayCount 由ъ뀑
    setDisplayCount(50);

    return filtered;
  }, [albums, selectedGenre, yearRange, selectedCountry, sortBy, searchQuery, randomOrder]);

  // ?ㅼ젣 ?쒖떆???⑤쾾 (?깅뒫 理쒖쟻??
  const displayedAlbums = useMemo(() => {
    return filteredAlbums.slice(0, displayCount);
  }, [filteredAlbums, displayCount]);

  const hasMore = filteredAlbums.length > displayCount;

  // 臾댄븳 ?ㅽ겕濡?援ы쁽 (Intersection Observer)
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loadMore]);

  return (
    <div className="absolute top-16 right-0 bottom-0 left-0 overflow-y-auto bg-white custom-scrollbar">
      {/* ?ㅻ뜑 */}
      <header className="sticky top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-6">
            {/* ??댄? */}
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-black">
                Archive
              </h1>
              <p className="text-sm text-gray-500">
                {filteredAlbums.length} albums
              </p>
            </div>

            {/* ?꾪꽣 & ?뺣젹 */}
            <div className="flex items-center gap-2">
              {/* ?λⅤ ?꾪꽣 */}
              <div className="relative">
                <select
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value)}
                  className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm text-black focus:outline-none focus:border-black cursor-pointer hover:border-gray-400 transition-colors"
                >
                  {GENRES.map(genre => (
                    <option key={genre} value={genre} className="bg-white">
                      {genre === 'All' ? 'All Genres' : genre}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              {/* ?곕룄 ?꾪꽣 */}
              {/* Years slider */}
              <div className="flex flex-col items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 min-h-[44px]">
                <div
                  ref={trackRef}
                  onPointerDown={handleTrackPointerDown}
                  className="relative h-3 w-[180px] cursor-pointer"
                >
                  <div className="absolute inset-0 flex items-center">
                    <div className="h-1 w-full rounded-full bg-gray-200" />
                    <div
                      className="absolute h-1 rounded-full bg-black"
                      style={{
                        left: `${((yearRange[0] - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100}%`,
                        right: `${100 - ((yearRange[1] - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100}%`,
                      }}
                    />
                  </div>
                  <div
                    onPointerDown={(event) => handlePointerDown(event, 'min')}
                    className="pointer-events-auto absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-black bg-white shadow-lg"
                    style={{
                      left: `${((yearRange[0] - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    aria-label="Start year"
                  />
                  <div
                    onPointerDown={(event) => handlePointerDown(event, 'max')}
                    className="pointer-events-auto absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-black bg-white shadow-lg"
                    style={{
                      left: `${((yearRange[1] - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    aria-label="End year"
                  />
                </div>
                <div className="flex w-full justify-between text-[10px] font-semibold text-gray-600">
                  <span>{yearRange[0]}</span>
                  <span>{yearRange[1]}</span>
                </div>
              </div>

              {/* 援?? ?꾪꽣 */}
              <div className="relative">
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm text-black focus:outline-none focus:border-black cursor-pointer hover:border-gray-400 transition-colors"
                >
                  {countries.map(country => (
                    <option key={country} value={country} className="bg-white">
                      {country === 'All' ? 'All Countries' : country}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              {/* ?뺣젹 */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm text-black focus:outline-none focus:border-black cursor-pointer hover:border-gray-400 transition-colors"
                >
                  {SORT_OPTIONS.map(option => (
                    <option key={option.value} value={option.value} className="bg-white">
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 洹몃━??*/}
      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 relative z-10">
        {filteredAlbums.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
              {displayedAlbums.map(album => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onClick={() => handleAlbumClick(album.id)}
                />
              ))}
            </div>

            {/* 臾댄븳 ?ㅽ겕濡??몃━嫄?*/}
            {hasMore && (
              <div ref={observerTarget} className="flex justify-center mt-8 py-8">
                <div className="flex items-center gap-2 text-gray-400">
                  <div className="w-2 h-2 bg-black rounded-full animate-pulse" />
                  <span className="text-sm">Loading more... ({displayedAlbums.length} / {filteredAlbums.length})</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <Music2 size={64} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No albums found</p>
            <p className="text-gray-400 text-sm mt-2">Try adjusting your filters</p>
          </div>
        )}
      </main>
    </div>
  );
};






