import { getExercise } from '../domain/catalog'
import { PHASES } from '../domain/program'
import type {
  ExerciseResult,
  ExerciseState,
  LoadAction,
  PhaseNumber,
  Profile,
  SessionLog,
  SessionPlan,
  SessionResult,
} from '../domain/types'

export const DELOAD_MULTIPLIER = 0.9
export const DEADLIFT_10LB_CAP = 185
export const FAILURES_BEFORE_DELOAD = 2

export const isLinear = (t: string) => t === 'LINEAR' || t === 'LINEAR_DEADLIFT'

/** Load increment for an exercise at a given weight. */
export function incrementFor(exerciseId: string, weight: number, profile: Pick<Profile, 'dumbbell_step_lbs'>): number {
  const ex = getExercise(exerciseId)
  if (ex.progression_type === 'LINEAR_DEADLIFT') return weight < DEADLIFT_10LB_CAP ? 10 : 5
  if (ex.increment_lbs) return ex.increment_lbs
  if (ex.equipment === 'DUMBBELL') return profile.dumbbell_step_lbs
  return 5
}

export const deloadWeight = (w: number, floor: number) =>
  Math.max(floor, Math.round((w * DELOAD_MULTIPLIER) / 5) * 5)

interface LiftEval {
  target_met: boolean
  upgrade_load: boolean
  next_weight: number
  next_failures: number
  action: LoadAction
}

/**
 * Linear progression for the 5 primary barbell lifts.
 * Success: +increment. 1st miss: hold. 2nd consecutive miss: 10% deload, counter reset.
 */
export function evaluateLinear(
  exerciseId: string,
  weight: number,
  reps: number[],
  repsTarget: number,
  failures: number,
  profile: Pick<Profile, 'dumbbell_step_lbs' | 'barbell_weight_lbs'>,
): LiftEval {
  const met = reps.length > 0 && reps.every((r) => r >= repsTarget)
  if (met) {
    return { target_met: true, upgrade_load: true, next_weight: weight + incrementFor(exerciseId, weight, profile), next_failures: 0, action: 'INCREASE' }
  }
  const f = failures + 1
  if (f >= FAILURES_BEFORE_DELOAD) {
    return { target_met: false, upgrade_load: false, next_weight: deloadWeight(weight, profile.barbell_weight_lbs), next_failures: 0, action: 'DELOAD' }
  }
  return { target_met: false, upgrade_load: false, next_weight: weight, next_failures: f, action: 'HOLD' }
}

/**
 * Double progression for everything else.
 * Every set >= min: target met. Every set >= max: add load.
 * Below min on 2 consecutive exposures: drop one step.
 */
export function evaluateDouble(
  exerciseId: string,
  weight: number,
  reps: number[],
  min: number,
  max: number,
  failures: number,
  profile: Pick<Profile, 'dumbbell_step_lbs'>,
): LiftEval {
  const inc = incrementFor(exerciseId, weight, profile)
  const met = reps.length > 0 && reps.every((r) => r >= min)
  const upgrade = met && reps.every((r) => r >= max)
  if (upgrade) return { target_met: true, upgrade_load: true, next_weight: weight + inc, next_failures: 0, action: 'INCREASE' }
  if (met) return { target_met: true, upgrade_load: false, next_weight: weight, next_failures: 0, action: 'HOLD' }
  const f = failures + 1
  if (f >= FAILURES_BEFORE_DELOAD) {
    return { target_met: false, upgrade_load: false, next_weight: Math.max(inc, weight - inc), next_failures: 0, action: 'DECREASE' }
  }
  return { target_met: false, upgrade_load: false, next_weight: weight, next_failures: f, action: 'HOLD' }
}

export interface EvaluateOptions {
  joint_pain?: boolean | null
  now?: string
}

export interface EvaluateOutput {
  result: SessionResult
  states: Record<string, ExerciseState>
  profile: Pick<Profile, 'current_phase' | 'phase_gate_progress' | 'next_rotation_index'>
}

export function blankState(exerciseId: string, weight: number): ExerciseState {
  return {
    exercise_id: exerciseId,
    current_working_weight_lbs: weight,
    consecutive_failures: 0,
    last_performed_at: null,
    best_e1rm_lbs: null,
    last_reps: null,
    last_weight_lbs: null,
    updated_at: new Date(0).toISOString(),
  }
}

