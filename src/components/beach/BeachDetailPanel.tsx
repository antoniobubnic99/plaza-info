'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { beachName, type Beach, type CrowdLevel } from '@/lib/beaches';
import { crowdColor, formatDistance, seaQualityColor } from '@/lib/beachFilters';
import {
  getBeachPhotos,
  getBeachReviews,
  getBeachSeaQuality,
  getLatestCrowdLevels,
  type BeachPhoto,
  type BeachReview,
  type SeaQualitySample,
} from '@/lib/queries';
import { reportCrowd } from '@/lib/crowd';
import type { MapFocus } from './MapView';
import PhotosSection from './PhotosSection';
import PhotoCredit from './PhotoCredit';
import ReviewsSection from './ReviewsSection';

const CROWD_LEVELS: CrowdLevel[] = ['empty', 'moderate', 'packed'];
const AMENITY_KEYS = ['showers', 'wc', 'bar', 'loungers', 'lifeguard'] as const;
const FLAG_KEYS = ['dogs', 'nudist', 'accessible'] as const;

// MapLibre je isključivo klijentski (window/WebGL) → bez SSR-a. Mini-karta samo na detalj-stranici.
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-sea-100" />,
});

interface BeachDetailPanelProps {
  beach: Beach;
  locale: string;
  /** `panel` = inline u appu (explorer, 3. zona); `page` = SSG detalj-stranica. */
  variant?: 'panel' | 'page';
  /** Zračna udaljenost od korisnika (samo kad je „blizu mene" aktivno). */
  distanceKm?: number | null;
  /** Zatvori panel — samo `panel` varijanta. */
  onClose?: () => void;
  /** SSR podaci s detalj-stranice; kad izostanu (panel), komponenta ih dohvaća sama. */
  initialSeaQuality?: SeaQualitySample | null;
  initialPhotos?: BeachPhoto[];
  initialReviews?: BeachReview[];
}

/**
 * Zajednički bogati prikaz plaže — koristi ga i in-app panel (BeachExplorer) i
 * SSG detalj-stranica (`plaza/[slug]`). Jedan izvor istine → nema drifta sadržaja.
 * Statični SEO okvir (h1, JSON-LD, hero, hreflang) ostaje u server komponenti stranice.
 */
