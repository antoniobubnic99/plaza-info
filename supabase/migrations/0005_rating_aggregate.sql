-- PlažaInfo — agregatni rejting iz odobrenih recenzija (ROADMAP v2, Faza 3).
-- Dodaje rating_avg / rating_count u `beaches_geo` view radi prikaza u panelu
-- i filtriranja „min ★" u listi (Faza 2).
-- Primjenjuje se ISKLJUČIVO na Supabase projekt PlazaInfo (izolacija).
--
-- security_invoker = true → agregat nasljeđuje RLS `reviews` (anon vidi samo 'approved'),
-- pa je `where status = 'approved'` dodatni eksplicitni filter (dvostruko osiguranje).
-- Drop+create (umjesto create or replace) jer kasnije migracije mijenjaju `beaches.*`.

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
