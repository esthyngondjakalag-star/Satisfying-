import React, { useState } from 'react';

export interface BarDatum {
  label: string;
  value: number;
  secondaryValue?: number;
  hint?: string;
}

export function InteractiveTrendChart({
  data,
  primaryLabel = 'Créés',
  secondaryLabel = 'Résolus',
}: {
  data: BarDatum[];
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(1, ...data.flatMap((d) => [d.value, d.secondaryValue || 0]));

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 dark:bg-blue-500 inline-block" />
            {primaryLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 dark:bg-emerald-500 inline-block" />
            {secondaryLabel}
          </span>
        </div>
        {hoveredIdx !== null && data[hoveredIdx] && (
          <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-medium">
            {data[hoveredIdx].label} · {data[hoveredIdx].value} {primaryLabel.toLowerCase()} /{' '}
            {data[hoveredIdx].secondaryValue ?? 0} {secondaryLabel.toLowerCase()}
          </span>
        )}
      </div>

      <div className="relative h-48 flex items-end gap-2 pt-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        {data.map((d, i) => {
          const h1 = Math.max(4, Math.round((d.value / maxVal) * 100));
          const h2 = Math.max(4, Math.round(((d.secondaryValue || 0) / maxVal) * 100));
          const isHovered = hoveredIdx === i;
          return (
            <div
              key={d.label}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer rounded-md px-1 transition-colors ${
                isHovered ? 'bg-slate-100/80 dark:bg-slate-800/60' : ''
              }`}
            >
              <div className="w-full flex items-end justify-center gap-1 h-36">
                <div
                  style={{ height: `${h1}%` }}
                  className="w-3 sm:w-4 rounded-t-xs bg-blue-600 dark:bg-blue-500 transition-all duration-150"
                />
                {d.secondaryValue !== undefined && (
                  <div
                    style={{ height: `${h2}%` }}
                    className="w-3 sm:w-4 rounded-t-xs bg-emerald-600 dark:bg-emerald-500 transition-all duration-150"
                  />
                )}
              </div>
              <span className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate max-w-full">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HorizontalDistributionList({
  items,
  valueFormatter = (v) => String(v),
  accentClass = 'bg-blue-600 dark:bg-blue-500',
}: {
  items: Array<{ label: string; value: number; sublabel?: string }>;
  valueFormatter?: (v: number) => string;
  accentClass?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
        Aucune donnée disponible sur cette période.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = Math.round((item.value / max) * 100);
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate pr-3">
                {item.label}
                {item.sublabel ? (
                  <span className="text-slate-400 dark:text-slate-500 font-normal"> · {item.sublabel}</span>
                ) : null}
              </span>
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                {valueFormatter(item.value)}
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                style={{ width: `${Math.max(4, pct)}%` }}
                className={`h-full rounded-full transition-all duration-200 ${accentClass}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
