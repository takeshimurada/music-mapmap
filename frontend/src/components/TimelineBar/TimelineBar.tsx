import React, { useRef, useEffect } from 'react';
import { select, rollup, scaleLinear, max } from 'd3';
import { useStore } from '../../state/store';
import { Album } from '../../types';

// ?λⅤ蹂??됱긽 (二쇱슂 ?λⅤ留??쒖떆)
export const TimelineBar: React.FC = () => {
  const { albums, viewportYearRange, setViewportYearRange } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const minYear = 1950;
  const maxYear = 2026;
  const [selectedYears, setSelectedYears] = React.useState({ 
    start: viewportYearRange[0], 
    end: viewportYearRange[1] 
  });
  
  // ?쇱そ ?쒕∼諛뺤뒪 ?듭뀡: 1950 ~ ?좏깮?????곕룄
  const startYearOptions = React.useMemo(() => {
    const years = [];
    for (let year = minYear; year <= selectedYears.end; year++) {
      years.push(year);
    }
    return years;
  }, [selectedYears.end]);

  // ?ㅻⅨ履??쒕∼諛뺤뒪 ?듭뀡: ?좏깮???쒖옉 ?곕룄 ~ 2026
  const endYearOptions = React.useMemo(() => {
    const years = [];
    for (let year = selectedYears.start; year <= maxYear; year++) {
      years.push(year);
    }
    return years;
  }, [selectedYears.start]);

  // 酉고룷???곕룄 踰붿쐞媛 蹂寃쎈릺硫??쒕∼諛뺤뒪???낅뜲?댄듃
  React.useEffect(() => {
    setSelectedYears({
      start: viewportYearRange[0],
      end: viewportYearRange[1]
    });
  }, [viewportYearRange[0], viewportYearRange[1]]);

  // ?쒖옉 ?곕룄 蹂寃?(?쇱そ 諛뺤뒪)
  const handleStartYearChange = (year: number) => {
    // ?듭뀡???대? ?쒗븳?섏뼱 ?덉쑝誘濡??좏슚??寃??遺덊븘??
    setSelectedYears({ start: year, end: selectedYears.end });
    setViewportYearRange([year, selectedYears.end]);
    
    console.log('?뱟 Start year changed:', { start: year, end: selectedYears.end });
  };

  // ???곕룄 蹂寃?(?ㅻⅨ履?諛뺤뒪)
  const handleEndYearChange = (year: number) => {
    // ?듭뀡???대? ?쒗븳?섏뼱 ?덉쑝誘濡??좏슚??寃??遺덊븘??
    setSelectedYears({ start: selectedYears.start, end: year });
    setViewportYearRange([selectedYears.start, year]);
    
    console.log('?뱟 End year changed:', { start: selectedYears.start, end: year });
  };

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = select(svgRef.current);
    const container = svgRef.current.parentElement;
    if (!container) return;
    
    const { width } = container.getBoundingClientRect();
    const height = 32;  // 異뺤냼: 40 ??32
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
      .attr("width", Math.max(1, chartWidth / data.length + 0.5))
      .attr("height", d => height - yScale(d.count))
      .attr("fill", d => {
        const inViewport = d.year >= viewportYearRange[0] && d.year <= viewportYearRange[1];
        if (inViewport) return "#000000";  // 酉고룷??怨??꾪꽣)??蹂댁씠???곸뿭
        return "#D1D5DB";  // 蹂댁씠吏 ?딅뒗 ?곸뿭 (諛앹? ?뚯깋)
      })
      .attr("rx", 1)
      .style("transition", "fill 0.5s ease");  // 遺?쒕윭???됱긽 ?꾪솚

    // 酉고룷??踰붿쐞 ?쒓컖??
    const viewportOverlay = g.append("g").attr("class", "viewport-indicator");
    
    // ?쇱そ ?대몢???곸뿭
    viewportOverlay.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", xScale(viewportYearRange[0]))
      .attr("height", height)
      .attr("fill", "rgba(255, 255, 255, 0.7)")
      .attr("pointer-events", "none");
    
    // ?ㅻⅨ履??대몢???곸뿭
    viewportOverlay.append("rect")
      .attr("x", xScale(viewportYearRange[1]))
      .attr("y", 0)
      .attr("width", chartWidth - xScale(viewportYearRange[1]))
      .attr("height", height)
      .attr("fill", "rgba(255, 255, 255, 0.7)")
      .attr("pointer-events", "none");
    
    // 酉고룷??寃쎄퀎??(?쇱そ)
    viewportOverlay.append("line")
      .attr("x1", xScale(viewportYearRange[0]))
      .attr("y1", 0)
      .attr("x2", xScale(viewportYearRange[0]))
      .attr("y2", height)
      .attr("stroke", "#111111")
      .attr("stroke-width", 3)
      .attr("opacity", 1);
    
    // 酉고룷??寃쎄퀎??(?ㅻⅨ履?
    viewportOverlay.append("line")
      .attr("x1", xScale(viewportYearRange[1]))
      .attr("y1", 0)
      .attr("x2", xScale(viewportYearRange[1]))
      .attr("y2", height)
      .attr("stroke", "#111111")
      .attr("stroke-width", 3)
      .attr("opacity", 1);

  }, [albums, viewportYearRange]);

  return (
    <div className="w-full max-w-[460px] ml-auto space-y-2">
      {/* ?λⅤ ?됱긽 ?몃뜳??(異뺤냼) */}
      <div className="flex justify-end items-center px-2">
        {/* ?곕룄 ?쒕∼諛뺤뒪 (?숈쟻 ?듭뀡) */}
        <div className="flex items-center gap-2">
          {/* ?쇱そ: 1950 ~ ?좏깮?????곕룄 */}
          <select
            value={selectedYears.start}
            onChange={(e) => handleStartYearChange(parseInt(e.target.value))}
            className="w-20 px-2 py-1 text-xs font-mono font-semibold text-black bg-gray-50 border border-gray-300 rounded focus:ring-2 focus:ring-black/10 focus:border-black outline-none cursor-pointer hover:bg-gray-100 transition-colors"
            title="?쒖옉 ?곕룄"
          >
            {startYearOptions.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <span className="text-gray-400 text-xs font-bold">·</span>
          {/* ?ㅻⅨ履? ?좏깮???쒖옉 ?곕룄 ~ 2024 */}
          <select
            value={selectedYears.end}
            onChange={(e) => handleEndYearChange(parseInt(e.target.value))}
            className="w-20 px-2 py-1 text-xs font-mono font-semibold text-black bg-gray-50 border border-gray-300 rounded focus:ring-2 focus:ring-black/10 focus:border-black outline-none cursor-pointer hover:bg-gray-100 transition-colors"
            title="???곕룄"
          >
            {endYearOptions.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Histogram SVG */}
      <div className="h-8 w-full px-2">
        <svg ref={svgRef} className="w-full h-full overflow-hidden" />
      </div>
    </div>
  );
};

