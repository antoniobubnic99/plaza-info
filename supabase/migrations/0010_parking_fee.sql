-- PlažaInfo — parking kao punopravni objekt (ROADMAP v2, stavke 4 i 5).
-- Dodaje naplatu parkinga (status + slobodan iznos + napomena) na plažu i u prijave,
-- te razlikuje fotke plaže od fotki parkinga (`photos.kind`).
-- Primjenjuje se ISKLJUČIVO na Supabase projekt PlazaInfo (izolacija).
--
-- ⚠️ POKRENUTI PRIJE DEPLOYA koda koji je koristi — `queries.ts` traži nove stupce,
-- pa bi bez migracije lista plaža ostala prazna (isti redoslijed kao 0009).

-- ── 1. Naplata parkinga na plaži ───────────────────────────────────────────────
-- 'unknown' je namjerno default: bolje priznati da ne znamo nego izmisliti cijenu.
-- `parking_price_text` je slobodan tekst („2 €/h", „15 €/dan") jer OSM i korisnici
-- ne daju usporediv iznos — ne računa se s njim, samo se prikazuje.
alter table beaches
  add column if not exists parking_fee_status text not null default 'unknown',
  add column if not exists parking_price_text text,
  add column if not exists parking_note text;

do $$
begin
  alter table beaches
    add constraint beaches_parking_fee_status_chk
    check (parking_fee_status in ('free', 'paid', 'unknown'));
exception
  when duplicate_object then null;
end $$;

-- ── 2. Ista polja u prijavama ──────────────────────────────────────────────────
-- Ovdje su nullabilna: null = korisnik nije dirao podatak (za razliku od plaže,
-- gdje 'unknown' znači „nemamo informaciju").
alter table beach_submissions
  add column if not exists parking_fee_status text,
  add column if not exists parking_price_text text,
  add column if not exists parking_note text;

do $$
begin
  alter table beach_submissions
    add constraint beach_submissions_parking_fee_status_chk
    check (
      parking_fee_status is null
      or parking_fee_status in ('free', 'paid', 'unknown')
    );
exception
  when duplicate_object then null;
end $$;

-- ── 3. Fotke parkinga odvojene od fotki plaže ──────────────────────────────────
-- Postojeće fotke su sve fotke plaže → default 'beach' je točan za backfill.
alter table photos
  add column if not exists kind text not null default 'beach';

do $$
begin
  alter table photos
    add constraint photos_kind_chk check (kind in ('beach', 'parking'));
exception
  when duplicate_object then null;
end $$;

create index if not exists photos_beach_kind_status_idx on photos (beach_id, kind, status);

-- ── 4. beaches_geo — presloži da pokupi nove parking stupce ────────────────────
-- View je `select b.*` → novi stupci se NE pojave sami; drop+recreate zadržava
-- rating (0005), sea_assessment (0008) i popularity_score (0009). Popularnost sad
-- broji samo fotke plaže (fotka parkinga nije signal popularnosti plaže).
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
  where status = 'approved' and kind = 'beach'
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

-- ── 5. Odobravanje prijave prenosi i podatke o naplati ─────────────────────────
-- Pravilo pri ispravku postojećeg parkinga: prijava koja kaže 'unknown' NE briše
-- ono što već znamo (unknown ne nosi informaciju); prazan tekst se isto ignorira.
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
    update beaches b set
      parking_lat = s.parking_lat,
      parking_lng = s.parking_lng,
      parking_distance_m = case
        when s.parking_lat is not null and s.parking_lng is not null then
          round(st_distance(
            b.location,
            st_setsrid(st_makepoint(s.parking_lng, s.parking_lat), 4326)::geography
          ))::int
        else null
      end,
      parking_fee_status = coalesce(
        nullif(s.parking_fee_status, 'unknown'),
        b.parking_fee_status
      ),
      parking_price_text = coalesce(nullif(s.parking_price_text, ''), b.parking_price_text),
      parking_note = coalesce(nullif(s.parking_note, ''), b.parking_note)
    where b.id = s.target_beach_id
    returning b.id into v_id;

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
    parking_lat, parking_lng, parking_distance_m,
    parking_fee_status, parking_price_text, parking_note
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
    end,
    coalesce(s.parking_fee_status, 'unknown'),
    nullif(s.parking_price_text, ''),
    nullif(s.parking_note, '')
  )
  returning id into v_id;

  update beach_submissions set status = 'approved', target_beach_id = v_id where id = p_id;
  return v_id;
end;
$$;

revoke all on function apply_beach_submission(uuid) from public;
grant execute on function apply_beach_submission(uuid) to service_role;
