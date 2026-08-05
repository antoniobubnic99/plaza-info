'use client';

import { useTranslations } from 'next-intl';
import { OSM_COPYRIGHT_URL } from '@/lib/legal';

/**
 * ODbL atribucija uz IZVEDENE podatke (podloga, sadržaji, parking). Licenca je traži
 * ondje gdje se podaci prikazuju — atribucija na samoj karti pokriva samo pločice.
 */
export default function OsmAttribution({ className = '' }: { className?: string }) {
  const t = useTranslations('Footer');
  return (
    <p className={`text-xs text-sea-800/60 ${className}`}>
      <a
        href={OSM_COPYRIGHT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline"
      >
        {t('osm')}
      </a>
    </p>
  );
}
