import { PHASES } from '../domain/program'
import type { PhaseNumber } from '../domain/types'

/** Local-date helpers (YYYY-MM-DD, no timezone drift). */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/**
 * Suggested date for the next session (resolution #7).
 * The rotation pointer decides WHAT is next; this only suggests WHEN.
 * - Phases 1–2: next Mon / Wed / Fri, at least one rest day after the last session.
 * - Phase 3: every other day.
 * - Phase 4: daily, Sundays off.
 */
export function suggestNextDate(phase: PhaseNumber, lastSessionDate: string | null, today: Date): Date {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const type = PHASES[phase].schedule_type
  if (!lastSessionDate) {
    if (type === 'FIXED_WEEKLY') return nextMatching(t, (d) => [1, 3, 5].includes(d.getDay()), true)
    return t
  }
  const last = fromISODate(lastSessionDate)
  if (type === 'FIXED_WEEKLY') {
    const earliest = addDays(last, 2)
    const from = earliest > t ? earliest : t
    return nextMatching(from, (d) => [1, 3, 5].includes(d.getDay()))
  }
  if (type === 'ROLLING_EVERY_OTHER_DAY') {
    const d = addDays(last, 2)
    return d > t ? d : t
  }
  const d = addDays(last, 1)
  const from = d > t ? d : t
  return nextMatching(from, (x) => x.getDay() !== 0)
}

function nextMatching(from: Date, pred: (d: Date) => boolean, allowTodayAnyway = false): Date {
  if (allowTodayAnyway) return from
  let d = from
  for (let i = 0; i < 8; i++) {
    if (pred(d)) return d
    d = addDays(d, 1)
  }
  return from
}

/** Projected dates for the next `count` sessions, assuming each is done on its suggested day. */
export function projectSchedule(phase: PhaseNumber, lastSessionDate: string | null, today: Date, count: number): Date[] {
  const out: Date[] = []
  let last = lastSessionDate
  for (let i = 0; i < count; i++) {
    const d = suggestNextDate(phase, last, today)
    out.push(d)
    last = toISODate(d)
    today = addDays(d, 1)
  }
  return out
}

export function relativeDayLabel(d: Date, today: Date): string {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  const wd = d.toLocaleDateString(undefined, { weekday: 'short' })
  return diff < 7 ? `${wd} ${d.getDate()}` : `${wd} ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}
