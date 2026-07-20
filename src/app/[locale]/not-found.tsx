import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('NotFound');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-sky-950">{t('title')}</h1>
      <Link href="/" className="text-sky-700 underline underline-offset-4">
        {t('back')}
      </Link>
    </main>
  );
}
