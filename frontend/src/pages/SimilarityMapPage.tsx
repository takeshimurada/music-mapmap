import React from 'react';
import { ArtistSimilarityMap } from '../components/ArtistSimilarityMap/ArtistSimilarityMap';

export const SimilarityMapPage: React.FC = () => {
  return (
    <div className="relative w-screen h-screen bg-white overflow-hidden">
      <div className="absolute inset-0">
        <ArtistSimilarityMap />
      </div>
    </div>
  );
};
