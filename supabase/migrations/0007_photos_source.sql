-- PlažaInfo — izvor + atribucija fotografija (ROADMAP v2, Faza 4).
-- Omogućuje seedanje slika s Wikimedia Commons / Mapillary uz OBAVEZNU atribuciju + licencu.
-- Primjenjuje se ISKLJUČIVO na Supabase projekt PlazaInfo (izolacija).
--
-- source: 'user' (korisnički upload), 'wikimedia', 'mapillary'.
-- Postojeće fotke dobiju default 'user' (bile su korisničke/službene) — točno.

alter table photos
  add column if not exists source text not null default 'user',
  add column if not exists attribution text,
  add column if not exists license text;

-- Check ograničenje dodano idempotentno (add constraint nije IF NOT EXISTS).
do $$
begin
  alter table photos
    add constraint photos_source_chk
    check (source in ('user', 'wikimedia', 'mapillary'));
exception
  when duplicate_object then null;
end $$;
