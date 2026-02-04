import React, { useEffect, useState, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navigation } from '../components/Navigation/Navigation';
import { DetailPanel } from '../components/DetailPanel/DetailPanel';
import { ArtistPanel } from '../components/ArtistPanel/ArtistPanel';
import { SearchBarCompact } from '../components/SearchBar/SearchBarCompact';
import { MyPanel } from '../components/MyPanel/MyPanel';
import { useStore } from '../state/store';
import { Music2, Sparkles } from 'lucide-react';

export const AppShell: React.FC = () => {
  const { selectedAlbumId, selectedArtist, loadAlbums, loading } = useStore();
  const location = useLocation();
  const isArchivePage = location.pathname === '/archive';
  const [showMyPanel, setShowMyPanel] = useState(false);
  const [panelArtistName, setPanelArtistName] = useState<string | null>(null);
  const [artistPanelVisible, setArtistPanelVisible] = useState(false);
  const artistCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    loadAlbums();
  }, []);

  useEffect(() => {
    if (selectedArtist) {
      if (artistCloseTimerRef.current) {
        window.clearTimeout(artistCloseTimerRef.current);
        artistCloseTimerRef.current = null;
      }
      setPanelArtistName(selectedArtist);
      setArtistPanelVisible(true);
      return;
    }

    if (panelArtistName) {
      setArtistPanelVisible(false);
      artistCloseTimerRef.current = window.setTimeout(() => {
        setPanelArtistName(null);
        artistCloseTimerRef.current = null;
      }, 300);
    }
  }, [selectedArtist, panelArtistName]);

  if (loading) {
    return (
      <div className="relative w-screen h-screen bg-space overflow-hidden flex items-center justify-center">
        <div className="text-center">
          <Music2 className="text-black mx-auto mb-4 animate-pulse" size={48} />
          <p className="text-black font-bold text-xl">Loading SonicChronos...</p>
          <p className="text-gray-500 text-sm mt-2">Mapping music history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-space overflow-hidden">
      
      {/* Top Header - 브랜딩 & Navigation */}
      <header className="absolute top-3 left-3 sm:top-4 sm:left-4 md:top-6 md:left-6 z-50 flex items-center gap-4">
        {/* 브랜딩 */}
        <div className="flex items-center gap-1.5 sm:gap-2 group cursor-pointer">
          <Music2 className="text-black" size={16} />
          <h1 className="text-xs sm:text-sm font-black tracking-tight text-black leading-none">
            SONIC<span className="text-gray-600 font-light tracking-normal hidden sm:inline">TOPOGRAPHY</span>
          </h1>
        </div>

        {/* Navigation */}
        <Navigation />
      </header>

      {/* Right Side - Search & Library (공통, 모든 페이지에서 표시) */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-50 flex items-center gap-2">
        {/* 앨범/아티스트 검색창 */}
        <SearchBarCompact />
        
        {/* Library Panel Button */}
        <button
          onClick={() => setShowMyPanel(true)}
          className="flex items-center justify-center gap-1.5 px-3 h-[40px] bg-white border border-gray-300 hover:border-black rounded transition-all group whitespace-nowrap"
        >
          <Sparkles size={16} strokeWidth={2} className="text-black" />
          <span className="text-xs font-semibold text-black">Library</span>
        </button>
      </div>

      {/* Page Content */}
      <Outlet />

      {/* Archive 페이지에서도 DetailPanel 표시 */}
      {isArchivePage && selectedAlbumId && (
        <>
          {/* 배경 오버레이 - 클릭하면 패널 닫기 */}
          <div 
            className="fixed inset-0 bg-white/40 backdrop-blur-sm z-45"
            onClick={() => useStore.getState().selectAlbum(null)}
          />
          <div className="fixed top-20 right-4 md:right-6 z-50 w-[320px] md:w-[400px] max-h-[calc(100vh-6rem)] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-right duration-300 flex flex-col">
            <DetailPanel />
          </div>
        </>
      )}

      {panelArtistName && (
        <>
          <div
            className={`fixed inset-0 bg-black/20 backdrop-blur-sm z-45 transition-opacity duration-300 ease-out ${artistPanelVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            onClick={() => useStore.getState().selectArtist(null)}
          />
          <div className={`fixed top-20 right-4 md:right-6 z-50 w-[320px] md:w-[400px] max-h-[calc(100vh-6rem)] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden flex flex-col transition-all duration-300 ease-out ${artistPanelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
            <ArtistPanel artistName={panelArtistName} />
          </div>
        </>
      )}

      {/* Library Panel Modal (공통) */}
      {showMyPanel && (
        <>
          {/* 배경 오버레이 - 클릭하면 닫기 */}
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={() => setShowMyPanel(false)}
          />
          <MyPanel onClose={() => setShowMyPanel(false)} />
        </>
      )}

    </div>
  );
};
