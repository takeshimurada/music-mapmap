import React, { useState, useEffect } from 'react';
import { Heart, Star, Calendar, Trash2, Music2, Search, RefreshCw, Sparkles } from 'lucide-react';
import { useStore, BACKEND_URL, getAuthHeaders } from '../../state/store';
import { LikeItem } from '../../types';

interface SavedLog {
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  albumYear: number;
  albumCover: string;
  rating: number;
  memo: string;
  updatedAt: string;
}

type TabType = 'wishlist' | 'rated';

export const MyPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('wishlist');
  const [likes, setLikes] = useState<LikeItem[]>([]);
  const [logs, setLogs] = useState<SavedLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'rating'>('date');
  const [loading, setLoading] = useState(false);
  const { albums, selectAlbum } = useStore();

  useEffect(() => {
    loadLikes();
    loadAllLogs();
  }, [albums]);

  const loadLikes = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${BACKEND_URL}/me/likes?entity_type=album`, {
        headers,
      });
      
      if (response.ok) {
        const data = await response.json();
        setLikes(data.items || []);
        console.log('❤️ Loaded likes:', data.items?.length || 0);
      } else {
        console.warn('⚠️ Failed to load likes:', response.status);
      }
    } catch (error) {
      console.error('❌ Error loading likes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllLogs = () => {
    const allLogs: SavedLog[] = [];
    
    // LocalStorage에서 모든 log- 로 시작하는 항목 찾기
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('log-')) {
        const albumId = key.replace('log-', '');
        const logData = JSON.parse(localStorage.getItem(key) || '{}');
        
        // 앨범 정보 찾기
        const album = albums.find(a => a.id === albumId);
        if (album && logData.rating > 0) {
          allLogs.push({
            albumId,
            albumTitle: album.title,
            albumArtist: album.artist,
            albumYear: album.year,
            albumCover: album.coverUrl || '',
            rating: logData.rating,
            memo: logData.memo || '',
            updatedAt: logData.updatedAt
          });
        }
      }
    }

    // 정렬
    if (sortBy === 'date') {
      allLogs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else {
      allLogs.sort((a, b) => b.rating - a.rating);
    }

    setLogs(allLogs);
  };

  const deleteLog = (albumId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 평가를 삭제하시겠습니까?')) {
      localStorage.removeItem(`log-${albumId}`);
      loadAllLogs();
    }
  };

  const handleAlbumClick = (albumId: string) => {
    selectAlbum(albumId);
    onClose();
  };

  const filteredLogs = logs.filter(log => 
    log.albumTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.albumArtist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLikes = likes.filter(like => {
    const album = albums.find(a => a.id === like.entity_id);
    if (!album) return false;
    return album.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
           album.artist.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-panel border border-slate-700 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-8 border-b border-slate-800">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                <span className="bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">My</span>
              </h2>
              <p className="text-slate-400 text-sm">당신의 음악 취향을 한눈에</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-full transition-colors"
            >
              <Music2 size={24} className="text-slate-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('wishlist')}
              className={`flex-1 px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'wishlist'
                  ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-lg shadow-pink-500/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              <Heart size={18} fill={activeTab === 'wishlist' ? 'white' : 'none'} />
              듣고 싶어요
              {likes.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'wishlist' ? 'bg-white/20' : 'bg-white/10'
                }`}>
                  {likes.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('rated')}
              className={`flex-1 px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'rated'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white shadow-lg shadow-yellow-500/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              <Star size={18} fill={activeTab === 'rated' ? 'white' : 'none'} />
              평가한 앨범
              {logs.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'rated' ? 'bg-white/20' : 'bg-white/10'
                }`}>
                  {logs.length}
                </span>
              )}
            </button>
          </div>

          {/* Search & Filter */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                id="my-search"
                name="my-search"
                type="text"
                placeholder="앨범이나 아티스트 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-black/20 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-accent"
              />
            </div>
            {activeTab === 'rated' && (
              <select
                id="my-sort"
                name="sort"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as 'date' | 'rating');
                  loadAllLogs();
                }}
                className="px-4 py-3 bg-black/20 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-accent"
              >
                <option value="date">최근 순</option>
                <option value="rating">평점 순</option>
              </select>
            )}
            {activeTab === 'wishlist' && (
              <button
                onClick={loadLikes}
                disabled={loading}
                className="px-4 py-3 bg-black/20 border border-slate-700 rounded-xl hover:bg-black/30 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={18} className={`text-slate-400 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-4">
          {activeTab === 'wishlist' ? (
            // Wishlist Tab
            loading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw size={32} className="text-slate-600 animate-spin" />
              </div>
            ) : filteredLikes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-20">
                <div className="w-20 h-20 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center mb-4">
                  <Heart size={40} className="text-pink-500" />
                </div>
                <p className="text-slate-400 text-lg mb-2">아직 담아둔 앨범이 없습니다</p>
                <p className="text-slate-600 text-sm">마음에 드는 앨범에 ❤️를 눌러보세요!</p>
              </div>
            ) : (
              filteredLikes.map((like) => {
                const album = albums.find(a => a.id === like.entity_id);
                if (!album) return null;

                return (
                  <div 
                    key={like.entity_id}
                    onClick={() => handleAlbumClick(like.entity_id)}
                    className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:bg-slate-900/80 hover:border-pink-500/40 transition-all cursor-pointer group"
                  >
                    <div className="flex gap-6">
                      <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform">
                        <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-white truncate group-hover:text-pink-400 transition-colors mb-2">
                          {album.title}
                        </h3>
                        <p className="text-slate-400 text-sm truncate mb-3">
                          {album.artist} • {album.year}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Calendar size={12} />
                          {new Date(like.liked_at).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Heart size={20} className="text-pink-500 fill-pink-500" />
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            // Rated Albums Tab
            filteredLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-20">
                <div className="w-20 h-20 bg-gradient-to-br from-yellow-500/20 to-amber-500/20 rounded-full flex items-center justify-center mb-4">
                  <Star size={40} className="text-yellow-500" />
                </div>
                <p className="text-slate-400 text-lg mb-2">아직 평가한 앨범이 없습니다</p>
                <p className="text-slate-600 text-sm">앨범을 선택하고 평점과 메모를 남겨보세요!</p>
              </div>
            ) : (
              filteredLogs.map(log => (
                <div 
                  key={log.albumId}
                  onClick={() => handleAlbumClick(log.albumId)}
                  className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:bg-slate-900/80 hover:border-slate-700 transition-all cursor-pointer group"
                >
                  <div className="flex gap-6">
                    <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform">
                      <img src={log.albumCover} alt={log.albumTitle} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl font-bold text-white truncate group-hover:text-yellow-400 transition-colors">
                            {log.albumTitle}
                          </h3>
                          <p className="text-slate-400 text-sm truncate">
                            {log.albumArtist} • {log.albumYear}
                          </p>
                        </div>
                        <button 
                          onClick={(e) => deleteLog(log.albumId, e)}
                          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} className="text-red-400" />
                        </button>
                      </div>

                      {/* Rating */}
                      <div className="flex items-center gap-1 mb-3">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star 
                            key={star}
                            size={16} 
                            fill={star <= log.rating ? "#FBBF24" : "none"}
                            className={star <= log.rating ? "text-yellow-400" : "text-slate-700"}
                          />
                        ))}
                        <span className="ml-2 text-xs text-slate-500">
                          ({log.rating}/5)
                        </span>
                      </div>

                      {/* Memo */}
                      {log.memo && (
                        <p className="text-slate-300 text-sm line-clamp-2 mb-2">
                          "{log.memo}"
                        </p>
                      )}

                      {/* Date */}
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Calendar size={12} />
                        {new Date(log.updatedAt).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {/* Footer Stats */}
        <div className="p-6 border-t border-slate-800 bg-black/20">
          <div className="flex justify-around text-center">
            {activeTab === 'wishlist' ? (
              <>
                <div>
                  <div className="text-2xl font-bold text-pink-500">{likes.length}</div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Wishlist</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-400">
                    {likes.length > 0 ? Math.round((likes.length / albums.length) * 100) : 0}%
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Collection</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {likes.slice(0, 7).length}
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">This Week</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-2xl font-bold text-yellow-400">{logs.length}</div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Total Logs</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-400">
                    {logs.length > 0 ? (logs.reduce((sum, log) => sum + log.rating, 0) / logs.length).toFixed(1) : '0.0'}
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Avg Rating</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {logs.filter(l => l.rating >= 4).length}
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Favorites</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
