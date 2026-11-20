import React, { useState, useMemo } from 'react';
import { CandleData } from '../types.ts';

interface StockChartProps {
  symbol: string;
  currency?: string;
  candles: CandleData[];
  previousClose?: number;
  timeframe: string;
  setTimeframe: (tf: string) => void;
  isLoading: boolean;
}

export const StockChart: React.FC<StockChartProps> = ({
  symbol,
  currency = 'USD',
  candles,
  previousClose,
  timeframe,
  setTimeframe,
  isLoading,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [chartType, setChartType] = useState<'area' | 'candles'>('area');

  const activeCandle = hoverIndex !== null && candles[hoverIndex] ? candles[hoverIndex] : (candles.length > 0 ? candles[candles.length - 1] : null);

  // Compute stats and coordinates
  const { minPrice, maxPrice, maxVolume, points, candlePoints, firstClose, lastClose } = useMemo(() => {
    if (!candles || candles.length === 0) {
      return { minPrice: 0, maxPrice: 100, maxVolume: 1, points: '', candlePoints: [], firstClose: 0, lastClose: 0 };
    }

    let min = Infinity;
    let max = -Infinity;
    let maxVol = 0;

    candles.forEach((c) => {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
      if (c.volume > maxVol) maxVol = c.volume;
    });

    if (previousClose) {
      if (previousClose < min) min = previousClose;
      if (previousClose > max) max = previousClose;
    }

    const padding = (max - min) * 0.08 || 1;
    const chartMin = min - padding;
    const chartMax = max + padding;
    const range = chartMax - chartMin || 1;

    const width = 800;
    const height = 300;
    const volHeight = 60;
    const priceHeight = height - volHeight - 20;

    const stepX = width / (candles.length > 1 ? candles.length - 1 : 1);

    const pts: string[] = [];
    const candleDataList = candles.map((c, i) => {
      const x = i * stepX;
      const yClose = priceHeight - ((c.close - chartMin) / range) * priceHeight;
      const yOpen = priceHeight - ((c.open - chartMin) / range) * priceHeight;
      const yHigh = priceHeight - ((c.high - chartMin) / range) * priceHeight;
      const yLow = priceHeight - ((c.low - chartMin) / range) * priceHeight;
      const vHeight = maxVol > 0 ? (c.volume / maxVol) * volHeight : 0;
      const vY = height - vHeight;

      pts.push(`${x.toFixed(1)},${yClose.toFixed(1)}`);

      return {
        x,
        yOpen,
        yClose,
        yHigh,
        yLow,
        vHeight,
        vY,
        isUp: c.close >= c.open,
        candle: c,
      };
    });

    return {
      minPrice: chartMin,
      maxPrice: chartMax,
      maxVolume: maxVol,
      points: pts.join(' '),
      candlePoints: candleDataList,
      firstClose: candles[0].close,
      lastClose: candles[candles.length - 1].close,
    };
  }, [candles, previousClose]);

  const isOverallUp = lastClose >= (previousClose ?? firstClose);
  const strokeColor = isOverallUp ? '#10b981' : '#f43f5e';
  const fillColor = isOverallUp ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';

  const timeframes = [
    { label: '1D', value: '1d', interval: '5m' },
    { label: '5D', value: '5d', interval: '15m' },
    { label: '1M', value: '1mo', interval: '1d' },
    { label: '6M', value: '6mo', interval: '1d' },
    { label: '1Y', value: '1y', interval: '1wk' },
  ];

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      {/* Chart Top Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold tracking-tight text-white font-mono tabular-nums">
              ${activeCandle ? activeCandle.close.toFixed(2) : '0.00'}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {currency}
            </span>
            {previousClose && activeCandle && (
              <span
                className={`text-xs font-semibold font-mono tabular-nums ${
                  activeCandle.close >= previousClose ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {activeCandle.close >= previousClose ? '+' : ''}
                {(activeCandle.close - previousClose).toFixed(2)} (
                {(((activeCandle.close - previousClose) / previousClose) * 100).toFixed(2)}%)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <span>{symbol}</span>
            <span aria-hidden="true">·</span>
            <span>{activeCandle ? activeCandle.time : 'Latest Session'}</span>
            {activeCandle && (
              <>
                <span aria-hidden="true">·</span>
                <span>O: ${activeCandle.open.toFixed(2)}</span>
                <span aria-hidden="true">·</span>
                <span>H: ${activeCandle.high.toFixed(2)}</span>
                <span aria-hidden="true">·</span>
                <span>L: ${activeCandle.low.toFixed(2)}</span>
                <span aria-hidden="true">·</span>
                <span>Vol: {(activeCandle.volume / 1000).toFixed(1)}k</span>
              </>
            )}
          </div>
        </div>

        {/* Controls: Chart Style & Timeframes */}
        <div className="flex items-center gap-3">
          {/* Chart Type Toggle */}
          <div className="flex items-center p-0.5 bg-slate-950 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setChartType('area')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                chartType === 'area' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Line
            </button>
            <button
              onClick={() => setChartType('candles')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                chartType === 'candles' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Candles
            </button>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center p-0.5 bg-slate-950 rounded-lg border border-slate-800 text-xs">
            {timeframes.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  timeframe === tf.value
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full h-[320px] bg-slate-950/60 rounded-lg border border-slate-800/80 p-2 overflow-hidden flex flex-col justify-end">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-20">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
              <span className="animate-spin inline-block w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full" />
              <span>Fetching Live Quotes & Candles...</span>
            </div>
          </div>
        )}

        {candles.length === 0 && !isLoading ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            No candle history available for {symbol}
          </div>
        ) : (
          <svg
            viewBox="0 0 800 300"
            className="w-full h-full cursor-crosshair overflow-visible"
            preserveAspectRatio="none"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
                <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Price horizontal grid lines */}
            <line x1="0" y1="50" x2="800" y2="50" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="0.8" />
            <line x1="0" y1="120" x2="800" y2="120" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="0.8" />
            <line x1="0" y1="190" x2="800" y2="190" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="0.8" />
            <line x1="0" y1="240" x2="800" y2="240" stroke="#1e293b" strokeWidth="1" />

            {/* Volume bars in lower pane */}
            {candlePoints.map((pt, i) => (
              <rect
                key={`vol-${i}`}
                x={pt.x - 2}
                y={pt.vY}
                width={Math.max(2, 800 / candlePoints.length - 1.5)}
                height={pt.vHeight}
                fill={pt.isUp ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'}
              />
            ))}

            {/* Line / Area Mode */}
            {chartType === 'area' && (
              <>
                {/* Area under curve */}
                <polygon
                  points={`0,220 ${points} 800,220`}
                  fill="url(#areaGrad)"
                />
                {/* Main line */}
                <polyline
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />
              </>
            )}

            {/* Candlestick Mode */}
            {chartType === 'candles' && (
              <g>
                {candlePoints.map((pt, i) => {
                  const candleWidth = Math.max(3, 800 / candlePoints.length - 2.5);
                  const top = Math.min(pt.yOpen, pt.yClose);
                  const h = Math.max(2, Math.abs(pt.yClose - pt.yOpen));
                  const cColor = pt.isUp ? '#10b981' : '#f43f5e';

                  return (
                    <g key={`candle-${i}`}>
                      {/* High-Low Wick */}
                      <line
                        x1={pt.x}
                        y1={pt.yHigh}
                        x2={pt.x}
                        y2={pt.yLow}
                        stroke={cColor}
                        strokeWidth="1.2"
                      />
                      {/* Open-Close Body */}
                      <rect
                        x={pt.x - candleWidth / 2}
                        y={top}
                        width={candleWidth}
                        height={h}
                        fill={cColor}
                        rx="1"
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* Hover Crosshair & Trigger Rectangles */}
            {candlePoints.map((pt, i) => (
              <rect
                key={`trigger-${i}`}
                x={pt.x - (800 / candlePoints.length) / 2}
                y="0"
                width={800 / candlePoints.length}
                height="300"
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
              />
            ))}

            {/* Crosshair indicator */}
            {hoverIndex !== null && candlePoints[hoverIndex] && (
              <g>
                <line
                  x1={candlePoints[hoverIndex].x}
                  y1="0"
                  x2={candlePoints[hoverIndex].x}
                  y2="300"
                  stroke="#94a3b8"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                />
                <circle
                  cx={candlePoints[hoverIndex].x}
                  cy={candlePoints[hoverIndex].yClose}
                  r="4"
                  fill="#ffffff"
                  stroke={strokeColor}
                  strokeWidth="2"
                />
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
};
