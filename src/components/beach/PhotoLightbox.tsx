'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { BeachPhoto } from '@/lib/queries';
import PhotoCredit from './PhotoCredit';

interface PhotoLightboxProps {
  photos: BeachPhoto[];
  index: number;
  beachName: string;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}

/**
 * Modal za pregled fotografije u punoj veličini.
 *
 * Atribucija (CC uvjet) ide UZ sliku i u modalu — licenca vrijedi svugdje gdje se
 * slika prikazuje, ne samo u galeriji.
 * Dostupnost: aria-modal + Esc za izlaz + strelice za navigaciju + zadržavanje
 * fokusa unutar modala (Tab ne smije pobjeći na pozadinsku stranicu).
 */
export default function PhotoLightbox({
  photos,
  index,
  beachName,
  onClose,
  onIndexChange,
}: PhotoLightboxProps) {
  const t = useTranslations('Photos');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const photo = photos[index];
  const hasMultiple = photos.length > 1;

  const goPrev = useCallback(() => {
    onIndexChange((index - 1 + photos.length) % photos.length);
  }, [index, photos.length, onIndexChange]);

  const goNext = useCallback(() => {
    onIndexChange((index + 1) % photos.length);
  }, [index, photos.length, onIndexChange]);

  // Tipkovnica: Esc zatvara, strelice listaju, Tab kruži unutar modala.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (hasMultiple && e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
        return;
      }
      if (hasMultiple && e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, goPrev, goNext, hasMultiple]);

  // Fokus u modal pri otvaranju + zaključaj scroll pozadine.
  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!photo) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('photoAlt', { name: beachName })}
      ref={dialogRef}
      onClick={onClose} // klik na pozadinu zatvara
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()} // klik na sadržaj ne zatvara
        className="flex max-h-full w-full max-w-4xl flex-col items-center gap-3"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Storage/Wikimedia URL; bez next/image da ne troši Vercel kvotu */}
        <img
          src={photo.url}
          alt={t('photoAlt', { name: beachName })}
          className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
        />

        <div className="w-full rounded-lg bg-white/95 px-4 py-2">
          <PhotoCredit photo={photo} variant="caption" />
        </div>

        <div className="flex items-center gap-2">
          {hasMultiple && (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label={t('previous')}
                className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-sea-950 transition hover:bg-white"
              >
                ←
              </button>
              <span className="text-xs text-white/80">
                {index + 1} / {photos.length}
              </span>
              <button
                type="button"
                onClick={goNext}
                aria-label={t('next')}
                className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-sea-950 transition hover:bg-white"
              >
                →
              </button>
            </>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-full bg-sea-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sea-800"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
