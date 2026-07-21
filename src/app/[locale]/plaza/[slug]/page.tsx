import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getBeachBySlug, getBeachSlugs } from '@/lib/queries';
import { beachName, type Beach } from '@/lib/beaches';
import BeachDetail from '@/components/beach/BeachDetail';

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
    },
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

      <div className="mt-6">
        <BeachDetail beach={beach} locale={locale} />
      </div>

      <section aria-labelledby="about-heading" className="mt-8">
        <h2 id="about-heading" className="text-lg font-semibold text-sea-950">
          {t('aboutHeading')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-sea-800/90">
          {description ?? t('noDescription')}
        </p>
      </section>

      <section aria-labelledby="details-heading" className="mt-8">
        <h2 id="details-heading" className="text-lg font-semibold text-sea-950">
          {t('detailsHeading')}
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {surfaceLabel && (
            <div className="flex justify-between border-b border-sea-100 pb-2">
              <dt className="text-sm text-sea-800/70">{t('surfaceLabel')}</dt>
              <dd className="text-sm font-medium text-sea-950">{surfaceLabel}</dd>
            </div>
          )}
          {place && (
            <div className="flex justify-between border-b border-sea-100 pb-2">
              <dt className="text-sm text-sea-800/70">{t('locationLabel')}</dt>
              <dd className="text-sm font-medium text-sea-950">{place}</dd>
            </div>
          )}
          {beach.lengthM != null && (
            <div className="flex justify-between border-b border-sea-100 pb-2">
              <dt className="text-sm text-sea-800/70">{t('lengthLabel')}</dt>
              <dd className="text-sm font-medium text-sea-950">
                {t('lengthValue', { m: beach.lengthM })}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <div className="mt-8">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${beach.lat},${beach.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full bg-sea-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sea-800"
        >
          {t('directions')}
        </a>
      </div>
    </main>
  );
}
