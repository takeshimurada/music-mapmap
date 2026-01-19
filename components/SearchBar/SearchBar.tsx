import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock, ArrowUpRight, Music, Trash2 } from 'lucide-react';
import { useStore, BACKEND_URL, getAuthHeaders } from '../../state/store';
import { Album } from '../../types';

export const SearchBar: React.FC = () => {
  const { searchQuery, setSearchQuery, selectAlbum, albums, setViewport, setBrushedAlbums } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Album[]>([]);
  const [artistSuggestions, setArtistSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<{ type: 'album' | 'artist', data: Album | string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize Recent Searches
  useEffect(() => {
    const saved = localStorage.getItem('sonic_recent_queries');
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  // Filter Logic - 앨범과 아티스트 구분
  useEffect(() => {
    // 검색 시작하면 selectedItem 초기화
    if (searchQuery.trim().length > 0) {
      setSelectedItem(null);
    }
    
    if (searchQuery.trim().length > 1) {
      const q = searchQuery.toLowerCase();
      
      // 앨범 검색
      const albumMatches = albums.filter(a => 
        a.title.toLowerCase().includes(q)
      ).slice(0, 8);
      
      // 아티스트 검색 (중복 제거)
      const artistMatches = Array.from(new Set(
        albums
          .filter(a => a.artist.toLowerCase().includes(q))
          .map(a => a.artist)
      )).slice(0, 5);
      
      setSuggestions(albumMatches);
      setArtistSuggestions(artistMatches);
      setIsOpen(true);
    } else {
      setSuggestions([]);
      setArtistSuggestions([]);
    }
  }, [searchQuery, albums]);

  // Click Outside Handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Step 1: 검색 이벤트 로깅
  const logSearchEvent = async (query: string) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${BACKEND_URL}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          event_type: 'search',
          entity_type: null,
          entity_id: null,
          payload: { query },
        }),
      });
      console.log('🔍 Search event logged:', query);
    } catch (error) {
      console.error('❌ Failed to log search event:', error);
    }
  };

  const handleSelectAlbum = (album: Album) => {
    console.log('🎵 Album selected from dropdown:', album.title);
    
    // Step 1: 검색 이벤트 로깅
    logSearchEvent(album.title);
    
    // Save to Recent
    const updated = [album.title, ...recentSearches.filter(s => s !== album.title)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('sonic_recent_queries', JSON.stringify(updated));

    setSearchQuery(album.title);
    
    // 팝업 표시 (지도 이동 안함)
    setSelectedItem({ type: 'album', data: album });
    setIsOpen(false);  // 드롭다운 닫기
  };

  const handleSelectArtist = (artist: string) => {
    console.log('🎤 Artist selected from dropdown:', artist);
    
    // Step 1: 검색 이벤트 로깅
    logSearchEvent(artist);
    
    // Save to Recent
    const updated = [artist, ...recentSearches.filter(s => s !== artist)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('sonic_recent_queries', JSON.stringify(updated));

    setSearchQuery(artist);
    
    // 팝업 표시 (지도 이동 안함)
    setSelectedItem({ type: 'artist', data: artist });
    setIsOpen(false);  // 드롭다운 닫기
  };
  
  const handleViewOnMap = () => {
    console.log('🗺️ View on Map clicked, selectedItem:', selectedItem);
    if (!selectedItem) return;
    
    if (selectedItem.type === 'album') {
      const album = selectedItem.data as Album;
      console.log('📍 Setting album:', album.id, album.title);
      selectAlbum(album.id);
      setBrushedAlbums([]);
      const newViewport = { x: album.year, y: album.vibe, k: 3 };
      console.log('🎯 Setting viewport:', newViewport);
      setViewport(newViewport);
      setSelectedItem(null);
    } else {
      const artist = selectedItem.data as string;
      const artistAlbums = albums.filter(a => a.artist === artist);
      console.log('🎤 Artist albums:', artistAlbums.length);
      if (artistAlbums.length > 0) {
        setBrushedAlbums(artistAlbums.map(a => a.id));
        selectAlbum(artistAlbums[0].id);
        const avgYear = artistAlbums.reduce((sum, a) => sum + a.year, 0) / artistAlbums.length;
        const avgVibe = artistAlbums.reduce((sum, a) => sum + a.vibe, 0) / artistAlbums.length;
        const newViewport = { x: avgYear, y: avgVibe, k: 2.5 };
        console.log('🎯 Setting viewport:', newViewport);
        setViewport(newViewport);
        setSelectedItem(null);
      }
    }
  };

  const clearRecent = (query: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentSearches.filter(s => s !== query);
    setRecentSearches(updated);
    localStorage.setItem('sonic_recent_queries', JSON.stringify(updated));
  };

  return (
    <div ref={containerRef} className="relative w-full group">
      {/* Search Input Field (축소 버전) */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500 group-focus-within:text-accent transition-colors">
          <Search size={16} strokeWidth={2.5} />
        </div>
        <input
          id="search-input"
          name="search"
          type="text"
          className="block w-full py-2.5 pl-10 pr-10 text-xs text-white border border-white/10 rounded-xl bg-panel/60 backdrop-blur-xl focus:ring-2 focus:ring-accent/30 focus:bg-panel focus:border-accent/40 placeholder-slate-600 shadow-lg transition-all outline-none"
          placeholder="앨범/아티스트 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
        />
        {searchQuery && (
          <button 
            onClick={() => { 
              setSearchQuery(''); 
              setSuggestions([]);
              setArtistSuggestions([]);
              setSelectedItem(null);
            }}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-600 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Selected Item Detail Popup */}
      {selectedItem && (
        <div className="absolute z-50 w-full mt-2 bg-[#12131D]/98 backdrop-blur-3xl border border-accent/40 rounded-xl shadow-[0_20px_60px_-10px_rgba(99,102,241,0.5)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          {selectedItem.type === 'album' ? (
            // Album Detail Card
            <div className="p-4">
              {(() => {
                const album = selectedItem.data as Album;
                return (
                  <>
                    <div className="flex items-start gap-4 mb-4">
                      <img 
                        src={album.coverUrl} 
                        className="w-20 h-20 rounded-lg border border-white/20 shadow-lg" 
                        alt={album.title} 
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white mb-1 truncate">{album.title}</h3>
                        <p className="text-xs text-slate-400 truncate">{album.artist}</p>
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
                          <span>{album.year}</span>
                          <span>•</span>
                          <span>{album.region}</span>
                          <span>•</span>
                          <span>{album.genres.slice(0, 2).join(', ')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleViewOnMap}
                        className="flex-1 px-4 py-2 bg-accent hover:bg-accent/80 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                      >
                        <ArrowUpRight size={14} />
                        View on Map
                      </button>
                      <button
                        onClick={() => setSelectedItem(null)}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold rounded-lg transition-all"
                      >
                        Close
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            // Artist Detail Card
            <div className="p-4">
              {(() => {
                const artist = selectedItem.data as string;
                const artistAlbums = albums.filter(a => a.artist === artist);
                return (
                  <>
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-20 h-20 bg-gradient-to-br from-emerald-500/30 to-blue-500/30 rounded-lg flex items-center justify-center shrink-0">
                        <Music size={32} className="text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white mb-1">{artist}</h3>
                        <p className="text-xs text-slate-400">{artistAlbums.length} albums</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {artistAlbums.slice(0, 3).map(album => (
                            <span key={album.id} className="text-[9px] px-2 py-0.5 bg-white/5 rounded text-slate-500">
                              {album.title}
                            </span>
                          ))}
                          {artistAlbums.length > 3 && (
                            <span className="text-[9px] px-2 py-0.5 text-slate-600">+{artistAlbums.length - 3}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleViewOnMap}
                        className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                      >
                        <ArrowUpRight size={14} />
                        View on Map
                      </button>
                      <button
                        onClick={() => setSelectedItem(null)}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold rounded-lg transition-all"
                      >
                        Close
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
      
      {/* Dropdown UI (축소 버전) */}
      {isOpen && !selectedItem && (
        <div className="absolute z-50 w-full mt-2 bg-[#12131D]/98 backdrop-blur-3xl border border-white/10 rounded-xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          
          {/* Recent History Section (축소) */}
          {!searchQuery && recentSearches.length > 0 && (
            <div className="p-3 border-b border-white/5">
              <div className="flex justify-between items-center mb-2 px-1">
                <h3 className="text-[9px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Clock size={10} className="text-accent" /> Recent
                </h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map((s) => (
                  <button 
                    key={s}
                    onClick={() => setSearchQuery(s)}
                    className="group px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-[10px] text-slate-400 hover:text-white transition-all flex items-center gap-2"
                  >
                    {s}
                    <Trash2 size={10} className="text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => clearRecent(s, e)} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Autocomplete Suggestions (앨범 + 아티스트 구분) */}
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-2">
            {(suggestions.length > 0 || artistSuggestions.length > 0) ? (
              <div className="space-y-3">
                {/* 앨범 결과 */}
                {suggestions.length > 0 && (
                  <div>
                    <h3 className="text-[8px] font-black text-slate-600 uppercase tracking-wider px-2 py-2">📀 Albums</h3>
                    <div className="space-y-0.5">
                      {suggestions.map((album) => (
                        <button 
                          key={album.id}
                          onClick={() => handleSelectAlbum(album)}
                          className="w-full text-left flex items-center gap-3 px-2 py-2 hover:bg-accent/10 rounded-lg group transition-all"
                        >
                          <div className="relative w-10 h-10 shrink-0 overflow-hidden rounded-lg border border-white/10 shadow-md group-hover:scale-105 transition-transform">
                            <img src={album.coverUrl} className="w-full h-full object-cover" alt={album.title} />
                            <div className="absolute inset-0 bg-accent/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Music size={14} className="text-white" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-slate-100 truncate group-hover:text-accent transition-colors">{album.title}</div>
                            <div className="text-[10px] text-slate-600 truncate font-medium mt-0.5">{album.artist} • {album.year}</div>
                          </div>
                          <div className="p-1 bg-white/5 rounded-full opacity-0 group-hover:opacity-100 transition-all">
                            <ArrowUpRight size={12} className="text-accent" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* 아티스트 결과 */}
                {artistSuggestions.length > 0 && (
                  <div>
                    <h3 className="text-[8px] font-black text-slate-600 uppercase tracking-wider px-2 py-2">🎤 Artists</h3>
                    <div className="space-y-0.5">
                      {artistSuggestions.map((artist) => (
                        <button 
                          key={artist}
                          onClick={() => handleSelectArtist(artist)}
                          className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-500/10 rounded-lg group transition-all border border-transparent hover:border-emerald-500/20"
                        >
                          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <Music size={16} className="text-emerald-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-slate-100 truncate group-hover:text-emerald-400 transition-colors">{artist}</div>
                            <div className="text-[10px] text-slate-600 truncate font-medium mt-0.5">
                              {albums.filter(a => a.artist === artist).length} albums
                            </div>
                          </div>
                          <div className="p-1 bg-emerald-500/10 rounded-full opacity-0 group-hover:opacity-100 transition-all">
                            <ArrowUpRight size={12} className="text-emerald-400" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : searchQuery.length > 1 && (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3 border border-white/5">
                   <Search size={20} className="text-slate-700" />
                </div>
                <p className="text-slate-500 text-xs font-medium">"{searchQuery}" 없음</p>
                <p className="text-slate-700 text-[10px] mt-1">다른 검색어를 시도해보세요</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};