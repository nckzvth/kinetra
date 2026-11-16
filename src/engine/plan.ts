import { defaultStart, getExercise } from '../domain/catalog'
import { dayAt, phaseOf } from '../domain/program'
import type {
  ExerciseState,
  PhaseNumber,
  PlannedExercise,
  PlannedSet,
  PlannedWarmup,
  PrescribedExercise,
  Profile,
  ProgramDef,
  RotationCode,
  SessionPlan,
  UnitSystem,
} from '../domain/types'
import { rulesFor, roundToStep } from '../domain/units'
import { isLinear } from './progression'
import { calculateWarmups } from './warmup'

/** Suggested reps for one tap on a double-progression set: last time +1, within the window. */
function suggestedReps(setIndex: number, min: number, max: number, weight: number, state: ExerciseState | undefined): number {
  if (!state?.last_reps || state.last_weight_lbs !== weight) return min
  const last = state.last_reps[setIndex]
  if (last === undefined) return min
  return Math.min(max, Math.max(min, last + 1))
}

export function weightFor(exerciseId: string, states: Record<string, ExerciseState>, unit: UnitSystem = 'IMPERIAL'): number {
  return states[exerciseId]?.current_working_weight_lbs ?? defaultStart(exerciseId, unit)
}

/** Turns one prescription into a planned exercise with today's weight, sets and warmups. */
export function planExercise(
  p: PrescribedExercise,
  i: number,
  profile: Profile,
  states: Record<string, ExerciseState>,
  amrapEnabled: boolean,
  setOffset = 0,
): PlannedExercise {
  const ex = getExercise(p.exercise_id)
  const weight = weightFor(p.exercise_id, states, profile.unit_system)
  const primary = isLinear(ex.progression_type)
  const sets: PlannedSet[] = Array.from({ length: p.sets }, (_, s) => ({
    index: s,
    is_amrap: p.amrap_last_set && amrapEnabled && s === p.sets - 1,
    target_reps: primary ? p.reps_min : suggestedReps(setOffset + s, p.reps_min, p.reps_max, weight, states[p.exercise_id]),
  }))
  const opts = { barWeight: profile.barbell_weight_lbs, exerciseId: p.exercise_id, unit: profile.unit_system }
  return {
    key: `${i}:${p.exercise_id}`,
    order: i + 1,
    exercise_id: p.exercise_id,
    name: p.name || ex.name,
    equipment: ex.equipment,
    progression_type: ex.progression_type,
    is_primary: primary,
    per_hand: !!ex.per_hand,
    weight_lbs: weight,
    reps_min: p.reps_min,
    reps_max: p.reps_max,
    amrap_last_set: p.amrap_last_set && amrapEnabled,
    rest_sec: p.rest_sec,
    superset_group: p.superset_group ?? null,
    sets,
    warmups:
      p.warmup_enabled && ex.equipment === 'BARBELL'
        ? calculateWarmups(weight, opts)
        : i > 0 && ex.equipment === 'BARBELL'
          ? feelerSet(weight, profile.barbell_weight_lbs, profile.unit_system)
          : [],
    substitutions: ex.substitutions,
  }
}

export function buildSessionPlan(
  profile: Profile,
  states: Record<string, ExerciseState>,
  program: ProgramDef,
  opts: { phase?: PhaseNumber; rotation?: RotationCode } = {},
): SessionPlan {
  const phase = phaseOf(program, opts.phase ?? profile.current_phase)
  const day = opts.rotation ? (program.days.find((d) => d.id === opts.rotation) ?? dayAt(program, 0)) : dayAt(program, profile.next_rotation_index)
  const seen = new Map<string, number>()
  const exercises = (phase.workouts[day.id] ?? []).map((p, i) => {
    // An exercise that appears twice continues set numbering so suggestions line up.
    const offset = seen.get(p.exercise_id) ?? 0
    seen.set(p.exercise_id, offset + p.sets)
    return planExercise(p, i, profile, states, phase.amrap_enabled, offset)
  })
  return {
    phase: phase.phase,
    rotation_code: day.id,
    title: day.name,
    subtitle: day.focus,
    readiness: program.readiness?.[day.id] ?? [],
    exercises,
  }
}

/** An empty workout for "just track" or ad-hoc sessions; exercises are added during it. */
export function emptyPlan(title = 'Workout'): SessionPlan {
  return { phase: 0, rotation_code: 'FREE', title, subtitle: '', readiness: [], exercises: [] }
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
 * barely differ from the empty bar or the working weight.
 */
export function feelerSet(weight: number, bar: number, unit: UnitSystem = 'IMPERIAL'): PlannedWarmup[] {
  const r = rulesFor(unit)
  const w = roundToStep(weight * 0.6, r.round, bar)
  if (w < bar + r.rampMinStep || w > weight - r.rampMinStep) return []
  return [{ weight_lbs: w, reps: 6, reps_label: '6–8', rest_sec: 60, note: 'Optional feeler set' }]
}
