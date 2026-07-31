// Indeks mjesta za pretragu u stilu karata: uz same plaže nudi i županije i mjesta,
// izračunate iz već učitanih podataka. Namjerno BEZ vanjskog geokodera — `region` i
// `municipality` već stoje uz svaku plažu, pa je pretraga besplatna, trenutna i radi offline.
import { beachName, type Beach } from './beaches';

export type PlaceKind = 'beach' | 'municipality' | 'region';

export interface PlaceSuggestion {
  kind: PlaceKind;
  /** Tekst koji korisnik vidi (naziv plaže / mjesta / županije). */
  label: string;
  /** Dodatni kontekst u prijedlogu (npr. županija ispod mjesta). */
  context: string | null;
  /** Središte: za plažu njezina točka, za mjesto/županiju prosjek njihovih plaža. */
  lat: number;
  lng: number;
  /** Broj plaža (samo za mjesto/županiju) — pomaže rangirati veća mjesta gore. */
  count: number;
  /** Id plaže kad je kind === 'beach' (za izravni odabir). */
  beachId?: string;
}

/** Bez dijakritike i malim slovima — „Šibenik" se nađe i upisom „sibenik". */
export function normalizePlace(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

interface Cluster {
  label: string;
  context: string | null;
  latSum: number;
  lngSum: number;
  count: number;
}

function addToCluster(map: Map<string, Cluster>, label: string, context: string | null, b: Beach) {
  const key = normalizePlace(label);
  const existing = map.get(key);
  if (existing) {
    existing.latSum += b.lat;
    existing.lngSum += b.lng;
    existing.count += 1;
    return;
  }
  map.set(key, { label, context, latSum: b.lat, lngSum: b.lng, count: 1 });
}

function clustersToSuggestions(map: Map<string, Cluster>, kind: PlaceKind): PlaceSuggestion[] {
  return [...map.values()].map((c) => ({
    kind,
    label: c.label,
    context: c.context,
    lat: c.latSum / c.count,
    lng: c.lngSum / c.count,
    count: c.count,
  }));
}

export interface PlaceIndex {
  regions: PlaceSuggestion[];
  municipalities: PlaceSuggestion[];
}

/** Gradi indeks županija i mjesta iz popisa plaža (centroid = prosjek koordinata). */
export function buildPlaceIndex(beaches: Beach[]): PlaceIndex {
  const regions = new Map<string, Cluster>();
  const municipalities = new Map<string, Cluster>();
  for (const b of beaches) {
    if (b.region) addToCluster(regions, b.region, null, b);
    if (b.municipality) addToCluster(municipalities, b.municipality, b.region, b);
  }
  return {
    regions: clustersToSuggestions(regions, 'region'),
    municipalities: clustersToSuggestions(municipalities, 'municipality'),
  };
}

const MAX_PER_GROUP = { region: 3, municipality: 4, beach: 5 } as const;

/**
 * Prijedlozi za upisani tekst, poredani: županije → mjesta → plaže.
 * Rangiranje unutar skupine: poklapanje na početku naziva ide ispred poklapanja u sredini,
 * zatim veći broj plaža (veće mjesto je vjerojatnija namjera).
 */
export function suggestPlaces(
  query: string,
  index: PlaceIndex,
  beaches: Beach[],
  locale: string,
): PlaceSuggestion[] {
  const q = normalizePlace(query);
  if (q.length < 2) return [];

  const rank = (label: string, count: number): number => {
    const n = normalizePlace(label);
    if (!n.includes(q)) return -1;
    return (n.startsWith(q) ? 1000 : 0) + Math.min(count, 999);
  };

  const pick = (items: PlaceSuggestion[], limit: number): PlaceSuggestion[] =>
    items
      .map((s) => ({ s, score: rank(s.label, s.count) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.s);

  const beachHits: PlaceSuggestion[] = beaches
    .map((b) => {
      const label = beachName(b, locale);
      return { b, label, score: rank(label, 0) };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PER_GROUP.beach)
    .map(({ b, label }) => ({
      kind: 'beach' as const,
      label,
      context: b.municipality ?? b.region,
      lat: b.lat,
      lng: b.lng,
      count: 0,
      beachId: b.id,
    }));

  return [
    ...pick(index.regions, MAX_PER_GROUP.region),
    ...pick(index.municipalities, MAX_PER_GROUP.municipality),
    ...beachHits,
  ];
}
