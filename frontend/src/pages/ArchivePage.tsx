import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useStore } from '../state/store';
import { Album } from '../types';
import { ChevronDown, Music2 } from 'lucide-react';

// 장르 목록 (DB 실제 장르)
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

// 정렬 옵션
const SORT_OPTIONS = [
  { value: 'popularity', label: 'Popularity' },
  { value: 'newest', label: 'Newest → Oldest' },
  { value: 'oldest', label: 'Oldest → Newest' },
  { value: 'title-asc', label: 'Title (A → Z)' },
  { value: 'title-desc', label: 'Title (Z → A)' },
  { value: 'artist-asc', label: 'Artist (A → Z)' },
  { value: 'artist-desc', label: 'Artist (Z → A)' },
];

// 앨범 카드 컴포넌트 (React.memo로 최적화)
const AlbumCard: React.FC<{ album: Album; onClick: () => void }> = React.memo(({ album, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer bg-white border border-gray-200 rounded overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
    >
      {/* 앨범 커버 */}
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
        
        {/* 연도 배지 */}
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-white/90 rounded text-[10px] font-medium text-black">
          {album.year}
        </div>
      </div>

      {/* 정보 */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-black mb-1 line-clamp-2">
          {album.title}
        </h3>
        <p className="text-xs text-gray-500 line-clamp-1">
          {album.artist}
        </p>
        
        {/* 장르 & 국가 */}
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
  const { albums, selectAlbum, selectedAlbumId } = useStore();
  
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedCountry, setSelectedCountry] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('popularity');
  const [displayCount, setDisplayCount] = useState(50); // 초기 표시 개수 (50개로 감소)

  // Intersection Observer용 ref
  const observerTarget = useRef<HTMLDivElement>(null);

  // 앨범 클릭 핸들러 최적화
  const handleAlbumClick = useCallback((albumId: string) => {
    selectAlbum(albumId);
  }, [selectAlbum]);

  // Load More 핸들러
  const loadMore = useCallback(() => {
    setDisplayCount(prev => prev + 50);
  }, []);

  // 연도 목록 생성 (앨범이 있는 연도만)
  const years = useMemo(() => {
    const yearSet = new Set(albums.map(a => a.year).filter(y => y > 0));
    return ['All', ...Array.from(yearSet).sort((a, b) => b - a)];
  }, [albums]);

  // 국가 목록 생성 (앨범이 있는 국가만)
  const countries = useMemo(() => {
    const countrySet = new Set(albums.map(a => a.country).filter(c => c));
    return ['All', ...Array.from(countrySet).sort()];
  }, [albums]);

  // 필터링 & 정렬
  const filteredAlbums = useMemo(() => {
    let filtered = [...albums];

    // 장르 필터
    if (selectedGenre !== 'All') {
      filtered = filtered.filter(album => album.genres[0] === selectedGenre);
    }

    // 연도 필터
    if (selectedYear !== 'All') {
      filtered = filtered.filter(album => album.year === Number(selectedYear));
    }

    // 국가 필터
    if (selectedCountry !== 'All') {
      filtered = filtered.filter(album => album.country === selectedCountry);
    }

    // 정렬
    filtered.sort((a, b) => {
      switch (sortBy) {
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

    // 필터 변경 시 displayCount 리셋
    setDisplayCount(50);

    return filtered;
  }, [albums, selectedGenre, selectedYear, selectedCountry, sortBy]);

  // 실제 표시할 앨범 (성능 최적화)
  const displayedAlbums = useMemo(() => {
    return filteredAlbums.slice(0, displayCount);
  }, [filteredAlbums, displayCount]);

  const hasMore = filteredAlbums.length > displayCount;

  // 무한 스크롤 구현 (Intersection Observer)
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
      {/* 헤더 */}
      <header className="sticky top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-6">
            {/* 타이틀 */}
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-black">
                Archive
              </h1>
              <p className="text-sm text-gray-500">
                {filteredAlbums.length} albums
              </p>
            </div>

            {/* 필터 & 정렬 */}
            <div className="flex items-center gap-2">
              {/* 장르 필터 */}
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

              {/* 연도 필터 */}
              <div className="relative">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm text-black focus:outline-none focus:border-black cursor-pointer hover:border-gray-400 transition-colors"
                >
                  {years.map(year => (
                    <option key={year} value={year} className="bg-white">
                      {year === 'All' ? 'All Years' : year}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              {/* 국가 필터 */}
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

              {/* 정렬 */}
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

      {/* 그리드 */}
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

            {/* 무한 스크롤 트리거 */}
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