export default function BeachDetailPanel({
  beach,
  locale,
  variant = 'panel',
  distanceKm = null,
  onClose,
  initialSeaQuality,
  initialPhotos,
  initialReviews,
}: BeachDetailPanelProps) {
  const t = useTranslations('Beach');
  const tSurface = useTranslations('Surface');
  const tFlags = useTranslations('Flags');
  const tAmenities = useTranslations('Amenities');
  const tCrowd = useTranslations('Crowd');
  const tSea = useTranslations('SeaQuality');

  const name = beachName(beach, locale);
  const place = beach.municipality ?? beach.region ?? null;
  const description = locale === 'en' ? beach.descriptionEn : beach.descriptionHr;
  const surfaceLabel = beach.surfaceType ? tSurface(beach.surfaceType) : null;
  const isPanel = variant === 'panel';
  const metaLine = [
    surfaceLabel,
    place,
    distanceKm != null ? formatDistance(distanceKm) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const [sea, setSea] = useState<SeaQualitySample | null>(initialSeaQuality ?? null);
  const [photos, setPhotos] = useState<BeachPhoto[]>(initialPhotos ?? []);
  const [reviews, setReviews] = useState<BeachReview[]>(initialReviews ?? []);
  const [crowd, setCrowd] = useState<CrowdLevel | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [shared, setShared] = useState(false);

  // Panel varijanta nema SSR podatke → dohvat kakvoće mora / fotki / recenzija po plaži.
  // (Explorer remounta panel po beach.id, pa je početno stanje uvijek svježe.)
  useEffect(() => {
    if (initialSeaQuality !== undefined) return;
    let active = true;
    getBeachSeaQuality(beach.id)
      .then((s) => active && setSea(s))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [beach.id, initialSeaQuality]);

  useEffect(() => {
    if (initialPhotos !== undefined) return;
    let active = true;
    getBeachPhotos(beach.id)
      .then((p) => active && setPhotos(p))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [beach.id, initialPhotos]);

  useEffect(() => {
    if (initialReviews !== undefined) return;
    let active = true;
    getBeachReviews(beach.id)
      .then((r) => active && setReviews(r))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [beach.id, initialReviews]);

  // Živa gužva za ovu plažu (RPC vraća sve; uzmi svoju), osvježavaj svakih 60 s.
  useEffect(() => {
    let active = true;
    const load = () =>
      getLatestCrowdLevels()
        .then((levels) => active && setCrowd(levels[beach.id] ?? null))
        .catch(() => {});
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [beach.id]);

  // Fokus mini-karte na plažu pri montiranju (init jednom; panel se remounta po beach.id).
  const [mapFocus] = useState<MapFocus>(() => ({
    lng: beach.lng,
    lat: beach.lat,
    zoom: 14,
    nonce: Date.now(),
  }));

  async function handleReport(level: CrowdLevel) {
    if (reporting) return;
    setReporting(true);
    const ok = await reportCrowd(beach.id, level, null);
    setReporting(false);
    if (ok) {
      setCrowd(level);
      setReported(true);
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}/${locale}/plaza/${beach.slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: name, url });
        return;
      } catch {
        /* korisnik odustao → padni na kopiranje */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch {
      /* clipboard nedostupan → tiho */
    }
  }

  const activeFlags = FLAG_KEYS.filter((fl) => beach.flags[fl]);
  const activeAmenities = AMENITY_KEYS.filter((am) => beach.amenities[am]);
  const hero = photos[0];

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {isPanel && (
        <header className="sticky top-0 z-10 border-b border-sea-100 bg-white/95 backdrop-blur">
          {hero && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- Storage URL; bez next/image da ne troši Vercel kvotu */}
              <img
                src={hero.url}
                alt={t('heroAlt', { name })}
                width={760}
                height={280}
                className="aspect-[760/280] w-full object-cover"
              />
              <PhotoCredit photo={hero} variant="overlay" />
            </div>
          )}
          <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight text-sea-950">
                {name}
              </h2>
              {metaLine && <p className="mt-0.5 truncate text-xs text-sea-800/70">{metaLine}</p>}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('close')}
                className="shrink-0 rounded-full px-2 py-0.5 text-lg leading-none text-sea-800/60 hover:bg-sea-100"
              >
                ✕
              </button>
            )}
          </div>
        </header>
      )}

      <div className={`min-h-0 flex-1 ${isPanel ? 'overflow-y-auto px-4 pb-6' : ''}`}>
        {/* Ocjena posjetitelja (agregat iz odobrenih recenzija) */}
        {beach.ratingCount > 0 && (
          <div className={isPanel ? 'mt-4' : ''}>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 ring-1 ring-amber-200">
              <span className="text-sm font-semibold text-amber-600">
                ★ {beach.ratingAvg.toFixed(1)}
              </span>
              <span className="text-xs text-sea-800/70">
                {t('reviewsSummary', { count: beach.ratingCount })}
              </span>
            </div>
          </div>
        )}

        {/* Kakvoća mora (IZOR) */}
        {sea?.assessment && (
          <section aria-labelledby="sea-heading" className={isPanel ? 'mt-6' : 'mt-8'}>
            <h2 id="sea-heading" className="text-lg font-semibold text-sea-950">
              {tSea('heading')}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white"
                style={{ background: seaQualityColor(sea.assessment) }}
              >
                {tSea(sea.assessment)}
              </span>
              {sea.seaTemp != null && (
                <span className="text-sm text-sea-800/80">
                  {tSea('seaTemp', { temp: sea.seaTemp })}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-sea-800/60">
              {tSea('note')}
              {` · ${tSea('sampled', {
                date: new Date(sea.sampledAt).toLocaleDateString(
                  locale === 'hr' ? 'hr-HR' : 'en-GB',
                ),
              })}`}
            </p>
          </section>
        )}

        {/* Mini-karta — samo na detalj-stranici (u exploreru je velika karta pored). */}
        {variant === 'page' && (
          <div className="mt-6 h-64 w-full overflow-hidden rounded-2xl ring-1 ring-sea-100 sm:h-80">
            <MapView
              beaches={[beach]}
              crowdLevels={crowd ? { [beach.id]: crowd } : {}}
              selectedId={beach.id}
              onSelect={() => {}}
              focus={mapFocus}
              userLocation={null}
            />
          </div>
        )}

        {/* Živa gužva (crowdsourced) */}
        <section
          aria-labelledby="crowd-heading"
          className="mt-6 rounded-2xl bg-sea-50/60 p-4 ring-1 ring-sea-100"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="crowd-heading" className="text-sm font-semibold text-sea-950">
              {t('crowdHeading')}
            </h2>
            <span className="text-xs text-sea-800/60">{t('crowdNote')}</span>
          </div>
          <p className="mt-1 text-xs font-medium text-sea-800/70">
            {crowd ? `${tCrowd('question')} ${tCrowd(crowd)}` : tCrowd('question')}
          </p>
          <div className="mt-2 flex gap-2">
            {CROWD_LEVELS.map((lvl) => {
              const isCurrent = crowd === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => handleReport(lvl)}
                  disabled={reporting}
                  aria-pressed={isCurrent}
                  className="flex-1 rounded-full px-3 py-2 text-sm font-medium text-white transition disabled:opacity-60"
                  style={{
                    background: crowdColor(lvl),
                    outline: isCurrent ? '2px solid #0d2b4a' : 'none',
                    outlineOffset: '1px',
                  }}
                >
                  {tCrowd(lvl)}
                </button>
              );
            })}
          </div>
          {reported && <p className="mt-2 text-xs text-crowd-empty">{tCrowd('thanks')}</p>}
        </section>

        {/* Sadržaji + oznake (samo panel; stranica ih ima u <header>) */}
        {isPanel && (activeFlags.length > 0 || activeAmenities.length > 0) && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {activeFlags.map((fl) => (
              <span
                key={fl}
                className="rounded-full bg-sea-50 px-2.5 py-0.5 text-xs font-medium text-sea-800 ring-1 ring-sea-200"
              >
                {tFlags(fl)}
              </span>
            ))}
            {activeAmenities.map((am) => (
              <span
                key={am}
                className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sea-800 ring-1 ring-sand-200"
              >
                {tAmenities(am)}
              </span>
            ))}
          </div>
        )}

        {/* O plaži */}
        <section aria-labelledby="about-heading" className="mt-8">
          <h2 id="about-heading" className="text-lg font-semibold text-sea-950">
            {t('aboutHeading')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-sea-800/90">
            {description ?? t('noDescription')}
          </p>
        </section>

        {/* Detalji */}
        {(surfaceLabel || place || beach.lengthM != null) && (
          <section aria-labelledby="details-heading" className="mt-8">
            <h2 id="details-heading" className="text-lg font-semibold text-sea-950">
              {t('detailsHeading')}
            </h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {surfaceLabel && (
                <div className="flex justify-between border-b border-sea-100 pb-2">
                  <dt className="text-sm text-sea-800/70">{t('surfaceLabel')}</dt>
                  <dd className="text-sm font-medium text-sea-950">{surfaceLabel}</dd>
                </div>
              )}
              {place && (
                <div className="flex justify-between border-b border-sea-100 pb-2">
                  <dt className="text-sm text-sea-800/70">{t('locationLabel')}</dt>
                  <dd className="text-sm font-medium text-sea-950">{place}</dd>
                </div>
              )}
              {beach.lengthM != null && (
                <div className="flex justify-between border-b border-sea-100 pb-2">
                  <dt className="text-sm text-sea-800/70">{t('lengthLabel')}</dt>
                  <dd className="text-sm font-medium text-sea-950">
                    {t('lengthValue', { m: beach.lengthM })}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}

        <PhotosSection beachId={beach.id} beachName={name} initialPhotos={photos} />

        <ReviewsSection beachId={beach.id} initialReviews={reviews} locale={locale} />

        {/* Akcije */}
        <div className="mt-8 flex flex-wrap gap-2">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${beach.lat},${beach.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full bg-sea-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sea-800"
          >
            {t('directions')}
          </a>
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-sea-800 ring-1 ring-sea-200 transition hover:bg-sea-50"
          >
            {shared ? t('shareCopied') : t('share')}
          </button>
          {beach.osmId && (
            <a
              href={`https://www.openstreetmap.org/${beach.osmId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-sea-800 ring-1 ring-sea-200 transition hover:bg-sea-50"
            >
              OSM
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
