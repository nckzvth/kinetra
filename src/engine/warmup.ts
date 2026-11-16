import type { PlannedWarmup } from '../domain/types'

export const roundTo5 = (x: number, floor = 45) => Math.max(floor, Math.round(x / 5) * 5)

/** Minimum jump between consecutive ramp sets, and minimum gap below the working weight. */
const MIN_STEP = 10

const RAMP = [
  { pct: 0.55, minWorking: 60 },
  { pct: 0.75, minWorking: 70 },
  { pct: 0.88, minWorking: 135 },
]
const REPS_BY_POSITION = [
  { reps: 5, label: '5', rest: 60 },
  { reps: 3, label: '3', rest: 75 },
  { reps: 2, label: '1–2', rest: 105 },
]

/**
 * Barbell ramp-up for the first primary lift of the day (resolution #1).
 *
 * Starts with the empty bar, then tries ~55% / ~75% / ~88% of the working weight
 * (rounded to 5 lb, never under the bar). A ramp set is kept only if it is at least
 * 10 lb heavier than the previous warmup and at least 10 lb under the working weight,
 * so no set ever duplicates the bar or the working weight. Reps follow position:
 * the first loaded set gets 5, the next 3, the last 1–2.
 */
export function calculateWarmups(
  workingWeight: number,
  opts: { barWeight?: number; exerciseId?: string } = {},
): PlannedWarmup[] {
  const bar = opts.barWeight ?? 45
  const isDeadlift = opts.exerciseId === 'barbell_deadlift'
  const isSquat = opts.exerciseId === 'barbell_back_squat'
  const barReps = isSquat ? 10 : 8
  const sets: PlannedWarmup[] = [
    {
      weight_lbs: bar,
      reps: barReps,
      reps_label: isSquat ? '10' : '8–10',
      rest_sec: 45,
      note: isDeadlift && workingWeight < 135 ? 'Empty bar as RDL from rack / blocks' : 'Empty bar groove',
    },
  ]
  let prev = bar
  for (const step of RAMP) {
    if (workingWeight < step.minWorking) continue
    const w = roundTo5(workingWeight * step.pct, bar)
    if (w < prev + MIN_STEP || w > workingWeight - MIN_STEP) continue
    const pos = REPS_BY_POSITION[sets.length - 1]
    sets.push({ weight_lbs: w, reps: pos.reps, reps_label: pos.label, rest_sec: pos.rest })
    prev = w
  }
  return sets
}
