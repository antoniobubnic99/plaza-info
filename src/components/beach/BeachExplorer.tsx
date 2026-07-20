'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { beachName, type Beach, type SurfaceType } from '@/lib/beaches';
import {
  EMPTY_FILTERS,
  filterBeaches,
  formatDistance,
  haversineKm,
  sortByDistance,
  sortByName,
  type BeachFilterState,
  type FilterFlag,
} from '@/lib/beachFilters';
import type { MapFocus } from './MapView';
import FilterBar from './FilterBar';
import BeachList from './BeachList';

// MapLibre je isključivo klijentski (koristi window/WebGL) → bez SSR-a.
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-sea-100" />,
});

interface BeachExplorerProps {
  beaches: Beach[];
  locale: string;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function BeachExplorer({ beaches, locale }: BeachExplorerProps) {
  const t = useTranslations('Map');
  const tSurface = useTranslations('Surface');
  const tFlags = useTranslations('Flags');

  const [filters, setFilters] = useState<BeachFilterState>(EMPTY_FILTERS);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearActive, setNearActive] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const filtered = useMemo(() => filterBeaches(beaches, filters), [beaches, filters]);

  const listBeaches = useMemo(() => {
    if (nearActive && userLocation) {
      return sortByDistance(filtered, userLocation.lat, userLocation.lng);
    }
    return sortByName(filtered, locale);
  }, [filtered, nearActive, userLocation, locale]);

  const selectedBeach = useMemo(
    () => beaches.find((b) => b.id === selectedId) ?? null,
    [beaches, selectedId],
  );

  function handleSelect(id: string) {
    setSelectedId(id);
    const b = beaches.find((x) => x.id === id);
    if (b) setFocus({ lng: b.lng, lat: b.lat, zoom: 14, nonce: Date.now() });
  }

  function handleNearMe() {
    if (!('geolocation' in navigator)) {
      setGeoError(t('geoUnsupported'));
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setNearActive(true);
        setLocating(false);
        setFocus({ lng: loc.lng, lat: loc.lat, zoom: 12, nonce: Date.now() });
      },
      () => {
        setLocating(false);
        setGeoError(t('geoError'));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS);
    setNearActive(false);
    setGeoError(null);
  }

  const selectedDistance =
    selectedBeach && nearActive && userLocation
      ? haversineKm(userLocation.lat, userLocation.lng, selectedBeach.lat, selectedBeach.lng)
      : null;

  return (
    <main className="flex h-dvh flex-col-reverse overflow-hidden md:flex-row">
      <aside className="flex min-h-0 flex-1 flex-col bg-white md:h-full md:w-[380px] md:flex-none md:border-r md:border-sea-100">
        <header className="flex items-center justify-between border-b border-sea-100 px-4 py-3">
          <span className="text-lg font-semibold tracking-tight text-sea-950">
            Plaža<span className="text-sea-600">Info</span>
          </span>
          <nav className="text-xs text-sea-800/70">
            <Link href="/" locale="hr" className="hover:underline">
              HR
            </Link>
            <span className="mx-1.5">·</span>
            <Link href="/" locale="en" className="hover:underline">
              EN
            </Link>
          </nav>
        </header>

        <FilterBar
          filters={filters}
          onQueryChange={(q) => setFilters((f) => ({ ...f, query: q }))}
          onToggleSurface={(s: SurfaceType) =>
            setFilters((f) => ({ ...f, surfaces: toggle(f.surfaces, s) }))
          }
          onToggleFlag={(fl: FilterFlag) =>
            setFilters((f) => ({ ...f, flags: toggle(f.flags, fl) }))
          }
          onReset={handleReset}
          onNearMe={handleNearMe}
          nearActive={nearActive}
          locating={locating}
          geoError={geoError}
          resultCount={filtered.length}
        />

        {selectedBeach && (
          <div className="border-b border-sea-100 bg-sea-50/50 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-sea-950">
                  {beachName(selectedBeach, locale)}
                </h2>
                <p className="text-xs text-sea-800/70">
                  {selectedBeach.surfaceType
                    ? tSurface(selectedBeach.surfaceType)
                    : t('surfaceUnknown')}
                  {selectedBeach.municipality ? ` · ${selectedBeach.municipality}` : ''}
                  {selectedDistance != null ? ` · ${formatDistance(selectedDistance)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label={t('close')}
                className="shrink-0 rounded-full px-2 py-0.5 text-sea-800/60 hover:bg-sea-100"
              >
                ✕
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['dogs', 'nudist', 'accessible'] as FilterFlag[])
                .filter((fl) => selectedBeach.flags[fl])
                .map((fl) => (
                  <span
                    key={fl}
                    className="rounded-full bg-white px-2 py-0.5 text-xs text-sea-800 ring-1 ring-sea-200"
                  >
                    {tFlags(fl)}
                  </span>
                ))}
            </div>

            <div className="mt-3 flex gap-2">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selectedBeach.lat},${selectedBeach.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-sea-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sea-800"
              >
                {t('directions')}
              </a>
              {selectedBeach.osmId && (
                <a
                  href={`https://www.openstreetmap.org/${selectedBeach.osmId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-sea-800 ring-1 ring-sea-200 hover:bg-sea-50"
                >
                  OSM
                </a>
              )}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <BeachList
            beaches={listBeaches}
            selectedId={selectedId}
            onSelect={handleSelect}
            locale={locale}
            showDistance={nearActive && userLocation != null}
          />
        </div>
      </aside>

      <div className="h-[45vh] w-full shrink-0 md:h-full md:flex-1">
        <MapView
          beaches={filtered}
          selectedId={selectedId}
          onSelect={handleSelect}
          focus={focus}
          userLocation={userLocation}
        />
      </div>
    </main>
  );
}
