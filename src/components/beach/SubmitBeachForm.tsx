'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { submitSubmission } from '@/lib/submissions';
import { AMENITY_FILTERS, FILTER_FLAGS, SURFACE_TYPES } from '@/lib/beachFilters';
import {
  PARKING_FEE_STATUSES,
  type BeachAmenities,
  type BeachFlags,
  type ParkingFeeStatus,
} from '@/lib/beaches';
import { submitPhoto } from '@/lib/photos';
import { ALLOWED_PHOTO_TYPES } from '@/lib/photoConfig';
import AuthButton from '@/components/auth/AuthButton';
import type { PickedPoint } from './LocationPicker';

// LocationPicker koristi MapLibre (window/WebGL) → bez SSR-a.
const LocationPicker = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-sea-100 sm:h-80" />,
});

type Mode = 'new_beach' | 'parking';

interface SubmitBeachFormProps {
  mode: Mode;
  /** Samo za mode='parking': plaža za koju se dodaje/ispravlja parking. */
  targetBeachId?: string;
  targetBeachName?: string;
  targetCenter?: PickedPoint;
  /**
   * Postojeće koordinate parkinga koji se ISPRAVLJA. Predpopunjavaju oznaku da
   * ispravak samo cijene ne traži ponovno klikanje po karti. Namjerno se ne izvodi
   * iz `targetCenter` — ondje su koordinate PLAŽE (kad parking još ne postoji),
   * pa bi predpopunjavanje upisalo plažu kao parking.
   */
  initialParkingPoint?: PickedPoint | null;
}

const BEACH_MARKER = '#0d6cc4';
const PARKING_MARKER = '#1f5fae';
const PHOTO_ACCEPT = Object.keys(ALLOWED_PHOTO_TYPES).join(',');

