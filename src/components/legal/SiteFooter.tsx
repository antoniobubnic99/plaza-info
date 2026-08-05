'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CONTACT_EMAIL, OSM_COPYRIGHT_URL } from '@/lib/legal';

interface SiteFooterProps {
  /**
   * `page` = pun footer ispod sadržaja (detalj-stranica, forme, pravne stranice).
   * `compact` = blok na dnu bočne trake karte, gdje naslovnica zauzima cijeli ekran
   * (`h-dvh`) pa klasičan footer nema kamo stati.
   */
  variant?: 'page' | 'compact';
}

export default function SiteFooter({ variant = 'page' }: SiteFooterProps) {
  const t = useTranslations('Footer');
  const year = new Date().getFullYear();

  const osmLink = (
    <a
      href={OSM_COPYRIGHT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline"
    >
      {t('osm')}
    </a>
  );

  if (variant === 'compact') {
    return (
      <footer className="shrink-0 border-t border-sea-100 px-4 py-2.5 text-[11px] leading-relaxed text-sea-800/60">
        <nav className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href="/privatnost" className="hover:underline">
            {t('privacy')}
          </Link>
          <span aria-hidden>·</span>
          <Link href="/uvjeti" className="hover:underline">
            {t('terms')}
          </Link>
          <span aria-hidden>·</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:underline">
            {t('copyright')}
          </a>
        </nav>
        <p className="mt-1">{osmLink}</p>
      </footer>
    );
  }

  return (
    <footer className="mt-12 border-t border-sea-100 pt-6 text-xs leading-relaxed text-sea-800/70">
      <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium text-sea-800">
        <Link href="/privatnost" className="hover:underline">
          {t('privacy')}
        </Link>
        <span aria-hidden className="text-sea-800/30">
          ·
        </span>
        <Link href="/uvjeti" className="hover:underline">
          {t('terms')}
        </Link>
        <span aria-hidden className="text-sea-800/30">
          ·
        </span>
        <a href={`mailto:${CONTACT_EMAIL}`} className="hover:underline">
          {t('copyright')}
        </a>
      </nav>
      <p className="mt-3">
        {t('osmLicense')} {osmLink}
      </p>
      <p className="mt-1">{t('sources')}</p>
      <p className="mt-3 text-sea-800/50">{t('rights', { year })}</p>
    </footer>
  );
}
