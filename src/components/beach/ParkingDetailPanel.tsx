'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { beachName, type Beach, type ParkingFeeStatus } from '@/lib/beaches';
import { formatDistance, parkingFeeColor } from '@/lib/beachFilters';
import { getParkingPhotos, type BeachPhoto } from '@/lib/queries';
import PhotoCredit from './PhotoCredit';
import PhotoLightbox from './PhotoLightbox';
import SubmitBeachForm from './SubmitBeachForm';

interface ParkingDetailPanelProps {
  beach: Beach;
  locale: string;
  /** Zatvori panel parkinga. */
  onClose: () => void;
  /** Prijelaz na panel same plaže (parking je uvijek vezan uz plažu). */
  onOpenBeach: () => void;
}

/**
 * Panel parkinga — otvara se klikom na „P" marker na karti (stavka 5).
 * Parking nije zasebna tablica nego skup polja na plaži (0006 + 0010), pa panel
 * prima cijelu plažu i prikazuje samo njezin parking dio.
 *
 * Načelo prikaza: nepoznato se PRIZNAJE („cijena nije poznata") umjesto da se
 * izmisli iznos — isto pravilo koje vrijedi za kakvoću mora i sadržaje.
 */
export default function ParkingDetailPanel({
  beach,
  locale,
  onClose,
  onOpenBeach,
}: ParkingDetailPanelProps) {
  const t = useTranslations('Parking');
  const name = beachName(beach, locale);

  const [photos, setPhotos] = useState<BeachPhoto[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let active = true;
    getParkingPhotos(beach.id)
      .then((p) => active && setPhotos(p))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [beach.id]);

  const fee: ParkingFeeStatus = beach.parkingFeeStatus;
  const hasCoords = beach.parkingLat != null && beach.parkingLng != null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-sea-100 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight text-sea-950">
            {t('heading')}
          </h2>
          <p className="mt-0.5 truncate text-xs text-sea-800/70">{t('forBeach', { name })}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="shrink-0 rounded-full px-2 py-0.5 text-lg leading-none text-sea-800/60 hover:bg-sea-100"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {/* Naplata — glavna informacija zbog koje se panel i otvara */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white"
            style={{ background: parkingFeeColor(fee) }}
          >
            {t(`fee_${fee}`)}
          </span>
          {beach.parkingDistanceM != null && (
            <span className="text-sm text-sea-800/80">
              {t('distanceValue', {
                distance: formatDistance(beach.parkingDistanceM / 1000),
              })}
            </span>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3">
          <div className="flex justify-between gap-4 border-b border-sea-100 pb-2">
            <dt className="text-sm text-sea-800/70">{t('priceLabel')}</dt>
            <dd className="text-right text-sm font-medium text-sea-950">
              {beach.parkingPriceText ?? (fee === 'free' ? t('priceFree') : t('priceUnknown'))}
            </dd>
          </div>
          {beach.parkingNote && (
            <div className="flex justify-between gap-4 border-b border-sea-100 pb-2">
              <dt className="text-sm text-sea-800/70">{t('noteLabel')}</dt>
              <dd className="text-right text-sm font-medium text-sea-950">{beach.parkingNote}</dd>
            </div>
          )}
        </dl>

        <p className="mt-3 text-xs text-sea-800/60">{t('sourceNote')}</p>

        {/* Fotografije parkinga (odvojene od galerije plaže — photos.kind) */}
        <section aria-labelledby="parking-photos-heading" className="mt-6">
          <h3 id="parking-photos-heading" className="text-sm font-semibold text-sea-950">
            {t('photosHeading')}
          </h3>
          {photos.length === 0 ? (
            <p className="mt-2 text-sm text-sea-800/70">{t('photosEmpty')}</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {photos.map((p, i) => (
                <li
                  key={p.id}
                  className="overflow-hidden rounded-lg border border-sea-100 bg-sea-50"
                >
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    aria-label={t('openPhoto', { name })}
                    className="block w-full cursor-zoom-in transition hover:opacity-90"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Storage URL; bez next/image da ne troši Vercel kvotu */}
                    <img
                      src={p.url}
                      alt={t('photoAlt', { name })}
                      loading="lazy"
                      width={400}
                      height={300}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  </button>
                  <PhotoCredit photo={p} variant="caption" />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Akcije */}
        <div className="mt-6 flex flex-wrap gap-2">
          {hasCoords && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${beach.parkingLat},${beach.parkingLng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full bg-sea-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sea-800"
            >
              {t('directions')}
            </a>
          )}
          <button
            type="button"
            onClick={onOpenBeach}
            className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-sea-800 ring-1 ring-sea-200 transition hover:bg-sea-50"
          >
            {t('openBeach')}
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-sea-800 ring-1 ring-sea-200 transition hover:bg-sea-50"
          >
            {t('fix')}
          </button>
        </div>

        {showForm && (
          <section
            aria-label={t('fix')}
            className="mt-4 rounded-2xl bg-sea-50/60 p-4 ring-1 ring-sea-100"
          >
            <SubmitBeachForm
              mode="parking"
              targetBeachId={beach.id}
              targetBeachName={name}
              targetCenter={
                hasCoords
                  ? { lat: beach.parkingLat as number, lng: beach.parkingLng as number }
                  : { lat: beach.lat, lng: beach.lng }
              }
              initialParkingPoint={
                hasCoords
                  ? { lat: beach.parkingLat as number, lng: beach.parkingLng as number }
                  : null
              }
            />
          </section>
        )}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          beachName={name}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </div>
  );
}
