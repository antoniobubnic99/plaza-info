-- PlažaInfo — pomoćne funkcije za seed (Faza 1).
-- upsert_beach: umeće/ažurira plažu, gradi PostGIS geografiju iz lat/lng.
-- Poziva se ISKLJUČIVO service role ključem iz seed skripte (ne anon/authenticated).

create or replace function upsert_beach(
  p_slug text,
  p_name_hr text,
  p_name_en text,
  p_lat double precision,
  p_lng double precision,
  p_region text,
  p_municipality text,
  p_surface surface_type,
  p_izor_point_id text,
  p_osm_id text,
  p_amenities jsonb,
  p_flags jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into beaches (
    slug, name_hr, name_en, location, region, municipality,
    surface_type, izor_point_id, osm_id, amenities, flags
  ) values (
    p_slug, p_name_hr, p_name_en,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_region, p_municipality, p_surface, p_izor_point_id, p_osm_id,
    coalesce(p_amenities, '{}'::jsonb), coalesce(p_flags, '{}'::jsonb)
  )
  on conflict (slug) do update set
    name_hr = excluded.name_hr,
    name_en = excluded.name_en,
    location = excluded.location,
    region = excluded.region,
    municipality = excluded.municipality,
    surface_type = excluded.surface_type,
    izor_point_id = excluded.izor_point_id,
    osm_id = excluded.osm_id,
    amenities = excluded.amenities,
    flags = excluded.flags
  returning id into v_id;
  return v_id;
end;
$$;

-- Ukloni default execute za sve i vrati samo service role (seed).
revoke all on function upsert_beach(
  text, text, text, double precision, double precision, text, text,
  surface_type, text, text, jsonb, jsonb
) from public;
grant execute on function upsert_beach(
  text, text, text, double precision, double precision, text, text,
  surface_type, text, text, jsonb, jsonb
) to service_role;
