import React, { useState, useEffect } from 'react';
import { Heart, Star, Calendar, Trash2, X, Search, RefreshCw, Sparkles } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 배경 클릭 시 닫기 */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header - 슬림하고 모던하게 */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-black tracking-tight">
              Library
            </h2>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            >
              <X size={18} className="text-gray-400 hover:text-black transition-colors" />
            </button>
          </div>

          {/* Tabs - 미니멀하고 시크하게 */}
          <div className="flex gap-1 mt-4">
            <button
              onClick={() => setActiveTab('wishlist')}
              className={`flex-1 px-4 py-2 text-sm font-semibold transition-all flex items-center justify-center gap-1.5 rounded ${
                activeTab === 'wishlist'
                  ? 'bg-black text-white'
                  : 'text-gray-500 hover:text-black hover:bg-gray-50'
              }`}
            >
              <Heart size={14} fill={activeTab === 'wishlist' ? 'white' : 'none'} strokeWidth={2} />
              Wishlist
              {likes.length > 0 && (
                <span className={`ml-1 text-xs ${
                  activeTab === 'wishlist' ? 'text-white/70' : 'text-gray-400'
                }`}>
                  {likes.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('rated')}
              className={`flex-1 px-4 py-2 text-sm font-semibold transition-all flex items-center justify-center gap-1.5 rounded ${
                activeTab === 'rated'
                  ? 'bg-black text-white'
                  : 'text-gray-500 hover:text-black hover:bg-gray-50'
              }`}
            >
              <Star size={14} fill={activeTab === 'rated' ? 'white' : 'none'} strokeWidth={2} />
              Rated
              {logs.length > 0 && (
                <span className={`ml-1 text-xs ${
                  activeTab === 'rated' ? 'text-white/70' : 'text-gray-400'
                }`}>
                  {logs.length}
                </span>
              )}
            </button>
          </div>

          {/* Search & Filter - 슬림하게 */}
          <div className="flex gap-2 mt-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                id="my-search"
                name="my-search"
                type="text"
                placeholder="Search albums or artists..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm text-black placeholder-gray-400 focus:outline-none focus:bg-white focus:border-black transition-all"
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
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm text-black focus:outline-none focus:bg-white focus:border-black transition-all"
              >
                <option value="date">Recent</option>
                <option value="rating">Rating</option>
              </select>
            )}
            {activeTab === 'wishlist' && (
              <button
                onClick={loadLikes}
                disabled={loading}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={`text-gray-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Content - 여백 줄임 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {activeTab === 'wishlist' ? (
            // Wishlist Tab
            loading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw size={32} className="text-gray-400 animate-spin" />
              </div>
            ) : filteredLikes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <Heart size={32} className="text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm mb-1">No albums in wishlist</p>
                <p className="text-gray-400 text-xs">Like albums to add them here</p>
              </div>
            ) : (
              filteredLikes.map((like) => {
                const album = albums.find(a => a.id === like.entity_id);
                if (!album) return null;

                return (
                  <div 
                    key={like.entity_id}
                    onClick={() => handleAlbumClick(like.entity_id)}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:border-black hover:shadow-sm transition-all cursor-pointer group"
                  >
                    <div className="flex gap-6">
                      <div className="w-16 h-16 rounded overflow-hidden flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                        <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-black truncate group-hover:text-black transition-colors mb-1">
                          {album.title}
                        </h3>
                        <p className="text-gray-500 text-xs truncate mb-2">
                          {album.artist} • {album.year}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400">
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
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <Star size={32} className="text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm mb-1">No rated albums</p>
                <p className="text-gray-400 text-xs">Rate albums to track your collection</p>
              </div>
            ) : (
              filteredLogs.map(log => (
                <div 
                  key={log.albumId}
                  onClick={() => handleAlbumClick(log.albumId)}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:border-black hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="flex gap-6">
                    <div className="w-16 h-16 rounded overflow-hidden flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                      <img src={log.albumCover} alt={log.albumTitle} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-black truncate">
                            {log.albumTitle}
                          </h3>
                          <p className="text-gray-500 text-xs truncate">
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
                      <div className="flex items-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star 
                            key={star}
                            size={14} 
                            fill={star <= log.rating ? "#FBBF24" : "none"}
                            className={star <= log.rating ? "text-yellow-400" : "text-gray-300"}
                          />
                        ))}
                        <span className="ml-1 text-[10px] text-gray-400">
                          ({log.rating}/5)
                        </span>
                      </div>

                      {/* Memo */}
                      {log.memo && (
                        <p className="text-gray-700 text-sm line-clamp-2 mb-2">
                          "{log.memo}"
                        </p>
                      )}

                      {/* Date */}
                      <div className="flex items-center gap-2 text-xs text-gray-500">
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

        {/* Footer Stats - 제거 또는 슬림하게 */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-around text-center">
            {activeTab === 'wishlist' ? (
              <>
                <div>
                  <div className="text-lg font-bold text-black">{likes.length}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Wishlist</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-black">
                    {likes.length > 0 ? Math.round((likes.length / albums.length) * 100) : 0}%
                  </div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Collection</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-black">
                    {likes.slice(0, 7).length}
                  </div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">This Week</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-lg font-bold text-black">{logs.length}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Rated</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-black">
                    {logs.length > 0 ? (logs.reduce((sum, log) => sum + log.rating, 0) / logs.length).toFixed(1) : '0.0'}
                  </div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Avg</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-black">
                    {logs.filter(l => l.rating >= 4).length}
                  </div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Top</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
