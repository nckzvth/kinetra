/** Pure logic for the non-lifting activity archetypes (Release 2). */

// ─── Distance & pace ────────────────────────────────────────────────────────

export type DistanceUnit = 'mi' | 'km' | 'm'

/** Seconds per unit, or null when distance or time is missing. */
export function paceSecPerUnit(distance: number, durationSec: number): number | null {
  if (!(distance > 0) || !(durationSec > 0)) return null
  return Math.round(durationSec / distance)
}

export function formatHMS(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

export function formatPace(secPerUnit: number | null, unit: DistanceUnit): string {
  if (secPerUnit === null) return '—'
  return `${formatHMS(secPerUnit)} /${unit}`
}

/** Parses "mm:ss", "h:mm:ss" or plain minutes into seconds. */
export function parseDuration(input: string): number | null {
  const t = input.trim()
  if (!t) return null
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 60)
  const parts = t.split(':').map((p) => p.trim())
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.slice(1).some((n) => n >= 60)) return null
  return nums.reduce((acc, n) => acc * 60 + n, 0)
}

// ─── Round & bell timer ─────────────────────────────────────────────────────

export interface RoundConfig {
  rounds: number
  work_sec: number
  rest_sec: number
  prep_sec: number
  warn_sec: number
}

export type RoundPhase = 'PREP' | 'WORK' | 'REST' | 'DONE'

export interface RoundState {
  phase: RoundPhase
  /** 1-based round number (the upcoming round during PREP / REST). */
  round: number
  remaining: number
  /** Length of the current phase, for progress rings. */
  phaseLength: number
  /** Rounds whose work period has fully elapsed. */
  completed: number
  warning: boolean
}

export const totalRoundSeconds = (c: RoundConfig) => c.prep_sec + c.rounds * c.work_sec + Math.max(0, c.rounds - 1) * c.rest_sec

/** Where a round timer is after `elapsed` seconds of running time. */
export function roundStateAt(c: RoundConfig, elapsed: number): RoundState {
  if (elapsed < c.prep_sec) {
    return { phase: 'PREP', round: 1, remaining: c.prep_sec - elapsed, phaseLength: c.prep_sec, completed: 0, warning: false }
  }
  const t = elapsed - c.prep_sec
  const cycle = c.work_sec + c.rest_sec
  const idx = cycle > 0 ? Math.floor(t / cycle) : c.rounds
  if (idx >= c.rounds) return done(c)
  const within = t - idx * cycle
  if (within < c.work_sec) {
    const remaining = c.work_sec - within
    return { phase: 'WORK', round: idx + 1, remaining, phaseLength: c.work_sec, completed: idx, warning: remaining <= c.warn_sec }
  }
  if (idx === c.rounds - 1) return done(c)
  return { phase: 'REST', round: idx + 2, remaining: cycle - within, phaseLength: c.rest_sec, completed: idx + 1, warning: false }
}

const done = (c: RoundConfig): RoundState => ({ phase: 'DONE', round: c.rounds, remaining: 0, phaseLength: 0, completed: c.rounds, warning: false })

export type RoundCue = 'ROUND_START' | 'WARNING' | 'ROUND_END' | 'FINISHED' | null

/** The audio cue for moving from one state to the next tick's state. */
export function cueBetween(prev: RoundState, next: RoundState): RoundCue {
  if (next.phase === 'DONE' && prev.phase !== 'DONE') return 'FINISHED'
  if (next.phase === 'WORK' && (prev.phase !== 'WORK' || prev.round !== next.round)) return 'ROUND_START'
  if (next.phase === 'REST' && prev.phase === 'WORK') return 'ROUND_END'
  if (next.phase === 'WORK' && next.warning && !prev.warning) return 'WARNING'
  return null
}

// ─── Climbing ───────────────────────────────────────────────────────────────

export const V_GRADES = ['VB', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12']
export const YDS_GRADES = ['5.6', '5.7', '5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b', '5.11c', '5.11d', '5.12a', '5.12b', '5.12c', '5.12d', '5.13a', '5.13b', '5.13c', '5.13d', '5.14a']

export interface ClimbLog {
  grade: string
  outcome: 'FLASH' | 'SEND' | 'ATTEMPT'
  attempts: number
}

/** Points for a grade: V-scale number + 1 (VB = 0), or the YDS index. */
export function gradePoints(grade: string): number {
  const v = V_GRADES.indexOf(grade)
  if (v >= 0) return v
  const y = YDS_GRADES.indexOf(grade)
  return y >= 0 ? y : 0
}

export function climbStats(climbs: ClimbLog[]) {
  const sends = climbs.filter((c) => c.outcome !== 'ATTEMPT')
  const flashes = climbs.filter((c) => c.outcome === 'FLASH').length
  const attempts = climbs.reduce((n, c) => n + Math.max(1, c.attempts), 0)
  const hardest = sends.reduce<string | null>((best, c) => (best === null || gradePoints(c.grade) > gradePoints(best) ? c.grade : best), null)
  return {
    problems: climbs.length,
    sends: sends.length,
    flashes,
    attempts,
    sendRate: climbs.length ? Math.round((sends.length / climbs.length) * 100) : 0,
    points: sends.reduce((n, c) => n + gradePoints(c.grade), 0),
    hardest,
  }
}
