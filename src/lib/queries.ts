// PlažaInfo — dohvat plaža (server + klijent kompatibilno; koristi anon Supabase klijent).
import { supabase } from './supabase';
import { dbToBeach, type Beach, type BeachRow, type CrowdLevel } from './beaches';

/**
 * Sve plaže iz `beaches_geo` viewa (statični podaci + lat/lng).
 * Za pilot regiju skup je malen (~70), pa učitavamo sve i filtriramo/sortiramo na klijentu.
 * Vraća [] ako Supabase nije konfiguriran (npr. prije nego env zaživi) — UI to elegantno pokrije.
 */
export async function getBeaches(): Promise<Beach[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('beaches_geo')
    .select(
      'id, slug, name_hr, name_en, lat, lng, region, municipality, surface_type, length_m, orientation, description_hr, description_en, izor_point_id, osm_id, amenities, flags',
    )
    .order('name_hr', { ascending: true });

  if (error) {
    console.error('[queries] getBeaches:', error.message);
    return [];
  }
  return (data as BeachRow[]).map(dbToBeach);
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
