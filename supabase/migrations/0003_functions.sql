-- PlažaInfo — viewovi i funkcije (Faza 1).

-- Lat/lng izložen preko viewa; security_invoker => nasljeđuje RLS baznih tablica.
create view beaches_geo
with (security_invoker = true) as
select
  b.*,
  st_y(b.location::geometry) as lat,
  st_x(b.location::geometry) as lng
from beaches b;

grant select on beaches_geo to anon, authenticated;

-- "Plaže blizu mene": plaže unutar radijusa, sortirane po udaljenosti.
create or replace function beaches_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 20000,
  p_limit int default 50
)
returns table (
  id uuid,
  slug text,
  name_hr text,
  name_en text,
  lat double precision,
  lng double precision,
  surface_type surface_type,
  region text,
  municipality text,
  amenities jsonb,
  flags jsonb,
  distance_m double precision
)
language sql stable as $$
  select
    b.id, b.slug, b.name_hr, b.name_en,
    st_y(b.location::geometry), st_x(b.location::geometry),
    b.surface_type, b.region, b.municipality,
    b.amenities, b.flags,
    st_distance(b.location, st_point(p_lng, p_lat)::geography) as distance_m
  from beaches b
  where st_dwithin(b.location, st_point(p_lng, p_lat)::geography, p_radius_m)
  order by b.location <-> st_point(p_lng, p_lat)::geography
  limit p_limit;
$$;

-- Sažetak gužve po plaži (modalna razina u prozoru) — bez izlaganja sirovih prijava/koordinata.
create or replace function beach_crowd_summary(
  p_beach_id uuid,
  p_window interval default interval '2 hours'
)
returns table (level crowd_level, reports_count bigint, last_reported_at timestamptz)
language sql stable security definer set search_path = public as $$
  select cr.level, count(*), max(cr.created_at)
  from crowd_reports cr
  where cr.beach_id = p_beach_id and cr.created_at > now() - p_window
  group by cr.level
  order by count(*) desc
  limit 1;
$$;

-- Zadnja razina gužve za sve plaže (za bojanje markera na karti).
create or replace function latest_crowd_levels(
  p_window interval default interval '2 hours'
)
returns table (beach_id uuid, level crowd_level, last_reported_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (cr.beach_id) cr.beach_id, cr.level, cr.created_at
  from crowd_reports cr
  where cr.created_at > now() - p_window
  order by cr.beach_id, cr.created_at desc;
$$;

grant execute on function beaches_near(double precision, double precision, double precision, int) to anon, authenticated;
grant execute on function beach_crowd_summary(uuid, interval) to anon, authenticated;
grant execute on function latest_crowd_levels(interval) to anon, authenticated;
