import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import SubmitBeachForm from '@/components/beach/SubmitBeachForm';

// Javna forma za prijavu nove plaže. Prijava traži Google prijavu; ide u moderaciju.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Submit' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: true }, // korisnički alat, ne indeksirati
  };
}

export default async function SubmitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Submit' });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Link href="/" className="text-sm text-sea-600 hover:underline">
          ← {t('backToMap')}
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-sea-950">{t('title')}</h1>
        <p className="mt-1 text-sm text-sea-800/80">{t('intro')}</p>
      </div>
      <SubmitBeachForm mode="new_beach" />
    </main>
  );
}
