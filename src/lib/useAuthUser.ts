'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from './supabaseBrowser';

// Jedno mjesto za stanje Google prijave na klijentu. Prije je isti useEffect
// (getUser + onAuthStateChange + odjava pretplate) živio zasebno u AuthButtonu i
// SubmitBeachFormu; recenzije i fotke sad TRAŽE prijavu, pa bi treća i četvrta
// kopija bile prevelika cijena za jednu te istu provjeru.

export interface AuthUser {
  /** Je li Supabase Auth uopće konfiguriran (bez ključeva gumb nema smisla). */
  configured: boolean;
  /** Prva provjera sesije je gotova — do tada ne crtaj ni gumb ni upozorenje. */
  ready: boolean;
  email: string | null;
  /** `null` dok se ne zna; `false` uključuje i „Supabase nije konfiguriran". */
  signedIn: boolean | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuthUser(): AuthUser {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [email, setEmail] = useState<string | null>(null);
  // Bez konfiguriranog Supabasea nema što čekati — odmah smo „ready" (i odjavljeni).
  // Inicijalizacija ovdje (ne setState u effectu) zadovoljava react-hooks/set-state-in-effect.
  const [ready, setReady] = useState(supabase === null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setEmail(data.user?.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const signIn = useCallback(async () => {
    if (!supabase) return;
    // Nakon Googlea vrati korisnika točno na stranicu s koje je krenuo, da ne
    // izgubi ispunjenu formu iz vida.
    const next = window.location.pathname;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setEmail(null);
  }, [supabase]);

  return {
    configured: supabase !== null,
    ready,
    email,
    signedIn: ready ? email !== null : null,
    signIn,
    signOut,
  };
}
