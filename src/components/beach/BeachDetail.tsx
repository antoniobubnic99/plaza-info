'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { Beach, CrowdLevel } from '@/lib/beaches';
import { crowdColor } from '@/lib/beachFilters';
import { getLatestCrowdLevels } from '@/lib/queries';
import { reportCrowd } from '@/lib/crowd';
import type { MapFocus } from './MapView';

const CROWD_LEVELS: CrowdLevel[] = ['empty', 'moderate', 'packed'];

// MapLibre je isključivo klijentski (window/WebGL) → bez SSR-a.
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-sea-100" />,
});

interface BeachDetailProps {
  beach: Beach;
  locale: string;
}

/**
 * Interaktivni dio detalj-stranice: mini-karta s jednim markerom + prijava/prikaz gužve uživo.
 * Statični SEO sadržaj (naziv, opis, JSON-LD) živi u server komponenti (page.tsx).
 */
export default function BeachDetail({ beach }: BeachDetailProps) {
  const t = useTranslations('Beach');
  const tCrowd = useTranslations('Crowd');

  const [crowd, setCrowd] = useState<CrowdLevel | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  // Fokusiraj kartu na plažu odmah pri montiranju (karta se inicijalizira na pilot-centar).
  const [focus] = useState<MapFocus>(() => ({
    lng: beach.lng,
    lat: beach.lat,
    zoom: 14,
    nonce: Date.now(),
  }));

  // Dohvat zadnje razine gužve za ovu plažu (RPC vraća sve; ~71 red, uzmi svoju), osvježavaj svakih 60 s.
  useEffect(() => {
    let active = true;
    const load = () => {
      getLatestCrowdLevels()
        .then((levels) => {
          if (active) setCrowd(levels[beach.id] ?? null);
        })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [beach.id]);

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

  const crowdLevels = crowd ? { [beach.id]: crowd } : {};

  return (
    <div className="flex flex-col gap-4">
      <div className="h-64 w-full overflow-hidden rounded-2xl ring-1 ring-sea-100 sm:h-80">
        <MapView
          beaches={[beach]}
          crowdLevels={crowdLevels}
          selectedId={beach.id}
          onSelect={() => {}}
          focus={focus}
          userLocation={null}
        />
      </div>

      <section
        aria-labelledby="crowd-heading"
        className="rounded-2xl bg-sea-50/60 p-4 ring-1 ring-sea-100"
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
    </div>
  );
}
