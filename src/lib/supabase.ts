import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// sb_publishable_ ključevi nisu JWT-ovi. supabase-js ih šalje kao
// "Authorization: Bearer <key>" što PostgREST ne može dekodirati.
// Skini header za anonimne zahtjeve da gateway koristi 'apikey'.
// (Isti obrazac dokazan u meridijan-vijesti — ovdje samostalno prepisan, bez importa.)
function anonFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (anonKey && headers.get('Authorization') === `Bearer ${anonKey}`) {
    headers.delete('Authorization');
  }
  return fetch(input, { ...init, headers });
}

// null ako env nije postavljen (npr. prije nego cloud projekt zaživi).
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, { global: { fetch: anonFetch } })
    : null;
