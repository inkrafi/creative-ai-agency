"use client";

import { useRef, useState, type MouseEvent } from "react";
import { TrendDownIcon, TrendUpIcon } from "./icons";

export interface ChartPoint {
  label: string;
  value: number;
}

const CHART_W = 640;
const CHART_H = 220;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;
const PAD_X = 4;

/** Catmull-rom-ish smoothing: control points at each segment's midpoint x. */
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

/** Hand-rolled so the chart has no runtime dependency -- just SUM(payments) by day, no fabricated data. */
export function RevenueAreaChart({
  data,
  formatValue,
}: {
  data: ChartPoint[];
  formatValue: (value: number) => string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-medium text-ink">Belum ada pembayaran pada periode ini</p>
        <p className="text-xs text-ink-muted">Grafik terisi begitu ada pembayaran yang dicatat.</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const innerW = CHART_W - PAD_X * 2;
  const innerH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: PAD_X + stepX * i,
    y: PAD_TOP + innerH - (d.value / maxValue) * innerH,
  }));

  const linePath = smoothPath(points);
  const baseline = PAD_TOP + innerH;
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;

  const activeIndex = hoverIndex ?? points.length - 1;
  const active = points[activeIndex];
  const activeData = data[activeIndex];

  function handleMove(e: MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CHART_W;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        className="h-[220px] w-full cursor-crosshair"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--brand)", stopOpacity: 0.22 }} />
            <stop offset="100%" style={{ stopColor: "var(--brand)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={PAD_X}
            x2={CHART_W - PAD_X}
            y1={PAD_TOP + innerH * g}
            y2={PAD_TOP + innerH * g}
            style={{ stroke: "var(--border)" }}
            strokeDasharray="3 4"
            strokeWidth={1}
          />
        ))}

        <path d={areaPath} fill="url(#revenueFill)" stroke="none" />
        <path
          d={linePath}
          fill="none"
          style={{ stroke: "var(--brand)" }}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={PAD_TOP}
            y2={baseline}
            style={{ stroke: "var(--brand)" }}
            strokeOpacity={0.2}
            strokeWidth={1.5}
          />
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === activeIndex ? 5 : 0}
            style={{ fill: "var(--brand)", stroke: "var(--surface)" }}
            strokeWidth={2}
          />
        ))}
      </svg>

      {active && activeData && (
        <div
          className="pointer-events-none absolute top-1 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs whitespace-nowrap shadow-lg"
          style={{ left: `${Math.min(92, Math.max(8, (active.x / CHART_W) * 100))}%` }}
        >
          <div className="font-medium text-ink">{activeData.label}</div>
          <div className="font-semibold text-brand tabular-nums">{formatValue(activeData.value)}</div>
        </div>
      )}

      <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
        {data.map((d, i) => (
          <span key={i} className={i === activeIndex ? "font-medium text-ink" : ""}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MethodBreakdown({
  items,
}: {
  items: { label: string; percent: number; amountIdr: number }[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-muted">Belum ada pembayaran pada periode ini.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium text-ink">{item.label}</span>
            <span className="shrink-0 tabular-nums text-ink-muted">{item.percent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-brand" style={{ width: `${item.percent}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DeltaBadge({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  const up = percent >= 0;
  const Icon = up ? TrendUpIcon : TrendDownIcon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums ${
        up ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
      }`}
    >
      <Icon width={12} height={12} />
      {Math.abs(percent).toFixed(1)}%
    </span>
  );
}
