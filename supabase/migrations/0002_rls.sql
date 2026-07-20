-- PlažaInfo — RLS politike i grantovi (Faza 1).
-- Načelo: statični podaci javno čitljivi; korisnički sadržaj moderiran;
-- gužva/check-in upisi idu ISKLJUČIVO preko servera (service role zaobilazi RLS).

alter table beaches enable row level security;
alter table sea_quality enable row level security;
alter table crowd_reports enable row level security;
alter table checkins enable row level security;
alter table reviews enable row level security;
alter table photos enable row level security;
alter table favorites enable row level security;

-- Eksplicitni table grantovi (RLS ostaje vrata).
grant select on beaches, sea_quality to anon, authenticated;
grant select, insert on reviews to authenticated;
grant select on reviews to anon;
grant select, insert on photos to authenticated;
grant select on photos to anon;
grant select, insert, delete on favorites to authenticated;
-- crowd_reports i checkins: BEZ anon/authenticated grantova (samo service role).

-- Javno čitanje statičkih podataka.
create policy "beaches public read" on beaches
  for select using (true);
create policy "sea_quality public read" on sea_quality
  for select using (true);

-- Recenzije: javno se čitaju samo odobrene; korisnik stvara (status ostaje pending).
create policy "reviews read approved" on reviews
  for select using (status = 'approved');
create policy "reviews insert own" on reviews
  for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');

-- Fotke: javno odobrene ili službene; korisnik stvara (pending).
create policy "photos read approved" on photos
  for select using (status = 'approved' or is_official);
create policy "photos insert own" on photos
  for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');

-- Favoriti: korisnik upravlja samo svojima.
create policy "favorites select own" on favorites
  for select to authenticated using (auth.uid() = user_id);
create policy "favorites insert own" on favorites
  for insert to authenticated with check (auth.uid() = user_id);
create policy "favorites delete own" on favorites
  for delete to authenticated using (auth.uid() = user_id);

-- crowd_reports / checkins namjerno bez policya za anon/authenticated:
-- čitanje ide preko security-definer funkcija (0003), upis preko servera.
