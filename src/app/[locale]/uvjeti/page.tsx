import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { CONTACT_EMAIL, LEGAL_UPDATED, ODBL_URL, OSM_COPYRIGHT_URL } from '@/lib/legal';
import SiteFooter from '@/components/legal/SiteFooter';

// Statična pravna stranica — isti slug na oba lokala (`/hr/uvjeti`, `/en/uvjeti`).
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Terms' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `/${locale}/uvjeti`,
      languages: { hr: '/hr/uvjeti', en: '/en/uvjeti' },
    },
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Terms' });

  const updated = new Date(LEGAL_UPDATED).toLocaleDateString(
    locale === 'hr' ? 'hr-HR' : 'en-GB',
  );

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="text-sm font-medium text-sea-600 hover:underline">
        {t('back')}
      </Link>

      <header className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight text-sea-950">{t('title')}</h1>
        <p className="mt-1 text-xs text-sea-800/60">{t('updated', { date: updated })}</p>
        <p className="mt-4 text-sm leading-relaxed text-sea-800/90">{t('intro')}</p>
      </header>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-sea-800/90">
        <section aria-labelledby="terms-service">
          <h2 id="terms-service" className="text-lg font-semibold text-sea-950">
            {t('serviceTitle')}
          </h2>
          <p className="mt-2">{t('serviceBody')}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>{t('serviceSea')}</li>
            <li>{t('serviceCrowd')}</li>
          </ul>
          <p className="mt-3 font-medium text-sea-950">{t('serviceSafety')}</p>
        </section>

        <section aria-labelledby="terms-contributions">
          <h2 id="terms-contributions" className="text-lg font-semibold text-sea-950">
            {t('contributionsTitle')}
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>{t('contributionsAuth')}</li>
            <li>{t('contributionsModeration')}</li>
            <li>{t('contributionsRules')}</li>
          </ul>
        </section>

        <section aria-labelledby="terms-photos">
          <h2 id="terms-photos" className="text-lg font-semibold text-sea-950">
            {t('photosTitle')}
          </h2>
          <p className="mt-2 font-medium text-sea-950">{t('photosWarranty')}</p>
          <p className="mt-2">{t('photosLicense')}</p>
          <p className="mt-2">{t('photosRemoval')}</p>
        </section>

        <section aria-labelledby="terms-osm">
          <h2 id="terms-osm" className="text-lg font-semibold text-sea-950">
            {t('osmTitle')}
          </h2>
          <p className="mt-2">{t('osmBody')}</p>
          <p className="mt-2">{t('osmDerived')}</p>
          <p className="mt-2">{t('osmSources')}</p>
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <a
              href={OSM_COPYRIGHT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sea-600 hover:underline"
            >
              openstreetmap.org/copyright
            </a>
            <a
              href={ODBL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sea-600 hover:underline"
            >
              opendatacommons.org/licenses/odbl
            </a>
          </p>
        </section>

        <section aria-labelledby="terms-copyright">
          <h2 id="terms-copyright" className="text-lg font-semibold text-sea-950">
            {t('copyrightTitle')}
          </h2>
          <p className="mt-2">{t('copyrightBody', { email: CONTACT_EMAIL })}</p>
          <p className="mt-3">{t('copyrightIntro')}</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>{t('copyrightItem1')}</li>
            <li>{t('copyrightItem2')}</li>
            <li>{t('copyrightItem3')}</li>
            <li>{t('copyrightItem4')}</li>
          </ol>
          <p className="mt-3">{t('copyrightCounter')}</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-2 inline-block font-medium text-sea-600 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </section>

        <section aria-labelledby="terms-liability">
          <h2 id="terms-liability" className="text-lg font-semibold text-sea-950">
            {t('liabilityTitle')}
          </h2>
          <p className="mt-2">{t('liabilityBody')}</p>
        </section>

        <section aria-labelledby="terms-changes">
          <h2 id="terms-changes" className="text-lg font-semibold text-sea-950">
            {t('changesTitle')}
          </h2>
          <p className="mt-2">{t('changesBody')}</p>
        </section>

        <section aria-labelledby="terms-law">
          <h2 id="terms-law" className="text-lg font-semibold text-sea-950">
            {t('lawTitle')}
          </h2>
          <p className="mt-2">{t('lawBody')}</p>
        </section>

        <section aria-labelledby="terms-contact">
          <h2 id="terms-contact" className="text-lg font-semibold text-sea-950">
            {t('contactTitle')}
          </h2>
          <p className="mt-2">{t('contactBody', { email: CONTACT_EMAIL })}</p>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
