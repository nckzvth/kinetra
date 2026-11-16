import type { PlannedWarmup, UnitSystem } from '../domain/types'
import { roundToStep, rulesFor } from '../domain/units'

export const roundTo5 = (x: number, floor = 45) => Math.max(floor, Math.round(x / 5) * 5)

const RAMP = [0.55, 0.75, 0.88]
const REPS_BY_POSITION = [
  { reps: 5, label: '5', rest: 60 },
  { reps: 3, label: '3', rest: 75 },
  { reps: 2, label: '1–2', rest: 105 },
]

/**
 * Barbell ramp-up before the day's main lift.
 *
 * Starts with the empty bar, then tries ~55% / ~75% / ~88% of the working weight
 * (rounded to the unit's step, never under the bar). A ramp set is kept only if it is
 * clearly heavier than the previous warmup and clearly under the working weight, so no
 * set duplicates the bar or the working weight. Reps follow position: 5, then 3, then 1–2.
 */
export function calculateWarmups(
  workingWeight: number,
  opts: { barWeight?: number; exerciseId?: string; unit?: UnitSystem } = {},
): PlannedWarmup[] {
  const r = rulesFor(opts.unit ?? 'IMPERIAL')
  const bar = opts.barWeight ?? r.bar
  const isDeadlift = opts.exerciseId === 'barbell_deadlift'
  const isSquat = opts.exerciseId === 'barbell_back_squat'
  const rdlBelow = opts.unit === 'METRIC' ? 60 : 135
  const sets: PlannedWarmup[] = [
    {
      weight_lbs: bar,
      reps: isSquat ? 10 : 8,
      reps_label: isSquat ? '10' : '8–10',
      rest_sec: 45,
      note: isDeadlift && workingWeight < rdlBelow ? 'Empty bar as RDL from rack / blocks' : 'Empty bar groove',
    },
  ]
  let prev = bar
  RAMP.forEach((pct, i) => {
    if (workingWeight < r.rampThresholds[i]) return
    const w = roundToStep(workingWeight * pct, r.round, bar)
    if (w < prev + r.rampMinStep || w > workingWeight - r.rampMinStep) return
    const pos = REPS_BY_POSITION[sets.length - 1]
    sets.push({ weight_lbs: w, reps: pos.reps, reps_label: pos.label, rest_sec: pos.rest })
    prev = w
  })
  return sets
}
