import React, { useState, useRef, useEffect } from 'react';
import { SearchBar } from './SearchBar';
import { Search } from 'lucide-react';

export const SearchBarCompact: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 배경 클릭으로 닫기
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded]);

  return (
    <div 
      ref={containerRef}
      onClick={() => {
        if (!isExpanded) setIsExpanded(true);
      }}
      className={`bg-white border border-gray-300 hover:border-black rounded overflow-hidden transition-[width,padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width,padding] h-[40px] flex items-center ${
        isExpanded ? 'w-[320px] px-3' : 'w-auto px-3'
      } ${isExpanded ? 'cursor-default' : 'cursor-pointer'}`}
    >
      {!isExpanded ? (
        <div className="flex items-center justify-center gap-1.5 text-black whitespace-nowrap">
          <Search size={14} strokeWidth={2} />
          <span className="text-[10px] font-semibold">Search</span>
        </div>
      ) : (
        <div className="w-full">
          <SearchBar variant="embedded" />
        </div>
      )}
    </div>
  );
};
