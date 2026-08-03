import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Health-check za vanjski nadzor (UptimeRobot) i keep-alive.
// Namjerno dodiruje bazu: Vercel može biti živ dok je Supabase pauziran,
// a upravo je pauza ono što ruši build od 1706 SSG stranica.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ts = new Date().toISOString();

  if (!supabase) {
    return NextResponse.json({ ok: false, db: false, ts, error: 'not_configured' }, { status: 503 });
  }

  // Najlakši mogući upit — jedan id, bez ijednog korisničkog podatka u odgovoru.
  const { error } = await supabase.from('beaches').select('id').limit(1);

  if (error) {
    // Poruka iz baze se NE prosljeđuje van (može otkriti shemu).
    console.error('[health] Supabase upit pao:', error.message);
    return NextResponse.json({ ok: false, db: false, ts }, { status: 503 });
  }

  return NextResponse.json(
    { ok: true, db: true, ts },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
