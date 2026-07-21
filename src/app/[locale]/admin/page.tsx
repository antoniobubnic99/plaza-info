import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import AdminPanel from '@/components/admin/AdminPanel';

// Interni alat — ne indeksiraj i ne pre-renderiraj (ovisi o tokenu iz localStorage).
export const metadata: Metadata = {
  title: 'Admin — PlažaInfo',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AdminPanel locale={locale} />;
}
