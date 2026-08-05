import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return { title: t('title'), description: t('description') };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Omogući statički render za locale segmente.
  setRequestLocale(locale);

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        {/*
          Vercel Analytics: agregirani pregledi stranica bez kolačića i bez pohrane na
          uređaju — zato nema banner za pristanak (nema čemu pristajati po ePrivacy).
          Postojeći obrazac pristanka ostaje samo ondje gdje se pohranjuje ili traži
          osobni podatak (geolokacija). Politika privatnosti to navodi u odjeljku 5.
        */}
        <Analytics />
      </body>
    </html>
  );
}
