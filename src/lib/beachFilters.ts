// PlažaInfo — čiste funkcije za filtriranje/sortiranje plaža i vizualne oznake.
// Bez React/DOM ovisnosti — lako testabilno i dijeljeno između liste i karte.
import {
  beachName,
  type Beach,
  type CrowdLevel,
  type SeaAssessment,
  type SurfaceType,
} from './beaches';

export const SURFACE_TYPES: SurfaceType[] = ['sand', 'pebble', 'rock', 'concrete'];

// Filtrabilne zastavice (podskup BeachFlags koje seed/OSM stvarno puni + korisne).
export const FILTER_FLAGS = ['dogs', 'nudist', 'accessible'] as const;
export type FilterFlag = (typeof FILTER_FLAGS)[number];

// Filtrabilni sadržaji (booleani iz BeachAmenities; bez `rentals` koji je lista).
export const AMENITY_FILTERS = ['showers', 'wc', 'bar', 'loungers', 'lifeguard'] as const;
export type AmenityFilter = (typeof AMENITY_FILTERS)[number];

// Pragovi za „min rejting" dropdown (koristi agregat rating_avg iz 0005).
export const RATING_OPTIONS = [3, 4, 4.5] as const;

// Filtrabilne ocjene kakvoće mora (zadnji IZOR uzorak, sea_assessment iz 0008).
export const SEA_ASSESSMENTS: SeaAssessment[] = [
  'excellent',
  'good',
  'satisfactory',
  'unsatisfactory',
];

// Filtrabilne razine gužve (zadnja crowdsourced prijava, RPC latest_crowd_levels).
export const CROWD_LEVELS: CrowdLevel[] = ['empty', 'moderate', 'packed'];

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

// Boje ocjene kakvoće mora (IZOR) — od izvrsne (plavo-zelena) do nezadovoljavajuće (crvena).
const SEA_QUALITY_COLORS: Record<SeaAssessment, string> = {
  excellent: '#0d9488',
  good: '#10a37f',
  satisfactory: '#c8860b',
  unsatisfactory: '#c0392b',
};

export function seaQualityColor(assessment: SeaAssessment): string {
  return SEA_QUALITY_COLORS[assessment];
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
  amenities: AmenityFilter[];
  minRating: number; // 0 = bilo koji; inače prag na rating_avg
  seaAssessments: SeaAssessment[]; // prazno = bilo koja; inače OR po zadnjoj IZOR ocjeni
  crowds: CrowdLevel[]; // prazno = bilo koja; inače OR po zadnjoj prijavi gužve
}

export const EMPTY_FILTERS: BeachFilterState = {
  query: '',
  surfaces: [],
  flags: [],
  amenities: [],
  minRating: 0,
  seaAssessments: [],
  crowds: [],
};

export function hasActiveFilters(f: BeachFilterState): boolean {
  return (
    f.query.trim() !== '' ||
    f.surfaces.length > 0 ||
    f.flags.length > 0 ||
    f.amenities.length > 0 ||
    f.minRating > 0 ||
    f.seaAssessments.length > 0 ||
    f.crowds.length > 0
  );
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
  crowdLevels: Record<string, CrowdLevel> = {},
): Beach[] {
  const q = normalize(filters.query);
  return beaches.filter((b) => {
    if (q) {
      const haystack = normalize(
        `${b.nameHr} ${b.nameEn ?? ''} ${b.municipality ?? ''} ${b.region ?? ''}`,
      );
      if (!haystack.includes(q)) return false;
    }
    // Kategorijski dropdown (podloga): isključi SAMO ako plaža ima poznatu vrijednost
    // koja se ne poklapa. Nepoznato (null) ostaje vidljivo — nepoznato ≠ negativno.
    if (filters.surfaces.length > 0) {
      if (b.surfaceType && !filters.surfaces.includes(b.surfaceType)) return false;
    }
    // Sadržaji/oznake su prisutnost-filtri: izostanak oznake znači „nema tog sadržaja".
    for (const flag of filters.flags) {
      if (!b.flags[flag]) return false;
    }
    for (const amenity of filters.amenities) {
      if (!b.amenities[amenity]) return false;
    }
    // Rejting: plaža BEZ ijedne ocjene nije loša plaža, samo neocijenjena — ne ispada
    // iz rezultata (isto načelo kao podloga/kakvoća mora). Prag se primjenjuje tek
    // kad postoji barem jedna odobrena recenzija.
    if (filters.minRating > 0 && b.ratingCount > 0 && b.ratingAvg < filters.minRating) {
      return false;
    }
    // Kakvoća mora (kategorijski): isto kao podloga — nepoznata ocjena ostaje vidljiva.
    if (filters.seaAssessments.length > 0) {
      if (b.seaAssessment && !filters.seaAssessments.includes(b.seaAssessment)) {
        return false;
      }
    }
    // Gužva (kategorijski): plaže bez ijedne prijave ostaju vidljive — nepoznato ≠ negativno.
    if (filters.crowds.length > 0) {
      const level = crowdLevels[b.id];
      if (level && !filters.crowds.includes(level)) return false;
    }
    return true;
  });
}

// URL search-params serijalizacija filtera (dijeljivo stanje). Prazne vrijednosti se izostavljaju.
export function filtersToSearchParams(f: BeachFilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.query.trim()) p.set('q', f.query.trim());
  if (f.surfaces.length) p.set('surface', f.surfaces.join(','));
  if (f.flags.length) p.set('flag', f.flags.join(','));
  if (f.amenities.length) p.set('amenity', f.amenities.join(','));
  if (f.minRating > 0) p.set('rating', String(f.minRating));
  if (f.seaAssessments.length) p.set('sea', f.seaAssessments.join(','));
  if (f.crowds.length) p.set('crowd', f.crowds.join(','));
  return p;
}

export function filtersFromSearchParams(p: URLSearchParams): BeachFilterState {
  const csv = <T extends string>(key: string, allowed: readonly T[]): T[] => {
    const raw = p.get(key);
    if (!raw) return [];
    return raw.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
  };
  const rating = Number(p.get('rating'));
  return {
    query: p.get('q') ?? '',
    surfaces: csv('surface', SURFACE_TYPES),
    flags: csv('flag', FILTER_FLAGS),
    amenities: csv('amenity', AMENITY_FILTERS),
    minRating: RATING_OPTIONS.includes(rating as (typeof RATING_OPTIONS)[number]) ? rating : 0,
    seaAssessments: csv('sea', SEA_ASSESSMENTS),
    crowds: csv('crowd', CROWD_LEVELS),
  };
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

/**
 * Sortira po popularnosti (kombinirani signal iz beaches_geo, 0009) — najviše prvo.
 * Plaže bez ijednog signala (score 0) padnu na dno, ali ostaju u popisu.
 * Tie-break: abecedno po imenu, da je poredak stabilan i predvidiv.
 */
export function sortByPopularity(beaches: Beach[], locale: string): Beach[] {
  return [...beaches].sort((a, b) => {
    if (b.popularityScore !== a.popularityScore) {
      return b.popularityScore - a.popularityScore;
    }
    return beachName(a, locale).localeCompare(beachName(b, locale), locale);
  });
}

/** Formatira udaljenost za prikaz (m ispod 1 km, inače 1 decimala km). */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
