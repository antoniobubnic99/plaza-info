-- PlažaInfo — ocjena pri prijavi plaže (zadnji ostatak stavke 9).
-- Prijavitelj smije uz plažu ostaviti i ocjenu; odobrenjem prijave ona postaje
-- prava recenzija, čime indeks kvalitete prestaje biti zamjena i pravi prosjek
-- preuzima prikaz (`beaches_geo.rating_avg` / `rating_count` iz 0005).
-- Primjenjuje se ISKLJUČIVO na Supabase projekt PlazaInfo (izolacija).
--
-- SIGURNO ZA PONOVNO POKRETANJE: `if not exists`, `do $$` oko ograničenja i
-- `create or replace` za funkciju — drugi prolaz ne mijenja ništa.
--
-- NIJE potrebno čekati Google OAuth: `reviews.user_id` je nullable i anonimne
-- recenzije već postoje, pa ovo radi odmah. Kad OAuth proradi, prijavljeni
-- korisnik automatski dobiva atribuciju preko `submitted_by`.

-- ── 1. Ocjena na prijavi ───────────────────────────────────────────────────────
-- Nullable je namjerno: null = „nisam ocijenio" i razlikuje se od bilo koje ocjene.
-- Raspon 1–5 je isti kao u `reviews`, da se pri prijenosu ne može provući vrijednost
-- koju `reviews` ne bi primio.
alter table beach_submissions
  add column if not exists rating smallint;

do $$
begin
  alter table beach_submissions
    add constraint beach_submissions_rating_chk
    check (rating is null or rating between 1 and 5);
exception
  when duplicate_object then null;
end $$;

-- ── 2. Odobrenje prijave prenosi i ocjenu u recenzije ──────────────────────────
-- Tijelo je preuzeto iz 0010 i prošireno SAMO umetanjem recenzije u obje grane;
-- ostalo je nepromijenjeno da se ne izgubi logika naplate parkinga.
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

    -- Ocjena je vezana uz PLAŽU, pa vrijedi i kad je prijava bila o parkingu.
    if s.rating is not null and v_id is not null then
      insert into reviews (beach_id, user_id, rating, status)
      values (v_id, s.submitted_by, s.rating, 'approved');
    end if;

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

  -- Recenzija je odmah 'approved' jer je administrator već odobrio samu prijavu;
  -- drugi krug moderacije istog sadržaja ne bi ništa dodao.
  if s.rating is not null then
    insert into reviews (beach_id, user_id, rating, status)
    values (v_id, s.submitted_by, s.rating, 'approved');
  end if;

  update beach_submissions set status = 'approved', target_beach_id = v_id where id = p_id;
  return v_id;
end;
$$;

revoke all on function apply_beach_submission(uuid) from public;
grant execute on function apply_beach_submission(uuid) to service_role;
