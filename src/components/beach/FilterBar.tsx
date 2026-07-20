'use client';

import { useTranslations } from 'next-intl';
import type { SurfaceType } from '@/lib/beaches';
import {
  FILTER_FLAGS,
  SURFACE_TYPES,
  hasActiveFilters,
  surfaceColor,
  type BeachFilterState,
  type FilterFlag,
} from '@/lib/beachFilters';

interface FilterBarProps {
  filters: BeachFilterState;
  onQueryChange: (q: string) => void;
  onToggleSurface: (s: SurfaceType) => void;
  onToggleFlag: (f: FilterFlag) => void;
  onReset: () => void;
  onNearMe: () => void;
  nearActive: boolean;
  locating: boolean;
  geoError: string | null;
  resultCount: number;
}

export default function FilterBar({
  filters,
  onQueryChange,
  onToggleSurface,
  onToggleFlag,
  onReset,
  onNearMe,
  nearActive,
  locating,
  geoError,
  resultCount,
}: FilterBarProps) {
  const t = useTranslations('Map');
  const tSurface = useTranslations('Surface');
  const tFlags = useTranslations('Flags');
  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-3 border-b border-sea-100 bg-white/95 p-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="search"
            inputMode="search"
            value={filters.query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="w-full rounded-full border border-sea-200 bg-sea-50/60 px-4 py-2.5 text-sm text-sea-950 outline-none transition focus:border-sea-400 focus:bg-white"
          />
        </div>
        <button
          type="button"
          onClick={onNearMe}
          aria-pressed={nearActive}
          disabled={locating}
          className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition ${
            nearActive
              ? 'bg-sea-600 text-white'
              : 'bg-sea-100 text-sea-800 hover:bg-sea-200'
          } disabled:opacity-60`}
        >
          {locating ? t('locating') : t('nearMe')}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SURFACE_TYPES.map((s) => {
          const on = filters.surfaces.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => onToggleSurface(s)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                on
                  ? 'border-sea-600 bg-sea-600 text-white'
                  : 'border-sea-200 bg-white text-sea-800 hover:border-sea-400'
              }`}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: surfaceColor(s) }}
              />
              {tSurface(s)}
            </button>
          );
        })}
        {FILTER_FLAGS.map((f) => {
          const on = filters.flags.includes(f);
          return (
            <button
              key={f}
              type="button"
              onClick={() => onToggleFlag(f)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                on
                  ? 'border-sea-600 bg-sea-600 text-white'
                  : 'border-sea-200 bg-white text-sea-800 hover:border-sea-400'
              }`}
            >
              {tFlags(f)}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-sea-800/70">
        <span>{t('resultsCount', { count: resultCount })}</span>
        {(active || nearActive) && (
          <button
            type="button"
            onClick={onReset}
            className="font-medium text-sea-600 underline-offset-2 hover:underline"
          >
            {t('resetFilters')}
          </button>
        )}
      </div>

      {geoError && <p className="text-xs text-crowd-packed">{geoError}</p>}
    </div>
  );
}