/**
 * Evaluates a finished session and returns the next state.
 *
 * Gate rule (resolution #2): the session counts only if every exercise met its
 * minimum reps. A miss pauses the gate counter — it is never reset.
 * Phase 3 (resolution #3): a session with joint pain reported does not count.
 * Shared exercises (resolution #6): entries with the same exercise_id in one
 * session (e.g. lateral raises in both Phase 4 supersets) are judged together.
 */
export function evaluateSession(
  plan: SessionPlan,
  log: SessionLog,
  states: Record<string, ExerciseState>,
  profile: Profile,
  opts: EvaluateOptions = {},
): EvaluateOutput {
  const now = opts.now ?? new Date().toISOString()
  const groups = new Map<string, { keys: string[] }>()
  for (const ex of plan.exercises) {
    const g = groups.get(ex.exercise_id) ?? { keys: [] }
    g.keys.push(ex.key)
    groups.set(ex.exercise_id, g)
  }

  const nextStates: Record<string, ExerciseState> = { ...states }
  const results: ExerciseResult[] = []

  for (const [exerciseId, { keys }] of groups) {
    const first = plan.exercises.find((e) => e.key === keys[0])!
    const weight = log.weights[first.key] ?? first.weight_lbs
    const reps = keys.flatMap((k) => (log.reps[k] ?? []).map((r) => r ?? 0))
    const prev = states[exerciseId] ?? blankState(exerciseId, first.weight_lbs)
    const ev = isLinear(first.progression_type)
      ? evaluateLinear(exerciseId, weight, reps, first.reps_min, prev.consecutive_failures, profile)
      : evaluateDouble(exerciseId, weight, reps, first.reps_min, first.reps_max, prev.consecutive_failures, profile)

    const best = reps.reduce<number | null>((acc, r) => {
      if (r < 1 || r > 12) return acc
      const e = weight * (1 + r / 30)
      return acc === null || e > acc ? e : acc
    }, null)

    nextStates[exerciseId] = {
      ...prev,
      current_working_weight_lbs: ev.next_weight,
      consecutive_failures: ev.next_failures,
      last_performed_at: now,
      last_reps: reps,
      last_weight_lbs: weight,
      best_e1rm_lbs:
        best === null ? prev.best_e1rm_lbs : Math.round(Math.max(best, prev.best_e1rm_lbs ?? 0) * 10) / 10,
      updated_at: now,
      dirty: 1,
    }
    results.push({
      exercise_id: exerciseId,
      name: first.name,
      is_primary: first.is_primary,
      target_met: ev.target_met,
      upgrade_load: ev.upgrade_load,
      weight_used_lbs: weight,
      next_weight_lbs: ev.next_weight,
      action: ev.action,
      consecutive_failures: ev.next_failures,
      reps,
      reps_min: first.reps_min,
      reps_max: first.reps_max,
    })
  }

  const sessionMet = results.every((r) => r.target_met)
  const phase = profile.current_phase
  const def = PHASES[phase]
  const jointBlocked = phase === 3 && opts.joint_pain === true
  const counted = sessionMet && !jointBlocked && def.gate_required !== null
  const gateBefore = profile.phase_gate_progress
  let gateAfter = counted ? gateBefore + 1 : gateBefore
  let phaseAfter: PhaseNumber = phase
  let promoted = false
  if (def.gate_required !== null && gateAfter >= def.gate_required) {
    phaseAfter = (phase + 1) as PhaseNumber
    gateAfter = 0
    promoted = true
  }
  const nextRotation = (profile.next_rotation_index + 1) % 6

  return {
    result: {
      exercises: results,
      session_target_met: sessionMet,
      counted_toward_gate: counted,
      gate_blocked_by_joint_pain: sessionMet && jointBlocked,
      gate_before: gateBefore,
      gate_after: promoted ? def.gate_required! : gateAfter,
      gate_required: def.gate_required,
      phase_before: phase,
      phase_after: phaseAfter,
      promoted,
      next_rotation_index: nextRotation,
    },
    states: nextStates,
    profile: { current_phase: phaseAfter, phase_gate_progress: gateAfter, next_rotation_index: nextRotation },
  }
}
