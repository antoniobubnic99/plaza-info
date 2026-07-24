import type { BeachPhoto } from '@/lib/queries';

interface PhotoCreditProps {
  photo: BeachPhoto;
  /** `overlay` = poluprozirna traka preko slike (hero); `caption` = redak ispod slike (galerija). */
  variant?: 'overlay' | 'caption';
}

/**
 * Atribucija za seedane slike (Wikimedia/Mapillary) — obavezno po CC licenci.
 * Ne prikazuje ništa za korisničke fotke (nemaju attribution/license).
 */
export default function PhotoCredit({ photo, variant = 'caption' }: PhotoCreditProps) {
  if (!photo.attribution && !photo.license) return null;

  const text = [photo.attribution, photo.license].filter(Boolean).join(' · ');

  if (variant === 'overlay') {
    return (
      <span className="pointer-events-none absolute bottom-1 right-1 max-w-[90%] truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] leading-tight text-white/90">
        © {text}
      </span>
    );
  }

  return (
    <span className="block truncate px-1.5 py-1 text-[10px] leading-tight text-sea-800/60">
      © {text}
    </span>
  );
}
