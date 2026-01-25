import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X, Sparkles, Music, Star, Search, Globe, ListMusic, MessageSquare, BookOpen, Users, Heart, ExternalLink } from 'lucide-react';
import { useStore, BACKEND_URL, getAuthHeaders } from '../../state/store';
import { getExtendedAlbumDetails } from '../../services/geminiService';
import { Region, ExtendedAlbumData, UserLog } from '../../types';

// 장르별 색상 (MapCanvas와 동일)
const GENRE_COLORS: Record<string, string> = {
  'Rock': '#EF4444', 'Hard Rock': '#DC2626', 'Metal': '#7F1D1D',
  'Alternative': '#FB923C', 'Indie': '#FDBA74', 'Punk': '#EA580C',
  'Pop': '#EC4899', 'Dance': '#DB2777',
  'Electronic': '#A855F7', 'EDM': '#9333EA', 'House': '#7E22CE', 'Techno': '#6B21A8',
  'Hip Hop': '#EAB308', 'Rap': '#CA8A04', 'R&B': '#84CC16', 'Soul': '#65A30D',
  'Jazz': '#3B82F6', 'Blues': '#2563EB', 'Funk': '#1D4ED8',
  'Classical': '#9CA3AF', 'Folk': '#86EFAC', 'Country': '#4ADE80',
  'World': '#FBBF24', 'Latin': '#F59E0B', 'Reggae': '#14B8A6',
  'K-Pop': '#F472B6', 'J-Pop': '#D946EF',
  'Other': '#94A3B8'
};

const REGION_COLORS: Record<string, string> = {
  'North America': '#F472B6',
  'Europe': '#60A5FA',
  'Asia': '#FBBF24',
  'South America': '#34D399',
  'Caribbean': '#34D399',
  'Oceania': '#FBBF24',
  'Africa': '#A78BFA'
};

type Tab = 'context' | 'tracks' | 'credits' | 'reviews' | 'log';

