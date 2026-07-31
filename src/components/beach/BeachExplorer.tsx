'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  beachName,
  PARKING_FEE_STATUSES,
  type Beach,
  type CrowdLevel,
  type SeaAssessment,
  type SurfaceType,
} from '@/lib/beaches';
import {
  CROWD_LEVELS,
  EMPTY_FILTERS,
  crowdColor,
  filterBeaches,
  filtersFromSearchParams,
  filtersToSearchParams,
  haversineKm,
  parkingFeeColor,
  sortByDistance,
  sortByPopularity,
  type AmenityFilter,
  type BeachFilterState,
  type FilterFlag,
} from '@/lib/beachFilters';
import { getLatestCrowdLevels } from '@/lib/queries';
import { locateOnce } from '@/lib/geolocate';
import { buildPlaceIndex, suggestPlaces, type PlaceSuggestion } from '@/lib/placeIndex';
import type { MapFocus } from './MapView';
import FilterBar from './FilterBar';
import BeachList from './BeachList';
import BeachDetailPanel from './BeachDetailPanel';
import ParkingDetailPanel from './ParkingDetailPanel';

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
  const tCrowd = useTranslations('Crowd');
  const tParking = useTranslations('Parking');

  const [filters, setFilters] = useState<BeachFilterState>(EMPTY_FILTERS);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearActive, setNearActive] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Isti odabir, dvije vrste panela: klik na marker plaže vs. klik na „P" marker (stavka 5).
  // Parking nije zaseban entitet nego dio plaže, pa dijeli `selectedId`.
  const [selectedKind, setSelectedKind] = useState<'beach' | 'parking'>('beach');
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [crowdLevels, setCrowdLevels] = useState<Record<string, CrowdLevel>>({});
  // Središte odabranog mjesta iz pretrage (mjesto/županija) — sidro za sortiranje po blizini.
  const [placeAnchor, setPlaceAnchor] = useState<{ lat: number; lng: number } | null>(null);
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
      // `parking=1` je valjan samo ako plaža stvarno ima parking (ručno složen URL).
      const wantsParking = params.get('parking') === '1' && b?.parkingLat != null;
      setSelectedKind(wantsParking ? 'parking' : 'beach');
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
      if (selectedKind === 'parking') params.set('parking', '1');
    }
    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  }, [filters, selectedId, selectedKind, beaches]);

  const filtered = useMemo(
    () => filterBeaches(beaches, filters, crowdLevels),
    [beaches, filters, crowdLevels],
  );

  // Indeks županija/mjesta iz učitanih plaža — gradi se jednom, bez vanjskog geokodera.
  const placeIndex = useMemo(() => buildPlaceIndex(beaches), [beaches]);
  const suggestions = useMemo(
    () => suggestPlaces(filters.query, placeIndex, beaches, locale),
    [filters.query, placeIndex, beaches, locale],
  );

  const listBeaches = useMemo(() => {
    // Odabrano mjesto iz pretrage („u blizini grada Zadra") sortira po udaljenosti
    // od njegova središta; korisnikova lokacija ima prednost ako je aktivna.
    const anchor = nearActive && userLocation ? userLocation : placeAnchor;
    if (anchor) return sortByDistance(filtered, anchor.lat, anchor.lng);
    return sortByPopularity(filtered, locale); // default: najpopularnije prvo (0009)
  }, [filtered, nearActive, userLocation, placeAnchor, locale]);

  const selectedBeach = useMemo(
    () => beaches.find((b) => b.id === selectedId) ?? null,
    [beaches, selectedId],
  );

  function handleSelect(id: string) {
    setSelectedId(id);
    setSelectedKind('beach');
    const b = beaches.find((x) => x.id === id);
    if (b) setFocus({ lng: b.lng, lat: b.lat, zoom: 14, nonce: Date.now() });
  }

  /** Klik na „P" marker: otvara panel parkinga i zumira na sam parking. */
  function handleSelectParking(id: string) {
    const b = beaches.find((x) => x.id === id);
    if (!b || b.parkingLat == null || b.parkingLng == null) return;
    setSelectedId(id);
    setSelectedKind('parking');
    setFocus({ lng: b.parkingLng, lat: b.parkingLat, zoom: 16, nonce: Date.now() });
  }

  async function handleNearMe() {
    setLocating(true);
    setGeoError(null);
    try {
      const loc = await locateOnce();
      setUserLocation(loc);
      setNearActive(true);
      setFocus({ lng: loc.lng, lat: loc.lat, zoom: 12, nonce: Date.now() });
    } catch (reason) {
      setGeoError(reason === 'unsupported' ? t('geoUnsupported') : t('geoError'));
    } finally {
      setLocating(false);
    }
  }

  /**
   * Odabir iz prijedloga pretrage:
   * - plaža → otvori je,
   * - mjesto → zumiraj i poredaj po blizini tog mjesta (upit se briše da ne filtrira dvaput),
   * - županija → tvrdi filter po županiji.
   */
  function handlePickSuggestion(s: PlaceSuggestion) {
    if (s.kind === 'beach' && s.beachId) {
      setFilters((f) => ({ ...f, query: '' }));
      handleSelect(s.beachId);
      return;
    }
    if (s.kind === 'municipality') {
      setFilters((f) => ({ ...f, query: '' }));
      setPlaceAnchor({ lat: s.lat, lng: s.lng });
      setFocus({ lng: s.lng, lat: s.lat, zoom: 12, nonce: Date.now() });
      return;
    }
    setFilters((f) => ({ ...f, query: '', region: s.label }));
    setPlaceAnchor(null);
    setFocus({ lng: s.lng, lat: s.lat, zoom: 9, nonce: Date.now() });
  }

  function handleClearRegion() {
    setFilters((f) => ({ ...f, region: null }));
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS);
    setNearActive(false);
    setPlaceAnchor(null);
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
          onToggleCrowd={(c: CrowdLevel) =>
            setFilters((f) => ({ ...f, crowds: toggle(f.crowds, c) }))
          }
          suggestions={suggestions}
          onPickSuggestion={handlePickSuggestion}
          onClearRegion={handleClearRegion}
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
            showDistance={(nearActive && userLocation != null) || placeAnchor != null}
            crowdLevels={crowdLevels}
          />
        </div>
      </aside>

      {/* Zona 2 — detalj-panel (treći stupac desktop; preko liste na mobitelu) */}
      {selectedBeach && (
        <section
          aria-label={beachName(selectedBeach, locale)}
          className="fixed inset-0 z-40 flex flex-col bg-white md:static md:z-auto md:h-full md:w-[400px] md:flex-none md:border-r md:border-sea-100"
        >
          {selectedKind === 'parking' ? (
            <ParkingDetailPanel
              key={`${selectedBeach.id}-parking`}
              beach={selectedBeach}
              locale={locale}
              onClose={() => setSelectedId(null)}
              onOpenBeach={() => handleSelect(selectedBeach.id)}
            />
          ) : (
            <BeachDetailPanel
              key={selectedBeach.id}
              beach={selectedBeach}
              locale={locale}
              variant="panel"
              distanceKm={selectedDistance}
              onClose={() => setSelectedId(null)}
            />
          )}
        </section>
      )}

      {/* Zona 3 — karta */}
      <div className="relative h-[45vh] w-full shrink-0 md:h-full md:flex-1">
        <MapView
          beaches={filtered}
          crowdLevels={crowdLevels}
          selectedId={selectedKind === 'beach' ? selectedId : null}
          onSelect={handleSelect}
          focus={focus}
          userLocation={userLocation}
          onSelectParking={handleSelectParking}
          selectedParkingId={selectedKind === 'parking' ? selectedId : null}
        />
        {/* Legenda: bez nje se ne vidi da boja markera znači gužvu, a ne podlogu. */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg bg-white/90 px-3 py-2 text-xs shadow-md backdrop-blur">
          <p className="mb-1 font-semibold text-sea-950">{t('crowdLegend')}</p>
          <ul className="flex gap-3">
            {CROWD_LEVELS.map((lvl) => (
              <li key={lvl} className="flex items-center gap-1.5 text-sea-800/80">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full ring-1 ring-white"
                  style={{ background: crowdColor(lvl) }}
                />
                {tCrowd(lvl)}
              </li>
            ))}
          </ul>
          {/* Parking markeri („P") sad nose naplatu bojom — bez legende to nitko ne pogodi. */}
          <p className="mb-1 mt-2 font-semibold text-sea-950">{tParking('legend')}</p>
          <ul className="flex gap-3">
            {PARKING_FEE_STATUSES.map((s) => (
              <li key={s} className="flex items-center gap-1.5 text-sea-800/80">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-sm ring-1 ring-white"
                  style={{ background: parkingFeeColor(s) }}
                />
                {tParking(`fee_${s}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
