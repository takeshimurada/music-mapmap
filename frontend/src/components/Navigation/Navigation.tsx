import React from 'react';
import { NavLink } from 'react-router-dom';
import { Map, Grid3x3, Share2 } from 'lucide-react';

export const Navigation: React.FC = () => {
  return (
    <nav className="flex items-center gap-1 bg-white border border-gray-300 rounded p-0.5">
      <NavLink
        to="/"
        className={({ isActive }) =>
          `flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
            isActive
              ? 'bg-black text-white'
              : 'text-gray-600 hover:text-black hover:bg-gray-100'
          }`
        }
      >
        <Map size={14} />
        <span>Map</span>
      </NavLink>
      
      <NavLink
        to="/archive"
        className={({ isActive }) =>
          `flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
            isActive
              ? 'bg-black text-white'
              : 'text-gray-600 hover:text-black hover:bg-gray-100'
          }`
        }
      >
        <Grid3x3 size={14} />
        <span>Archive</span>
      </NavLink>

      <NavLink
        to="/artists"
        className={({ isActive }) =>
          `flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
            isActive
              ? 'bg-black text-white'
              : 'text-gray-600 hover:text-black hover:bg-gray-100'
          }`
        }
      >
        <Share2 size={14} />
        <span>Artists</span>
      </NavLink>
    </nav>
  );
};
