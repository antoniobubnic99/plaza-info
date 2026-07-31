'use client';

import { useTranslations } from 'next-intl';
import { beachName, type Beach, type CrowdLevel } from '@/lib/beaches';
import { crowdColor, formatDistance, markerColor, qualityIndex } from '@/lib/beachFilters';

type ListBeach = Beach & { distanceKm?: number };

interface BeachListProps {
  beaches: ListBeach[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  locale: string;
  showDistance: boolean;
  crowdLevels: Record<string, CrowdLevel>;
}

export default function BeachList({
  beaches,
  selectedId,
  onSelect,
  locale,
  showDistance,
  crowdLevels,
}: BeachListProps) {
  const t = useTranslations('Map');
  const tSurface = useTranslations('Surface');
  const tCrowd = useTranslations('Crowd');

  if (beaches.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-sea-800/60">{t('noResults')}</p>
    );
  }

  return (
    <ul className="divide-y divide-sea-100">
      {beaches.map((b) => {
        const selected = b.id === selectedId;
        const crowd = crowdLevels[b.id];
        return (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => onSelect(b.id)}
              aria-current={selected}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                selected ? 'bg-sea-50' : 'hover:bg-sea-50/60'
              }`}
            >
              {/* Točka nosi istu boju kao marker na karti (gužva ima prednost pred podlogom). */}
              <span
                aria-hidden
                className="mt-0.5 h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                style={{ background: markerColor(b.surfaceType, crowd) }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-sea-950">
                  {beachName(b, locale)}
                </span>
                <span className="block truncate text-xs text-sea-800/60">
                  {b.ratingCount > 0 ? (
                    <span className="font-medium text-amber-600">
                      ★ {b.ratingAvg.toFixed(1)}
                      <span className="mx-1 text-sea-800/40">·</span>
                    </span>
                  ) : (
                    /* Bez recenzija: indeks iz vlastitih podataka, u boji popisa (ne amber),
                       da se na prvi pogled razlikuje od prave ocjene posjetitelja. */
                    <span className="font-medium text-sea-800/80">
                      {t('qualityIndexShort', { score: qualityIndex(b) })}
                      <span className="mx-1 text-sea-800/40">·</span>
                    </span>
                  )}
                  {b.surfaceType ? tSurface(b.surfaceType) : t('surfaceUnknown')}
                  {b.municipality ? ` · ${b.municipality}` : ''}
                </span>
              </span>
              {/* Gužva uživo — vidljiva odmah u popisu, ne tek nakon otvaranja plaže. */}
              {crowd && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ background: crowdColor(crowd) }}
                >
                  {tCrowd(crowd)}
                </span>
              )}
              {showDistance && b.distanceKm != null && (
                <span className="shrink-0 rounded-full bg-sea-100 px-2 py-0.5 text-xs font-medium text-sea-800">
                  {formatDistance(b.distanceKm)}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
