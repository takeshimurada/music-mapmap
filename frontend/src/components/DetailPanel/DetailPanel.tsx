import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X, Sparkles, Music, Star, Search, Globe, ListMusic, MessageSquare, BookOpen, Users, Heart, ExternalLink } from 'lucide-react';
import { useStore, BACKEND_URL, getAuthHeaders } from '../../state/store';
import { getExtendedAlbumDetails } from '../../services/geminiService';
import { Region, ExtendedAlbumData, UserLog, AlbumDetailMeta, AlbumCredit, TrackInfo, TrackCredit } from '../../types';

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

type Tab = 'log' | 'context' | 'tracks' | 'credits' | 'reviews';

export const DetailPanel: React.FC<{ albumId?: string | null }> = ({ albumId }) => {
  const { selectedAlbumId, albums, selectAlbum, selectArtist } = useStore();
  const resolvedAlbumId = albumId ?? selectedAlbumId;
  const storeAlbum = albums.find(a => a.id === resolvedAlbumId);
  const [resolvedAlbum, setResolvedAlbum] = useState<typeof storeAlbum | null>(null);
  const [resolvingAlbum, setResolvingAlbum] = useState(false);
  
  // Data State
  const [details, setDetails] = useState<ExtendedAlbumData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('log');
  const [lang, setLang] = useState<'en' | 'ko'>(() => {
    const userLang = navigator.language || 'en';
    return userLang.startsWith('ko') ? 'ko' : 'en';
  });
  
  // User Log State
  const [userLog, setUserLog] = useState<UserLog>({ rating: 0, memo: '', updatedAt: '' });
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  
  // Step 1: Like State
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  
  // Step 1: 이벤트 로그 중복 방지 (앨범별로 1회만 기록)
  const lastViewedAlbumRef = useRef<string | null>(null);

  const album = storeAlbum ?? resolvedAlbum;
  const [metaDetail, setMetaDetail] = useState<AlbumDetailMeta | null>(null);

  useEffect(() => {
    let alive = true;
    setResolvedAlbum(null);

    if (!resolvedAlbumId || storeAlbum) {
      setResolvingAlbum(false);
      return () => {
        alive = false;
      };
    }

    const fetchAlbumSummary = async () => {
      setResolvingAlbum(true);
      try {
        const res = await fetch(`${BACKEND_URL}/albums/${resolvedAlbumId}`);
        if (!res.ok) return;
        const payload = await res.json();
        const data = payload?.data;
        if (!alive || !data) return;
        setResolvedAlbum({
          id: data.id,
          title: data.title,
          artist: data.artist_name,
          year: data.year,
          releaseDate: data.release_date || undefined,
          vibe: data.genre_vibe ?? 0.5,
          popularity: data.popularity ?? 0,
          region: (data.region_bucket as Region) ?? 'North America',
          country: data.country || undefined,
          coverUrl: data.cover_url || undefined,
          genres: [data.genre || 'Unknown'],
        });
      } catch (err) {
        console.warn('Failed to resolve album from API:', err);
      } finally {
        if (alive) setResolvingAlbum(false);
      }
    };

    fetchAlbumSummary();
    return () => {
      alive = false;
    };
  }, [resolvedAlbumId, storeAlbum]);

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

  const saveUserLog = useCallback((nextLog: UserLog) => {
    if (!album) return;
    const now = new Date().toISOString();
    const saved = { ...nextLog, updatedAt: now };
    setUserLog(saved);
    localStorage.setItem(`log-${album.id}`, JSON.stringify(saved));
  }, [album?.id]);

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
          const autoLog = {
            rating: 5,
            memo: userLog.memo || '',
            updatedAt: ''
          };
          saveUserLog(autoLog);
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
    const spotifyUrl = metaDetail?.album_links?.find(link => link.provider?.toLowerCase().includes('spotify'))?.url || null;
    
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
    setActiveTab('log');
    setIsLiked(false); // Step 1: Like 상태 초기화
    setMetaDetail(null);
    
    if (album) {
      // Load user log from local storage
      const saved = localStorage.getItem(`log-${album.id}`);
      if (saved) {
        setUserLog(JSON.parse(saved));
      } else {
        setUserLog({ rating: 0, memo: '', updatedAt: '' });
      }
      
      // Step 1: view_album 이벤트 로깅 (중복 방지)
      if (lastViewedAlbumRef.current !== album.id) {
        lastViewedAlbumRef.current = album.id;
        logEvent('view_album', 'album', album.id);
        console.log('👀 Logged view_album event for:', album.id);
      }
      
      const fetchMeta = async () => {
        try {
          const res = await fetch(`${BACKEND_URL}/album-groups/${album.id}/detail`);
          if (!res.ok) return;
          const data = await res.json();
          if (!data?.data) return;
          const detail = data.data;
          setMetaDetail({
            tracks: detail.tracks || [],
            album_credits: detail.album_credits || [],
            track_credits: detail.track_credits || [],
            album_links: detail.album_links || [],
          });
        } catch (err) {
          console.warn('⚠️ Failed to load metadata detail:', err);
        }
      };
      fetchMeta();

      // 자동으로 AI 분석 생성
      handleResearch();
    }
  }, [album?.id, handleResearch]);

  if (!album) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm flex-col gap-4">
        <Music size={48} className="opacity-20" />
        <p>{resolvingAlbum ? 'Loading album details...' : 'Select an album from the map'}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 shadow-lg overflow-hidden">
      
      {/* 1. Hero Header (더 큰 크기) */}
      <div className="relative h-64 sm:h-72 md:h-80 lg:h-96 w-full shrink-0 group">
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/60 to-transparent z-10" />
        <img 
          src={album.coverUrl} 
          alt={album.title} 
          className="w-full h-full object-contain bg-gray-100 opacity-100"
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
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                selectAlbum(null);
                selectArtist(album.artist);
              }}
              className="group relative text-sm sm:text-base md:text-lg text-gray-900 font-semibold tracking-tight truncate"
              title="View artist"
            >
              <span className="inline-flex items-center gap-2 border-b border-transparent group-hover:border-black transition-colors">
                {album.artist}
                <span className="text-[10px] uppercase tracking-[0.2em] text-gray-400 group-hover:text-gray-700">Artist</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 1.5. Action Buttons (한 줄로 압축) */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-1.5">
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
        <TabButton id="log" label="My Log" icon={MessageSquare} active={activeTab} set={setActiveTab} />
        <TabButton id="context" label="Context" icon={BookOpen} active={activeTab} set={setActiveTab} />
        <TabButton id="tracks" label="Tracks" icon={ListMusic} active={activeTab} set={setActiveTab} />
        <TabButton id="credits" label="Credits" icon={Users} active={activeTab} set={setActiveTab} />
        <TabButton id="reviews" label="Reviews" icon={Globe} active={activeTab} set={setActiveTab} />
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
             {metaDetail?.tracks?.length ? (
               <div className="space-y-1">
                 {metaDetail.tracks.map((track: TrackInfo, i: number) => (
                   <div key={track.track_id || i} className="flex items-center py-3 px-3 hover:bg-gray-100 rounded-lg group transition-colors cursor-default">
                     <span className="w-8 text-right mr-4 text-gray-500 font-mono text-sm group-hover:text-black">{track.track_no}</span>
                     <span className="text-gray-700 font-medium text-sm group-hover:text-black">{track.title}</span>
                     <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        <Music size={14} className="text-gray-400" />
                     </div>
                   </div>
                 ))}
               </div>
             ) : !details ? (
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
            {metaDetail?.album_credits?.length || metaDetail?.track_credits?.length ? (
              <div className="space-y-4">
                {[...(metaDetail?.album_credits || []), ...(metaDetail?.track_credits || [])].map((credit: AlbumCredit | TrackCredit, i: number) => (
                  <div key={`${credit.creator.creator_id}-${credit.role.role_id}-${i}`} className="bg-white border border-gray-200 p-5 rounded-lg hover:border-gray-300 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="text-black font-bold text-base">{credit.creator.display_name}</h4>
                        <span className="text-gray-600 text-xs font-medium uppercase tracking-wider">{credit.role.role_name}</span>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                        <Users size={18} className="text-slate-400" />
                      </div>
                    </div>
                    {credit.credit_detail && (
                      <p className="text-slate-600 text-sm leading-relaxed">{credit.credit_detail}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : !details ? (
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
                {[1, 2, 3, 4, 5].map((star) => {
                  const activeRating = hoverRating ?? userLog.rating;
                  const isFull = activeRating >= star;
                  const isHalf = activeRating >= star - 0.5 && activeRating < star;
                  return (
                    <div key={star} className="relative w-7 h-7">
                      <Star
                        size={28}
                        className={isFull || isHalf ? 'text-yellow-400' : 'text-slate-700'}
                        fill={isFull ? 'currentColor' : 'none'}
                      />
                      {isHalf && (
                        <div className="absolute inset-0 overflow-hidden w-1/2">
                          <Star size={28} className="text-yellow-400" fill="currentColor" />
                        </div>
                      )}
                      <button
                        type="button"
                        aria-label={`Rate ${star - 0.5} stars`}
                        className="absolute inset-y-0 left-0 w-1/2"
                        onMouseEnter={() => setHoverRating(star - 0.5)}
                        onMouseLeave={() => setHoverRating(null)}
                        onClick={() => {
                          const next = { ...userLog, rating: star - 0.5 };
                          saveUserLog(next);
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`Rate ${star} stars`}
                        className="absolute inset-y-0 right-0 w-1/2"
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(null)}
                        onClick={() => {
                          const next = { ...userLog, rating: star };
                          saveUserLog(next);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label htmlFor="album-memo" className="text-sm font-bold text-slate-400 uppercase tracking-wider block">Personal Memo</label>
              <textarea 
                id="album-memo"
                name="memo"
                className="w-full h-32 bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-800 focus:ring-2 focus:ring-black/10 focus:border-black outline-none resize-none placeholder-gray-400"
                placeholder="Write your thoughts about this album..."
                value={userLog.memo}
                onChange={(e) => {
                  setUserLog(prev => ({ ...prev, memo: e.target.value }));
                }}
                onBlur={() => {
                  saveUserLog({ ...userLog, memo: userLog.memo });
                }}
              />
            </div>

            {userLog.updatedAt && (
               <div className="text-xs text-slate-600 text-right">
                 Last saved: {new Date(userLog.updatedAt).toLocaleDateString()}
               </div>
            )}

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
