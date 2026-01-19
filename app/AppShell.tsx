import React, { useEffect, useState } from 'react';
import { MapCanvas } from '../components/MapCanvas/MapCanvas';
import { SearchBar } from '../components/SearchBar/SearchBar';
import { TimelineBar } from '../components/TimelineBar/TimelineBar';
import { DetailPanel } from '../components/DetailPanel/DetailPanel';
import { MyPanel } from '../components/MyPanel/MyPanel';
import { useStore } from '../state/store';
import { Music2, Sparkles } from 'lucide-react';

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
        
        {/* Top Header Section - 미니멀 브랜딩 */}
        <header className="absolute top-6 left-6 z-30 pointer-events-auto">
          <div className="flex items-center gap-2 group cursor-pointer">
            <Music2 className="text-accent" size={20} />
            <h1 className="text-sm font-black tracking-tight text-white leading-none">
              SONIC<span className="text-accent/80 font-light tracking-normal">TOPOGRAPHY</span>
            </h1>
          </div>
        </header>

        {/* Map Canvas */}
        <div className="absolute inset-0 z-10">
          <MapCanvas />
        </div>

        {/* Floating Timeline Island (Glass Material - 매우 투명하게) */}
        <footer className="absolute bottom-0 left-0 w-full z-30 p-8 pointer-events-none flex justify-center">
          <div className="w-full max-w-5xl pointer-events-auto bg-white/[0.02] backdrop-blur-3xl border border-white/10 rounded-[2rem] p-6 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] transition-all hover:bg-white/[0.05]">
            <TimelineBar />
          </div>
        </footer>
      </main>

      {/* 2. Right Side - 독립적인 My Log & 검색창 + DetailPanel (Glass Material 강화) */}
      <div className="absolute top-6 right-6 z-40 flex flex-col gap-3 w-[320px]">
        
        {/* My Panel Button */}
        <button
          onClick={() => setShowMyPanel(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500/20 to-purple-500/20 backdrop-blur-2xl hover:from-pink-500/30 hover:to-purple-500/30 border border-pink-500/40 hover:border-pink-500/60 rounded-xl transition-all shadow-lg shadow-pink-500/20 group"
        >
          <Sparkles size={18} className="text-pink-400 group-hover:scale-110 transition-transform" />
          <span className="text-sm font-bold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">My</span>
        </button>
        
        {/* 앨범/아티스트 검색창 (Glass Material - 매우 투명하게, overflow visible) */}
        <div className="bg-white/[0.02] backdrop-blur-2xl border border-accent/30 rounded-xl p-4 shadow-[0_8px_32px_rgba(99,102,241,0.15)] hover:shadow-[0_12px_48px_rgba(99,102,241,0.25)] transition-all overflow-visible">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-0.5 h-3 bg-accent rounded-full" />
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Search</div>
          </div>
          <SearchBar />
        </div>
        
        {/* DetailPanel - Search 박스 아래에 플로팅 박스로 표시 */}
        {selectedAlbumId && (
          <div className="bg-white/[0.02] backdrop-blur-2xl border border-accent/30 rounded-xl shadow-[0_20px_60px_-10px_rgba(99,102,241,0.5)] overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-300 max-h-[calc(100vh-200px)]">
            <DetailPanel />
          </div>
        )}
      </div>

      {/* My Panel Modal */}
      {showMyPanel && <MyPanel onClose={() => setShowMyPanel(false)} />}

    </div>
  );
};