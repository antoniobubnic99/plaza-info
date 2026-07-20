// PlažaInfo — čiste funkcije za filtriranje/sortiranje plaža i vizualne oznake.
// Bez React/DOM ovisnosti — lako testabilno i dijeljeno između liste i karte.
import { beachName, type Beach, type CrowdLevel, type SurfaceType } from './beaches';

export const SURFACE_TYPES: SurfaceType[] = ['sand', 'pebble', 'rock', 'concrete'];

// Filtrabilne zastavice (podskup BeachFlags koje seed/OSM stvarno puni + korisne).
export const FILTER_FLAGS = ['dogs', 'nudist', 'accessible'] as const;
export type FilterFlag = (typeof FILTER_FLAGS)[number];

// Boje markera po podlozi — usklađene s jadranskom paletom (globals.css).
const SURFACE_COLORS: Record<SurfaceType, string> = {
  sand: '#e0b84c',
  pebble: '#9aa0a6',
  rock: '#5b6b7a',
  concrete: '#94a3b8',
};
const UNKNOWN_SURFACE_COLOR = '#1f7fd4'; // sea-600

export function surfaceColor(surface: SurfaceType | null): string {
  return surface ? SURFACE_COLORS[surface] : UNKNOWN_SURFACE_COLOR;
}

// Boje gužve — usklađene s tokenima --color-crowd-* u globals.css.
const CROWD_COLORS: Record<CrowdLevel, string> = {
  empty: '#10a37f',
  moderate: '#c8860b',
  packed: '#c0392b',
};

export function crowdColor(level: CrowdLevel): string {
  return CROWD_COLORS[level];
}

/** Boja markera: gužva ima prednost (aktualnija), inače podloga. */
export function markerColor(
  surface: SurfaceType | null,
  crowd: CrowdLevel | undefined,
): string {
  return crowd ? crowdColor(crowd) : surfaceColor(surface);
}

export interface BeachFilterState {
  query: string;
  surfaces: SurfaceType[];
  flags: FilterFlag[];
}

export const EMPTY_FILTERS: BeachFilterState = {
  query: '',
  surfaces: [],
  flags: [],
};

export function hasActiveFilters(f: BeachFilterState): boolean {
  return f.query.trim() !== '' || f.surfaces.length > 0 || f.flags.length > 0;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function filterBeaches(
  beaches: Beach[],
  filters: BeachFilterState,
): Beach[] {
  const q = normalize(filters.query);
  return beaches.filter((b) => {
    if (q) {
      const haystack = normalize(
        `${b.nameHr} ${b.nameEn ?? ''} ${b.municipality ?? ''} ${b.region ?? ''}`,
      );
      if (!haystack.includes(q)) return false;
    }
    if (filters.surfaces.length > 0) {
      if (!b.surfaceType || !filters.surfaces.includes(b.surfaceType)) return false;
    }
    for (const flag of filters.flags) {
      if (!b.flags[flag]) return false;
    }
    return true;
  });
}

// Haversine udaljenost u kilometrima.
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface BeachWithDistance extends Beach {
  distanceKm: number;
}

/** Sortira po udaljenosti od zadane točke (najbliže prvo). */
export function sortByDistance(
  beaches: Beach[],
  fromLat: number,
  fromLng: number,
): BeachWithDistance[] {
  return beaches
    .map((b) => ({
      ...b,
      distanceKm: haversineKm(fromLat, fromLng, b.lat, b.lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Sortira abecedno po imenu u zadanom jeziku. */
export function sortByName(beaches: Beach[], locale: string): Beach[] {
  return [...beaches].sort((a, b) =>
    beachName(a, locale).localeCompare(beachName(b, locale), locale),
  );
}

/** Formatira udaljenost za prikaz (m ispod 1 km, inače 1 decimala km). */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
