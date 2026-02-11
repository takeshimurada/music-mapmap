import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock, ArrowUpRight, Music, Trash2 } from 'lucide-react';
import { useStore, BACKEND_URL, getAuthHeaders } from '../../state/store';
import { Album } from '../../types';
import { useLocation } from 'react-router-dom';

type SearchBarVariant = 'default' | 'embedded';

export const SearchBar: React.FC<{ variant?: SearchBarVariant; autoFocus?: boolean }> = ({ variant = 'default', autoFocus = false }) => {
  const { searchQuery, setSearchQuery, selectAlbum, selectArtist, albums, setViewport, setBrushedAlbums } = useStore();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Album[]>([]);
  const [artistSuggestions, setArtistSuggestions] = useState<string[]>([]);
  const [artistImages, setArtistImages] = useState<Record<string, string>>({});
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<{ type: 'album' | 'artist', data: Album | string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize Recent Searches
  useEffect(() => {
    const saved = localStorage.getItem('sonic_recent_queries');
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  // Filter Logic - 앨범과 아티스트 구분
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      setSelectedItem(null);
    }
    
    if (searchQuery.trim().length > 1) {
      const q = searchQuery.toLowerCase();
      
      const albumMatches = albums.filter(a => 
        a.title.toLowerCase().includes(q)
      ).slice(0, 8);
      
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

  useEffect(() => {
    if (artistSuggestions.length === 0) return;
    let cancelled = false;

    const fetchImages = async () => {
      const updates: Record<string, string> = {};
      await Promise.all(
        artistSuggestions.map(async (artist) => {
          if (artistImages[artist]) return;
          try {
            const res = await fetch(`${BACKEND_URL}/artists/lookup?name=${encodeURIComponent(artist)}`);
            if (!res.ok) return;
            const data = await res.json();
            const url = data?.data?.image_url;
            if (url) updates[artist] = url;
          } catch {
            // ignore
          }
        })
      );
      if (!cancelled && Object.keys(updates).length > 0) {
        setArtistImages((prev) => ({ ...prev, ...updates }));
      }
    };

    fetchImages();
    return () => {
      cancelled = true;
    };
  }, [artistSuggestions, artistImages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSuggestions([]);
        setArtistSuggestions([]);
        setSelectedItem(null);
        if (location.pathname !== '/archive') {
          setSearchQuery('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [location.pathname, setSearchQuery]);

  useEffect(() => {
    if (!autoFocus) return;
    setIsOpen(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [autoFocus]);

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
    } catch (error) {
      console.error('❌ Failed to log search event:', error);
    }
  };

  const handleSelectAlbum = (album: Album) => {
    logSearchEvent(album.title);
    
    const updated = [album.title, ...recentSearches.filter(s => s !== album.title)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('sonic_recent_queries', JSON.stringify(updated));

    setSearchQuery(album.title);
    setSelectedItem({ type: 'album', data: album });
    setIsOpen(false);
  };

  const handleSelectArtist = (artist: string) => {
    logSearchEvent(artist);
    
    const updated = [artist, ...recentSearches.filter(s => s !== artist)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('sonic_recent_queries', JSON.stringify(updated));

    setSearchQuery(artist);
    setSelectedItem({ type: 'artist', data: artist });
    setIsOpen(false);
    selectAlbum(null);
    selectArtist(artist);
  };
  
  const handleViewOnMap = () => {
    if (!selectedItem) return;
    
    if (selectedItem.type === 'album') {
      const album = selectedItem.data as Album;
      selectAlbum(album.id);
      setBrushedAlbums([]);
      setViewport({ x: album.year, y: album.vibe, k: 3 });
      setSelectedItem(null);
    } else {
      const artist = selectedItem.data as string;
      const artistAlbums = albums.filter(a => a.artist === artist);
      if (artistAlbums.length > 0) {
        setBrushedAlbums(artistAlbums.map(a => a.id));
        selectAlbum(artistAlbums[0].id);
        const avgYear = artistAlbums.reduce((sum, a) => sum + a.year, 0) / artistAlbums.length;
        const avgVibe = artistAlbums.reduce((sum, a) => sum + a.vibe, 0) / artistAlbums.length;
        setViewport({ x: avgYear, y: avgVibe, k: 2.5 });
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

  const inputClassName = variant === 'embedded'
    ? 'block w-full py-2.5 pl-10 pr-10 text-xs text-black bg-transparent focus:ring-0 focus:border-transparent placeholder-gray-400 outline-none'
    : 'block w-full py-2.5 pl-10 pr-10 text-xs text-black border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-black/10 focus:border-black placeholder-gray-400 shadow-sm transition-all outline-none';

  const closePanelsForArchive = () => {
    if (location.pathname === '/archive') {
      selectAlbum(null);
      selectArtist(null);
    }
  };
  const prioritizeArtists = location.pathname === '/artists';

  return (
    <div ref={containerRef} className="relative w-full group">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400 group-focus-within:text-black transition-colors">
          <Search size={16} strokeWidth={2.5} />
        </div>
        <input
          type="text"
          ref={inputRef}
          className={inputClassName}
          placeholder="앨범/아티스트 검색..."
          value={searchQuery}
          onChange={(e) => {
            closePanelsForArchive();
            setSearchQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setIsOpen(false);
              setSelectedItem(null);
            }
          }}
          onMouseEnter={() => setIsOpen(true)}
          onFocus={() => {
            closePanelsForArchive();
            setIsOpen(true);
          }}
        />
        {searchQuery && (
          <button 
            onClick={() => { 
              setSearchQuery(''); 
              setSuggestions([]);
              setArtistSuggestions([]);
              setSelectedItem(null);
            }}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-black transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Selected Item Popup */}
      {selectedItem && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          {selectedItem.type === 'album' ? (
            <div className="p-4">
              {(() => {
                const album = selectedItem.data as Album;
                return (
                  <>
                    <div className="flex items-start gap-4 mb-4">
                      <img 
                        src={album.coverUrl} 
                        className="w-20 h-20 rounded border border-gray-200 shadow-sm" 
                        alt={album.title} 
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-black mb-1 truncate">{album.title}</h3>
                        <p className="text-xs text-gray-500 truncate">{album.artist}</p>
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
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
                        className="flex-1 px-4 py-2 bg-black hover:bg-gray-800 text-white text-xs font-semibold rounded transition-all flex items-center justify-center gap-2"
                      >
                        <ArrowUpRight size={14} />
                        View on Map
                      </button>
                      <button
                        onClick={() => setSelectedItem(null)}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded transition-all"
                      >
                        Close
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="p-4">
              {(() => {
                const artist = selectedItem.data as string;
                const artistAlbums = albums.filter(a => a.artist === artist);
                return (
                  <>
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center shrink-0">
                        <Music size={32} className="text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-black mb-1">{artist}</h3>
                        <p className="text-xs text-gray-500">{artistAlbums.length} albums</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {artistAlbums.slice(0, 3).map(album => (
                            <span key={album.id} className="text-[9px] px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                              {album.title}
                            </span>
                          ))}
                          {artistAlbums.length > 3 && (
                            <span className="text-[9px] px-2 py-0.5 text-gray-400">+{artistAlbums.length - 3}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleViewOnMap}
                        className="flex-1 px-4 py-2 bg-black hover:bg-gray-800 text-white text-xs font-semibold rounded transition-all flex items-center justify-center gap-2"
                      >
                        <ArrowUpRight size={14} />
                        View on Map
                      </button>
                      <button
                        onClick={() => setSelectedItem(null)}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded transition-all"
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
      
      {/* Dropdown */}
      {isOpen && !selectedItem && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          
          {/* Recent History */}
          {!searchQuery && recentSearches.length > 0 && (
            <div className="p-3 border-b border-gray-100">
              <div className="flex justify-between items-center mb-2 px-1">
                <h3 className="text-[9px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                  <Clock size={10} className="text-black" /> Recent
                </h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map((s) => (
                  <button 
                    key={s}
                    onClick={() => setSearchQuery(s)}
                    className="group px-2 py-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded text-[10px] text-gray-600 hover:text-black transition-all flex items-center gap-2"
                  >
                    {s}
                    <Trash2 size={10} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => clearRecent(s, e)} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-2">
            {(suggestions.length > 0 || artistSuggestions.length > 0) ? (
              <div className="flex flex-col gap-3">
                {/* Albums */}
                {suggestions.length > 0 && (
                  <div className={prioritizeArtists ? 'order-2' : 'order-1'}>
                    <h3 className="text-[8px] font-bold text-gray-400 uppercase tracking-wider px-2 py-2">📀 Albums</h3>
                    <div className="space-y-0.5">
                      {suggestions.map((album) => (
                        <button 
                          key={album.id}
                          onClick={() => handleSelectAlbum(album)}
                          className="w-full text-left flex items-center gap-3 px-2 py-2 hover:bg-gray-50 rounded group transition-all"
                        >
                          <div className="relative w-10 h-10 shrink-0 overflow-hidden rounded border border-gray-200 shadow-sm group-hover:scale-105 transition-transform">
                            <img src={album.coverUrl} className="w-full h-full object-cover" alt={album.title} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-black truncate">{album.title}</div>
                            <div className="text-[10px] text-gray-500 truncate mt-0.5">{album.artist} • {album.year}</div>
                          </div>
                          <ArrowUpRight size={12} className="text-gray-300 group-hover:text-black transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Artists */}
                {artistSuggestions.length > 0 && (
                  <div className={prioritizeArtists ? 'order-1' : 'order-2'}>
                    <h3 className="text-[8px] font-bold text-gray-400 uppercase tracking-wider px-2 py-2">🎤 Artists</h3>
                    <div className="space-y-0.5">
                      {artistSuggestions.map((artist) => (
                        <button 
                          key={artist}
                          onClick={() => handleSelectArtist(artist)}
                          className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded group transition-all"
                        >
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform overflow-hidden">
                            {artistImages[artist] ? (
                              <img src={artistImages[artist]} alt={artist} className="w-full h-full object-cover" />
                            ) : (
                              <Music size={16} className="text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-black truncate">{artist}</div>
                            <div className="text-[10px] text-gray-500 truncate mt-0.5">
                              {albums.filter(a => a.artist === artist).length} albums
                            </div>
                          </div>
                          <ArrowUpRight size={12} className="text-gray-300 group-hover:text-black transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : searchQuery.length > 1 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-gray-100">
                   <Search size={20} className="text-gray-300" />
                </div>
                <p className="text-gray-500 text-xs font-medium">"{searchQuery}" 없음</p>
                <p className="text-gray-400 text-[10px] mt-1">다른 검색어를 시도해보세요</p>
              </div>
            ) : (
              <div className="p-5 text-center">
                <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-2 border border-gray-100">
                  <Search size={16} className="text-gray-300" />
                </div>
                <p className="text-gray-500 text-xs font-medium">검색어를 입력해 주세요</p>
                <p className="text-gray-400 text-[10px] mt-1">앨범 또는 아티스트 이름</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
