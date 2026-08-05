import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { CONTACT_EMAIL, LEGAL_UPDATED } from '@/lib/legal';
import SiteFooter from '@/components/legal/SiteFooter';

// Statična pravna stranica — isti slug na oba lokala (`/hr/privatnost`, `/en/privatnost`),
// da poveznica u footeru i u dijalogu pristanka ostane jedna.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Privacy' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `/${locale}/privatnost`,
      languages: { hr: '/hr/privatnost', en: '/en/privatnost' },
    },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Privacy' });

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
        <section aria-labelledby="privacy-data">
          <h2 id="privacy-data" className="text-lg font-semibold text-sea-950">
            {t('dataTitle')}
          </h2>
          <p className="mt-2">{t('dataIntro')}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>{t('dataAccount')}</li>
            <li>{t('dataContributions')}</li>
            <li>{t('dataDevice')}</li>
            <li>{t('dataLocation')}</li>
            <li>{t('dataTechnical')}</li>
          </ul>
        </section>

        <section aria-labelledby="privacy-purpose">
          <h2 id="privacy-purpose" className="text-lg font-semibold text-sea-950">
            {t('purposeTitle')}
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>{t('purposeService')}</li>
            <li>{t('purposeConsent')}</li>
            <li>{t('purposeLegitimate')}</li>
          </ul>
        </section>

        <section aria-labelledby="privacy-retention">
          <h2 id="privacy-retention" className="text-lg font-semibold text-sea-950">
            {t('retentionTitle')}
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>{t('retentionContributions')}</li>
            <li>{t('retentionRejected')}</li>
            <li>{t('retentionAccount')}</li>
            <li>{t('retentionTechnical')}</li>
          </ul>
        </section>

        <section aria-labelledby="privacy-sharing">
          <h2 id="privacy-sharing" className="text-lg font-semibold text-sea-950">
            {t('sharingTitle')}
          </h2>
          <p className="mt-2">{t('sharingIntro')}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>{t('sharingSupabase')}</li>
            <li>{t('sharingVercel')}</li>
            <li>{t('sharingGoogle')}</li>
            <li>{t('sharingMaps')}</li>
          </ul>
          <p className="mt-3">{t('sharingLegal')}</p>
        </section>

        <section aria-labelledby="privacy-cookies">
          <h2 id="privacy-cookies" className="text-lg font-semibold text-sea-950">
            {t('cookiesTitle')}
          </h2>
          <p className="mt-2">{t('cookiesBody')}</p>
        </section>

        <section aria-labelledby="privacy-rights">
          <h2 id="privacy-rights" className="text-lg font-semibold text-sea-950">
            {t('rightsTitle')}
          </h2>
          <p className="mt-2">{t('rightsBody')}</p>
          <p className="mt-2">{t('rightsAuthority')}</p>
        </section>

        <section aria-labelledby="privacy-children">
          <h2 id="privacy-children" className="text-lg font-semibold text-sea-950">
            {t('childrenTitle')}
          </h2>
          <p className="mt-2">{t('childrenBody')}</p>
        </section>

        <section aria-labelledby="privacy-changes">
          <h2 id="privacy-changes" className="text-lg font-semibold text-sea-950">
            {t('changesTitle')}
          </h2>
          <p className="mt-2">{t('changesBody')}</p>
        </section>

        <section aria-labelledby="privacy-contact">
          <h2 id="privacy-contact" className="text-lg font-semibold text-sea-950">
            {t('contactTitle')}
          </h2>
          <p className="mt-2">{t('contactBody', { email: CONTACT_EMAIL })}</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-1 inline-block font-medium text-sea-600 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
