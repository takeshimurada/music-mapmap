import React from 'react';
import { MapCanvas } from '../components/MapCanvas/MapCanvas';
import { SearchBar } from '../components/SearchBar/SearchBar';
import { TimelineBar } from '../components/TimelineBar/TimelineBar';
import { DetailPanel } from '../components/DetailPanel/DetailPanel';
import { useStore } from '../state/store';
import { Music2 } from 'lucide-react';

export const AppShell: React.FC = () => {
  const { selectedAlbumId } = useStore();

  return (
    <div className="relative w-screen h-screen bg-space overflow-hidden flex flex-row">
      
      {/* 1. Main Interaction Area (Left/Center) */}
      <main className="relative flex-1 flex flex-col h-full overflow-hidden min-w-0">
        
        {/* Top Header Section */}
        <header className="absolute top-0 left-0 w-full z-30 pointer-events-none p-10">
          <div className="max-w-[1400px] mx-auto flex justify-between items-start">
            {/* Branding */}
            <div className="pointer-events-auto group cursor-pointer flex items-center gap-4 bg-panel/80 backdrop-blur-3xl border border-white/5 p-4 pr-10 rounded-[2rem] shadow-2xl transition-all hover:bg-panel">
              <div className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center shadow-lg shadow-accent/40 transition-transform group-hover:rotate-12">
                <Music2 className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tighter text-white leading-none">SONIC<span className="text-accent opacity-80 font-medium tracking-normal">TOPOGRAPHY</span></h1>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em] mt-1">v2.5 Professional</p>
              </div>
            </div>

            {/* Central Search HUD */}
            <div className="w-full max-w-2xl pointer-events-auto px-6">
              <SearchBar />
            </div>

            {/* Status Panel */}
            <div className="w-48 hidden xl:flex justify-end pointer-events-auto">
              <div className="bg-panel/80 backdrop-blur px-5 py-3 rounded-2xl border border-white/5 flex flex-col gap-1 shadow-xl">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-slate-400">ENGINE_STABLE</span>
                </div>
                <span className="text-[9px] font-mono text-slate-600">LOD: DYNAMIC</span>
              </div>
            </div>
          </div>
        </header>

        {/* Map Canvas */}
        <div className="absolute inset-0 z-10">
          <MapCanvas />
        </div>

        {/* Floating Timeline Island */}
        <footer className="absolute bottom-0 left-0 w-full z-30 p-12 pointer-events-none flex justify-center">
          <div className="w-full max-w-5xl pointer-events-auto bg-panel/70 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] transition-all hover:bg-panel/90">
            <TimelineBar />
          </div>
        </footer>
      </main>

      {/* 2. Side Content (Right Fixed Panel) */}
      <aside 
        className={`z-40 h-full bg-panel border-l border-white/5 transition-all duration-[1000ms] ease-[cubic-bezier(0.2,1,0.2,1)] shadow-[-40px_0_80px_rgba(0,0,0,0.7)] overflow-hidden ${
          selectedAlbumId ? 'w-[450px]' : 'w-0 border-none opacity-0'
        }`}
      >
        <div className="w-[450px] h-full">
          <DetailPanel />
        </div>
      </aside>

    </div>
  );
};