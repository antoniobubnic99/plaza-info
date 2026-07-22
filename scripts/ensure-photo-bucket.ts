/**
 * PlažaInfo — jednokratna infra: stvori javno-čitljiv Storage bucket za fotke plaža.
 *
 * DDL nije potreban (Storage API radi preko service_role), pa se pokreće iz koda:
 *   set -a && . ./.env.local && set +a && npx tsx scripts/ensure-photo-bucket.ts
 *
 * Idempotentno: ako bucket već postoji, samo javi i izađi.
 */
import { createClient } from '@supabase/supabase-js';
import { PHOTO_BUCKET, MAX_PHOTO_BYTES, ALLOWED_PHOTO_TYPES } from '../src/lib/photoConfig';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Nedostaje NEXT_PUBLIC_SUPABASE_URL ili SUPABASE_SERVICE_ROLE_KEY. Učitaj .env.local.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  const { data: existing } = await admin.storage.getBucket(PHOTO_BUCKET);
  if (existing) {
    console.log(`Bucket "${PHOTO_BUCKET}" već postoji (public=${existing.public}). Ništa za raditi.`);
    return;
  }

  const { error } = await admin.storage.createBucket(PHOTO_BUCKET, {
    public: true,
    fileSizeLimit: MAX_PHOTO_BYTES,
    allowedMimeTypes: Object.keys(ALLOWED_PHOTO_TYPES),
  });

  if (error) {
    console.error(`Neuspjelo stvaranje bucketa "${PHOTO_BUCKET}":`, error.message);
    process.exit(1);
  }
  console.log(`Bucket "${PHOTO_BUCKET}" stvoren (public, ≤${MAX_PHOTO_BYTES} B, ${Object.keys(ALLOWED_PHOTO_TYPES).join('/')}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
