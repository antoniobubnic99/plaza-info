'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ADMIN_TOKEN_KEY,
  fetchPending,
  fetchPendingPhotos,
  fetchPendingSubmissions,
  loginWithPin,
  moderate,
  moderatePhoto,
  moderateSubmission,
  UnauthorizedError,
  type ModerateAction,
  type PendingPhoto,
  type PendingReview,
  type PendingSubmission,
} from '@/lib/adminApi';

type Tab = 'reviews' | 'photos' | 'submissions';

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

  const [tab, setTab] = useState<Tab>('reviews');

  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'hr' ? 'hr-HR' : 'en-GB');
  const beachLabel = (b: { name_hr: string; name_en: string } | null) =>
    (b && (locale === 'en' ? b.name_en : b.name_hr)) || t('unknownBeach');

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
    setPhotos([]);
    setSubmissions([]);
  }, []);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof UnauthorizedError) {
        setLoadError('sessionExpired');
        clearSession();
      } else {
        setLoadError('loadError');
      }
    },
    [clearSession],
  );

  const load = useCallback(
    async (tk: string) => {
      setLoading(true);
      setLoadError(null);
      try {
        const [rev, pho, sub] = await Promise.all([
          fetchPending(tk),
          fetchPendingPhotos(tk),
          fetchPendingSubmissions(tk),
        ]);
        setReviews(rev);
        setPhotos(pho);
        setSubmissions(sub);
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  // Dohvati liste kad imamo token (sinkronizacija sa serverom — kanonski effect).
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
      if (tab === 'reviews') {
        await moderate(token, id, action);
        setReviews((prev) => prev.filter((r) => r.id !== id)); // optimistično uklanjanje
      } else if (tab === 'photos') {
        await moderatePhoto(token, id, action);
        setPhotos((prev) => prev.filter((p) => p.id !== id));
      } else {
        await moderateSubmission(token, id, action);
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      handleError(err);
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

  const items = tab === 'reviews' ? reviews : tab === 'photos' ? photos : submissions;

  function tabButton(id: Tab, label: string, count: number) {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
          active
            ? 'bg-sea-600 text-white'
            : 'border border-sea-200 text-sea-800 hover:bg-sea-50'
        }`}
      >
        {label} ({count})
      </button>
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

      <div className="mt-4 flex gap-2">
        {tabButton('reviews', t('tabReviews'), reviews.length)}
        {tabButton('photos', t('tabPhotos'), photos.length)}
        {tabButton('submissions', t('tabSubmissions'), submissions.length)}
      </div>

      {loadError && <p className="mt-3 text-sm text-red-600">{t(loadError)}</p>}

      {loading && items.length === 0 ? (
        <p className="mt-6 text-sm text-sea-800/60">…</p>
      ) : items.length === 0 && !loadError ? (
        <p className="mt-6 text-sm text-sea-800/70">
          {tab === 'reviews'
            ? t('empty')
            : tab === 'photos'
              ? t('emptyPhotos')
              : t('emptySubmissions')}
        </p>
      ) : tab === 'reviews' ? (
        <ul className="mt-5 space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-sea-100 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-sea-950">
                  {beachLabel(r.beach)}
                </span>
                <span className="text-xs text-sea-800/50">{fmt(r.created_at)}</span>
              </div>
              <div className="mt-1">
                <Stars value={r.rating} />
              </div>
              {r.body && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-sea-800/90">{r.body}</p>
              )}
              <ModerateButtons id={r.id} busy={busyId === r.id} onAct={handleModerate} t={t} />
            </li>
          ))}
        </ul>
      ) : tab === 'photos' ? (
        <ul className="mt-5 space-y-3">
          {photos.map((p) => (
            <li key={p.id} className="rounded-lg border border-sea-100 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-sea-950">
                  {beachLabel(p.beach)}
                </span>
                <span className="text-xs text-sea-800/50">{fmt(p.created_at)}</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- pregled uploada za moderaciju; bez next/image optimizacije */}
              <img
                src={p.url}
                alt={beachLabel(p.beach)}
                className="mt-2 max-h-64 w-full rounded-lg bg-sea-50 object-contain"
              />
              <ModerateButtons id={p.id} busy={busyId === p.id} onAct={handleModerate} t={t} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-5 space-y-3">
          {submissions.map((s) => (
            <SubmissionCard
              key={s.id}
              submission={s}
              busy={busyId === s.id}
              onAct={handleModerate}
              fmt={fmt}
              beachLabel={beachLabel}
              locale={locale}
              t={t}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

// Kartica prijave (nova plaža / parking) — pregled svih podataka + karta-link za
// vizualnu provjeru koordinata prije odobrenja.
function SubmissionCard({
  submission: s,
  busy,
  onAct,
  fmt,
  beachLabel,
  locale,
  t,
}: {
  submission: PendingSubmission;
  busy: boolean;
  onAct: (id: string, action: ModerateAction) => void;
  fmt: (iso: string) => string;
  beachLabel: (b: { name_hr: string; name_en: string } | null) => string;
  locale: string;
  t: (key: string) => string;
}) {
  // PostgREST relaciju vraća kao objekt; supabase-js je tipizira kao niz — pokrij oba.
  const beachRel = Array.isArray(s.beach) ? s.beach[0] ?? null : s.beach;
  const isParking = s.kind === 'parking';
  const name = isParking ? beachLabel(beachRel) : locale === 'en' ? s.name_en || s.name_hr : s.name_hr;
  const place = [s.municipality, s.region].filter(Boolean).join(', ') || null;
  const description = locale === 'en' ? s.description_en : s.description_hr;
  const activeAmenities = Object.entries(s.amenities ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  const activeFlags = Object.entries(s.flags ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);

  const mapsLink = (lat: number, lng: number) =>
    `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <li className="rounded-lg border border-sea-100 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isParking ? 'bg-sea-100 text-sea-800' : 'bg-sand-100 text-sea-900'
            }`}
          >
            {isParking ? t('kindParking') : t('kindNewBeach')}
          </span>
          <span className="text-sm font-semibold text-sea-950">{name || t('unknownBeach')}</span>
        </span>
        <span className="text-xs text-sea-800/50">{fmt(s.created_at)}</span>
      </div>

      <dl className="mt-2 space-y-1 text-xs text-sea-800/90">
        {!isParking && place && (
          <div>
            <span className="text-sea-800/60">{t('subPlace')}: </span>
            {place}
          </div>
        )}
        {!isParking && s.surface && (
          <div>
            <span className="text-sea-800/60">{t('subSurface')}: </span>
            {s.surface}
          </div>
        )}
        {!isParking && s.length_m != null && (
          <div>
            <span className="text-sea-800/60">{t('subLength')}: </span>
            {s.length_m} m
          </div>
        )}
        {!isParking && s.lat != null && s.lng != null && (
          <div>
            <span className="text-sea-800/60">{t('subCoords')}: </span>
            <a
              href={mapsLink(s.lat, s.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sea-600 underline"
            >
              {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
            </a>
          </div>
        )}
        {s.parking_lat != null && s.parking_lng != null && (
          <div>
            <span className="text-sea-800/60">{t('subParking')}: </span>
            <a
              href={mapsLink(s.parking_lat, s.parking_lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sea-600 underline"
            >
              {s.parking_lat.toFixed(5)}, {s.parking_lng.toFixed(5)}
            </a>
          </div>
        )}
        {/* Naplata parkinga (0010) — prikazuje se samo ono što je korisnik stvarno
            odgovorio, da moderator vidi razliku između „ne znam" i „nije dirao". */}
        {s.parking_fee_status && (
          <div>
            <span className="text-sea-800/60">{t('subParkingFee')}: </span>
            {t(`subParkingFee_${s.parking_fee_status}`)}
            {s.parking_price_text ? ` · ${s.parking_price_text}` : ''}
          </div>
        )}
        {s.parking_note && (
          <div>
            <span className="text-sea-800/60">{t('subParkingNote')}: </span>
            {s.parking_note}
          </div>
        )}
      </dl>

      {!isParking && (activeAmenities.length > 0 || activeFlags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...activeFlags, ...activeAmenities].map((k) => (
            <span
              key={k}
              className="rounded-full bg-sea-50 px-2 py-0.5 text-[11px] font-medium text-sea-800 ring-1 ring-sea-200"
            >
              {k}
            </span>
          ))}
        </div>
      )}

      {!isParking && description && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-sea-800/90">{description}</p>
      )}

      <ModerateButtons id={s.id} busy={busy} onAct={onAct} t={t} />
    </li>
  );
}

function ModerateButtons({
  id,
  busy,
  onAct,
  t,
}: {
  id: string;
  busy: boolean;
  onAct: (id: string, action: ModerateAction) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="mt-3 flex gap-2">
      <button
        onClick={() => onAct(id, 'approve')}
        disabled={busy}
        className="rounded-full bg-crowd-empty px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {t('approve')}
      </button>
      <button
        onClick={() => onAct(id, 'reject')}
        disabled={busy}
        className="rounded-full border border-red-200 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {t('reject')}
      </button>
    </div>
  );
}
