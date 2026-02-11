import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { MapPage } from './pages/MapPage';
import { ArchivePage } from './pages/ArchivePage';
import { SimilarityMapPage } from './pages/SimilarityMapPage';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<MapPage />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="artists" element={<SimilarityMapPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
