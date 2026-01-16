import React, { useRef, useEffect } from 'react';
import { select, rollup, scaleLinear, max, brushX } from 'd3';
import { useStore } from '../../state/store';
import { Region, Album } from '../../types';

const REGION_COLORS: Record<Region, string> = {
  [Region.NORTH_AMERICA]: '#F472B6', 
  [Region.EUROPE]: '#60A5FA',        
  [Region.ASIA]: '#FBBF24',          
  [Region.LATIN_AMERICA]: '#34D399', 
  [Region.AFRICA]: '#A78BFA'         
};

export const TimelineBar: React.FC = () => {
  const { yearRange, setYearRange, activeRegions, toggleRegion, albums } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);

  const minYear = 1960;
  const maxYear = 2024;

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = select(svgRef.current);
    const container = svgRef.current.parentElement;
    if (!container) return;
    
    const { width } = container.getBoundingClientRect();
    const height = 40;
    svg.selectAll("*").remove();

    const padding = 10;
    const chartWidth = width - padding * 2;

    const yearCounts = rollup(albums, v => v.length, (d: Album) => d.year);
    const data = Array.from({ length: maxYear - minYear + 1 }, (_, i) => {
      const year = minYear + i;
      return { year, count: yearCounts.get(year) || 0 };
    });

    const xScale = scaleLinear().domain([minYear, maxYear]).range([0, chartWidth]);
    const yScale = scaleLinear()
      .domain([0, max(data, d => d.count) || 1])
      .range([height, 0]);

    const g = svg.append("g").attr("transform", `translate(${padding}, 0)`);

    g.selectAll("rect")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", d => xScale(d.year))
      .attr("y", d => yScale(d.count))
      .attr("width", Math.max(1, chartWidth / data.length - 1))
      .attr("height", d => height - yScale(d.count))
      .attr("fill", d => 
        (d.year >= yearRange[0] && d.year <= yearRange[1]) ? "#6366F1" : "#1E293B"
      )
      .attr("rx", 1);

    const brush = brushX()
      .extent([[0, 0], [chartWidth, height]])
      .on("end", (event) => {
        if (!event.selection) return;
        const [x0, x1] = event.selection;
        const y0 = Math.round(xScale.invert(x0));
        const y1 = Math.round(xScale.invert(x1));
        if (y0 !== yearRange[0] || y1 !== yearRange[1]) {
           setYearRange([y0, y1]);
        }
      });

    const brushG = g.append("g").attr("class", "brush").call(brush);
    brush.move(brushG, [xScale(yearRange[0]), xScale(yearRange[1])]);

  }, [yearRange, albums, setYearRange]);

  return (
    <div className="w-full space-y-5">
      {/* Regions Filter */}
      <div className="flex justify-between items-center px-2">
        <div className="flex gap-5">
          {Object.values(Region).map(region => (
            <button 
              key={region}
              onClick={() => toggleRegion(region)}
              className="flex items-center gap-2 group outline-none"
            >
              <div 
                className={`w-3 h-3 rounded-full transition-all duration-300 ${activeRegions.includes(region) ? 'scale-125' : 'opacity-30'}`}
                style={{ backgroundColor: REGION_COLORS[region], boxShadow: activeRegions.includes(region) ? `0 0 10px ${REGION_COLORS[region]}` : 'none' }}
              />
              <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${activeRegions.includes(region) ? 'text-slate-200' : 'text-slate-600'}`}>
                {region}
              </span>
            </button>
          ))}
        </div>
        <div className="text-[10px] font-mono font-bold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
          {yearRange[0]} — {yearRange[1]}
        </div>
      </div>

      {/* Histogram SVG */}
      <div className="h-10 w-full">
        <svg ref={svgRef} className="w-full h-full overflow-visible" />
      </div>
    </div>
  );
};