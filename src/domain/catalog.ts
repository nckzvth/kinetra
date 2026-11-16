import type { Equipment, ExerciseDef, UnitSystem } from './types'
import { convertWeight, rulesFor } from './units'

const lift = (
  d: Omit<ExerciseDef, 'tracking_archetype' | 'substitutions' | 'primary_muscles'> &
    Partial<Pick<ExerciseDef, 'substitutions' | 'primary_muscles'>>,
): ExerciseDef => ({
  tracking_archetype: 'WEIGHT_REPS',
  substitutions: [],
  primary_muscles: [],
  ...d,
})

export const EXERCISES: ExerciseDef[] = [
  // ── Primary barbell lifts ──
  lift({ id: 'barbell_bench_press_heavy', name: 'Bench Press', category: 'PUSH', equipment: 'BARBELL', progression_type: 'LINEAR', default_rest_sec: 180, primary_muscles: ['chest', 'triceps', 'front delts'] }),
  lift({ id: 'barbell_overhead_press_heavy', name: 'Overhead Press', category: 'PUSH', equipment: 'BARBELL', progression_type: 'LINEAR', default_rest_sec: 180, primary_muscles: ['delts', 'triceps'] }),
  lift({ id: 'barbell_deadlift', name: 'Deadlift', category: 'PULL', equipment: 'BARBELL', progression_type: 'LINEAR_DEADLIFT', default_rest_sec: 180, primary_muscles: ['posterior chain'] }),
  lift({ id: 'barbell_row', name: 'Barbell Row', category: 'PULL', equipment: 'BARBELL', progression_type: 'LINEAR', default_rest_sec: 180, primary_muscles: ['lats', 'upper back'] }),
  lift({ id: 'barbell_back_squat', name: 'Squat', category: 'LEGS', equipment: 'BARBELL', progression_type: 'LINEAR', default_rest_sec: 180, primary_muscles: ['quads', 'glutes'] }),

  // ── Secondary compounds & isolation (double progression) ──
  lift({ id: 'barbell_bench_press_volume', name: 'Bench Press (Volume)', category: 'PUSH', equipment: 'BARBELL', progression_type: 'DOUBLE', default_rest_sec: 120, substitutions: ['Dumbbell Bench Press'] }),
  lift({ id: 'dumbbell_overhead_press_volume', name: 'Dumbbell Shoulder Press', category: 'PUSH', equipment: 'DUMBBELL', per_hand: true, progression_type: 'DOUBLE', default_rest_sec: 120, substitutions: ['Standing Barbell OHP'] }),
  lift({ id: 'incline_dumbbell_press', name: 'Incline Dumbbell Press', category: 'PUSH', equipment: 'DUMBBELL', per_hand: true, progression_type: 'DOUBLE', default_rest_sec: 90, substitutions: ['Landmine Press', 'Incline Barbell Press'] }),
  lift({ id: 'triceps_rope_pushdown', name: 'Triceps Pushdown', category: 'PUSH', equipment: 'CABLE', progression_type: 'DOUBLE', default_rest_sec: 75, substitutions: ['DB Overhead Triceps Extension', 'EZ-Bar Skullcrushers'] }),
  lift({ id: 'overhead_triceps_extension', name: 'Overhead Triceps Extension', category: 'PUSH', equipment: 'CABLE', progression_type: 'DOUBLE', default_rest_sec: 75, substitutions: ['Dumbbell Overhead Extension'] }),
  lift({ id: 'dumbbell_lateral_raise', name: 'Lateral Raise', category: 'PUSH', equipment: 'DUMBBELL', per_hand: true, progression_type: 'DOUBLE', default_rest_sec: 75, substitutions: ['Cable Lateral Raise'] }),
  lift({ id: 'lat_pulldown', name: 'Lat Pulldown', category: 'PULL', equipment: 'CABLE', progression_type: 'DOUBLE', default_rest_sec: 120, substitutions: ['Pull-ups', 'Assisted Pull-ups'] }),
  lift({ id: 'seated_cable_row', name: 'Seated Cable Row', category: 'PULL', equipment: 'CABLE', progression_type: 'DOUBLE', default_rest_sec: 90, substitutions: ['Chest-Supported Row', 'One-Arm DB Row', 'T-Bar Row'] }),
  lift({ id: 'face_pulls', name: 'Face Pulls', category: 'PULL', equipment: 'CABLE', progression_type: 'DOUBLE', default_rest_sec: 75, substitutions: ['Rear Delt DB Flyes + Band Pull-Aparts'] }),
  lift({ id: 'hammer_curls', name: 'Hammer Curl', category: 'PULL', equipment: 'DUMBBELL', per_hand: true, progression_type: 'DOUBLE', default_rest_sec: 60 }),
  lift({ id: 'bicep_curls', name: 'Biceps Curl', category: 'PULL', equipment: 'DUMBBELL', per_hand: true, progression_type: 'DOUBLE', default_rest_sec: 60 }),
  lift({ id: 'romanian_deadlift', name: 'Romanian Deadlift', category: 'LEGS', equipment: 'BARBELL', progression_type: 'DOUBLE', default_rest_sec: 120, substitutions: ['Dumbbell RDL'] }),
  lift({ id: 'leg_press', name: 'Leg Press', category: 'LEGS', equipment: 'MACHINE', progression_type: 'DOUBLE', increment_lbs: 10, default_rest_sec: 120, substitutions: ['Front Squat', 'Hack Squat'] }),
  lift({ id: 'leg_curls', name: 'Leg Curl', category: 'LEGS', equipment: 'MACHINE', progression_type: 'DOUBLE', default_rest_sec: 75, substitutions: ['Glute-Ham Raise', 'Nordic Curl'] }),
  lift({ id: 'calf_raises', name: 'Calf Raise', category: 'LEGS', equipment: 'MACHINE', progression_type: 'DOUBLE', default_rest_sec: 60 }),

  // ── More strength movements for custom programs ──
  lift({ id: 'front_squat', name: 'Front Squat', category: 'LEGS', equipment: 'BARBELL', progression_type: 'DOUBLE', default_rest_sec: 150 }),
  lift({ id: 'goblet_squat', name: 'Goblet Squat', category: 'LEGS', equipment: 'DUMBBELL', progression_type: 'DOUBLE', default_rest_sec: 90 }),
  lift({ id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', category: 'LEGS', equipment: 'DUMBBELL', per_hand: true, progression_type: 'DOUBLE', default_rest_sec: 90 }),
  lift({ id: 'walking_lunge', name: 'Walking Lunge', category: 'LEGS', equipment: 'DUMBBELL', per_hand: true, progression_type: 'DOUBLE', default_rest_sec: 90 }),
  lift({ id: 'hip_thrust', name: 'Barbell Hip Thrust', category: 'LEGS', equipment: 'BARBELL', progression_type: 'DOUBLE', default_rest_sec: 120 }),
  lift({ id: 'leg_extension', name: 'Leg Extension', category: 'LEGS', equipment: 'MACHINE', progression_type: 'DOUBLE', default_rest_sec: 75 }),
  lift({ id: 'dumbbell_bench_press', name: 'Dumbbell Bench Press', category: 'PUSH', equipment: 'DUMBBELL', per_hand: true, progression_type: 'DOUBLE', default_rest_sec: 120 }),
  lift({ id: 'machine_chest_press', name: 'Machine Chest Press', category: 'PUSH', equipment: 'MACHINE', progression_type: 'DOUBLE', default_rest_sec: 90 }),
  lift({ id: 'cable_fly', name: 'Cable Fly', category: 'PUSH', equipment: 'CABLE', progression_type: 'DOUBLE', default_rest_sec: 60 }),
  lift({ id: 'dumbbell_row', name: 'One-Arm Dumbbell Row', category: 'PULL', equipment: 'DUMBBELL', per_hand: true, progression_type: 'DOUBLE', default_rest_sec: 90 }),
  lift({ id: 'rear_delt_fly', name: 'Rear Delt Fly', category: 'PULL', equipment: 'DUMBBELL', per_hand: true, progression_type: 'DOUBLE', default_rest_sec: 60 }),
  lift({ id: 'shrug', name: 'Dumbbell Shrug', category: 'PULL', equipment: 'DUMBBELL', per_hand: true, progression_type: 'DOUBLE', default_rest_sec: 60 }),
  { id: 'chin_up', name: 'Chin-up', category: 'PULL', tracking_archetype: 'BODYWEIGHT_REPS', equipment: 'BODYWEIGHT', primary_muscles: ['lats', 'biceps'], progression_type: 'NONE', default_rest_sec: 120, substitutions: ['Lat Pulldown'] },
  { id: 'dip', name: 'Dip', category: 'PUSH', tracking_archetype: 'BODYWEIGHT_REPS', equipment: 'BODYWEIGHT', primary_muscles: ['chest', 'triceps'], progression_type: 'NONE', default_rest_sec: 120, substitutions: [] },
  { id: 'push_up', name: 'Push-up', category: 'PUSH', tracking_archetype: 'BODYWEIGHT_REPS', equipment: 'BODYWEIGHT', primary_muscles: ['chest'], progression_type: 'NONE', default_rest_sec: 60, substitutions: [] },
  { id: 'hanging_leg_raise', name: 'Hanging Leg Raise', category: 'MOBILITY', tracking_archetype: 'BODYWEIGHT_REPS', equipment: 'BODYWEIGHT', primary_muscles: ['core'], progression_type: 'NONE', default_rest_sec: 60, substitutions: [] },

  // ── Multi-modal catalog (step 2 — Log Activity) ──
  { id: 'outdoor_run', name: 'Outdoor Run', category: 'CARDIO', tracking_archetype: 'DISTANCE_PACE', equipment: 'NONE', primary_muscles: [], progression_type: 'NONE', default_rest_sec: 0, substitutions: ['Treadmill Run'] },
  { id: 'rowing', name: 'Rowing Erg', category: 'CARDIO', tracking_archetype: 'DISTANCE_PACE', equipment: 'MACHINE', primary_muscles: [], progression_type: 'NONE', default_rest_sec: 0, substitutions: [] },
  { id: 'rucking', name: 'Rucking', category: 'CARDIO', tracking_archetype: 'DISTANCE_PACE', equipment: 'NONE', primary_muscles: [], progression_type: 'NONE', default_rest_sec: 0, substitutions: [] },
  { id: 'shadow_boxing', name: 'Shadow Boxing', category: 'COMBAT', tracking_archetype: 'ROUNDS_INTERVAL', equipment: 'NONE', primary_muscles: [], progression_type: 'NONE', default_rest_sec: 60, substitutions: ['Heavy Bag'] },
  { id: 'jump_rope', name: 'Jump Rope', category: 'COMBAT', tracking_archetype: 'ROUNDS_INTERVAL', equipment: 'NONE', primary_muscles: [], progression_type: 'NONE', default_rest_sec: 60, substitutions: [] },
  { id: 'indoor_bouldering', name: 'Indoor Bouldering', category: 'CLIMBING', tracking_archetype: 'CLIMB_BOULDER', equipment: 'NONE', primary_muscles: [], progression_type: 'NONE', default_rest_sec: 0, substitutions: ['Top Rope'] },
  { id: 'plank', name: 'Plank', category: 'MOBILITY', tracking_archetype: 'DURATION_HOLD', equipment: 'BODYWEIGHT', primary_muscles: ['core'], progression_type: 'NONE', default_rest_sec: 60, substitutions: [] },
  { id: 'dead_hang', name: 'Dead Hang', category: 'MOBILITY', tracking_archetype: 'DURATION_HOLD', equipment: 'BODYWEIGHT', primary_muscles: ['grip', 'lats'], progression_type: 'NONE', default_rest_sec: 60, substitutions: [] },
  { id: 'pull_up', name: 'Pull-up', category: 'PULL', tracking_archetype: 'BODYWEIGHT_REPS', equipment: 'BODYWEIGHT', primary_muscles: ['lats'], progression_type: 'NONE', default_rest_sec: 120, substitutions: [] },
]

export const EXERCISE_BY_ID: Record<string, ExerciseDef> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]))

