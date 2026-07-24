'use client';

import { useEffect, useRef, useState } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  color?: string;
}

interface FilterDropdownProps {
  label: string;
  options: DropdownOption[];
  /** Odabrane vrijednosti (za single-select izvedi kao [value] ili []). */
  selected: string[];
  onToggle: (value: string) => void;
  /** Pristupačan naziv za skup opcija (npr. „Vrsta plaže"). */
  ariaLabel?: string;
}

/**
 * Pristupačan multi-select padajući izbornik (checkbox lista u popoveru).
 * Bez teških ovisnosti — zatvara se na klik izvan i Escape. Za single-select
 * (rejting) roditelj izvede `selected` iz jedne vrijednosti, pa je uvijek ≤1 označen.
 */
export default function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  ariaLabel,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = selected.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
          count > 0
            ? 'border-sea-600 bg-sea-600 text-white'
            : 'border-sea-200 bg-white text-sea-800 hover:border-sea-400'
        }`}
      >
        {label}
        {count > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white/25 px-1 text-[10px] font-semibold text-white">
            {count}
          </span>
        )}
        <span aria-hidden className={`text-[10px] transition ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="group"
          aria-label={ariaLabel ?? label}
          className="absolute left-0 top-full z-30 mt-1.5 max-h-72 w-52 overflow-y-auto rounded-xl border border-sea-100 bg-white p-1.5 shadow-lg ring-1 ring-black/5"
        >
          {options.map((opt) => {
            const on = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sea-900 hover:bg-sea-50"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(opt.value)}
                  className="h-4 w-4 shrink-0 accent-sea-600"
                />
                {opt.color && (
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: opt.color }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
