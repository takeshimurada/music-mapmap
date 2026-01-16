import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock, ArrowUpRight, Music, Trash2 } from 'lucide-react';
import { useStore } from '../../state/store';
import { Album } from '../../types';

export const SearchBar: React.FC = () => {
  const { searchQuery, setSearchQuery, selectAlbum, albums, setViewport } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Album[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize Recent Searches
  useEffect(() => {
    const saved = localStorage.getItem('sonic_recent_queries');
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  // Filter Logic
  useEffect(() => {
    if (searchQuery.trim().length > 1) {
      const q = searchQuery.toLowerCase();
      const matches = albums.filter(a => 
        a.title.toLowerCase().includes(q) || 
        a.artist.toLowerCase().includes(q)
      ).slice(0, 10);
      setSuggestions(matches);
      setIsOpen(true);
    } else {
      setSuggestions([]);
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

  const handleSelect = (album: Album) => {
    // Save to Recent
    const updated = [album.title, ...recentSearches.filter(s => s !== album.title)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('sonic_recent_queries', JSON.stringify(updated));

    setSearchQuery(album.title);
    selectAlbum(album.id);
    setIsOpen(false);
    setViewport({ x: album.year, y: album.vibe, k: 3 }); 
  };

  const clearRecent = (query: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentSearches.filter(s => s !== query);
    setRecentSearches(updated);
    localStorage.setItem('sonic_recent_queries', JSON.stringify(updated));
  };

  return (
    <div ref={containerRef} className="relative w-full group">
      {/* Search Input Field */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-6 pointer-events-none text-slate-500 group-focus-within:text-accent transition-colors">
          <Search size={22} strokeWidth={2.5} />
        </div>
        <input
          type="text"
          className="block w-full p-5 pl-16 text-sm text-white border border-white/5 rounded-[1.5rem] bg-panel/60 backdrop-blur-2xl focus:ring-4 focus:ring-accent/20 focus:bg-panel focus:border-accent/40 placeholder-slate-500 shadow-2xl transition-all outline-none"
          placeholder="Search for albums, artists, or sonic eras..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
        />
        {searchQuery && (
          <button 
            onClick={() => { setSearchQuery(''); setSuggestions([]); }}
            className="absolute inset-y-0 right-0 flex items-center pr-6 text-slate-500 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Dropdown UI */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-4 bg-[#12131D]/98 backdrop-blur-3xl border border-white/10 rounded-[2rem] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          
          {/* Recent History Section */}
          {!searchQuery && recentSearches.length > 0 && (
            <div className="p-8 border-b border-white/5">
              <div className="flex justify-between items-center mb-5 px-1">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Clock size={12} className="text-accent" /> Recent Explorations
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((s) => (
                  <button 
                    key={s}
                    onClick={() => setSearchQuery(s)}
                    className="group px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs text-slate-300 hover:text-white transition-all flex items-center gap-3"
                  >
                    {s}
                    <Trash2 size={12} className="text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => clearRecent(s, e)} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Autocomplete Suggestions */}
          <div className="max-h-[500px] overflow-y-auto custom-scrollbar p-3">
            {suggestions.length > 0 ? (
              <div className="space-y-1">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-5 py-3">Found in Database</h3>
                {suggestions.map((album) => (
                  <button 
                    key={album.id}
                    onClick={() => handleSelect(album)}
                    className="w-full text-left flex items-center gap-5 px-5 py-4 hover:bg-accent/10 rounded-[1.25rem] group transition-all"
                  >
                    <div className="relative w-14 h-14 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-lg group-hover:scale-105 transition-transform">
                      <img src={album.coverUrl} className="w-full h-full object-cover" alt={album.title} />
                      <div className="absolute inset-0 bg-accent/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Music size={18} className="text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-bold text-slate-100 truncate group-hover:text-accent transition-colors">{album.title}</div>
                      <div className="text-xs text-slate-500 truncate font-medium mt-0.5">{album.artist} • {album.year}</div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-full opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1">
                      <ArrowUpRight size={16} className="text-accent" />
                    </div>
                  </button>
                ))}
              </div>
            ) : searchQuery.length > 1 && (
              <div className="p-16 text-center">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-5 border border-white/5">
                   <Search size={32} className="text-slate-700" />
                </div>
                <p className="text-slate-400 text-sm font-medium">No sonic artifacts found for "{searchQuery}"</p>
                <p className="text-slate-600 text-xs mt-1 italic">Try searching by artist or year instead.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};