/** User-created exercises, registered at startup and whenever they change. */
const custom: Record<string, ExerciseDef> = {}
export function registerCustomExercises(defs: ExerciseDef[]) {
  for (const k of Object.keys(custom)) delete custom[k]
  for (const d of defs) custom[d.id] = d
}
export const allExercises = (): ExerciseDef[] => [...EXERCISES, ...Object.values(custom)]
export const isCustomExercise = (id: string) => id in custom

const UNKNOWN = (id: string): ExerciseDef => ({
  id,
  name: id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  category: 'PUSH',
  tracking_archetype: 'WEIGHT_REPS',
  equipment: 'NONE',
  primary_muscles: [],
  progression_type: 'DOUBLE',
  default_rest_sec: 90,
  substitutions: [],
})

/** Never throws: an exercise deleted on another device still renders by its id. */
export function getExercise(id: string): ExerciseDef {
  return EXERCISE_BY_ID[id] ?? custom[id] ?? UNKNOWN(id)
}

/** Conservative first-session weight when the user hasn't set one (in lb). */
const EQUIPMENT_START_LB: Record<Equipment, number> = { BARBELL: 45, DUMBBELL: 15, CABLE: 30, MACHINE: 50, BODYWEIGHT: 0, NONE: 0 }

export function defaultStart(exerciseId: string, unit: UnitSystem): number {
  const ex = getExercise(exerciseId)
  const lb = STARTING_WEIGHTS_LBS[exerciseId] ?? (ex.id === 'leg_press' ? 90 : EQUIPMENT_START_LB[ex.equipment])
  if (unit === 'IMPERIAL') return lb
  const step = ex.equipment === 'DUMBBELL' ? rulesFor(unit).dumbbellStep : rulesFor(unit).round
  if (ex.equipment === 'BARBELL') return Math.max(rulesFor(unit).bar, convertWeight(lb, 'IMPERIAL', unit, step))
  return convertWeight(lb, 'IMPERIAL', unit, step)
}

export const PRIMARY_LIFT_IDS = [
  'barbell_bench_press_heavy',
  'barbell_overhead_press_heavy',
  'barbell_deadlift',
  'barbell_row',
  'barbell_back_squat',
] as const

/** Day-0 seed weights from the program spec (lbs; dumbbells are per hand). */
export const STARTING_WEIGHTS_LBS: Record<string, number> = {
  barbell_bench_press_heavy: 75,
  barbell_bench_press_volume: 65,
  barbell_overhead_press_heavy: 50,
  dumbbell_overhead_press_volume: 25,
  barbell_deadlift: 115,
  barbell_row: 65,
  barbell_back_squat: 95,
  romanian_deadlift: 85,
  lat_pulldown: 80,
  seated_cable_row: 75,
  incline_dumbbell_press: 30,
  triceps_rope_pushdown: 30,
  overhead_triceps_extension: 25,
  dumbbell_lateral_raise: 15,
  face_pulls: 25,
  hammer_curls: 20,
  bicep_curls: 20,
  leg_press: 135,
  leg_curls: 60,
  calf_raises: 50,
}
