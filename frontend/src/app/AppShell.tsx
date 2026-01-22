import React, { useEffect, useState } from 'react';
import { MapCanvas } from '../components/MapCanvas/MapCanvas';
import { SearchBar } from '../components/SearchBar/SearchBar';
import { TimelineBar } from '../components/TimelineBar/TimelineBar';
import { DetailPanel } from '../components/DetailPanel/DetailPanel';
import { MyPanel } from '../components/MyPanel/MyPanel';
import { useStore } from '../state/store';
import { Music2, Sparkles, Search } from 'lucide-react';

// 확장 가능한 검색 박스 컴포넌트 (왼쪽으로 확장)
const SearchBarCompact: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div 
      className={`bg-white/[0.02] backdrop-blur-2xl border border-accent/30 rounded-lg shadow-lg transition-all duration-300 ${
        isExpanded ? 'w-[280px] p-3' : 'w-auto p-2'
      }`}
    >
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-accent hover:bg-white/5 transition-all rounded whitespace-nowrap"
        >
          <Search size={14} />
          <span className="text-[10px] text-slate-400 font-medium">앨범, 뮤지션 검색</span>
        </button>
      ) : (
        <div onBlur={() => setIsExpanded(false)}>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-0.5 h-2.5 bg-accent rounded-full" />
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Search</div>
          </div>
          <SearchBar />
        </div>
      )}
    </div>
  );
};

export const AppShell: React.FC = () => {
  const { selectedAlbumId, loadAlbums, loading } = useStore();
  const [showMyPanel, setShowMyPanel] = useState(false);

  useEffect(() => {
    loadAlbums();
  }, []);

  if (loading) {
    return (
      <div className="relative w-screen h-screen bg-space overflow-hidden flex items-center justify-center">
        <div className="text-center">
          <Music2 className="text-accent mx-auto mb-4 animate-pulse" size={48} />
          <p className="text-white font-bold text-xl">Loading SonicChronos...</p>
          <p className="text-slate-400 text-sm mt-2">Mapping music history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-space overflow-hidden flex flex-row">
      
      {/* 1. Main Interaction Area (Left/Center) */}
      <main className="relative flex-1 flex flex-col h-full overflow-hidden min-w-0">
        
        {/* Top Header Section - 미니멀 브랜딩 (반응형) */}
        <header className="absolute top-3 left-3 sm:top-4 sm:left-4 md:top-6 md:left-6 z-30 pointer-events-auto">
          <div className="flex items-center gap-1.5 sm:gap-2 group cursor-pointer">
            <Music2 className="text-accent" size={16} />
            <h1 className="text-xs sm:text-sm font-black tracking-tight text-white leading-none">
              SONIC<span className="text-accent/80 font-light tracking-normal hidden sm:inline">TOPOGRAPHY</span>
            </h1>
          </div>
        </header>

        {/* Map Canvas */}
        <div className="absolute inset-0 z-10">
          <MapCanvas />
        </div>

        {/* Floating Timeline Island (Glass Material - 반응형) */}
        <footer className="absolute bottom-0 left-0 right-0 sm:right-[340px] md:right-[360px] z-30 p-2 sm:p-4 md:p-6 lg:p-8 pointer-events-none flex justify-center">
          <div className="w-full max-w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl pointer-events-auto bg-white/[0.02] backdrop-blur-3xl border border-white/10 rounded-xl sm:rounded-2xl md:rounded-[2rem] p-3 sm:p-4 md:p-6 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] transition-all hover:bg-white/[0.05]">
            <TimelineBar />
          </div>
        </footer>
      </main>

      {/* 2. Right Side - Search & My (작고 독립적, 우측 상단, 가로 배치) */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-50 flex items-stretch gap-2">
        {/* 앨범/아티스트 검색창 (왼쪽, 작다가 클릭 시 왼쪽으로 확장) */}
        <SearchBarCompact />
        
        {/* My Panel Button (오른쪽, Search와 높이 맞춤) */}
        <button
          onClick={() => setShowMyPanel(true)}
          className="flex items-center justify-center gap-1 px-2 py-1.5 bg-gradient-to-r from-pink-500/20 to-purple-500/20 backdrop-blur-2xl hover:from-pink-500/30 hover:to-purple-500/30 border border-pink-500/40 hover:border-pink-500/60 rounded-lg transition-all shadow-lg shadow-pink-500/20 group whitespace-nowrap h-full"
        >
          <Sparkles size={12} className="text-pink-400 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] font-bold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">My</span>
        </button>
      </div>

      {/* 3. DetailPanel - Search/My 아래에 충분한 간격 (큰 폭) */}
      {selectedAlbumId && (
        <div className="absolute top-[4.5rem] sm:top-20 right-3 sm:right-4 md:right-6 z-40 w-[280px] sm:w-[320px] md:w-[380px] lg:w-[420px] xl:w-[460px] max-h-[calc(100vh-5.5rem)] sm:max-h-[calc(100vh-6rem)] bg-white/[0.02] backdrop-blur-2xl border border-accent/30 rounded-xl shadow-[0_20px_60px_-10px_rgba(99,102,241,0.5)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 flex flex-col">
          <DetailPanel />
        </div>
      )}

      {/* My Panel Modal */}
      {showMyPanel && <MyPanel onClose={() => setShowMyPanel(false)} />}

    </div>
  );
};