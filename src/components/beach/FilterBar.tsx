'use client';

import { useTranslations } from 'next-intl';
import type { SurfaceType } from '@/lib/beaches';
import {
  AMENITY_FILTERS,
  FILTER_FLAGS,
  RATING_OPTIONS,
  SURFACE_TYPES,
  hasActiveFilters,
  surfaceColor,
  type AmenityFilter,
  type BeachFilterState,
  type FilterFlag,
} from '@/lib/beachFilters';
import FilterDropdown from './FilterDropdown';

interface FilterBarProps {
  filters: BeachFilterState;
  onQueryChange: (q: string) => void;
  onToggleSurface: (s: SurfaceType) => void;
  onToggleFlag: (f: FilterFlag) => void;
  onToggleAmenity: (a: AmenityFilter) => void;
  onSetMinRating: (r: number) => void;
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
  onToggleAmenity,
  onSetMinRating,
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
  const tAmenities = useTranslations('Amenities');
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

      <div className="flex flex-wrap gap-2">
        <FilterDropdown
          label={t('filterSurface')}
          ariaLabel={t('filterSurface')}
          selected={filters.surfaces}
          onToggle={(v) => onToggleSurface(v as SurfaceType)}
          options={SURFACE_TYPES.map((s) => ({
            value: s,
            label: tSurface(s),
            color: surfaceColor(s),
          }))}
        />
        <FilterDropdown
          label={t('filterFlags')}
          ariaLabel={t('filterFlags')}
          selected={filters.flags}
          onToggle={(v) => onToggleFlag(v as FilterFlag)}
          options={FILTER_FLAGS.map((f) => ({ value: f, label: tFlags(f) }))}
        />
        <FilterDropdown
          label={t('filterAmenities')}
          ariaLabel={t('filterAmenities')}
          selected={filters.amenities}
          onToggle={(v) => onToggleAmenity(v as AmenityFilter)}
          options={AMENITY_FILTERS.map((a) => ({ value: a, label: tAmenities(a) }))}
        />
        <FilterDropdown
          label={t('filterRating')}
          ariaLabel={t('filterRating')}
          selected={filters.minRating > 0 ? [String(filters.minRating)] : []}
          onToggle={(v) => onSetMinRating(Number(v) === filters.minRating ? 0 : Number(v))}
          options={RATING_OPTIONS.map((r) => ({ value: String(r), label: `${r}★+` }))}
        />
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
