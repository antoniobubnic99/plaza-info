// PlažaInfo — dohvat plaža (server + klijent kompatibilno; koristi anon Supabase klijent).
import { supabase } from './supabase';
import { dbToBeach, type Beach, type BeachRow } from './beaches';

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
