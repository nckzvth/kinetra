import { getExercise, STARTING_WEIGHTS_LBS } from '../domain/catalog'
import { PHASES, ROTATION_FOCUS, ROTATION_LABEL, rotationAt } from '../domain/program'
import type {
  ExerciseState,
  PhaseNumber,
  PlannedExercise,
  PlannedSet,
  PlannedWarmup,
  Profile,
  ReadinessItem,
  RotationCode,
  SessionPlan,
} from '../domain/types'
import { isLinear } from './progression'
import { calculateWarmups, roundTo5 } from './warmup'

export function readinessFor(code: RotationCode): ReadinessItem[] {
  const items: ReadinessItem[] = [
    { id: 'temp', label: 'Core temperature', detail: '2–3 min brisk incline walk, bike or rower at conversational pace' },
  ]
  if (code.startsWith('PUSH') || code.startsWith('PULL')) {
    items.push({ id: 'shoulder', label: 'Shoulder & scapular prep', detail: '12 band dislocates (or arm circles) + 15 band pull-aparts, 1 s squeeze' })
  }
  if (code.startsWith('LEGS') || code.startsWith('PULL')) {
    items.push({ id: 'hip', label: 'Hip & ankle mobility', detail: '8 deep squat pries (2 s pause, knees out) + 8 bodyweight hip hinges' })
  }
  return items
}

/** Suggested reps for one tap on a double-progression set: last time +1, within the window. */
function suggestedReps(
  setIndex: number,
  min: number,
  max: number,
  weight: number,
  state: ExerciseState | undefined,
): number {
  if (!state?.last_reps || state.last_weight_lbs !== weight) return min
  const last = state.last_reps[setIndex]
  if (last === undefined) return min
  return Math.min(max, Math.max(min, last + 1))
}

export function weightFor(exerciseId: string, states: Record<string, ExerciseState>): number {
  return states[exerciseId]?.current_working_weight_lbs ?? STARTING_WEIGHTS_LBS[exerciseId] ?? 0
}

export function buildSessionPlan(
  profile: Profile,
  states: Record<string, ExerciseState>,
  opts: { phase?: PhaseNumber; rotation?: RotationCode } = {},
): SessionPlan {
  const phase = opts.phase ?? profile.current_phase
  const rotation = opts.rotation ?? rotationAt(profile.next_rotation_index)
  const def = PHASES[phase]
  const seen = new Map<string, number>()

  const exercises: PlannedExercise[] = def.workouts[rotation].map((p, i) => {
    const ex = getExercise(p.exercise_id)
    const weight = weightFor(p.exercise_id, states)
    const primary = isLinear(ex.progression_type)
    // When an exercise appears twice in a session, the second block continues set numbering
    // so suggestions line up with the combined last_reps array.
    const offset = seen.get(p.exercise_id) ?? 0
    seen.set(p.exercise_id, offset + p.sets)
    const sets: PlannedSet[] = Array.from({ length: p.sets }, (_, s) => {
      const amrap = p.amrap_last_set && def.amrap_enabled && s === p.sets - 1
      return {
        index: s,
        is_amrap: amrap,
        target_reps: primary ? p.reps_min : suggestedReps(offset + s, p.reps_min, p.reps_max, weight, states[p.exercise_id]),
      }
    })
    return {
      key: `${i}:${p.exercise_id}`,
      order: i + 1,
      exercise_id: p.exercise_id,
      name: p.name,
      equipment: ex.equipment,
      progression_type: ex.progression_type,
      is_primary: primary,
      per_hand: !!ex.per_hand,
      weight_lbs: weight,
      reps_min: p.reps_min,
      reps_max: p.reps_max,
      amrap_last_set: p.amrap_last_set && def.amrap_enabled,
      rest_sec: p.rest_sec,
      superset_group: p.superset_group ?? null,
      sets,
      warmups:
        p.warmup_enabled && i === 0
          ? calculateWarmups(weight, { barWeight: profile.barbell_weight_lbs, exerciseId: p.exercise_id })
          : i > 0 && ex.equipment === 'BARBELL'
            ? feelerSet(weight, profile.barbell_weight_lbs)
            : [],
      substitutions: ex.substitutions,
    }
  })

  return {
    phase,
    rotation_code: rotation,
    title: ROTATION_LABEL[rotation],
    subtitle: ROTATION_FOCUS[rotation],
    readiness: readinessFor(rotation),
    exercises,
  }
}

/** Human-readable prescription, e.g. "4×5, 1×5+" or "3×8–12". */
export function prescriptionLabel(ex: Pick<PlannedExercise, 'sets' | 'reps_min' | 'reps_max' | 'amrap_last_set'>): string {
  const n = ex.sets.length
  const range = ex.reps_min === ex.reps_max ? `${ex.reps_min}` : `${ex.reps_min}–${ex.reps_max}`
  if (ex.amrap_last_set) return n > 1 ? `${n - 1}×${range}, 1×${ex.reps_min}+` : `1×${ex.reps_min}+`
  return `${n}×${range}`
}

/**
 * Optional single feeler set (~60% × 6–8) before a barbell secondary compound in a
 * different movement plane (e.g. OHP → bench, squat → RDL). Skipped when it would
 * be within 10 lb of the empty bar.
 */
export function feelerSet(weight: number, bar: number): PlannedWarmup[] {
  const w = roundTo5(weight * 0.6, bar)
  if (w < bar + 10 || w > weight - 10) return []
  return [{ weight_lbs: w, reps: 6, reps_label: '6–8', rest_sec: 60, note: 'Optional feeler set' }]
}