export default function SubmitBeachForm({
  mode,
  targetBeachId,
  targetBeachName,
  targetCenter,
  initialParkingPoint = null,
}: SubmitBeachFormProps) {
  const t = useTranslations('Submit');
  const tSurface = useTranslations('Surface');
  const tAmenities = useTranslations('Amenities');
  const tFlags = useTranslations('Flags');

  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [signedIn, setSignedIn] = useState<boolean | null>(supabase ? null : false);

  // Nova plaža — polja.
  const [nameHr, setNameHr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [region, setRegion] = useState('');
  const [surfaceChoice, setSurfaceChoice] = useState(''); // '' | enum | 'other'
  const [surfaceOther, setSurfaceOther] = useState('');
  const [lengthM, setLengthM] = useState('');
  const [descriptionHr, setDescriptionHr] = useState('');
  const [amenities, setAmenities] = useState<BeachAmenities>({});
  const [flags, setFlags] = useState<BeachFlags>({});
  const [beachPoint, setBeachPoint] = useState<PickedPoint | null>(null);

  // Parking (opcionalno za novu plažu; obavezno u parking-modu).
  const [parkingPoint, setParkingPoint] = useState<PickedPoint | null>(initialParkingPoint);
  // Naplata (0010). '' = korisnik nije odgovorio → polje se uopće ne šalje, pa
  // odobrenje ne pregazi ono što o parkingu već znamo.
  const [feeStatus, setFeeStatus] = useState<ParkingFeeStatus | ''>('');
  const [priceText, setPriceText] = useState('');
  const [parkingNote, setParkingNote] = useState('');
  const [parkingPhoto, setParkingPhoto] = useState<File | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);

  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error' | 'auth'>('idle');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session?.user);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const isParking = mode === 'parking';
  const surface =
    surfaceChoice === 'other' ? surfaceOther.trim() : surfaceChoice || undefined;

  const canSubmit = isParking
    ? parkingPoint != null
    : nameHr.trim().length >= 2 && beachPoint != null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'sending' || !canSubmit) return;
    setState('sending');
    setPhotoWarning(null);

    // Zajednička polja o naplati — izostavljena kad korisnik nije odgovorio.
    const feeFields = {
      parkingFeeStatus: feeStatus || undefined,
      parkingPriceText: priceText.trim() || undefined,
      parkingNote: parkingNote.trim() || undefined,
    };

    const result = isParking
      ? await submitSubmission({
          kind: 'parking',
          targetBeachId: targetBeachId as string,
          parkingLat: (parkingPoint as PickedPoint).lat,
          parkingLng: (parkingPoint as PickedPoint).lng,
          ...feeFields,
        })
      : await submitSubmission({
          ...feeFields,
          kind: 'new_beach',
          nameHr: nameHr.trim(),
          nameEn: nameEn.trim() || undefined,
          lat: (beachPoint as PickedPoint).lat,
          lng: (beachPoint as PickedPoint).lng,
          region: region.trim() || undefined,
          municipality: municipality.trim() || undefined,
          surface,
          lengthM: lengthM ? Number(lengthM) : undefined,
          descriptionHr: descriptionHr.trim() || undefined,
          amenities,
          flags,
          parkingLat: parkingPoint?.lat,
          parkingLng: parkingPoint?.lng,
        });

    if (result.ok) {
      // Fotka parkinga ide zasebnim putem (/api/photos, kind='parking') jer traži
      // postojeću plažu — moguća je samo u parking-modu. Neuspjeh fotke NE poništava
      // uspješnu prijavu: prijava je već zaprimljena, pa se javlja samo upozorenje.
      if (isParking && parkingPhoto && targetBeachId) {
        const photoResult = await submitPhoto(targetBeachId, parkingPhoto, 'parking');
        if (photoResult !== 'ok') setPhotoWarning(t(`photo_${photoResult}`));
      }
      setState('done');
      setFeeStatus('');
      setPriceText('');
      setParkingNote('');
      setParkingPhoto(null);
      if (!isParking) {
        setNameHr('');
        setNameEn('');
        setMunicipality('');
        setRegion('');
        setSurfaceChoice('');
        setSurfaceOther('');
        setLengthM('');
        setDescriptionHr('');
        setAmenities({});
        setFlags({});
        setBeachPoint(null);
      }
      setParkingPoint(null);
    } else {
      setState(result.reason === 'auth' ? 'auth' : 'error');
    }
  }

  const field =
    'w-full rounded-lg border border-sea-200 bg-white px-3 py-2 text-sm text-sea-950 outline-none focus:border-sea-600';
  const labelCls = 'block text-sm font-medium text-sea-800';

  /**
   * Naplata parkinga (stavka 4) — isti blok u oba moda. „Ne znam" je namjerno
   * default: bolje prazan podatak nego pogrešna cijena na portalu.
   */
  const parkingFeeBlock = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="sb-fee" className={labelCls}>
          {t('parkingFee')}
        </label>
        <select
          id="sb-fee"
          value={feeStatus}
          onChange={(e) => setFeeStatus(e.target.value as ParkingFeeStatus | '')}
          className={`mt-1 ${field}`}
        >
          <option value="">{t('parkingFeeNoAnswer')}</option>
          {PARKING_FEE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`parkingFee_${s}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sb-price" className={labelCls}>
          {t('parkingPrice')}
        </label>
        <input
          id="sb-price"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          maxLength={120}
          disabled={feeStatus !== 'paid'}
          className={`mt-1 ${field} disabled:bg-sea-50 disabled:text-sea-800/50`}
          placeholder={t('parkingPricePlaceholder')}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="sb-parking-note" className={labelCls}>
          {t('parkingNote')}
        </label>
        <input
          id="sb-parking-note"
          value={parkingNote}
          onChange={(e) => setParkingNote(e.target.value)}
          maxLength={500}
          className={`mt-1 ${field}`}
          placeholder={t('parkingNotePlaceholder')}
        />
      </div>
    </div>
  );

  if (state === 'done') {
    return (
      <div className="rounded-xl bg-crowd-empty/10 p-6 text-center ring-1 ring-crowd-empty/30">
        <p className="text-base font-semibold text-sea-950">{t('thanksTitle')}</p>
        <p className="mt-1 text-sm text-sea-800/80">{t('thanksBody')}</p>
        {photoWarning && <p className="mt-2 text-xs text-red-600">{photoWarning}</p>}
        <button
          type="button"
          onClick={() => setState('idle')}
          className="mt-4 rounded-full bg-sea-600 px-4 py-2 text-sm font-medium text-white hover:bg-sea-800"
        >
          {t('addAnother')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Prijava (obavezno) */}
      <div className="rounded-lg bg-sea-50/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <AuthButton />
          <span className="text-[11px] leading-tight text-sea-800/70">{t('authNote')}</span>
        </div>
      </div>

      {isParking ? (
        <>
          <p className="text-sm text-sea-800/80">
            {t('parkingIntro', { beach: targetBeachName ?? '' })}
          </p>
          <div>
            <span className={labelCls}>{t('parkingLocation')} *</span>
            <p className="mb-2 text-xs text-sea-800/60">{t('mapHint')}</p>
            <LocationPicker
              value={parkingPoint}
              onChange={setParkingPoint}
              markerColor={PARKING_MARKER}
              initialCenter={targetCenter ?? null}
            />
          </div>

          {parkingFeeBlock}

          <div>
            <label htmlFor="sb-parking-photo" className={labelCls}>
              {t('parkingPhoto')}
            </label>
            <p className="mb-2 text-xs text-sea-800/60">{t('parkingPhotoHint')}</p>
            <input
              id="sb-parking-photo"
              type="file"
              accept={PHOTO_ACCEPT}
              onChange={(e) => setParkingPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-sea-800 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-sea-600 file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-sea-800"
            />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sb-name-hr" className={labelCls}>
                {t('nameHr')} *
              </label>
              <input
                id="sb-name-hr"
                value={nameHr}
                onChange={(e) => setNameHr(e.target.value)}
                maxLength={120}
                className={`mt-1 ${field}`}
                placeholder={t('namePlaceholder')}
              />
            </div>
            <div>
              <label htmlFor="sb-name-en" className={labelCls}>
                {t('nameEn')}
              </label>
              <input
                id="sb-name-en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                maxLength={120}
                className={`mt-1 ${field}`}
              />
            </div>
            <div>
              <label htmlFor="sb-municipality" className={labelCls}>
                {t('municipality')}
              </label>
              <input
                id="sb-municipality"
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
                maxLength={80}
                className={`mt-1 ${field}`}
              />
            </div>
            <div>
              <label htmlFor="sb-region" className={labelCls}>
                {t('region')}
              </label>
              <input
                id="sb-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                maxLength={80}
                className={`mt-1 ${field}`}
              />
            </div>
            <div>
              <label htmlFor="sb-surface" className={labelCls}>
                {t('surface')}
              </label>
              <select
                id="sb-surface"
                value={surfaceChoice}
                onChange={(e) => setSurfaceChoice(e.target.value)}
                className={`mt-1 ${field}`}
              >
                <option value="">{t('surfaceUnknown')}</option>
                {SURFACE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {tSurface(s)}
                  </option>
                ))}
                <option value="other">{t('surfaceOther')}</option>
              </select>
              {surfaceChoice === 'other' && (
                <input
                  value={surfaceOther}
                  onChange={(e) => setSurfaceOther(e.target.value)}
                  maxLength={40}
                  className={`mt-2 ${field}`}
                  placeholder={t('surfaceOtherPlaceholder')}
                />
              )}
            </div>
            <div>
              <label htmlFor="sb-length" className={labelCls}>
                {t('lengthM')}
              </label>
              <input
                id="sb-length"
                type="number"
                inputMode="numeric"
                min={1}
                max={50000}
                value={lengthM}
                onChange={(e) => setLengthM(e.target.value)}
                className={`mt-1 ${field}`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="sb-desc" className={labelCls}>
              {t('description')}
            </label>
            <textarea
              id="sb-desc"
              value={descriptionHr}
              onChange={(e) => setDescriptionHr(e.target.value)}
              maxLength={2000}
              rows={3}
              className={`mt-1 resize-y ${field}`}
            />
          </div>

          <fieldset>
            <legend className={labelCls}>{t('amenities')}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {AMENITY_FILTERS.map((am) => {
                const on = !!amenities[am];
                return (
                  <button
                    key={am}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAmenities((p) => ({ ...p, [am]: !p[am] }))}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      on
                        ? 'bg-sea-600 text-white'
                        : 'border border-sea-200 text-sea-800 hover:bg-sea-50'
                    }`}
                  >
                    {tAmenities(am)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className={labelCls}>{t('flags')}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {FILTER_FLAGS.map((fl) => {
                const on = !!flags[fl];
                return (
                  <button
                    key={fl}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFlags((p) => ({ ...p, [fl]: !p[fl] }))}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      on
                        ? 'bg-sea-600 text-white'
                        : 'border border-sea-200 text-sea-800 hover:bg-sea-50'
                    }`}
                  >
                    {tFlags(fl)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <span className={labelCls}>{t('beachLocation')} *</span>
            <p className="mb-2 text-xs text-sea-800/60">{t('mapHint')}</p>
            <LocationPicker value={beachPoint} onChange={setBeachPoint} markerColor={BEACH_MARKER} />
          </div>

          <div>
            <span className={labelCls}>{t('parkingOptional')}</span>
            <p className="mb-2 text-xs text-sea-800/60">{t('parkingOptionalHint')}</p>
            <LocationPicker
              value={parkingPoint}
              onChange={setParkingPoint}
              markerColor={PARKING_MARKER}
            />
            {parkingPoint && <div className="mt-4">{parkingFeeBlock}</div>}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit || state === 'sending' || signedIn === false}
          className="rounded-full bg-sea-600 px-5 py-2 text-sm font-medium text-white hover:bg-sea-800 disabled:opacity-50"
        >
          {state === 'sending' ? t('sending') : t('submit')}
        </button>
        {signedIn === false && <span className="text-xs text-sea-800/70">{t('mustSignIn')}</span>}
        {state === 'auth' && <span className="text-xs text-red-600">{t('mustSignIn')}</span>}
        {state === 'error' && <span className="text-xs text-red-600">{t('error')}</span>}
      </div>

      <p className="text-[11px] leading-tight text-sea-800/60">{t('moderationNote')}</p>
    </form>
  );
}
