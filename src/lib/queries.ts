// PlažaInfo — dohvat plaža (server + klijent kompatibilno; koristi anon Supabase klijent).
import { supabase } from './supabase';
import {
  dbToBeach,
  type Beach,
  type BeachRow,
  type CrowdLevel,
  type SeaAssessment,
} from './beaches';

/** Zadnji službeni uzorak kakvoće mora (IZOR) za jednu plažu. */
export interface SeaQualitySample {
  assessment: SeaAssessment | null;
  sampledAt: string; // YYYY-MM-DD
  seaTemp: number | null;
  source: string;
}

/**
 * Sve plaže iz `beaches_geo` viewa (statični podaci + lat/lng).
 * Za pilot regiju skup je malen (~70), pa učitavamo sve i filtriramo/sortiramo na klijentu.
 * Vraća [] ako Supabase nije konfiguriran (npr. prije nego env zaživi) — UI to elegantno pokrije.
 */
export async function getBeaches(): Promise<Beach[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('beaches_geo')
    .select(BEACH_COLUMNS)
    .order('name_hr', { ascending: true });

  if (error) {
    console.error('[queries] getBeaches:', error.message);
    return [];
  }
  return (data as BeachRow[]).map(dbToBeach);
}

// Zajednički skup stupaca za `beaches_geo` (statični podaci + lat/lng).
const BEACH_COLUMNS =
  'id, slug, name_hr, name_en, lat, lng, region, municipality, surface_type, length_m, orientation, description_hr, description_en, izor_point_id, osm_id, amenities, flags, rating_avg, rating_count, sea_assessment, parking_lat, parking_lng, parking_distance_m';

/**
 * Slugovi svih plaža — lagani dohvat za `generateStaticParams` detalj-stranice.
 * Vraća [] ako Supabase nije konfiguriran.
 */
export async function getBeachSlugs(): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('beaches_geo').select('slug');
  if (error) {
    console.error('[queries] getBeachSlugs:', error.message);
    return [];
  }
  return (data as { slug: string }[]).map((r) => r.slug);
}

/**
 * Jedna plaža po slugu (za detalj-stranicu). Vraća null ako ne postoji ili Supabase nije konfiguriran.
 */
export async function getBeachBySlug(slug: string): Promise<Beach | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('beaches_geo')
    .select(BEACH_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('[queries] getBeachBySlug:', error.message);
    return null;
  }
  return data ? dbToBeach(data as BeachRow) : null;
}

/**
 * Zadnji službeni uzorak kakvoće mora za plažu (IZOR). Najnoviji po `sampled_at`.
 * Vraća null ako nema podatka ili Supabase nije konfiguriran. Anon smije čitati (public read policy).
 */
export async function getBeachSeaQuality(
  beachId: string,
): Promise<SeaQualitySample | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('sea_quality')
    .select('assessment, sampled_at, sea_temp, source')
    .eq('beach_id', beachId)
    .order('sampled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[queries] getBeachSeaQuality:', error.message);
    return null;
  }
  if (!data) return null;
  const row = data as {
    assessment: SeaAssessment | null;
    sampled_at: string;
    sea_temp: number | null;
    source: string;
  };
  return {
    assessment: row.assessment,
    sampledAt: row.sampled_at,
    seaTemp: row.sea_temp,
    source: row.source,
  };
}

/**
 * Zadnja prijavljena razina gužve po plaži (RPC `latest_crowd_levels`, default prozor 2h).
 * Vraća mapu beachId → razina. Prazno ako nema prijava ili Supabase nije konfiguriran.
 */
export async function getLatestCrowdLevels(): Promise<Record<string, CrowdLevel>> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc('latest_crowd_levels', {});
  if (error) {
    console.error('[queries] getLatestCrowdLevels:', error.message);
    return {};
  }
  const map: Record<string, CrowdLevel> = {};
  for (const row of (data ?? []) as { beach_id: string; level: CrowdLevel }[]) {
    map[row.beach_id] = row.level;
  }
  return map;
}

/** Odobrena korisnička recenzija plaže (javno vidljiva). */
export interface BeachReview {
  id: string;
  rating: number; // 1–5
  body: string | null;
  createdAt: string; // ISO timestamptz
}

/**
 * Odobrene recenzije za plažu (najnovije prve). Anon smije čitati samo `approved`
 * (RLS policy). Vraća [] ako nema odobrenih ili Supabase nije konfiguriran.
 */
export async function getBeachReviews(beachId: string): Promise<BeachReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, body, created_at')
    .eq('beach_id', beachId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[queries] getBeachReviews:', error.message);
    return [];
  }
  return (data as { id: string; rating: number; body: string | null; created_at: string }[]).map(
    (r) => ({ id: r.id, rating: r.rating, body: r.body, createdAt: r.created_at }),
  );
}

export interface BeachPhoto {
  id: string;
  url: string;
  source: string; // 'user' | 'wikimedia' | 'mapillary'
  attribution: string | null; // autor/izvor (obavezno za CC-seedane slike)
  license: string | null; // npr. 'CC BY-SA 4.0'
}

type PhotoRow = {
  id: string;
  url: string;
  source?: string | null;
  attribution?: string | null;
  license?: string | null;
};

function rowToPhoto(p: PhotoRow): BeachPhoto {
  return {
    id: p.id,
    url: p.url,
    source: p.source ?? 'user',
    attribution: p.attribution ?? null,
    license: p.license ?? null,
  };
}

const PHOTO_COLUMNS = 'id, url, source, attribution, license';

/**
 * Odobrene fotke za plažu (najnovije prve). Anon smije čitati samo `approved` ili
 * `is_official` (RLS policy). Vraća [] ako nema odobrenih ili Supabase nije konfiguriran.
 */
export async function getBeachPhotos(beachId: string): Promise<BeachPhoto[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_COLUMNS)
    .eq('beach_id', beachId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('[queries] getBeachPhotos:', error.message);
    return [];
  }
  return (data as PhotoRow[]).map(rowToPhoto);
}

/**
 * Najnovija odobrena fotka plaže (za hero/OG sliku), ili null.
 * Lagani upit (limit 1) — koristi ga `generateMetadata` da OG slika ne povuče cijelu galeriju.
 */
export async function getBeachHeroPhoto(beachId: string): Promise<BeachPhoto | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_COLUMNS)
    .eq('beach_id', beachId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[queries] getBeachHeroPhoto:', error.message);
    return null;
  }
  return data ? rowToPhoto(data as PhotoRow) : null;
}
