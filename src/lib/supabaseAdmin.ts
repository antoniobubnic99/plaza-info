import { createClient } from '@supabase/supabase-js';

// SERVER ONLY — koristi service role ključ. Nikad importati u klijentski kod.
// Za: seed skripte, moderaciju, i serverski upis prijava gužve (zaobilazi RLS).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin =
  url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : null;
