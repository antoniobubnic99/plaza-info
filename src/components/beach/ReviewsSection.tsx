'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { BeachReview } from '@/lib/queries';
import { submitReview } from '@/lib/reviews';

interface ReviewsSectionProps {
  beachId: string;
  initialReviews: BeachReview[];
  locale: string;
}

function Stars({ value }: { value: number }) {
  const full = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span aria-label={`${full}/5`} className="text-amber-500">
      {'★'.repeat(full)}
      <span className="text-sea-200">{'★'.repeat(5 - full)}</span>
    </span>
  );
}

export default function ReviewsSection({ beachId, initialReviews, locale }: ReviewsSectionProps) {
  const t = useTranslations('Reviews');
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'hr' ? 'hr-HR' : 'en-GB');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1 || state === 'sending') return;
    setState('sending');
    const ok = await submitReview({ beachId, rating, body: body.trim() || undefined });
    setState(ok ? 'done' : 'error');
    if (ok) {
      setRating(0);
      setBody('');
    }
  }

  return (
    <section aria-labelledby="reviews-heading" className="mt-8">
      <h2 id="reviews-heading" className="text-lg font-semibold text-sea-950">
        {t('heading')}
      </h2>

      {initialReviews.length === 0 ? (
        <p className="mt-2 text-sm text-sea-800/70">{t('empty')}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {initialReviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-sea-100 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <Stars value={r.rating} />
                <span className="text-xs text-sea-800/50">{fmt(r.createdAt)}</span>
              </div>
              {r.body && <p className="mt-1.5 text-sm text-sea-800/90">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* Forma za novu recenziju */}
      <form onSubmit={handleSubmit} className="mt-5 rounded-lg bg-sea-50/60 p-4">
        <p className="text-sm font-medium text-sea-950">{t('addTitle')}</p>

        <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label={t('ratingLabel')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={String(n)}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="text-2xl leading-none transition"
              style={{ color: (hover || rating) >= n ? '#f59e0b' : '#bcd3e6' }}
            >
              ★
            </button>
          ))}
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={t('bodyPlaceholder')}
          className="mt-3 w-full resize-y rounded-lg border border-sea-200 bg-white px-3 py-2 text-sm text-sea-950 outline-none focus:border-sea-600"
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={rating < 1 || state === 'sending'}
            className="rounded-full bg-sea-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sea-800 disabled:opacity-50"
          >
            {state === 'sending' ? t('sending') : t('submit')}
          </button>
          {state === 'done' && (
            <span className="text-xs text-crowd-empty">{t('thanksPending')}</span>
          )}
          {state === 'error' && <span className="text-xs text-red-600">{t('error')}</span>}
        </div>

        <p className="mt-2 text-[11px] leading-tight text-sea-800/55">{t('moderationNote')}</p>
      </form>
    </section>
  );
}
