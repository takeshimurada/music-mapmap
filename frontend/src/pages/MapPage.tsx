import React from 'react';
import { MapCanvas } from '../components/MapCanvas/MapCanvas';
import { TimelineBar } from '../components/TimelineBar/TimelineBar';
import { GenreFilter } from '../components/GenreFilter/GenreFilter';

export const MapPage: React.FC = () => {
  return (
    <div className="relative w-screen h-screen bg-white overflow-hidden flex flex-row">
      <main className="relative flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <div className="absolute inset-0 z-10">
          <MapCanvas />
        </div>

        <footer className="absolute bottom-0 left-0 right-0 z-30 p-2 sm:p-4 md:p-6 lg:p-8 pointer-events-none">
          <div className="pointer-events-auto flex items-end gap-4">
            <div className="fixed left-4 top-1/2 -translate-y-1/2 w-[90px] sm:w-[110px] md:w-[130px]">
              <GenreFilter />
            </div>
            <div className="flex-1 flex justify-center px-4 sm:px-6 md:px-8">
              <div className="w-full max-w-full sm:max-w-sm md:max-w-md lg:max-w-lg bg-white border border-gray-200 rounded-xl sm:rounded-2xl md:rounded-[2rem] p-2 sm:p-2.5 md:p-3 shadow-lg transition-all">
                <TimelineBar />
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};
