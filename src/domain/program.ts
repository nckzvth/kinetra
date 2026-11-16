import type { PhaseDef, PhaseNumber, PrescribedExercise, RotationCode } from './types'

export const PROGRAM_ID = 'metallicadpa_ppl_gated_ramp_v1'
export const PROGRAM_NAME = 'Metallicadpa PPL Systematic Ramp-Up'

export const ROTATION_ORDER: RotationCode[] = ['PUSH_A', 'PULL_A', 'LEGS_A', 'PUSH_B', 'PULL_B', 'LEGS_B']

export const ROTATION_LABEL: Record<RotationCode, string> = {
  PUSH_A: 'Push A',
  PULL_A: 'Pull A',
  LEGS_A: 'Legs A',
  PUSH_B: 'Push B',
  PULL_B: 'Pull B',
  LEGS_B: 'Legs B',
}

export const ROTATION_FOCUS: Record<RotationCode, string> = {
  PUSH_A: 'Heavy bench',
  PULL_A: 'Heavy deadlift',
  LEGS_A: 'Squat & hinge',
  PUSH_B: 'Heavy overhead press',
  PULL_B: 'Heavy barbell row',
  LEGS_B: 'Squat & hinge',
}

type P = Omit<PrescribedExercise, 'amrap_last_set' | 'warmup_enabled'> &
  Partial<Pick<PrescribedExercise, 'amrap_last_set' | 'warmup_enabled'>>
const ex = (p: P): PrescribedExercise => ({ amrap_last_set: false, warmup_enabled: false, ...p })

// ─── Phase 1: 3-day A/B foundation ──────────────────────────────────────────

const PHASE_1: PhaseDef['workouts'] = {
  PUSH_A: [
    ex({ exercise_id: 'barbell_bench_press_heavy', name: 'Barbell Bench Press', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 150, warmup_enabled: true }),
    ex({ exercise_id: 'dumbbell_overhead_press_volume', name: 'Seated Dumbbell Overhead Press', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'triceps_rope_pushdown', name: 'Triceps Rope Pushdown', sets: 3, reps_min: 10, reps_max: 12, rest_sec: 75 }),
  ],
  PULL_A: [
    ex({ exercise_id: 'barbell_deadlift', name: 'Conventional Barbell Deadlift', sets: 1, reps_min: 5, reps_max: 5, rest_sec: 180, warmup_enabled: true }),
    ex({ exercise_id: 'lat_pulldown', name: 'Lat Pulldown', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'face_pulls', name: 'Face Pulls', sets: 3, reps_min: 15, reps_max: 20, rest_sec: 75 }),
  ],
  LEGS_A: [
    ex({ exercise_id: 'barbell_back_squat', name: 'Barbell Back Squat', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 150, warmup_enabled: true }),
    ex({ exercise_id: 'romanian_deadlift', name: 'Romanian Deadlift', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'calf_raises', name: 'Standing or Seated Calf Raise', sets: 3, reps_min: 12, reps_max: 15, rest_sec: 75 }),
  ],
  PUSH_B: [
    ex({ exercise_id: 'barbell_overhead_press_heavy', name: 'Standing Barbell Overhead Press', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 150, warmup_enabled: true }),
    ex({ exercise_id: 'barbell_bench_press_volume', name: 'Barbell Bench Press (Volume)', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'dumbbell_lateral_raise', name: 'Dumbbell Lateral Raise', sets: 3, reps_min: 12, reps_max: 15, rest_sec: 75 }),
  ],
  PULL_B: [
    ex({ exercise_id: 'barbell_row', name: 'Pendlay / Strict Barbell Row', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 150, warmup_enabled: true }),
    ex({ exercise_id: 'lat_pulldown', name: 'Lat Pulldown', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'face_pulls', name: 'Face Pulls', sets: 3, reps_min: 15, reps_max: 20, rest_sec: 75 }),
  ],
  LEGS_B: [
    ex({ exercise_id: 'barbell_back_squat', name: 'Barbell Back Squat', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 150, warmup_enabled: true }),
    ex({ exercise_id: 'romanian_deadlift', name: 'Romanian Deadlift', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'calf_raises', name: 'Standing or Seated Calf Raise', sets: 3, reps_min: 12, reps_max: 15, rest_sec: 75 }),
  ],
}

// ─── Phase 4: full 6-day PPL (Phases 2 & 3 derive from this) ────────────────

const pushDay = (heavy: PrescribedExercise, volume: PrescribedExercise): PrescribedExercise[] => [
  heavy,
  volume,
  ex({ exercise_id: 'incline_dumbbell_press', name: 'Incline Dumbbell Press', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 }),
  ex({ exercise_id: 'triceps_rope_pushdown', name: 'Triceps Rope Pushdown', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 0, superset_group: 'PUSH_SS_1' }),
  ex({ exercise_id: 'dumbbell_lateral_raise', name: 'Dumbbell Lateral Raise', sets: 3, reps_min: 15, reps_max: 20, rest_sec: 75, superset_group: 'PUSH_SS_1' }),
  ex({ exercise_id: 'overhead_triceps_extension', name: 'Overhead Triceps Extension', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 0, superset_group: 'PUSH_SS_2' }),
  ex({ exercise_id: 'dumbbell_lateral_raise', name: 'Dumbbell Lateral Raise', sets: 3, reps_min: 15, reps_max: 20, rest_sec: 75, superset_group: 'PUSH_SS_2' }),
]