export const DetailPanel: React.FC = () => {
  const { selectedAlbumId, albums, selectAlbum } = useStore();
  
  // Data State
  const [details, setDetails] = useState<ExtendedAlbumData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('context');
  const [lang, setLang] = useState<'en' | 'ko'>(() => {
    const userLang = navigator.language || 'en';
    return userLang.startsWith('ko') ? 'ko' : 'en';
  });
  
  // User Log State
  const [userLog, setUserLog] = useState<UserLog>({ rating: 0, memo: '', updatedAt: '' });
  const [isLogDirty, setIsLogDirty] = useState(false);
  
  // Step 1: Like State
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  
  // Step 1: 이벤트 로그 중복 방지 (앨범별로 1회만 기록)
  const lastViewedAlbumRef = useRef<string | null>(null);

  const album = albums.find(a => a.id === selectedAlbumId);

  // Handle Research Call
  const handleResearch = useCallback(async () => {
    if (!album) return;
    setLoading(true);
    const result = await getExtendedAlbumDetails(album);
    setDetails(result);
    setLoading(false);
  }, [album]);

  // Step 1: 이벤트 로그 함수
  const logEvent = async (eventType: string, entityType?: string, entityId?: string, payload?: any) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${BACKEND_URL}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          event_type: eventType,
          entity_type: entityType || null,
          entity_id: entityId || null,
          payload: payload || null,
        }),
      });
    } catch (error) {
      console.error('❌ Failed to log event:', error);
    }
  };

  // Step 1: Like 토글 함수 + 자동 5점 평가
  const handleLikeToggle = async () => {
    if (!album || likeLoading) return;
    
    setLikeLoading(true);
    try {
      const headers = await getAuthHeaders();
      const method = isLiked ? 'DELETE' : 'POST';
      
      const response = await fetch(`${BACKEND_URL}/me/likes`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          entity_type: 'album',
          entity_id: album.id,
        }),
      });
      
      if (response.ok) {
        setIsLiked(!isLiked);
        console.log(`${isLiked ? '💔' : '❤️'} Like toggled for album:`, album.id);
        
        // ⭐ 새로 Like할 때 자동으로 5점 평가 저장
        if (!isLiked) {
          const now = new Date().toISOString();
          const autoLog = {
            rating: 5,
            memo: userLog.memo || '',
            updatedAt: now
          };
          localStorage.setItem(`log-${album.id}`, JSON.stringify(autoLog));
          setUserLog(autoLog);
          console.log('⭐ Auto-rated 5 stars for liked album:', album.id);
        }
      }
    } catch (error) {
      console.error('❌ Failed to toggle like:', error);
    } finally {
      setLikeLoading(false);
    }
  };

  // Step 1: Play on Spotify 함수
  const handlePlayOnSpotify = () => {
    if (!album) return;
    
    // Step 1에서는 spotifyUrl이 없으므로 placeholder
    // const spotifyUrl = (album as any).spotifyUrl;
    const spotifyUrl = null; // TODO: Step 2에서 platform_ids로 제공 예정
    
    if (spotifyUrl) {
      window.open(spotifyUrl, '_blank');
      logEvent('open_on_platform', 'album', album.id, { platform: 'spotify', url: spotifyUrl });
    } else {
      console.warn('⚠️ Spotify URL not available for this album yet (Step 2 feature)');
      alert('Spotify link will be available in Step 2!');
      // 이벤트는 기록
      logEvent('open_on_platform', 'album', album.id, { platform: 'spotify', url: null });
    }
  };

  // Load Album & Local Data
  useEffect(() => {
    setDetails(null);
    setLoading(false);
    setActiveTab('context');
    setIsLiked(false); // Step 1: Like 상태 초기화
    
    if (album) {
      // Load user log from local storage
      const saved = localStorage.getItem(`log-${album.id}`);
      if (saved) {
        setUserLog(JSON.parse(saved));
      } else {
        setUserLog({ rating: 0, memo: '', updatedAt: '' });
      }
      setIsLogDirty(false);
      
      // Step 1: view_album 이벤트 로깅 (중복 방지)
      if (lastViewedAlbumRef.current !== album.id) {
        lastViewedAlbumRef.current = album.id;
        logEvent('view_album', 'album', album.id);
        console.log('👀 Logged view_album event for:', album.id);
      }
      
      // 자동으로 AI 분석 생성
      handleResearch();
    }
  }, [album?.id, handleResearch]);

  // Handle User Log Save
  const handleSaveLog = () => {
    if (!album) return;
    const now = new Date().toISOString();
    const newLog = { ...userLog, updatedAt: now };
    setUserLog(newLog);
    localStorage.setItem(`log-${album.id}`, JSON.stringify(newLog));
    setIsLogDirty(false);
    alert("Log saved!");
  };

  if (!album) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm flex-col gap-4">
        <Music size={48} className="opacity-20" />
        <p>Select an album from the map</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 shadow-lg overflow-hidden">
      
      {/* 1. Hero Header (더 큰 크기) */}
      <div className="relative h-48 sm:h-56 md:h-64 lg:h-72 w-full shrink-0 group">
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/60 to-transparent z-10" />
        <img 
          src={album.coverUrl} 
          alt={album.title} 
          className="w-full h-full object-cover opacity-60 transition-transform duration-700 group-hover:scale-105"
        />
        <button 
          onClick={() => selectAlbum(null)}
          className="absolute top-4 right-4 z-20 p-2 bg-white/90 hover:bg-white backdrop-blur rounded-full text-black transition-colors border border-gray-200"
        >
          <X size={18} />
        </button>
        
        <div className="absolute bottom-5 left-6 z-20 w-[calc(100%-3rem)]">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {/* 모든 장르 표시 (하위 장르 포함) - 작은 크기로 */}
            {album.genres.map((genre, idx) => (
              <span 
                key={idx}
                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white shadow-lg"
                style={{ backgroundColor: GENRE_COLORS[genre] || GENRE_COLORS['Other'] }}
              >
                {genre}
              </span>
            ))}
            <span className="text-[10px] font-mono text-gray-700 border border-gray-300 px-2 py-0.5 rounded bg-white/90">
              {album.year}
            </span>
            <span className="text-[10px] font-mono text-gray-700 border border-gray-300 px-2 py-0.5 rounded bg-white/90">
              {album.country}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-black leading-tight mb-1 truncate drop-shadow-sm">{album.title}</h2>
          <p className="text-sm sm:text-base md:text-lg text-gray-700 font-medium truncate drop-shadow-sm">{album.artist}</p>
        </div>
      </div>

      {/* 1.5. Action Buttons (한 줄로 압축) */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-1.5">
          {/* Like */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleLikeToggle();
            }}
            disabled={likeLoading}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg font-bold text-[10px] transition-all ${
              isLiked 
                ? 'bg-gradient-to-r from-pink-500 to-red-500 text-white' 
                : 'bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200'
            } ${likeLoading ? 'opacity-50 cursor-wait' : ''}`}
          >
            <Heart size={12} fill={isLiked ? 'currentColor' : 'none'} strokeWidth={2.5} />
            <span className="hidden sm:inline">{isLiked ? 'Liked' : 'Like'}</span>
          </button>
          
          {/* 듣고싶어요 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isLiked) {
                handleLikeToggle();
              }
            }}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg font-bold text-[10px] transition-all ${
              isLiked
                ? 'bg-purple-500/20 border border-purple-500 text-purple-400'
                : 'bg-purple-500 text-white'
            }`}
          >
            <Star size={12} fill={isLiked ? 'currentColor' : 'none'} strokeWidth={2.5} />
            <span className="hidden sm:inline">{isLiked ? '담음' : '듣고싶어요'}</span>
          </button>
          
          {/* Spotify */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePlayOnSpotify();
            }}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium text-[10px] transition-all"
            title="Spotify"
          >
            <ExternalLink size={12} />
            <span className="hidden sm:inline">Spotify</span>
          </button>
          
          {/* YouTube */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const query = encodeURIComponent(`${album.artist} ${album.title}`);
              window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
            }}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium text-[10px] transition-all"
            title="YouTube"
          >
            <ExternalLink size={12} />
            <span className="hidden sm:inline">YouTube</span>
          </button>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center border-b border-gray-200">
        <TabButton id="context" label="Context" icon={BookOpen} active={activeTab} set={setActiveTab} />
        <TabButton id="tracks" label="Tracks" icon={ListMusic} active={activeTab} set={setActiveTab} />
        <TabButton id="credits" label="Credits" icon={Users} active={activeTab} set={setActiveTab} />
        <TabButton id="reviews" label="Reviews" icon={Globe} active={activeTab} set={setActiveTab} />
        <TabButton id="log" label="My Log" icon={MessageSquare} active={activeTab} set={setActiveTab} />
      </div>

      {/* 3. Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-gray-50">
        
        {/* Loading State Overlay */}
        {loading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
            <Sparkles className="text-black animate-spin mb-3" size={32} />
            <p className="text-sm text-black font-medium animate-pulse">Analyzing Album...</p>
          </div>
        )}

        {/* Tab: Context */}
        {activeTab === 'context' && (
          <div className="p-6 space-y-6">
            {!details ? (
              <EmptyState onAction={handleResearch} label="Generate AI Analysis" />
            ) : (
              <>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Quick Context</h3>
                  <button 
                    onClick={() => setLang(l => l === 'en' ? 'ko' : 'en')}
                    className="text-xs flex items-center gap-1 text-gray-500 hover:text-black transition-colors"
                  >
                    <span className={lang === 'en' ? 'text-black font-bold' : ''}>EN</span>
                    <span>/</span>
                    <span className={lang === 'ko' ? 'text-black font-bold' : ''}>KO</span>
                  </button>
                </div>
                <div className="bg-white border border-gray-200 p-4 rounded-lg">
                  <p className="text-gray-800 leading-relaxed text-sm">
                    {lang === 'en' ? details.summaryEn : details.summaryKo}
                  </p>
                </div>
                
                <div>
                   <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Key Credits</h3>
                   <div className="flex flex-wrap gap-2">
                      {details.credits.map((credit, i) => (
                        <button 
                          key={i}
                          onClick={() => setActiveTab('credits')}
                          className="px-3 py-1 bg-slate-800 rounded-full text-xs text-slate-300 border border-slate-700 hover:border-accent hover:text-white transition-all cursor-pointer"
                        >
                          {credit}
                        </button>
                      ))}
                   </div>
                   <p className="text-xs text-slate-600 mt-2">💡 Click to see detailed credits</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab: Tracks */}
        {activeTab === 'tracks' && (
          <div className="p-6">
             {!details ? (
               <EmptyState onAction={handleResearch} label="Fetch Tracklist" />
             ) : (
               <div className="space-y-1">
                 {details.tracklist.map((track, i) => (
                   <div key={i} className="flex items-center py-3 px-3 hover:bg-gray-100 rounded-lg group transition-colors cursor-default">
                     <span className="w-8 text-right mr-4 text-gray-500 font-mono text-sm group-hover:text-black">{i + 1}</span>
                     <span className="text-gray-700 font-medium text-sm group-hover:text-black">{track}</span>
                     <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        <Music size={14} className="text-gray-400" />
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {/* Tab: Credits */}
        {activeTab === 'credits' && (
          <div className="p-6 space-y-4">
            {!details ? (
              <EmptyState onAction={handleResearch} label="Fetch Credits Info" />
            ) : (
              <div className="space-y-4">
                {details.creditDetails?.map((credit, i) => (
                  <div key={i} className="bg-white border border-gray-200 p-5 rounded-lg hover:border-gray-300 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="text-black font-bold text-base">{credit.name}</h4>
                        <span className="text-gray-600 text-xs font-medium uppercase tracking-wider">{credit.role}</span>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                        <Users size={18} className="text-slate-400" />
                      </div>
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed">{credit.description}</p>
                  </div>
                )) || (
                  <div className="text-center text-slate-500 py-8">
                    <p className="text-sm">No detailed credit information available.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab: Reviews */}
        {activeTab === 'reviews' && (
          <div className="p-6 space-y-4">
            {!details ? (
              <EmptyState onAction={handleResearch} label="Find Reviews" />
            ) : (
              details.reviews.map((review, i) => (
                <div key={i} className="bg-white border border-gray-200 p-4 rounded-lg hover:border-gray-300 hover:shadow-md transition-all">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-black text-xs font-bold uppercase">{review.source}</span>
                    <a 
                      href={review.url} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-700/50 hover:bg-slate-600 rounded-full text-xs text-slate-300 hover:text-white transition-all border border-slate-600"
                    >
                      <Search size={12} />
                      <span>Search</span>
                    </a>
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed">"{review.excerpt}"</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab: My Log */}
        {activeTab === 'log' && (
          <div className="p-6 space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider block">Your Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button 
                    key={star}
                    onClick={() => {
                      setUserLog(prev => ({ ...prev, rating: star }));
                      setIsLogDirty(true);
                    }}
                    className={`p-1 transition-transform hover:scale-110 ${star <= userLog.rating ? 'text-yellow-400' : 'text-slate-700'}`}
                  >
                    <Star fill={star <= userLog.rating ? "currentColor" : "none"} size={28} />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label htmlFor="album-memo" className="text-sm font-bold text-slate-400 uppercase tracking-wider block">Personal Memo</label>
              <textarea 
                id="album-memo"
                name="memo"
                className="w-full h-32 bg-black/20 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 focus:ring-1 focus:ring-accent focus:border-accent outline-none resize-none placeholder-slate-600"
                placeholder="Write your thoughts about this album..."
                value={userLog.memo}
                onChange={(e) => {
                  setUserLog(prev => ({ ...prev, memo: e.target.value }));
                  setIsLogDirty(true);
                }}
              />
            </div>

            {userLog.updatedAt && (
               <div className="text-xs text-slate-600 text-right">
                 Last saved: {new Date(userLog.updatedAt).toLocaleDateString()}
               </div>
            )}

            <button 
              onClick={handleSaveLog}
              disabled={!isLogDirty}
              className={`w-full py-3 rounded-lg font-bold text-sm transition-all ${
                isLogDirty 
                  ? 'bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/20' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isLogDirty ? 'Save to My Log' : 'Saved'}
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

const TabButton = ({ id, label, icon: Icon, active, set }: { id: Tab, label: string, icon: any, active: Tab, set: (t: Tab) => void }) => (
  <button
    onClick={() => set(id)}
    className={`flex-1 py-2.5 flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all duration-300 border-b-2 group ${
      active === id 
        ? 'border-black text-black bg-gray-100' 
        : 'border-transparent text-gray-500 hover:text-black hover:bg-gray-50'
    }`}
  >
    <Icon size={14} className={`${active === id ? 'text-black' : 'text-gray-400 group-hover:text-gray-600'} transition-colors`} />
    <span className="text-[9px] uppercase tracking-wide">{label}</span>
  </button>
);

const EmptyState = ({ onAction, label }: { onAction: () => void, label: string }) => (
  <div className="h-60 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-gray-300 rounded-xl bg-gray-100">
    <Sparkles className="text-gray-400 mb-3" size={32} />
    <p className="text-gray-500 text-sm mb-4">Content not generated yet.</p>
    <button 
      onClick={onAction}
      className="flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-gray-800 text-white rounded-full font-medium text-sm transition-all"
    >
      <Sparkles size={14} className="text-white" />
      {label}
    </button>
  </div>
);