/**
 * Shared half-year (H1/H2) date logic.
 *
 * H1 = Apr 1 – Sep 30, H2 = Oct 1 – Mar 31 (next year) — matches the
 * backend's _half_dates/_current_half/_preceding_half in
 * app/routers/csat_cycles.py and app/routers/project_staging.py exactly.
 *
 * This used to be copy-pasted independently in CsatCycleDetailPage.tsx and
 * SelectProjectsPage.tsx — two copies that could silently drift apart if
 * the boundary logic ever changed in only one place. Both now import from
 * here instead.
 */

export type Half = 'H1' | 'H2';

export function currentHalf(today: Date): { year: number; half: Half } {
  const month = today.getMonth() + 1; // JS months are 0-indexed
  if (month >= 4 && month <= 9) return { year: today.getFullYear(), half: 'H1' };   // Apr–Sep
  if (month >= 10) return { year: today.getFullYear(), half: 'H2' };                 // Oct–Dec (this year's H2)
  return { year: today.getFullYear() - 1, half: 'H2' };                              // Jan–Mar: still last Oct's H2
}

export function precedingHalf(year: number, half: Half): { year: number; half: Half } {
  return half === 'H1' ? { year: year - 1, half: 'H2' } : { year, half: 'H1' };
}

// The half-year that opens immediately after the given one — e.g. once H1
// 2026 is in use, the next creatable window is H2 2026; once H2 2026 is in
// use (Oct 2026 – Mar 2027), the next is H1 2027. Mirrors halfDates' own
// boundary math so "next window opens" always lines up with the actual date
// the new half starts.
export function nextHalf(year: number, half: Half): { year: number; half: Half } {
  return half === 'H1' ? { year, half: 'H2' } : { year: year + 1, half: 'H1' };
}

export function halfDates(year: number, half: Half): [Date, Date] {
  if (half === 'H1') return [new Date(year, 3, 1), new Date(year, 8, 30, 23, 59, 59)];   // Apr 1 – Sep 30
  return [new Date(year, 9, 1), new Date(year + 1, 2, 31, 23, 59, 59)];                   // Oct 1 – Mar 31 (next year)
}