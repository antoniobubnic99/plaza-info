// Domenski tipovi i mapperi za plaže. Jezično neutralno spremanje; UI prevodi preko next-intl.

export type SurfaceType = 'sand' | 'pebble' | 'rock' | 'concrete';
export type SeaAssessment = 'excellent' | 'good' | 'satisfactory' | 'unsatisfactory';
export type CrowdLevel = 'empty' | 'moderate' | 'packed';

export interface BeachAmenities {
  showers?: boolean;
  wc?: boolean;
  bar?: boolean;
  loungers?: boolean;
  rentals?: string[];
  lifeguard?: boolean;
}

export interface BeachFlags {
  sandy?: boolean;
  shade?: boolean;
  dogs?: boolean;
  nudist?: boolean;
  accessible?: boolean;
  shallow?: boolean;
  parking?: boolean;
  vibe?: 'calm' | 'party';
}

export interface Beach {
  id: string;
  slug: string;
  nameHr: string;
  nameEn: string | null;
  lat: number;
  lng: number;
  region: string | null;
  municipality: string | null;
  surfaceType: SurfaceType | null;
  lengthM: number | null;
  orientation: string | null;
  descriptionHr: string | null;
  descriptionEn: string | null;
  izorPointId: string | null;
  osmId: string | null;
  amenities: BeachAmenities;
  flags: BeachFlags;
  ratingAvg: number; // 0 kad nema odobrenih recenzija (agregat iz beaches_geo)
  ratingCount: number;
}

/** Red iz `beaches_geo` viewa ili `beaches_near` funkcije. */
export interface BeachRow {
  id: string;
  slug: string;
  name_hr: string;
  name_en: string | null;
  lat: number;
  lng: number;
  region: string | null;
  municipality: string | null;
  surface_type: SurfaceType | null;
  length_m?: number | null;
  orientation?: string | null;
  description_hr?: string | null;
  description_en?: string | null;
  izor_point_id?: string | null;
  osm_id?: string | null;
  amenities: BeachAmenities | null;
  flags: BeachFlags | null;
  rating_avg?: number | string | null; // numeric dolazi kao string preko PostgREST-a
  rating_count?: number | null;
}

export function dbToBeach(row: BeachRow): Beach {
  return {
    id: row.id,
    slug: row.slug,
    nameHr: row.name_hr,
    nameEn: row.name_en,
    lat: row.lat,
    lng: row.lng,
    region: row.region,
    municipality: row.municipality,
    surfaceType: row.surface_type,
    lengthM: row.length_m ?? null,
    orientation: row.orientation ?? null,
    descriptionHr: row.description_hr ?? null,
    descriptionEn: row.description_en ?? null,
    izorPointId: row.izor_point_id ?? null,
    osmId: row.osm_id ?? null,
    amenities: row.amenities ?? {},
    flags: row.flags ?? {},
    ratingAvg: row.rating_avg != null ? Number(row.rating_avg) : 0,
    ratingCount: row.rating_count ?? 0,
  };
}

/** Naziv plaže po jeziku (EN pada natrag na HR). */
export function beachName(beach: Beach, locale: string): string {
  if (locale === 'en') return beach.nameEn ?? beach.nameHr;
  return beach.nameHr;
}
