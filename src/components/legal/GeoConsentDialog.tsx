'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

interface GeoConsentDialogProps {
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Kratak pristanak prije nego što uopće pozovemo Geolocation API. Preglednikov
 * dijalog dolazi tek nakon „Dozvoli" — dvostruko pitanje je namjerno: prvo naše
 * (zašto tražimo lokaciju i što s njom radimo), pa preglednikovo (stvarno dopuštenje).
 */
export default function GeoConsentDialog({ onAccept, onDecline }: GeoConsentDialogProps) {
  const t = useTranslations('Geo');

  // Escape = odustajanje; bez toga je dijalog zamka za tipkovnicu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDecline();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDecline]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="geo-consent-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-sea-950/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="geo-consent-title" className="text-base font-semibold text-sea-950">
          {t('consentTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-sea-800/90">{t('consentBody')}</p>
        <p className="mt-2 text-xs leading-relaxed text-sea-800/70">{t('consentStorage')}</p>
        <Link
          href="/privatnost"
          className="mt-2 inline-block text-xs font-medium text-sea-600 hover:underline"
        >
          {t('consentMore')}
        </Link>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            autoFocus
            onClick={onAccept}
            className="flex-1 rounded-full bg-sea-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sea-800"
          >
            {t('accept')}
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 rounded-full bg-white px-4 py-2 text-sm font-medium text-sea-800 ring-1 ring-sea-200 transition hover:bg-sea-50"
          >
            {t('decline')}
          </button>
        </div>
      </div>
    </div>
  );
}
