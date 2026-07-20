import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getBeaches } from '@/lib/queries';
import BeachExplorer from '@/components/beach/BeachExplorer';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Podaci plaža se rijetko mijenjaju — ISR: regeneriraj najviše jednom na sat.
export const revalidate = 3600;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const beaches = await getBeaches();

  return <BeachExplorer beaches={beaches} locale={locale} />;
}