const pullDay = (heavy: PrescribedExercise): PrescribedExercise[] => [
  heavy,
  ex({ exercise_id: 'lat_pulldown', name: 'Lat Pulldown', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 120 }),
  ex({ exercise_id: 'seated_cable_row', name: 'Seated Cable Row', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 }),
  ex({ exercise_id: 'face_pulls', name: 'Face Pulls', sets: 5, reps_min: 15, reps_max: 20, rest_sec: 60 }),
  ex({ exercise_id: 'hammer_curls', name: 'Dumbbell Hammer Curls', sets: 4, reps_min: 8, reps_max: 12, rest_sec: 60 }),
  ex({ exercise_id: 'bicep_curls', name: 'Dumbbell or EZ-Bar Curls', sets: 4, reps_min: 8, reps_max: 12, rest_sec: 60 }),
]

const legsDay = (): PrescribedExercise[] => [
  ex({ exercise_id: 'barbell_back_squat', name: 'Barbell Back Squat', sets: 3, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
  ex({ exercise_id: 'romanian_deadlift', name: 'Romanian Deadlift', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 120 }),
  ex({ exercise_id: 'leg_press', name: 'Leg Press', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 120 }),
  ex({ exercise_id: 'leg_curls', name: 'Seated or Lying Leg Curl', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 75 }),
  ex({ exercise_id: 'calf_raises', name: 'Standing or Seated Calf Raise', sets: 5, reps_min: 8, reps_max: 12, rest_sec: 60 }),
]

const PHASE_4: PhaseDef['workouts'] = {
  PUSH_A: pushDay(
    ex({ exercise_id: 'barbell_bench_press_heavy', name: 'Barbell Bench Press', sets: 5, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
    // Resolution #4: keep the seeded dumbbell OHP; barbell OHP is a listed substitution.
    ex({ exercise_id: 'dumbbell_overhead_press_volume', name: 'Seated Dumbbell Overhead Press', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 120 }),
  ),
  PULL_A: pullDay(
    ex({ exercise_id: 'barbell_deadlift', name: 'Conventional Barbell Deadlift', sets: 1, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
  ),
  LEGS_A: legsDay(),
  PUSH_B: pushDay(
    ex({ exercise_id: 'barbell_overhead_press_heavy', name: 'Standing Barbell Overhead Press', sets: 5, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
    ex({ exercise_id: 'barbell_bench_press_volume', name: 'Barbell Bench Press (Volume)', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 120 }),
  ),
  PULL_B: pullDay(
    ex({ exercise_id: 'barbell_row', name: 'Pendlay / Strict Barbell Row', sets: 5, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
  ),
  LEGS_B: legsDay(),
}

/** Phases 2 & 3: Phase 4 minus the second push superset, curls at 3 sets. */
function derivePhase2Workouts(): PhaseDef['workouts'] {
  const out = {} as PhaseDef['workouts']
  for (const code of ROTATION_ORDER) {
    out[code] = PHASE_4[code]
      .filter((e) => e.superset_group !== 'PUSH_SS_2')
      .map((e) => (e.exercise_id === 'hammer_curls' || e.exercise_id === 'bicep_curls' ? { ...e, sets: 3 } : { ...e }))
  }
  return out
}

export const PHASES: Record<PhaseNumber, PhaseDef> = {
  1: {
    phase: 1,
    name: 'Phase 1: 3-Day A/B Foundation',
    short_name: 'Foundation',
    summary: '3 exercises per session. Straight 3×5 main lifts (Deadlift 1×5) at RPE 7–8. No AMRAP.',
    schedule_type: 'FIXED_WEEKLY',
    days_per_week: 3,
    target_duration_minutes: 35,
    gate_required: 12,
    amrap_enabled: false,
    workouts: PHASE_1,
  },
  2: {
    phase: 2,
    name: 'Phase 2: Accessory & AMRAP Expansion',
    short_name: 'Expansion',
    summary: 'Main lifts move to 4×5 + 1×5+ AMRAP (Squat 2×5 + 1×5+, Deadlift 1×5+). Accessories and supersets added.',
    schedule_type: 'FIXED_WEEKLY',
    days_per_week: 3,
    target_duration_minutes: 50,
    gate_required: 12,
    amrap_enabled: true,
    workouts: derivePhase2Workouts(),
  },
  3: {
    phase: 3,
    name: 'Phase 3: Rolling Frequency Bridge',
    short_name: 'Bridge',
    summary: 'Same sessions as Phase 2 on a rolling every-other-day cadence. Sessions with joint pain do not count.',
    schedule_type: 'ROLLING_EVERY_OTHER_DAY',
    days_per_week: 3.5,
    target_duration_minutes: 50,
    gate_required: 16,
    amrap_enabled: true,
    workouts: derivePhase2Workouts(),
  },
  4: {
    phase: 4,
    name: 'Phase 4: Full 6-Day PPL',
    short_name: 'Full PPL',
    summary: 'Full volume: second push superset and 4 sets of each curl. Linear progression with automatic 10% deloads.',
    schedule_type: 'SIX_DAY_SPLIT',
    days_per_week: 6,
    target_duration_minutes: 60,
    gate_required: null,
    amrap_enabled: true,
    workouts: PHASE_4,
  },
}

export const rotationAt = (index: number): RotationCode => ROTATION_ORDER[((index % 6) + 6) % 6]
