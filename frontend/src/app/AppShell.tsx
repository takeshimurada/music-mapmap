import React, { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navigation } from '../components/Navigation/Navigation';
import { DetailPanel } from '../components/DetailPanel/DetailPanel';
import { ArtistPanel } from '../components/ArtistPanel/ArtistPanel';
import { SearchBarCompact } from '../components/SearchBar/SearchBarCompact';
import { MyPanel } from '../components/MyPanel/MyPanel';
import { useStore } from '../state/store';
import { Music2, Sparkles } from 'lucide-react';

export const AppShell: React.FC = () => {
  const { selectedAlbumId, selectedArtist, artistConnections, loadAlbums, loading, selectArtist } = useStore();
  const [showMyPanel, setShowMyPanel] = useState(false);

  const [panelAlbumId, setPanelAlbumId] = useState<string | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (selectedAlbumId) {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setPanelAlbumId(selectedAlbumId);
      setPanelVisible(true);
      return;
    }

    if (panelAlbumId) {
      setPanelVisible(false);
      closeTimerRef.current = window.setTimeout(() => {
        setPanelAlbumId(null);
        closeTimerRef.current = null;
      }, 260);
    }
  }, [selectedAlbumId, panelAlbumId]);

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

  const detailPanelPlacement = panelArtistName
    ? 'top-20 right-[352px] md:right-[448px]'
    : 'top-14 sm:top-16 right-3 sm:right-4 md:right-6';

  return (
    <div className="relative w-screen h-screen bg-space overflow-hidden">
      <header className="absolute top-3 left-3 sm:top-4 sm:left-4 md:top-6 md:left-6 z-50 flex items-center gap-4">
        <div className="flex items-center gap-1.5 sm:gap-2 group cursor-pointer">
          <Music2 className="text-black" size={16} />
          <h1 className="text-xs sm:text-sm font-black tracking-tight text-black leading-none">
            SONIC<span className="text-gray-600 font-light tracking-normal hidden sm:inline">TOPOGRAPHY</span>
          </h1>
        </div>

        <Navigation />
      </header>

      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-50 flex items-center gap-2">
        <SearchBarCompact />

        <button
          onClick={() => setShowMyPanel(true)}
          className="flex items-center justify-center gap-1.5 px-3 h-[40px] bg-white border border-gray-300 hover:border-black rounded transition-all group whitespace-nowrap"
        >
          <Sparkles size={16} strokeWidth={2} className="text-black" />
          <span className="text-xs font-semibold text-black">Library</span>
        </button>
      </div>

      <Outlet />

      {panelAlbumId && (
        <>
          <div
            className={`fixed inset-0 bg-black/10 z-35 transition-opacity duration-300 ${panelVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            onClick={() => useStore.getState().selectAlbum(null)}
          />
          <div className={`fixed ${detailPanelPlacement} z-[55] w-[300px] sm:w-[340px] md:w-[400px] lg:w-[440px] xl:w-[480px] max-h-[calc(100vh-4.5rem)] sm:max-h-[calc(100vh-5rem)] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden flex flex-col transition-all duration-300 ${panelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
            <DetailPanel albumId={panelAlbumId} />
          </div>
        </>
      )}

      {panelArtistName && (
        <>
          <div
            className={`fixed inset-0 z-45 transition-opacity duration-300 ease-out pointer-events-none ${panelAlbumId ? 'bg-transparent opacity-0' : `bg-black/10 ${artistPanelVisible ? 'opacity-100' : 'opacity-0'}`}`}
          />
          {artistConnections.length > 0 && (
            <div className={`fixed top-20 right-[336px] md:right-[426px] z-[59] w-[260px] max-h-[calc(100vh-6rem)] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden flex flex-col transition-all duration-300 ease-out ${artistPanelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
              <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                <div className="text-[11px] font-semibold text-gray-700">Connected Artists</div>
              </div>
              <div className="overflow-y-auto">
                {artistConnections.slice(0, 40).map((c) => (
                  <button
                    key={c.creator_id}
                    onClick={() => selectArtist(c.display_name)}
                    className="w-full px-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-xs font-medium text-black truncate">{c.display_name}</div>
                      <div className="text-[10px] text-gray-500">similarity {c.weight.toFixed(2)}</div>
                    </div>
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                      {c.image_url ? (
                        <img src={c.image_url} alt={c.display_name} className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className={`fixed top-20 right-4 md:right-6 z-[60] w-[320px] md:w-[400px] max-h-[calc(100vh-6rem)] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden flex flex-col transition-all duration-300 ease-out ${artistPanelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
            <ArtistPanel artistName={panelArtistName} />
          </div>
        </>
      )}

      {showMyPanel && (
        <>
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
