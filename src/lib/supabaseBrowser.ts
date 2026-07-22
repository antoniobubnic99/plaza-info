'use client';

import { createBrowserClient } from '@supabase/ssr';

// Klijentski (browser) Supabase klijent s kolačić-baziranom sesijom (@supabase/ssr).
// Koristi se SAMO za auth (Google prijava/odjava, čitanje trenutnog korisnika).
// Anon/publishable ključ; RLS i dalje čuva podatke.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// null ako env nije postavljen (npr. prije nego cloud projekt zaživi) → UI sakriva gumb.
export function getSupabaseBrowser() {
  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey);
}
