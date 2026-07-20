import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// next-intl plugin automatski pronalazi src/i18n/request.ts
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Slike s korisničkih uploada (Supabase Storage) konfiguriraju se u Fazi 3.
};

export default withNextIntl(nextConfig);
