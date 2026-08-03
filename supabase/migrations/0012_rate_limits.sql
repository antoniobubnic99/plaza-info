-- 0012 — rate limiting za javne API rute.
--
-- Zašto u bazi: Vercel funkcije su serverless, svaka instanca ima svoju memoriju,
-- pa in-memory brojač ne vidi zahtjeve koji su pali na drugu instancu.
--
-- `ident` je SHA-256 hash IP adrese (nikad sirovi IP) — pseudonimizacija je
-- namjerna: dovoljno za brojanje, a ne stvara evidenciju posjetitelja.

create table if not exists public.rate_limits (
  bucket       text        not null,
  ident        text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, ident, window_start)
);

-- Nema anon/authenticated granta — pristup ide isključivo preko service_role
-- iz serverskog koda. RLS uključen da slučajni grant ne otvori tablicu.
alter table public.rate_limits enable row level security;

-- Brzo brisanje isteklih prozora.
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- Atomarno povećanje brojača za fiksni prozor (fixed window counter).
-- Vraća je li zahtjev dopušten, koliko je ostalo i kada prozor istječe.
create or replace function public.hit_rate_limit(
  p_bucket         text,
  p_ident          text,
  p_limit          integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_hits         integer;
begin
  -- Početak trenutnog prozora, poravnat na p_window_seconds.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, ident, window_start, hits)
  values (p_bucket, p_ident, v_window_start, 1)
  on conflict (bucket, ident, window_start)
    do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- Oportunističko čišćenje: ~1 % zahtjeva plati brisanje starih prozora,
  -- pa tablica ostaje mala bez zasebnog crona.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return query
    select
      v_hits <= p_limit,
      greatest(p_limit - v_hits, 0),
      v_window_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.hit_rate_limit(text, text, integer, integer) from public;
grant execute on function public.hit_rate_limit(text, text, integer, integer) to service_role;
