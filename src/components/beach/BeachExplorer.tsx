'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  beachName,
  type Beach,
  type CrowdLevel,
  type SeaAssessment,
  type SurfaceType,
} from '@/lib/beaches';
import {
  EMPTY_FILTERS,
  filterBeaches,
  filtersFromSearchParams,
  filtersToSearchParams,
  haversineKm,
  sortByDistance,
  sortByPopularity,
  type AmenityFilter,
  type BeachFilterState,
  type FilterFlag,
} from '@/lib/beachFilters';
import { getLatestCrowdLevels } from '@/lib/queries';
import type { MapFocus } from './MapView';
import FilterBar from './FilterBar';
import BeachList from './BeachList';
import BeachDetailPanel from './BeachDetailPanel';

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

  const [filters, setFilters] = useState<BeachFilterState>(EMPTY_FILTERS);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearActive, setNearActive] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [crowdLevels, setCrowdLevels] = useState<Record<string, CrowdLevel>>({});
  const hydratedRef = useRef(false);

  // Zadnje razine gužve (za bojanje markera na karti), osvježavanje svakih 60 s.
  useEffect(() => {
    let active = true;
    const load = () => {
      getLatestCrowdLevels()
        .then((levels) => {
          if (active) setCrowdLevels(levels);
        })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  // URL → stanje (mount + back/forward): filteri + odabrana plaža su dijeljivi.
  useEffect(() => {
    const readUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setFilters(filtersFromSearchParams(params));
      const slug = params.get('plaza');
      const b = slug ? beaches.find((x) => x.slug === slug) : null;
      setSelectedId(b?.id ?? null);
      if (b) setFocus({ lng: b.lng, lat: b.lat, zoom: 14, nonce: Date.now() });
      hydratedRef.current = true;
    };
    readUrl();
    window.addEventListener('popstate', readUrl);
    return () => window.removeEventListener('popstate', readUrl);
  }, [beaches]);

  // Stanje → URL (nakon hidracije): replaceState da ne zatrpava povijest.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const params = filtersToSearchParams(filters);
    if (selectedId) {
      const b = beaches.find((x) => x.id === selectedId);
      if (b) params.set('plaza', b.slug);
    }
    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  }, [filters, selectedId, beaches]);

  const filtered = useMemo(() => filterBeaches(beaches, filters), [beaches, filters]);

  const listBeaches = useMemo(() => {
    if (nearActive && userLocation) {
      return sortByDistance(filtered, userLocation.lat, userLocation.lng);
    }
    return sortByPopularity(filtered, locale); // default: najpopularnije prvo (0009)
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
      {/* Zona 1 — lista (Google-Maps stil: rezultati lijevo) */}
      <aside className="flex min-h-0 flex-1 flex-col bg-white md:h-full md:w-[360px] md:flex-none md:border-r md:border-sea-100">
        <header className="flex items-center justify-between border-b border-sea-100 px-4 py-3">
          <span className="text-lg font-semibold tracking-tight text-sea-950">
            Plaža<span className="text-sea-600">Info</span>
          </span>
          <nav className="flex items-center gap-2 text-xs text-sea-800/70">
            <Link
              href="/prijava"
              className="rounded-full bg-sea-600 px-2.5 py-1 font-medium text-white hover:bg-sea-800"
            >
              {t('submitBeach')}
            </Link>
            <span className="text-sea-800/40">|</span>
            <Link href="/" locale="hr" className="hover:underline">
              HR
            </Link>
            <span>·</span>
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
          onToggleAmenity={(am: AmenityFilter) =>
            setFilters((f) => ({ ...f, amenities: toggle(f.amenities, am) }))
          }
          onSetMinRating={(r: number) => setFilters((f) => ({ ...f, minRating: r }))}
          onToggleSeaAssessment={(s: SeaAssessment) =>
            setFilters((f) => ({ ...f, seaAssessments: toggle(f.seaAssessments, s) }))
          }
          onReset={handleReset}
          onNearMe={handleNearMe}
          nearActive={nearActive}
          locating={locating}
          geoError={geoError}
          resultCount={filtered.length}
        />

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

      {/* Zona 2 — detalj-panel (treći stupac desktop; preko liste na mobitelu) */}
      {selectedBeach && (
        <section
          aria-label={beachName(selectedBeach, locale)}
          className="fixed inset-0 z-40 flex flex-col bg-white md:static md:z-auto md:h-full md:w-[400px] md:flex-none md:border-r md:border-sea-100"
        >
          <BeachDetailPanel
            key={selectedBeach.id}
            beach={selectedBeach}
            locale={locale}
            variant="panel"
            distanceKm={selectedDistance}
            onClose={() => setSelectedId(null)}
          />
        </section>
      )}

      {/* Zona 3 — karta */}
      <div className="h-[45vh] w-full shrink-0 md:h-full md:flex-1">
        <MapView
          beaches={filtered}
          crowdLevels={crowdLevels}
          selectedId={selectedId}
          onSelect={handleSelect}
          focus={focus}
          userLocation={userLocation}
        />
      </div>
    </main>
  );
}
