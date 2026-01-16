import React, { useEffect, useState } from 'react';
import { X, Sparkles, Music, Star, Share2, Globe, ListMusic, MessageSquare, BookOpen, ChevronRight } from 'lucide-react';
import { useStore } from '../../state/store';
import { getExtendedAlbumDetails } from '../../services/geminiService';
import { Region, ExtendedAlbumData, UserLog } from '../../types';

const REGION_COLORS: Record<Region, string> = {
  [Region.NORTH_AMERICA]: '#F472B6',
  [Region.EUROPE]: '#60A5FA',
  [Region.ASIA]: '#FBBF24',
  [Region.LATIN_AMERICA]: '#34D399',
  [Region.AFRICA]: '#A78BFA'
};

type Tab = 'context' | 'tracks' | 'reviews' | 'log';

export const DetailPanel: React.FC = () => {
  const { selectedAlbumId, albums, selectAlbum } = useStore();
  
  // Data State
  const [details, setDetails] = useState<ExtendedAlbumData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('context');
  const [lang, setLang] = useState<'en' | 'ko'>('en');
  
  // User Log State
  const [userLog, setUserLog] = useState<UserLog>({ rating: 0, memo: '', updatedAt: '' });
  const [isLogDirty, setIsLogDirty] = useState(false);

  const album = albums.find(a => a.id === selectedAlbumId);

  // Load Album & Local Data
  useEffect(() => {
    setDetails(null);
    setLoading(false);
    setActiveTab('context');
    
    if (album) {
      // Load user log from local storage
      const saved = localStorage.getItem(`log-${album.id}`);
      if (saved) {
        setUserLog(JSON.parse(saved));
      } else {
        setUserLog({ rating: 0, memo: '', updatedAt: '' });
      }
      setIsLogDirty(false);
    }
  }, [album?.id]);

  // Handle Research Call
  const handleResearch = async () => {
    if (!album) return;
    setLoading(true);
    const result = await getExtendedAlbumDetails(album);
    setDetails(result);
    setLoading(false);
  };

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
      <div className="h-full w-full flex items-center justify-center text-slate-600 text-sm flex-col gap-4">
        <Music size={48} className="opacity-20" />
        <p>Select an album from the map</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-panel/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl overflow-hidden">
      
      {/* 1. Hero Header */}
      <div className="relative h-56 w-full shrink-0 group">
        <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/60 to-transparent z-10" />
        <img 
          src={album.coverUrl} 
          alt={album.title} 
          className="w-full h-full object-cover opacity-60 transition-transform duration-700 group-hover:scale-105"
        />
        <button 
          onClick={() => selectAlbum(null)}
          className="absolute top-4 right-4 z-20 p-2 bg-black/40 hover:bg-black/60 backdrop-blur rounded-full text-white transition-colors border border-white/10"
        >
          <X size={18} />
        </button>
        
        <div className="absolute bottom-5 left-6 z-20 w-[calc(100%-3rem)]">
          <div className="flex items-center gap-2 mb-2">
            <span 
              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-black shadow-lg"
              style={{ backgroundColor: REGION_COLORS[album.region] }}
            >
              {album.region}
            </span>
            <span className="text-[10px] font-mono text-slate-300 border border-slate-700 px-2 py-0.5 rounded bg-black/40">
              {album.year}
            </span>
             <span className="text-[10px] font-mono text-slate-300 border border-slate-700 px-2 py-0.5 rounded bg-black/40">
              {album.genres[0]}
            </span>
          </div>
          <h2 className="text-3xl font-bold text-white leading-tight mb-1 truncate">{album.title}</h2>
          <p className="text-lg text-slate-300 font-medium truncate">{album.artist}</p>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center border-b border-slate-800 px-4">
        <TabButton id="context" label="Context" icon={BookOpen} active={activeTab} set={setActiveTab} />
        <TabButton id="tracks" label="Tracks" icon={ListMusic} active={activeTab} set={setActiveTab} />
        <TabButton id="reviews" label="Reviews" icon={Globe} active={activeTab} set={setActiveTab} />
        <TabButton id="log" label="My Log" icon={MessageSquare} active={activeTab} set={setActiveTab} />
      </div>

      {/* 3. Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-space/30">
        
        {/* Loading State Overlay */}
        {loading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-panel/80 backdrop-blur-sm">
            <Sparkles className="text-accent animate-spin mb-3" size={32} />
            <p className="text-sm text-accent font-medium animate-pulse">Analyzing Album...</p>
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
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Quick Context</h3>
                  <button 
                    onClick={() => setLang(l => l === 'en' ? 'ko' : 'en')}
                    className="text-xs flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                  >
                    <span className={lang === 'en' ? 'text-accent font-bold' : ''}>EN</span>
                    <span>/</span>
                    <span className={lang === 'ko' ? 'text-accent font-bold' : ''}>KO</span>
                  </button>
                </div>
                <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl">
                  <p className="text-slate-200 leading-relaxed text-sm">
                    {lang === 'en' ? details.summaryEn : details.summaryKo}
                  </p>
                </div>
                
                <div>
                   <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Key Credits</h3>
                   <div className="flex flex-wrap gap-2">
                      {details.credits.map((credit, i) => (
                        <span key={i} className="px-3 py-1 bg-slate-800 rounded-full text-xs text-slate-300 border border-slate-700">
                          {credit}
                        </span>
                      ))}
                   </div>
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
                   <div key={i} className="flex items-center py-3 px-3 hover:bg-white/5 rounded-lg group transition-colors cursor-default">
                     <span className="w-8 text-right mr-4 text-slate-600 font-mono text-sm group-hover:text-accent">{i + 1}</span>
                     <span className="text-slate-300 font-medium text-sm group-hover:text-white">{track}</span>
                     <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        <Music size={14} className="text-slate-500" />
                     </div>
                   </div>
                 ))}
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
                <div key={i} className="bg-slate-800/30 border border-slate-700/50 p-4 rounded-xl hover:border-slate-600 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-accent text-xs font-bold uppercase">{review.source}</span>
                    <a href={review.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white">
                      <Share2 size={14} />
                    </a>
                  </div>
                  <p className="text-slate-300 text-sm italic leading-relaxed">"{review.excerpt}"</p>
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
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider block">Personal Memo</label>
              <textarea 
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
    className={`flex-1 py-4 flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wider border-b-2 transition-all duration-300 ${
      active === id 
        ? 'border-accent text-white bg-white/5' 
        : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
    }`}
  >
    <Icon size={14} />
    {label}
  </button>
);

const EmptyState = ({ onAction, label }: { onAction: () => void, label: string }) => (
  <div className="h-60 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/20">
    <Sparkles className="text-slate-700 mb-3" size={32} />
    <p className="text-slate-500 text-sm mb-4">Content not generated yet.</p>
    <button 
      onClick={onAction}
      className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full font-medium text-sm transition-all border border-slate-700 hover:border-slate-500"
    >
      <Sparkles size={14} className="text-accent" />
      {label}
    </button>
  </div>
);