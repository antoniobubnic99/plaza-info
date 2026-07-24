'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { BeachPhoto } from '@/lib/queries';
import { submitPhoto, type SubmitPhotoResult } from '@/lib/photos';
import { ALLOWED_PHOTO_TYPES } from '@/lib/photoConfig';
import AuthButton from '@/components/auth/AuthButton';
import PhotoCredit from './PhotoCredit';

interface PhotosSectionProps {
  beachId: string;
  beachName: string;
  initialPhotos: BeachPhoto[];
}

const ACCEPT = Object.keys(ALLOWED_PHOTO_TYPES).join(',');

export default function PhotosSection({ beachId, beachName, initialPhotos }: PhotosSectionProps) {
  const t = useTranslations('Photos');
  const tAuth = useTranslations('Auth');
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'sending' | SubmitPhotoResult>('idle');

  async function handleFile(file: File | undefined) {
    if (!file || state === 'sending') return;
    setState('sending');
    const result = await submitPhoto(beachId, file);
    setState(result);
    if (inputRef.current) inputRef.current.value = ''; // dopusti ponovni odabir iste datoteke
  }

  const statusMessage =
    state === 'ok'
      ? t('thanksPending')
      : state === 'too_large'
        ? t('tooLarge')
        : state === 'unsupported'
          ? t('unsupported')
          : state === 'error'
            ? t('error')
            : null;

  return (
    <section aria-labelledby="photos-heading" className="mt-8">
      <h2 id="photos-heading" className="text-lg font-semibold text-sea-950">
        {t('heading')}
      </h2>

      {initialPhotos.length === 0 ? (
        <p className="mt-2 text-sm text-sea-800/70">{t('empty')}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {initialPhotos.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-lg border border-sea-100 bg-sea-50">
              {/* eslint-disable-next-line @next/next/no-img-element -- korisnički Storage URL; bez next/image optimizacije da ne troši Vercel kvotu */}
              <img
                src={p.url}
                alt={t('photoAlt', { name: beachName })}
                loading="lazy"
                width={400}
                height={300}
                className="aspect-[4/3] w-full object-cover"
              />
              <PhotoCredit photo={p} variant="caption" />
            </li>
          ))}
        </ul>
      )}

      {/* Upload */}
      <div className="mt-5 rounded-lg bg-sea-50/60 p-4">
        <p className="text-sm font-medium text-sea-950">{t('addTitle')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <AuthButton />
          <span className="text-[11px] leading-tight text-sea-800/55">{tAuth('optionalNote')}</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          disabled={state === 'sending'}
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="mt-2 block w-full text-sm text-sea-800 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-sea-600 file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-sea-800 disabled:opacity-50"
        />
        <div className="mt-3 min-h-5 text-xs">
          {state === 'sending' && <span className="text-sea-800/70">{t('sending')}</span>}
          {state === 'ok' && <span className="text-crowd-empty">{statusMessage}</span>}
          {(state === 'too_large' || state === 'unsupported' || state === 'error') && (
            <span className="text-red-600">{statusMessage}</span>
          )}
        </div>
        <p className="mt-1 text-[11px] leading-tight text-sea-800/55">{t('moderationNote')}</p>
      </div>
    </section>
  );
}
