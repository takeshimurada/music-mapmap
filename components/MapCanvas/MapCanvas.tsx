import React, { useState, useMemo, useEffect } from 'react';
import { DeckGL } from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import { scaleLinear } from 'd3';
import { MousePointer2, BoxSelect } from 'lucide-react';
import { useStore } from '../../state/store';
import { Album, Region } from '../../types';

const MIN_YEAR = 1960;
const MAX_YEAR = 2024;
const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 2000;

const REGION_RGB: Record<Region, [number, number, number]> = {
  [Region.NORTH_AMERICA]: [244, 114, 182],
  [Region.EUROPE]: [96, 165, 250],
  [Region.ASIA]: [251, 191, 36],
  [Region.LATIN_AMERICA]: [52, 211, 153],
  [Region.AFRICA]: [167, 139, 250]
};

export const MapCanvas: React.FC = () => {
  const { 
    filteredAlbums, 
    selectedAlbumId, 
    selectAlbum,
    setBrushedAlbums,
    brushedAlbumIds,
    viewport,
  } = useStore();

  const [tool, setTool] = useState<'pan' | 'brush'>('pan');
  const [hoverInfo, setHoverInfo] = useState<{x: number, y: number, object: Album} | null>(null);
  
  const [brushStart, setBrushStart] = useState<{x: number, y: number} | null>(null);
  const [brushEnd, setBrushEnd] = useState<{x: number, y: number} | null>(null);
  
  const [viewState, setViewState] = useState({
    target: [WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 0] as [number, number, number],
    zoom: 0,
    minZoom: -2,
    maxZoom: 5
  });

  const scales = useMemo(() => {
    const xScale = scaleLinear().domain([MIN_YEAR, MAX_YEAR]).range([0, WORLD_WIDTH]);
    const yScale = scaleLinear().domain([0, 1]).range([WORLD_HEIGHT, 0]); 
    return { xScale, yScale };
  }, []);

  useEffect(() => {
    if (viewport.k > 1) {
       setViewState(prev => ({
         ...prev,
         target: [scales.xScale(viewport.x), scales.yScale(viewport.y), 0] as [number, number, number],
         zoom: 2,
         transitionDuration: 1000
       }));
    }
  }, [viewport, scales]);

  const layers = useMemo(() => [
    new ScatterplotLayer({
      id: 'albums-layer',
      data: filteredAlbums,
      getPosition: (d: Album) => [scales.xScale(d.year), scales.yScale(d.vibe), 0],
      getFillColor: (d: Album): [number, number, number, number] => {
        const isBrushed = brushedAlbumIds.includes(d.id);
        const isSelected = selectedAlbumId === d.id;
        const baseColor = REGION_RGB[d.region];
        if ((selectedAlbumId || brushedAlbumIds.length > 0) && !isSelected && !isBrushed) {
           return [...baseColor, 40];
        }
        return [...baseColor, 200];
      },
      getLineColor: [255, 255, 255],
      getLineWidth: (d: Album) => d.id === selectedAlbumId ? 2 : 0,
      getRadius: (d: Album) => {
        const base = (d.popularity || 0.5) * 12 + 4;
        return d.id === selectedAlbumId ? base * 2.5 : base;
      },
      pickable: true,
      stroked: true,
      radiusScale: 1,
      radiusMinPixels: 2,
      onHover: (info: PickingInfo) => {
        if (info.object) {
          setHoverInfo({ x: info.x, y: info.y, object: info.object as Album });
        } else {
          setHoverInfo(null);
        }
      },
      onClick: (info: PickingInfo) => {
        if (info.object) {
          selectAlbum((info.object as Album).id);
        } else {
          selectAlbum(null);
          setBrushedAlbums([]);
        }
      },
      updateTriggers: {
        getFillColor: [selectedAlbumId, brushedAlbumIds],
        getLineWidth: [selectedAlbumId],
        getRadius: [selectedAlbumId],
        getPosition: [scales]
      }
    })
  ], [filteredAlbums, selectedAlbumId, brushedAlbumIds, scales, selectAlbum, setBrushedAlbums]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'brush') {
      const rect = e.currentTarget.getBoundingClientRect();
      const coords = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setBrushStart(coords);
      setBrushEnd(coords);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tool === 'brush' && brushStart) {
      const rect = e.currentTarget.getBoundingClientRect();
      setBrushEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (tool === 'brush' && brushStart && brushEnd) {
      const zoomFactor = Math.pow(2, viewState.zoom);
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      
      const p1 = {
        x: (Math.min(brushStart.x, brushEnd.x) - cx) / zoomFactor + viewState.target[0],
        y: (Math.min(brushStart.y, brushEnd.y) - cy) / zoomFactor + viewState.target[1]
      };
      const p2 = {
        x: (Math.max(brushStart.x, brushEnd.x) - cx) / zoomFactor + viewState.target[0],
        y: (Math.max(brushStart.y, brushEnd.y) - cy) / zoomFactor + viewState.target[1]
      };

      const selected = filteredAlbums.filter(d => {
        const px = scales.xScale(d.year);
        const py = scales.yScale(d.vibe);
        return px >= p1.x && px <= p2.x && py >= p1.y && py <= p2.y;
      });
      
      setBrushedAlbums(selected.map(d => d.id));
    }
    setBrushStart(null);
    setBrushEnd(null);
  };

  return (
    <div className="relative w-full h-full bg-black">
      <div className="absolute top-24 left-6 z-20 flex flex-col gap-2 bg-panel/90 backdrop-blur border border-slate-700 p-2 rounded-lg shadow-xl">
        <button onClick={() => setTool('pan')} className={`p-2 rounded-md transition-all ${tool === 'pan' ? 'bg-accent text-white' : 'text-slate-400 hover:bg-slate-700'}`}>
          <MousePointer2 size={20} />
        </button>
        <button onClick={() => setTool('brush')} className={`p-2 rounded-md transition-all ${tool === 'brush' ? 'bg-accent text-white' : 'text-slate-400 hover:bg-slate-700'}`}>
          <BoxSelect size={20} />
        </button>
      </div>

      <div className="w-full h-full relative" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState }: any) => tool === 'pan' && setViewState(viewState)}
          controller={tool === 'pan'}
          layers={layers}
          views={new OrthographicView({ id: 'ortho', controller: true })}
          getCursor={() => tool === 'brush' ? 'crosshair' : 'grab'}
        >
          {hoverInfo && (
            <div className="absolute z-50 bg-panel border border-slate-600 p-2 rounded shadow-lg pointer-events-none text-xs" style={{ left: hoverInfo.x + 10, top: hoverInfo.y + 10 }}>
              <div className="font-bold text-white">{hoverInfo.object.title}</div>
              <div className="text-slate-400">{hoverInfo.object.artist} ({hoverInfo.object.year})</div>
            </div>
          )}
        </DeckGL>
        
        {brushStart && brushEnd && (
          <div className="absolute border border-accent bg-accent/10 pointer-events-none" style={{
            left: Math.min(brushStart.x, brushEnd.x),
            top: Math.min(brushStart.y, brushEnd.y),
            width: Math.abs(brushEnd.x - brushStart.x),
            height: Math.abs(brushEnd.y - brushStart.y)
          }} />
        )}
      </div>
    </div>
  );
};