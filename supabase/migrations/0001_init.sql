-- PlažaInfo — inicijalna schema (Faza 1)
-- Primjenjuje se ISKLJUČIVO na Supabase projekt PlazaInfo (izolacija — nikad na drugi projekt).

create extension if not exists postgis;

-- Enumi (jezično neutralni; UI prevodi preko next-intl).
create type surface_type as enum ('sand', 'pebble', 'rock', 'concrete');
create type sea_assessment as enum ('excellent', 'good', 'satisfactory', 'unsatisfactory');
create type crowd_level as enum ('empty', 'moderate', 'packed');
create type content_status as enum ('pending', 'approved', 'rejected');

-- Plaže: statični podaci + geolokacija.
create table beaches (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_hr text not null,
  name_en text,
  location geography(Point, 4326) not null,
  region text,
  municipality text,
  surface_type surface_type,
  length_m integer,
  orientation text,
  description_hr text,
  description_en text,
  izor_point_id text,
  osm_id text,
  amenities jsonb not null default '{}'::jsonb,
  flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index beaches_location_gix on beaches using gist (location);
create index beaches_region_idx on beaches (region);

-- Kakvoća mora (službena, IZOR) — po datumu uzorka (~2 tjedna razmak, NIJE real-time).
create table sea_quality (
  id uuid primary key default gen_random_uuid(),
  beach_id uuid not null references beaches (id) on delete cascade,
  izor_point_id text,
  assessment sea_assessment,
  sampled_at date not null,
  sea_temp numeric(4, 1),
  air_temp numeric(4, 1),
  salinity numeric(4, 1),
  season_year integer,
  source text not null default 'izor',
  created_at timestamptz not null default now(),
  unique (beach_id, sampled_at)
);
create index sea_quality_beach_idx on sea_quality (beach_id, sampled_at desc);

-- Crowdsourced gužva (one-tap prijave). report_lat/lng služe za geofence anti-spam.
create table crowd_reports (
  id uuid primary key default gen_random_uuid(),
  beach_id uuid not null references beaches (id) on delete cascade,
  level crowd_level not null,
  device_hash text,
  report_lat double precision,
  report_lng double precision,
  created_at timestamptz not null default now()
);
create index crowd_reports_beach_idx on crowd_reports (beach_id, created_at desc);

-- Check-inovi — grade povijesne podatke za v2 predikcije gužve.
create table checkins (
  id uuid primary key default gen_random_uuid(),
  beach_id uuid not null references beaches (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  device_hash text,
  created_at timestamptz not null default now()
);
create index checkins_beach_idx on checkins (beach_id, created_at desc);

-- Recenzije (moderirane).
create table reviews (
  id uuid primary key default gen_random_uuid(),
  beach_id uuid not null references beaches (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  body text,
  status content_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index reviews_beach_idx on reviews (beach_id, status);

-- Fotografije (službene + korisničke, moderirane).
create table photos (
  id uuid primary key default gen_random_uuid(),
  beach_id uuid not null references beaches (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  url text not null,
  is_official boolean not null default false,
  status content_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index photos_beach_idx on photos (beach_id, status);

-- Favoriti (prijavljeni korisnik ILI anonimni uređaj).
create table favorites (
  id uuid primary key default gen_random_uuid(),
  beach_id uuid not null references beaches (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  device_hash text,
  created_at timestamptz not null default now()
);
create unique index favorites_user_uq on favorites (beach_id, user_id) where user_id is not null;
create unique index favorites_device_uq on favorites (beach_id, device_hash) where device_hash is not null;

-- updated_at trigger za beaches.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger beaches_set_updated_at
before update on beaches
for each row execute function set_updated_at();
