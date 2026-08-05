'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CrowdLevel, SeaAssessment, SurfaceType } from '@/lib/beaches';
import {
  AMENITY_FILTERS,
  CROWD_LEVELS,
  FILTER_FLAGS,
  RATING_OPTIONS,
  SEA_ASSESSMENTS,
  SURFACE_TYPES,
  crowdColor,
  hasActiveFilters,
  seaQualityColor,
  surfaceColor,
  type AmenityFilter,
  type BeachFilterState,
  type FilterCoverage,
  type FilterFlag,
} from '@/lib/beachFilters';
import type { PlaceSuggestion } from '@/lib/placeIndex';
import FilterDropdown from './FilterDropdown';

interface FilterBarProps {
  filters: BeachFilterState;
  onQueryChange: (q: string) => void;
  onToggleSurface: (s: SurfaceType) => void;
  onToggleFlag: (f: FilterFlag) => void;
  onToggleAmenity: (a: AmenityFilter) => void;
  onSetMinRating: (r: number) => void;
  onToggleSeaAssessment: (s: SeaAssessment) => void;
  onToggleCrowd: (c: CrowdLevel) => void;
  suggestions: PlaceSuggestion[];
  onPickSuggestion: (s: PlaceSuggestion) => void;
  onClearRegion: () => void;
  onReset: () => void;
  onNearMe: () => void;
  nearActive: boolean;
  locating: boolean;
  geoError: string | null;
  resultCount: number;
  /** Pokrivenost prisutnost-filtera u podacima — nulta gasi opciju umjesto praznog rezultata. */
  coverage: FilterCoverage;
}

export default function FilterBar({
  filters,
  onQueryChange,
  onToggleSurface,
  onToggleFlag,
  onToggleAmenity,
  onSetMinRating,
  onToggleSeaAssessment,
  onToggleCrowd,
  suggestions,
  onPickSuggestion,
  onClearRegion,
  onReset,
  onNearMe,
  nearActive,
  locating,
  geoError,
  resultCount,
  coverage,
}: FilterBarProps) {
  const t = useTranslations('Map');
  const tSurface = useTranslations('Surface');
  const tFlags = useTranslations('Flags');
  const tAmenities = useTranslations('Amenities');
  const tSea = useTranslations('SeaQuality');
  const tCrowd = useTranslations('Crowd');
  const active = hasActiveFilters(filters);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const showSuggestions = suggestOpen && suggestions.length > 0;

  // Prisutnost-filter bez ijedne plaže u podacima uvijek vraća prazan popis. Gasi se —
  // osim ako je već uključen (npr. iz dijeljenog URL-a), da ga korisnik može ugasiti.
  const noData = t('filterNoData');
  const emptyOption = (isSelected: boolean, count: number) =>
    count === 0 && !isSelected ? { disabled: true, note: noData } : {};

  return (
    <div className="flex flex-col gap-3 border-b border-sea-100 bg-white/95 p-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="search"
            inputMode="search"
            value={filters.query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            // Odgoda: bez nje `blur` ugasi popis prije nego klik na prijedlog stigne okinuti.
            onBlur={() => window.setTimeout(() => setSuggestOpen(false), 120)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            role="combobox"
            aria-expanded={showSuggestions}
            aria-controls="place-suggestions"
            className="w-full rounded-full border border-sea-200 bg-sea-50/60 px-4 py-2.5 text-sm text-sea-950 outline-none transition focus:border-sea-400 focus:bg-white"
          />
          {showSuggestions && (
            <ul
              id="place-suggestions"
              role="listbox"
              className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-sea-100 bg-white py-1 shadow-lg"
            >
              {suggestions.map((s) => (
                <li key={`${s.kind}-${s.label}-${s.beachId ?? ''}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      onPickSuggestion(s);
                      setSuggestOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-sea-50"
                  >
                    <span aria-hidden className="w-5 shrink-0 text-center text-sea-600">
                      {s.kind === 'beach' ? '🏖' : s.kind === 'municipality' ? '📍' : '🗺'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sea-950">{s.label}</span>
                      <span className="block truncate text-xs text-sea-800/60">
                        {t(`placeKind_${s.kind}`)}
                        {s.context ? ` · ${s.context}` : ''}
                        {s.count > 0 ? ` · ${t('placeBeachCount', { count: s.count })}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
          options={FILTER_FLAGS.map((f) => ({
            value: f,
            label: tFlags(f),
            ...emptyOption(filters.flags.includes(f), coverage.flags[f]),
          }))}
        />
        <FilterDropdown
          label={t('filterAmenities')}
          ariaLabel={t('filterAmenities')}
          selected={filters.amenities}
          onToggle={(v) => onToggleAmenity(v as AmenityFilter)}
          options={AMENITY_FILTERS.map((a) => ({
            value: a,
            label: tAmenities(a),
            ...emptyOption(filters.amenities.includes(a), coverage.amenities[a]),
          }))}
        />
        <FilterDropdown
          label={t('filterRating')}
          ariaLabel={t('filterRating')}
          selected={filters.minRating > 0 ? [String(filters.minRating)] : []}
          onToggle={(v) => onSetMinRating(Number(v) === filters.minRating ? 0 : Number(v))}
          options={RATING_OPTIONS.map((r) => ({ value: String(r), label: `${r}★+` }))}
        />
        <FilterDropdown
          label={tSea('heading')}
          ariaLabel={tSea('heading')}
          selected={filters.seaAssessments}
          onToggle={(v) => onToggleSeaAssessment(v as SeaAssessment)}
          options={SEA_ASSESSMENTS.map((s) => ({
            value: s,
            label: tSea(s),
            color: seaQualityColor(s),
          }))}
        />
        <FilterDropdown
          label={t('filterCrowd')}
          ariaLabel={t('filterCrowd')}
          selected={filters.crowds}
          onToggle={(v) => onToggleCrowd(v as CrowdLevel)}
          options={CROWD_LEVELS.map((c) => ({
            value: c,
            label: tCrowd(c),
            color: crowdColor(c),
          }))}
        />
      </div>

      {filters.region && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sea-600 px-3 py-1 text-xs font-medium text-white">
            🗺 {filters.region}
            <button
              type="button"
              onClick={onClearRegion}
              aria-label={t('clearRegion')}
              className="ml-0.5 text-white/80 transition hover:text-white"
            >
              ✕
            </button>
          </span>
        </div>
      )}

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
