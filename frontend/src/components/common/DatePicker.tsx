/**
 * DatePicker — a lightweight, brand-matched calendar picker.
 *
 * Replaces native <input type="date"> where its two-step "click the month
 * header, then click again to get back to the day grid" flow feels clunky.
 * This one keeps month + year jumps to a single click (via the header
 * selects) and the day grid is always visible underneath — pick a date in
 * exactly one click, always.
 *
 * Controlled the same way a native date input is: value/onChange as
 * 'YYYY-MM-DD' strings, so it's a drop-in swap wherever <input type="date">
 * was used before.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';

const BRAND = { green: '#1A5C3A', gold: '#9B7C2A' };

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toISODate(y: number, m: number, d: number): string {
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function parseISODate(value?: string): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

function formatDisplay(value?: string): string {
  const parsed = parseISODate(value);
  if (!parsed) return '';
  const dt = new Date(parsed.y, parsed.m, parsed.d);
  return dt.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface DatePickerProps {
  value: string;                 // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void;
  min?: string;                  // 'YYYY-MM-DD'
  max?: string;                  // 'YYYY-MM-DD'
  placeholder?: string;
  className?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value, onChange, min, max, placeholder = 'Select date', className = '',
}) => {
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const today = new Date();

  const [viewYear, setViewYear] = useState(selected?.y ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.m ?? today.getMonth());

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) {
      setViewYear(selected.y);
      setViewMonth(selected.m);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const minParsed = parseISODate(min);
  const maxParsed = parseISODate(max);
  const minTime = minParsed ? new Date(minParsed.y, minParsed.m, minParsed.d).getTime() : null;
  const maxTime = maxParsed ? new Date(maxParsed.y, maxParsed.m, maxParsed.d).getTime() : null;

  const yearOptions = useMemo(() => {
    const lo = minParsed?.y ?? today.getFullYear() - 5;
    const hi = maxParsed?.y ?? today.getFullYear() + 5;
    const years: number[] = [];
    for (let y = lo; y <= hi; y++) years.push(y);
    return years;
  }, [min, max]); // eslint-disable-line react-hooks/exhaustive-deps

  const grid = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: { y: number; m: number; d: number; inMonth: boolean }[] = [];

    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push({ y, m, d, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ y: viewYear, m: viewMonth, d, inMonth: true });
    }
    while (cells.length % 7 !== 0 || cells.length < 42) {
      const last = cells[cells.length - 1];
      const nextDate = new Date(last.y, last.m, last.d + 1);
      cells.push({ y: nextDate.getFullYear(), m: nextDate.getMonth(), d: nextDate.getDate(), inMonth: false });
      if (cells.length >= 42) break;
    }
    return cells;
  }, [viewYear, viewMonth]);

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const isDisabled = (y: number, m: number, d: number) => {
    const t = new Date(y, m, d).getTime();
    if (minTime !== null && t < minTime) return true;
    if (maxTime !== null && t > maxTime) return true;
    return false;
  };

  const isSelected = (y: number, m: number, d: number) =>
    !!selected && selected.y === y && selected.m === m && selected.d === d;

  const isToday = (y: number, m: number, d: number) =>
    today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;

  const pick = (y: number, m: number, d: number) => {
    if (isDisabled(y, m, d)) return;
    onChange(toISODate(y, m, d));
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-left bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-200 transition"
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-2 w-72 bg-white rounded-xl border border-gray-100 shadow-xl overflow-hidden"
          style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.14)' }}
        >
          {/* Header — single-click month/year jump, day grid always visible below */}
          <div className="flex items-center justify-between px-3 py-2.5" style={{ background: BRAND.green }}>
            <button
              type="button"
              onClick={goPrevMonth}
              className="text-white/80 hover:text-white w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/10 transition"
              aria-label="Previous month"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
            </button>

            <div className="flex items-center gap-1.5">
              <select
                value={viewMonth}
                onChange={e => setViewMonth(Number(e.target.value))}
                className="bg-white/10 text-white text-xs font-semibold rounded-md px-1.5 py-1 outline-none cursor-pointer hover:bg-white/20 transition [&>option]:text-gray-800"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>{name}</option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={e => setViewYear(Number(e.target.value))}
                className="bg-white/10 text-white text-xs font-semibold rounded-md px-1.5 py-1 outline-none cursor-pointer hover:bg-white/20 transition [&>option]:text-gray-800"
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={goNextMonth}
              className="text-white/80 hover:text-white w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/10 transition"
              aria-label="Next month"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 px-2 pt-2.5 pb-1">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-[10px] font-semibold text-gray-400">{w}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5 px-2 pb-2.5">
            {grid.map(({ y, m, d, inMonth }, i) => {
              const disabled = isDisabled(y, m, d);
              const sel = isSelected(y, m, d);
              const tod = isToday(y, m, d);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(y, m, d)}
                  className={[
                    'h-8 w-8 mx-auto flex items-center justify-center text-xs rounded-full transition',
                    !inMonth ? 'text-gray-300' : 'text-gray-700',
                    disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-green-50 cursor-pointer',
                    sel ? 'text-white font-semibold' : '',
                    !sel && tod ? 'ring-1 ring-inset font-semibold' : '',
                  ].join(' ')}
                  style={{
                    ...(sel ? { background: BRAND.green } : {}),
                    ...(!sel && tod ? { color: BRAND.green, boxShadow: `inset 0 0 0 1px ${BRAND.green}` } : {}),
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Footer quick actions */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50">
            <button
              type="button"
              onClick={() => {
                const t = new Date();
                if (!isDisabled(t.getFullYear(), t.getMonth(), t.getDate())) {
                  pick(t.getFullYear(), t.getMonth(), t.getDate());
                } else {
                  setViewYear(t.getFullYear());
                  setViewMonth(t.getMonth());
                }
              }}
              className="text-xs font-semibold hover:underline"
              style={{ color: BRAND.green }}
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="text-xs font-semibold text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};