import type { ScheduleRule } from '../domain/types'

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
 * Suggested date for the next session. The rotation pointer decides WHAT is next;
 * this only suggests WHEN, so a missed day shifts the queue instead of skipping a workout.
 */
export function suggestNextDate(rule: ScheduleRule, lastSessionDate: string | null, today: Date): Date {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const last = lastSessionDate ? fromISODate(lastSessionDate) : null
  switch (rule.type) {
    case 'WEEKDAYS': {
      if (!last) return t
      // At least one rest day when training days are spread out (e.g. Mon/Wed/Fri).
      const gap = rule.days.length <= 3 ? 2 : 1
      const earliest = addDays(last, gap)
      return nextMatching(earliest > t ? earliest : t, (d) => rule.days.includes(d.getDay()))
    }
    case 'EVERY_N_DAYS': {
      if (!last) return t
      const d = addDays(last, rule.n)
      return d > t ? d : t
    }
    case 'DAILY_EXCEPT': {
      const d = last ? addDays(last, 1) : t
      return nextMatching(d > t ? d : t, (x) => !rule.off.includes(x.getDay()))
    }
    case 'FLEXIBLE':
      return last && toISODate(last) === toISODate(t) ? addDays(t, 1) : t
  }
}

function nextMatching(from: Date, pred: (d: Date) => boolean): Date {
  let d = from
  for (let i = 0; i < 8; i++) {
    if (pred(d)) return d
    d = addDays(d, 1)
  }
  return from
}

/** Projected dates for the next `count` sessions, assuming each is done on its suggested day. */
export function projectSchedule(rule: ScheduleRule, lastSessionDate: string | null, today: Date, count: number): Date[] {
  const out: Date[] = []
  let last = lastSessionDate
  for (let i = 0; i < count; i++) {
    const d = suggestNextDate(rule, last, today)
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
  return diff < 7 ? `${wd} ${d.getDate()}` : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
