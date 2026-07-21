'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ADMIN_TOKEN_KEY,
  fetchPending,
  loginWithPin,
  moderate,
  UnauthorizedError,
  type ModerateAction,
  type PendingReview,
} from '@/lib/adminApi';

function Stars({ value }: { value: number }) {
  const full = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span aria-label={`${full}/5`} className="text-amber-500">
      {'★'.repeat(full)}
      <span className="text-sea-200">{'★'.repeat(5 - full)}</span>
    </span>
  );
}

export default function AdminPanel({ locale }: { locale: string }) {
  const t = useTranslations('Admin');
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // spriječi flash prije čitanja localStorage

  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'hr' ? 'hr-HR' : 'en-GB');

  // Učitaj token iz localStorage na mountu. Mora ići kroz effect (ne lazy initializer)
  // da SSR (token=null) i prvi klijentski render budu isti — inače hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkronizacija s localStorage (vanjski sustav), jednokratno na mountu
    setToken(localStorage.getItem(ADMIN_TOKEN_KEY));
    setReady(true);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
    setReviews([]);
  }, []);

  const load = useCallback(
    async (tk: string) => {
      setLoading(true);
      setLoadError(null);
      try {
        const list = await fetchPending(tk);
        setReviews(list);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          setLoadError('sessionExpired');
          clearSession();
        } else {
          setLoadError('loadError');
        }
      } finally {
        setLoading(false);
      }
    },
    [clearSession],
  );

  // Dohvati listu kad imamo token (sinkronizacija sa serverom — kanonski effect).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pokreće mrežni dohvat, ne cascading render petlju
    if (token) load(token);
  }, [token, load]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!pin || loggingIn) return;
    setLoggingIn(true);
    setLoginError(false);
    const tk = await loginWithPin(pin);
    setLoggingIn(false);
    if (!tk) {
      setLoginError(true);
      return;
    }
    localStorage.setItem(ADMIN_TOKEN_KEY, tk);
    setPin('');
    setToken(tk);
  }

  async function handleModerate(id: string, action: ModerateAction) {
    if (!token || busyId) return;
    setBusyId(id);
    try {
      await moderate(token, id, action);
      setReviews((prev) => prev.filter((r) => r.id !== id)); // optimistično uklanjanje
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setLoadError('sessionExpired');
        clearSession();
      } else {
        setLoadError('loadError');
      }
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) return null;

  // --- Prijava ---
  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-sea-950">{t('title')}</h1>
        <form onSubmit={handleLogin} className="mt-6 space-y-3">
          <label htmlFor="admin-pin" className="block text-sm font-medium text-sea-800">
            {t('pinLabel')}
          </label>
          <input
            id="admin-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={t('pinPlaceholder')}
            className="w-full rounded-lg border border-sea-200 bg-white px-3 py-2 text-sm text-sea-950 outline-none focus:border-sea-600"
          />
          <button
            type="submit"
            disabled={!pin || loggingIn}
            className="w-full rounded-full bg-sea-600 px-4 py-2 text-sm font-medium text-white hover:bg-sea-800 disabled:opacity-50"
          >
            {loggingIn ? '…' : t('login')}
          </button>
          {loginError && <p className="text-sm text-red-600">{t('loginError')}</p>}
        </form>
      </main>
    );
  }

  // --- Moderacija ---
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-sea-950">{t('title')}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => token && load(token)}
            disabled={loading}
            className="rounded-full border border-sea-200 px-3 py-1.5 text-sm font-medium text-sea-800 hover:bg-sea-50 disabled:opacity-50"
          >
            {t('refresh')}
          </button>
          <button
            onClick={clearSession}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-sea-800/70 hover:text-sea-950"
          >
            {t('logout')}
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm text-sea-800/70">
        {t('pendingCount', { count: reviews.length })}
      </p>

      {loadError && <p className="mt-3 text-sm text-red-600">{t(loadError)}</p>}

      {loading && reviews.length === 0 ? (
        <p className="mt-6 text-sm text-sea-800/60">…</p>
      ) : reviews.length === 0 && !loadError ? (
        <p className="mt-6 text-sm text-sea-800/70">{t('empty')}</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {reviews.map((r) => {
            const beachName =
              r.beach && (locale === 'en' ? r.beach.name_en : r.beach.name_hr);
            return (
              <li key={r.id} className="rounded-lg border border-sea-100 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-sea-950">
                    {beachName || t('unknownBeach')}
                  </span>
                  <span className="text-xs text-sea-800/50">{fmt(r.created_at)}</span>
                </div>
                <div className="mt-1">
                  <Stars value={r.rating} />
                </div>
                {r.body && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-sea-800/90">{r.body}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleModerate(r.id, 'approve')}
                    disabled={busyId === r.id}
                    className="rounded-full bg-crowd-empty px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {t('approve')}
                  </button>
                  <button
                    onClick={() => handleModerate(r.id, 'reject')}
                    disabled={busyId === r.id}
                    className="rounded-full border border-red-200 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {t('reject')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
