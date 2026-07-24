import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import {
  getBeachBySlug,
  getBeachHeroPhoto,
  getBeachPhotos,
  getBeachReviews,
  getBeachSeaQuality,
  getBeachSlugs,
} from '@/lib/queries';
import { beachName, type Beach } from '@/lib/beaches';
import BeachDetailPanel from '@/components/beach/BeachDetailPanel';

// Podaci plaža se rijetko mijenjaju — ISR: regeneriraj najviše jednom na sat.
export const revalidate = 3600;
// Dozvoli render i za slugove izostavljene iz build-time skupa (ISR na zahtjev).
export const dynamicParams = true;

// Booleani sadržaji iz `amenities` jsonb-a koje prikazujemo kao čipove.
const AMENITY_KEYS = ['showers', 'wc', 'bar', 'loungers', 'lifeguard'] as const;

export async function generateStaticParams() {
  const slugs = await getBeachSlugs();
  return routing.locales.flatMap((locale) =>
    slugs.map((slug) => ({ locale, slug })),
  );
}

function placeOf(beach: Beach): string | null {
  return beach.municipality ?? beach.region ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const beach = await getBeachBySlug(slug);
  if (!beach) return {};

  const t = await getTranslations({ locale, namespace: 'Beach' });
  const tSurface = await getTranslations({ locale, namespace: 'Surface' });
  const name = beachName(beach, locale);
  const surface = beach.surfaceType
    ? tSurface(beach.surfaceType).toLowerCase()
    : locale === 'hr'
      ? 'jadranska'
      : 'seaside';
  const place = placeOf(beach);
  const description = place
    ? t('metaDescription', { name, surface, place })
    : t('metaDescriptionNoPlace', { name, surface });

  const path = `/plaza/${slug}`;
  const heroPhoto = await getBeachHeroPhoto(beach.id);
  // Storage URL je apsolutan (https) → koristimo ga izravno kao OG sliku, bez next/image.
  const ogImages = heroPhoto
    ? [{ url: heroPhoto.url, width: 1200, height: 630, alt: name }]
    : undefined;

  return {
    title: `${name} — PlažaInfo`,
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: { hr: `/hr${path}`, en: `/en${path}` },
    },
    openGraph: {
      title: `${name} — PlažaInfo`,
      description,
      type: 'article',
      locale: locale === 'hr' ? 'hr_HR' : 'en_US',
      ...(ogImages ? { images: ogImages } : {}),
    },
    ...(heroPhoto
      ? {
          twitter: {
            card: 'summary_large_image',
            title: `${name} — PlažaInfo`,
            description,
            images: [heroPhoto.url],
          },
        }
      : {}),
  };
}

export default async function BeachPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const beach = await getBeachBySlug(slug);
  if (!beach) notFound();

  const t = await getTranslations({ locale, namespace: 'Beach' });
  const tSurface = await getTranslations({ locale, namespace: 'Surface' });
  const tFlags = await getTranslations({ locale, namespace: 'Flags' });
  const tAmenities = await getTranslations({ locale, namespace: 'Amenities' });

  // SSR podaci → predaju se panelu kao initial (bez client fetch flickera; ostaju u HTML-u za SEO).
  const seaQuality = await getBeachSeaQuality(beach.id);
  const reviews = await getBeachReviews(beach.id);
  const photos = await getBeachPhotos(beach.id);

  const name = beachName(beach, locale);
  const place = placeOf(beach);
  const description = locale === 'en' ? beach.descriptionEn : beach.descriptionHr;
  const surfaceLabel = beach.surfaceType ? tSurface(beach.surfaceType) : null;

  const activeFlags = (['dogs', 'nudist', 'accessible'] as const).filter(
    (fl) => beach.flags[fl],
  );
  const activeAmenities = AMENITY_KEYS.filter((k) => beach.amenities[k]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Beach',
    name,
    ...(description ? { description } : {}),
    ...(beach.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: beach.ratingAvg,
            reviewCount: beach.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    geo: {
      '@type': 'GeoCoordinates',
      latitude: beach.lat,
      longitude: beach.lng,
    },
    ...(place
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(beach.municipality ? { addressLocality: beach.municipality } : {}),
            ...(beach.region ? { addressRegion: beach.region } : {}),
            addressCountry: 'HR',
          },
        }
      : {}),
  };

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link
        href="/"
        className="inline-block text-sm font-medium text-sea-600 hover:underline"
      >
        {t('backToMap')}
      </Link>

      {photos.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-sea-100 bg-sea-50">
          {/* eslint-disable-next-line @next/next/no-img-element -- korisnički Storage URL; bez next/image optimizacije da ne troši Vercel kvotu */}
          <img
            src={photos[0].url}
            alt={t('heroAlt', { name })}
            width={1200}
            height={630}
            fetchPriority="high"
            className="aspect-[1200/630] w-full object-cover"
          />
        </div>
      )}

      <header className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight text-sea-950 sm:text-4xl">
          {name}
        </h1>
        <p className="mt-1 text-sm text-sea-800/70">
          {surfaceLabel ?? ''}
          {surfaceLabel && place ? ' · ' : ''}
          {place ?? ''}
        </p>

        {(activeFlags.length > 0 || activeAmenities.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
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
      </header>

      {/* Zajednički panel (isti kao in-app), varijanta `page` — reuse bez drifta sadržaja. */}
      <div className="mt-2">
        <BeachDetailPanel
          beach={beach}
          locale={locale}
          variant="page"
          initialSeaQuality={seaQuality}
          initialPhotos={photos}
          initialReviews={reviews}
        />
      </div>
    </main>
  );
}
