import type { PhaseDef, PhaseNumber, PrescribedExercise, ProgramDef, ReadinessItem, RotationCode } from './types'

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
    ex({ exercise_id: 'barbell_bench_press_heavy', name: 'Bench Press', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 150, warmup_enabled: true }),
    ex({ exercise_id: 'dumbbell_overhead_press_volume', name: 'Dumbbell Shoulder Press', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'triceps_rope_pushdown', name: 'Triceps Pushdown', sets: 3, reps_min: 10, reps_max: 12, rest_sec: 75 }),
  ],
  PULL_A: [
    ex({ exercise_id: 'barbell_deadlift', name: 'Deadlift', sets: 1, reps_min: 5, reps_max: 5, rest_sec: 180, warmup_enabled: true }),
    ex({ exercise_id: 'lat_pulldown', name: 'Lat Pulldown', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'face_pulls', name: 'Face Pulls', sets: 3, reps_min: 15, reps_max: 20, rest_sec: 75 }),
  ],
  LEGS_A: [
    ex({ exercise_id: 'barbell_back_squat', name: 'Squat', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 150, warmup_enabled: true }),
    ex({ exercise_id: 'romanian_deadlift', name: 'Romanian Deadlift', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'calf_raises', name: 'Calf Raise', sets: 3, reps_min: 12, reps_max: 15, rest_sec: 75 }),
  ],
  PUSH_B: [
    ex({ exercise_id: 'barbell_overhead_press_heavy', name: 'Overhead Press', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 150, warmup_enabled: true }),
    ex({ exercise_id: 'barbell_bench_press_volume', name: 'Bench Press (Volume)', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'dumbbell_lateral_raise', name: 'Lateral Raise', sets: 3, reps_min: 12, reps_max: 15, rest_sec: 75 }),
  ],
  PULL_B: [
    ex({ exercise_id: 'barbell_row', name: 'Barbell Row', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 150, warmup_enabled: true }),
    ex({ exercise_id: 'lat_pulldown', name: 'Lat Pulldown', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'face_pulls', name: 'Face Pulls', sets: 3, reps_min: 15, reps_max: 20, rest_sec: 75 }),
  ],
  LEGS_B: [
    ex({ exercise_id: 'barbell_back_squat', name: 'Squat', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 150, warmup_enabled: true }),
    ex({ exercise_id: 'romanian_deadlift', name: 'Romanian Deadlift', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
    ex({ exercise_id: 'calf_raises', name: 'Calf Raise', sets: 3, reps_min: 12, reps_max: 15, rest_sec: 75 }),
  ],
}

// ─── Phase 4: full 6-day PPL (Phases 2 & 3 derive from this) ────────────────

const pushDay = (heavy: PrescribedExercise, volume: PrescribedExercise): PrescribedExercise[] => [
  heavy,
  volume,
  ex({ exercise_id: 'incline_dumbbell_press', name: 'Incline Dumbbell Press', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 }),
  ex({ exercise_id: 'triceps_rope_pushdown', name: 'Triceps Pushdown', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 0, superset_group: 'PUSH_SS_1' }),
  ex({ exercise_id: 'dumbbell_lateral_raise', name: 'Lateral Raise', sets: 3, reps_min: 15, reps_max: 20, rest_sec: 75, superset_group: 'PUSH_SS_1' }),
  ex({ exercise_id: 'overhead_triceps_extension', name: 'Overhead Triceps Extension', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 0, superset_group: 'PUSH_SS_2' }),
  ex({ exercise_id: 'dumbbell_lateral_raise', name: 'Lateral Raise', sets: 3, reps_min: 15, reps_max: 20, rest_sec: 75, superset_group: 'PUSH_SS_2' }),
]

const pullDay = (heavy: PrescribedExercise): PrescribedExercise[] => [
  heavy,
  ex({ exercise_id: 'lat_pulldown', name: 'Lat Pulldown', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 120 }),
  ex({ exercise_id: 'seated_cable_row', name: 'Seated Cable Row', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 }),
  ex({ exercise_id: 'face_pulls', name: 'Face Pulls', sets: 5, reps_min: 15, reps_max: 20, rest_sec: 60 }),
  ex({ exercise_id: 'hammer_curls', name: 'Hammer Curl', sets: 4, reps_min: 8, reps_max: 12, rest_sec: 60 }),
  ex({ exercise_id: 'bicep_curls', name: 'Biceps Curl', sets: 4, reps_min: 8, reps_max: 12, rest_sec: 60 }),
]

const legsDay = (): PrescribedExercise[] => [
  ex({ exercise_id: 'barbell_back_squat', name: 'Squat', sets: 3, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
  ex({ exercise_id: 'romanian_deadlift', name: 'Romanian Deadlift', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 120 }),
  ex({ exercise_id: 'leg_press', name: 'Leg Press', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 120 }),
  ex({ exercise_id: 'leg_curls', name: 'Leg Curl', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 75 }),
  ex({ exercise_id: 'calf_raises', name: 'Calf Raise', sets: 5, reps_min: 8, reps_max: 12, rest_sec: 60 }),
]

const PHASE_4: PhaseDef['workouts'] = {
  PUSH_A: pushDay(
    ex({ exercise_id: 'barbell_bench_press_heavy', name: 'Bench Press', sets: 5, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
    // Resolution #4: keep the seeded dumbbell OHP; barbell OHP is a listed substitution.
    ex({ exercise_id: 'dumbbell_overhead_press_volume', name: 'Dumbbell Shoulder Press', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 120 }),
  ),
  PULL_A: pullDay(
    ex({ exercise_id: 'barbell_deadlift', name: 'Deadlift', sets: 1, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
  ),
  LEGS_A: legsDay(),
  PUSH_B: pushDay(
    ex({ exercise_id: 'barbell_overhead_press_heavy', name: 'Overhead Press', sets: 5, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
    ex({ exercise_id: 'barbell_bench_press_volume', name: 'Bench Press (Volume)', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 120 }),
  ),
  PULL_B: pullDay(
    ex({ exercise_id: 'barbell_row', name: 'Barbell Row', sets: 5, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
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

const PPL_PHASES: Record<PhaseNumber, PhaseDef> = {
  1: {
    phase: 1,
    name: 'Phase 1: Foundation',
    short_name: 'Foundation',
    summary: 'Three short workouts a week with three exercises each. Main lifts are 3 sets of 5, kept a little short of hard.',
    schedule: { type: 'WEEKDAYS', days: [1, 3, 5] },
    days_per_week: 3,
    target_duration_minutes: 35,
    gate_required: 12,
    amrap_enabled: false,
    workouts: PHASE_1,
  },
  2: {
    phase: 2,
    name: 'Phase 2: More volume',
    short_name: 'More volume',
    summary: 'Still three days a week. Main lifts add sets and finish with an as-many-reps-as-you-can set, plus more accessory work.',
    schedule: { type: 'WEEKDAYS', days: [1, 3, 5] },
    days_per_week: 3,
    target_duration_minutes: 50,
    gate_required: 12,
    amrap_enabled: true,
    workouts: derivePhase2Workouts(),
  },
  3: {
    phase: 3,
    name: 'Phase 3: Every other day',
    short_name: 'Every other day',
    summary: 'The same workouts, every other day, to build up to training more often. Workouts with joint pain don\'t count.',
    schedule: { type: 'EVERY_N_DAYS', n: 2 },
    days_per_week: 3.5,
    target_duration_minutes: 50,
    gate_required: 16,
    amrap_enabled: true,
    workouts: derivePhase2Workouts(),
  },
  4: {
    phase: 4,
    name: 'Phase 4: Six days a week',
    short_name: 'Six days',
    summary: 'The full push/pull/legs split, six days a week. Weight keeps going up, with an automatic step back when you stall.',
    schedule: { type: 'DAILY_EXCEPT', off: [0] },
    days_per_week: 6,
    target_duration_minutes: 60,
    gate_required: null,
    amrap_enabled: true,
    workouts: PHASE_4,
  },
}


// ─── Templates ──────────────────────────────────────────────────────────────

const readiness = (code: string): ReadinessItem[] => {
  const items: ReadinessItem[] = [{ id: 'temp', label: 'Raise your temperature', detail: '2–3 min brisk walk, bike or rower' }]
  if (/PUSH|PULL|UPPER|FULL/.test(code)) items.push({ id: 'shoulder', label: 'Shoulders', detail: '12 band dislocates or arm circles, 15 band pull-aparts' })
  if (/LEGS|PULL|LOWER|FULL/.test(code)) items.push({ id: 'hip', label: 'Hips and ankles', detail: '8 deep squat pries, 8 bodyweight hip hinges' })
  return items
}

const days = (list: [string, string, string][]) => list.map(([id, name, focus]) => ({ id, name, focus }))

export const PPL_RAMP: ProgramDef = {
  id: 'tpl_ppl_ramp',
  template_id: 'ppl_ramp',
  name: 'PPL ramp-up',
  tagline: 'Return to lifting and build to a 6-day push/pull/legs',
  icon: 'stairs',
  days: ROTATION_ORDER.map((id) => ({ id, name: ROTATION_LABEL[id], focus: ROTATION_FOCUS[id] })),
  phases: [1, 2, 3, 4].map((n) => PPL_PHASES[n]),
  readiness: Object.fromEntries(ROTATION_ORDER.map((c) => [c, readiness(c)])),
}

const FB_A = 'FULL_A'
const FB_B = 'FULL_B'
export const FULL_BODY_3: ProgramDef = {
  id: 'tpl_full_body_3',
  template_id: 'full_body_3',
  name: 'Full-body strength',
  tagline: '3 days a week of barbell basics',
  icon: 'barbell',
  days: days([
    [FB_A, 'Workout A', 'Squat, bench, row'],
    [FB_B, 'Workout B', 'Squat, press, deadlift'],
  ]),
  phases: [
    {
      phase: 1,
      name: 'Full-body strength',
      short_name: 'Strength',
      summary: 'Alternate A and B, three days a week. Add weight every time you hit all your reps.',
      schedule: { type: 'WEEKDAYS', days: [1, 3, 5] },
      days_per_week: 3,
      target_duration_minutes: 45,
      gate_required: null,
      amrap_enabled: false,
      workouts: {
        [FB_A]: [
          ex({ exercise_id: 'barbell_back_squat', name: 'Squat', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 180, warmup_enabled: true }),
          ex({ exercise_id: 'barbell_bench_press_heavy', name: 'Bench Press', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 180 }),
          ex({ exercise_id: 'barbell_row', name: 'Barbell Row', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 150 }),
          ex({ exercise_id: 'face_pulls', name: 'Face Pulls', sets: 2, reps_min: 15, reps_max: 20, rest_sec: 60 }),
        ],
        [FB_B]: [
          ex({ exercise_id: 'barbell_back_squat', name: 'Squat', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 180, warmup_enabled: true }),
          ex({ exercise_id: 'barbell_overhead_press_heavy', name: 'Overhead Press', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 180 }),
          ex({ exercise_id: 'barbell_deadlift', name: 'Deadlift', sets: 1, reps_min: 5, reps_max: 5, rest_sec: 180 }),
          ex({ exercise_id: 'lat_pulldown', name: 'Lat Pulldown', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 }),
        ],
      },
    },
  ],
  readiness: { [FB_A]: readiness('FULL'), [FB_B]: readiness('FULL') },
}

export const UPPER_LOWER_4: ProgramDef = {
  id: 'tpl_upper_lower_4',
  template_id: 'upper_lower_4',
  name: 'Upper / lower',
  tagline: '4 days a week for strength and size',
  icon: 'columns',
  days: days([
    ['UPPER_A', 'Upper A', 'Bench focus'],
    ['LOWER_A', 'Lower A', 'Squat focus'],
    ['UPPER_B', 'Upper B', 'Press focus'],
    ['LOWER_B', 'Lower B', 'Deadlift focus'],
  ]),
  phases: [
    {
      phase: 1,
      name: 'Upper / lower',
      short_name: 'Upper / lower',
      summary: 'Heavy main lift first, then rep-range accessories that add weight once you hit the top of the range.',
      schedule: { type: 'WEEKDAYS', days: [1, 2, 4, 5] },
      days_per_week: 4,
      target_duration_minutes: 55,
      gate_required: null,
      amrap_enabled: true,
      workouts: {
        UPPER_A: [
          ex({ exercise_id: 'barbell_bench_press_heavy', name: 'Bench Press', sets: 4, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
          ex({ exercise_id: 'barbell_row', name: 'Barbell Row', sets: 4, reps_min: 6, reps_max: 10, rest_sec: 120 }),
          ex({ exercise_id: 'incline_dumbbell_press', name: 'Incline Dumbbell Press', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 }),
          ex({ exercise_id: 'lat_pulldown', name: 'Lat Pulldown', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 }),
          ex({ exercise_id: 'triceps_rope_pushdown', name: 'Triceps Pushdown', sets: 3, reps_min: 10, reps_max: 15, rest_sec: 60 }),
        ],
        LOWER_A: [
          ex({ exercise_id: 'barbell_back_squat', name: 'Squat', sets: 4, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
          ex({ exercise_id: 'romanian_deadlift', name: 'Romanian Deadlift', sets: 3, reps_min: 8, reps_max: 10, rest_sec: 120 }),
          ex({ exercise_id: 'leg_curls', name: 'Leg Curl', sets: 3, reps_min: 10, reps_max: 15, rest_sec: 75 }),
          ex({ exercise_id: 'calf_raises', name: 'Calf Raise', sets: 4, reps_min: 10, reps_max: 15, rest_sec: 60 }),
        ],
        UPPER_B: [
          ex({ exercise_id: 'barbell_overhead_press_heavy', name: 'Overhead Press', sets: 4, reps_min: 5, reps_max: 5, amrap_last_set: true, rest_sec: 180, warmup_enabled: true }),
          ex({ exercise_id: 'seated_cable_row', name: 'Seated Cable Row', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 }),
          ex({ exercise_id: 'dumbbell_bench_press', name: 'Dumbbell Bench Press', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 }),
          ex({ exercise_id: 'dumbbell_lateral_raise', name: 'Lateral Raise', sets: 3, reps_min: 12, reps_max: 20, rest_sec: 60 }),
          ex({ exercise_id: 'bicep_curls', name: 'Curls', sets: 3, reps_min: 10, reps_max: 15, rest_sec: 60 }),
        ],
        LOWER_B: [
          ex({ exercise_id: 'barbell_deadlift', name: 'Deadlift', sets: 3, reps_min: 5, reps_max: 5, rest_sec: 180, warmup_enabled: true }),
          ex({ exercise_id: 'leg_press', name: 'Leg Press', sets: 3, reps_min: 10, reps_max: 15, rest_sec: 120 }),
          ex({ exercise_id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', sets: 3, reps_min: 8, reps_max: 12, rest_sec: 90 }),
          ex({ exercise_id: 'calf_raises', name: 'Calf Raise', sets: 4, reps_min: 10, reps_max: 15, rest_sec: 60 }),
        ],
      },
    },
  ],
  readiness: { UPPER_A: readiness('UPPER'), LOWER_A: readiness('LOWER'), UPPER_B: readiness('UPPER'), LOWER_B: readiness('LOWER') },
}

export const TEMPLATES: ProgramDef[] = [PPL_RAMP, FULL_BODY_3, UPPER_LOWER_4]

/** A blank program with `n` days for the user to fill in. */
export function makeCustomProgram(n: number): ProgramDef {
  const ids = Array.from({ length: n }, (_, i) => `DAY_${i + 1}`)
  const weekdays: Record<number, number[]> = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] }
  return {
    id: 'tpl_custom',
    template_id: null,
    name: 'My program',
    tagline: `${n} days a week`,
    icon: 'pencil',
    days: ids.map((id, i) => ({ id, name: `Day ${i + 1}`, focus: '' })),
    phases: [
      {
        phase: 1,
        name: 'My program',
        short_name: 'Custom',
        summary: 'Your own days and exercises.',
        schedule: { type: 'WEEKDAYS', days: weekdays[n] ?? [1, 3, 5] },
        days_per_week: n,
        target_duration_minutes: 45,
        gate_required: null,
        amrap_enabled: true,
        workouts: Object.fromEntries(ids.map((id) => [id, []])),
      },
    ],
  }
}

/** Copies a template so the user can edit their own version freely. */
export function instantiateProgram(template: ProgramDef, id: string): ProgramDef {
  return { ...structuredClone(template), id }
}

// ─── Lookups ────────────────────────────────────────────────────────────────

export const phaseOf = (program: ProgramDef, n: number): PhaseDef =>
  program.phases.find((p) => p.phase === n) ?? program.phases[program.phases.length - 1]

export const dayAt = (program: ProgramDef, index: number) => {
  const n = program.days.length
  return program.days[((index % n) + n) % n]
}

export const dayLabel = (program: ProgramDef | null | undefined, code: string | null) =>
  program?.days.find((d) => d.id === code)?.name ?? (code ? ROTATION_LABEL[code] ?? code : 'Workout')

export const hasGates = (program: ProgramDef) => program.phases.some((p) => p.gate_required !== null)

/** Kept for the engine tests that exercise the original PPL rules directly. */
export const PHASES = PPL_PHASES
