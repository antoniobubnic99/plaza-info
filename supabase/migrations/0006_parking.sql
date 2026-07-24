-- PlažaInfo — parking točke po plaži (ROADMAP v2, Faza 5).
-- Popunjava scripts/seed-parking.ts (Overpass amenity=parking → najbliži + zračna udaljenost).
-- Primjenjuje se ISKLJUČIVO na Supabase projekt PlazaInfo (izolacija).

alter table beaches
  add column if not exists parking_lat double precision,
  add column if not exists parking_lng double precision,
  add column if not exists parking_distance_m integer;

-- beaches_geo je `select b.*` → nove kolone se NE pojave automatski; drop+recreate
-- ponovno raširi b.* (sad uključuje parking_*) i zadrži rating agregat iz 0005.
drop view if exists beaches_geo;

create view beaches_geo
with (security_invoker = true) as
select
  b.*,
  st_y(b.location::geometry) as lat,
  st_x(b.location::geometry) as lng,
  coalesce(r.rating_avg, 0)::numeric(3, 2) as rating_avg,
  coalesce(r.rating_count, 0)::int as rating_count
from beaches b
left join (
  select
    beach_id,
    avg(rating)::numeric(3, 2) as rating_avg,
    count(*) as rating_count
  from reviews
  where status = 'approved'
  group by beach_id
) r on r.beach_id = b.id;

grant select on beaches_geo to anon, authenticated;
