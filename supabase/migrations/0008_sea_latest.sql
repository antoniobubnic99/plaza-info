-- PlažaInfo — zadnja službena ocjena kakvoće mora (IZOR) po plaži u beaches_geo (ROADMAP v2, Faza 2 rupa).
-- Omogućuje filter „Kakvoća mora" u listi/karti bez per-plaža dohvata iz sea_quality.
-- Primjenjuje se ISKLJUČIVO na Supabase projekt PlazaInfo (izolacija).

-- beaches_geo je `select b.*` → drop+recreate zadržava parking_* (0006) i rating agregat (0005),
-- a dodaje sea_assessment = ocjena najnovijeg uzorka po plaži (left join lateral, nullabilno).
drop view if exists beaches_geo;

create view beaches_geo
with (security_invoker = true) as
select
  b.*,
  st_y(b.location::geometry) as lat,
  st_x(b.location::geometry) as lng,
  coalesce(r.rating_avg, 0)::numeric(3, 2) as rating_avg,
  coalesce(r.rating_count, 0)::int as rating_count,
  sq.assessment as sea_assessment
from beaches b
left join (
  select
    beach_id,
    avg(rating)::numeric(3, 2) as rating_avg,
    count(*) as rating_count
  from reviews
  where status = 'approved'
  group by beach_id
) r on r.beach_id = b.id
left join lateral (
  select assessment
  from sea_quality s
  where s.beach_id = b.id
  order by s.sampled_at desc
  limit 1
) sq on true;

grant select on beaches_geo to anon, authenticated;
