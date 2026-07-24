-- PlažaInfo — korisničke prijave novih plaža + parkinga (ROADMAP v2, Faza 6).
-- Korisnik (prijavljen) podnese zahtjev → status 'pending' → Antonio odobrava u adminu.
-- Odobrenje ubacuje plažu u `beaches` (nova) ILI ažurira parking postojeće.
-- Dodaje i `popularity_score` u beaches_geo za default sort „po popularnosti".
-- Primjenjuje se ISKLJUČIVO na Supabase projekt PlazaInfo (izolacija).

-- ── 1. Broj prijava gužve po plaži (za popularity) ─────────────────────────────
-- crowd_reports NEMA anon/authenticated grant (namjerno — skriva sirove koordinate),
-- pa security_invoker beaches_geo ne smije čitati tablicu izravno. Security-definer
-- set-returning funkcija izloži SAMO agregatni broj (bez ikakvih koordinata).
create or replace function crowd_counts()
returns table (beach_id uuid, cnt bigint)
language sql stable security definer set search_path = public as $$
  select beach_id, count(*) from crowd_reports group by beach_id;
$$;
grant execute on function crowd_counts() to anon, authenticated;

-- ── 2. beaches_geo + popularity_score ──────────────────────────────────────────
-- Popularnost = broj odobrenih recenzija × prosjek ocjene + broj odobrenih fotki
-- + broj prijava gužve (zaključana odluka 2026-07-24). Plaže bez ijednog signala
-- padnu na 0 (dno liste) ali NE nestaju. Drop+recreate zadržava rating (0005),
-- parking_* (0006) i sea_assessment (0008).
drop view if exists beaches_geo;

create view beaches_geo
with (security_invoker = true) as
select
  b.*,
  st_y(b.location::geometry) as lat,
  st_x(b.location::geometry) as lng,
  coalesce(r.rating_avg, 0)::numeric(3, 2) as rating_avg,
  coalesce(r.rating_count, 0)::int as rating_count,
  sq.assessment as sea_assessment,
  (
    coalesce(r.rating_count, 0) * coalesce(r.rating_avg, 0)
    + coalesce(p.photo_count, 0)
    + coalesce(c.cnt, 0)
  )::numeric(10, 2) as popularity_score
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
left join (
  select beach_id, count(*) as photo_count
  from photos
  where status = 'approved'
  group by beach_id
) p on p.beach_id = b.id
left join crowd_counts() c on c.beach_id = b.id
left join lateral (
  select assessment
  from sea_quality s
  where s.beach_id = b.id
  order by s.sampled_at desc
  limit 1
) sq on true;

grant select on beaches_geo to anon, authenticated;

-- ── 3. Tablica prijava ─────────────────────────────────────────────────────────
-- Jedan tip pokriva oboje: kind='new_beach' (target_beach_id null) i
-- kind='parking' (target_beach_id = postojeća plaža). `surface` je SLOBODAN TEKST
-- (ne enum) — dopušta „other"/nove vrijednosti; odobravanje ga po potrebi svede na
-- enum (nevaljano → null). Popularnost/koordinate se izvode pri odobrenju.
create table beach_submissions (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'new_beach' check (kind in ('new_beach', 'parking')),
  target_beach_id uuid references beaches (id) on delete cascade,
  slug_base text,
  name_hr text,
  name_en text,
  lat double precision,
  lng double precision,
  region text,
  municipality text,
  surface text,
  length_m integer,
  description_hr text,
  description_en text,
  amenities jsonb not null default '{}'::jsonb,
  flags jsonb not null default '{}'::jsonb,
  parking_lat double precision,
  parking_lng double precision,
  submitted_by uuid references auth.users (id) on delete set null,
  status content_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index beach_submissions_status_idx on beach_submissions (status, created_at);
create index beach_submissions_user_idx on beach_submissions (submitted_by);

-- RLS: prijavljeni korisnik smije podnijeti (samo za sebe, status pending) i vidjeti
-- SVOJE prijave. Admin lista/odobravanje ide preko service_role (zaobilazi RLS).
alter table beach_submissions enable row level security;
grant select, insert on beach_submissions to authenticated;

create policy "submissions insert own" on beach_submissions
  for insert to authenticated
  with check (auth.uid() = submitted_by and status = 'pending');

create policy "submissions select own" on beach_submissions
  for select to authenticated using (auth.uid() = submitted_by);

-- ── 4. Odobravanje (atomarno, u bazi) ──────────────────────────────────────────
-- Poziva ISKLJUČIVO admin API (service_role). Za novu plažu gradi jedinstveni slug
-- i PostGIS geografiju; za parking ažurira postojeću plažu + izračuna udaljenost.
create or replace function apply_beach_submission(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s beach_submissions;
  v_surface surface_type;
  v_slug text;
  v_id uuid;
  n int := 1;
begin
  select * into s from beach_submissions where id = p_id and status = 'pending';
  if not found then
    return null;
  end if;

  -- Parking za postojeću plažu.
  if s.kind = 'parking' and s.target_beach_id is not null then
    update beaches set
      parking_lat = s.parking_lat,
      parking_lng = s.parking_lng,
      parking_distance_m = case
        when s.parking_lat is not null and s.parking_lng is not null then
          round(st_distance(
            location,
            st_setsrid(st_makepoint(s.parking_lng, s.parking_lat), 4326)::geography
          ))::int
        else null
      end
    where id = s.target_beach_id
    returning id into v_id;

    update beach_submissions set status = 'approved' where id = p_id;
    return v_id;
  end if;

  -- Nova plaža: svedi slobodni surface na enum ako je valjan, inače null.
  begin
    v_surface := s.surface::surface_type;
  exception when others then
    v_surface := null;
  end;

  -- Jedinstveni slug (bazni iz forme, po potrebi -2, -3, …).
  v_slug := coalesce(nullif(s.slug_base, ''), 'plaza');
  while exists (select 1 from beaches where slug = v_slug) loop
    n := n + 1;
    v_slug := coalesce(nullif(s.slug_base, ''), 'plaza') || '-' || n;
  end loop;

  insert into beaches (
    slug, name_hr, name_en, location, region, municipality,
    surface_type, length_m, description_hr, description_en, amenities, flags,
    parking_lat, parking_lng, parking_distance_m
  ) values (
    v_slug, s.name_hr, s.name_en,
    st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography,
    s.region, s.municipality, v_surface, s.length_m, s.description_hr, s.description_en,
    coalesce(s.amenities, '{}'::jsonb), coalesce(s.flags, '{}'::jsonb),
    s.parking_lat, s.parking_lng,
    case
      when s.parking_lat is not null and s.parking_lng is not null then
        round(st_distance(
          st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography,
          st_setsrid(st_makepoint(s.parking_lng, s.parking_lat), 4326)::geography
        ))::int
      else null
    end
  )
  returning id into v_id;

  update beach_submissions set status = 'approved', target_beach_id = v_id where id = p_id;
  return v_id;
end;
$$;

revoke all on function apply_beach_submission(uuid) from public;
grant execute on function apply_beach_submission(uuid) to service_role;
