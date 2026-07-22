'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

// Aditivna Google prijava (opcionalna). Kad je korisnik prijavljen, serverske
// rute (/api/reviews, /api/photos) čitaju sesiju iz kolačića i vežu unos uz
// user_id. Ako Supabase Auth nije konfiguriran, gumb se sakriva / prijava tiho
// ne uspije — anonimni unos i dalje radi.
export default function AuthButton() {
  const t = useTranslations('Auth');
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [email, setEmail] = useState<string | null>(null);
  // Kad Supabase nije konfiguriran, odmah smo "ready" (komponenta se sakriva);
  // inače čekamo prvi getUser() da izbjegnemo bljesak gumba. Inicijalizacija ovdje
  // (ne setState u effectu) zadovoljava react-hooks/set-state-in-effect.
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

  if (!supabase || !ready) return null;

  async function signIn() {
    if (!supabase) return;
    const next = window.location.pathname;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setEmail(null);
  }

  if (email) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-sea-800/70">
        {t('signedInAs', { email })}
        <button
          type="button"
          onClick={signOut}
          className="rounded-full border border-sea-200 px-2.5 py-1 font-medium text-sea-800 hover:bg-sea-50"
        >
          {t('signOut')}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={signIn}
      className="inline-flex items-center gap-2 rounded-full border border-sea-200 bg-white px-3 py-1.5 text-xs font-medium text-sea-900 hover:bg-sea-50"
    >
      <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4 5.6l6.2 5.3C41.4 36.4 44 30.7 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {t('signInGoogle')}
    </button>
  );
}
