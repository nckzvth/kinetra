/**
 * Domain model for the whole platform (lifting, multi-modal activities, nutrition).
 *
 * Persisted records use snake_case so they map 1:1 onto the Supabase / Postgres
 * schema in `supabase/migrations`. Only the lifting slice is wired into the UI
 * today; the activity archetypes and nutrition records are defined here so the
 * storage layer and sync already carry them when those screens ship.
 */

// ─── Catalog ────────────────────────────────────────────────────────────────

export type TrackingArchetype =
  | 'WEIGHT_REPS'
  | 'BODYWEIGHT_REPS'
  | 'DURATION_HOLD'
  | 'ROUNDS_INTERVAL'
  | 'DISTANCE_PACE'
  | 'CLIMB_BOULDER'

export type Equipment = 'BARBELL' | 'DUMBBELL' | 'CABLE' | 'MACHINE' | 'BODYWEIGHT' | 'NONE'

export type ProgressionType = 'LINEAR' | 'LINEAR_DEADLIFT' | 'DOUBLE' | 'NONE'

export type Category = 'PUSH' | 'PULL' | 'LEGS' | 'CARDIO' | 'COMBAT' | 'CLIMBING' | 'MOBILITY'

export interface ExerciseDef {
  id: string
  name: string
  category: Category
  tracking_archetype: TrackingArchetype
  equipment: Equipment
  primary_muscles: string[]
  progression_type: ProgressionType
  /** Fixed increment override. When absent the increment comes from equipment settings. */
  increment_lbs?: number
  default_rest_sec: number
  substitutions: string[]
  /** Weights for dumbbell movements are per hand. */
  per_hand?: boolean
}

// ─── Program ────────────────────────────────────────────────────────────────

/** A training day inside a program (e.g. "PUSH_A", "DAY_1"). */
export type RotationCode = string
export type PhaseNumber = number

/** When sessions are suggested. The day order is always the program's rotation. */
export type ScheduleRule =
  | { type: 'WEEKDAYS'; days: number[] } // 0 = Sunday
  | { type: 'EVERY_N_DAYS'; n: number }
  | { type: 'DAILY_EXCEPT'; off: number[] }
  | { type: 'FLEXIBLE' }

export interface PrescribedExercise {
  exercise_id: string
  name: string
  sets: number
  reps_min: number
  reps_max: number
  amrap_last_set: boolean
  rest_sec: number
  warmup_enabled: boolean
  superset_group?: string
}

export interface PhaseDef {
  phase: PhaseNumber
  name: string
  short_name: string
  summary: string
  schedule: ScheduleRule
  days_per_week: number
  target_duration_minutes: number
  /** Sessions that must count toward the gate before promotion. null = final phase. */
  gate_required: number | null
  amrap_enabled: boolean
  workouts: Record<RotationCode, PrescribedExercise[]>
}

export interface ProgramDay {
  id: RotationCode
  name: string
  focus: string
}

/** A complete, editable training program. Templates are copied into the user's own program. */
export interface ProgramDef {
  id: string
  template_id: string | null
  name: string
  tagline: string
  icon: string
  /** Rotation order. */
  days: ProgramDay[]
  /** At least one. Programs without gates have a single phase with gate_required = null. */
  phases: PhaseDef[]
  /** Optional warm-up checklist per day. */
  readiness?: Record<RotationCode, ReadinessItem[]>
}

// ─── User state ─────────────────────────────────────────────────────────────

export type UnitSystem = 'IMPERIAL' | 'METRIC'

interface Syncable {
  updated_at: string
  /** Local-only flag: 1 when the row has changes not yet pushed to the server. */
  dirty?: 0 | 1
}

export type EquipmentPreset = 'GYM' | 'HOME' | 'NONE'

export interface Profile extends Syncable {
  id: 'me'
  display_name: string
  /** All stored weights (the *_lbs fields included) are in this unit. */
  unit_system: UnitSystem
  equipment_preset: EquipmentPreset
  onboarded: boolean
  barbell_weight_lbs: number
  /** Plates available per side, heaviest first. */
  plates_lbs: number[]
  dumbbell_step_lbs: number
  /** The user's program (a row in `programs`), or null for "just track". */
  active_program_id: string | null
  current_phase: PhaseNumber
  phase_gate_progress: number
  next_rotation_index: number
  rest_day_calories: number
  training_day_calories: number
  protein_target_g: number
  carbs_target_g: number
  fat_target_g: number
  fiber_target_g: number
  created_at: string
}

export interface ExerciseState extends Syncable {
  exercise_id: string
  current_working_weight_lbs: number
  consecutive_failures: number
  last_performed_at: string | null
  best_e1rm_lbs: number | null
  /** Reps per set from the last exposure, used to suggest double-progression targets. */
  last_reps: number[] | null
  last_weight_lbs: number | null
}

export type SessionStatus = 'COMPLETED' | 'DISCARDED'

export interface WorkoutSession extends Syncable {
  id: string
  session_date: string
  program_phase: PhaseNumber | null
  rotation_code: RotationCode | 'CUSTOM' | null
  title: string
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  session_rpe: number | null
  counted_toward_phase_gate: boolean
  joint_pain: boolean | null
  status: SessionStatus
  notes: string | null
  /** Engine output captured at finish time (next weights, gate movement, promotion). */
  result_json: SessionResult | null
}

export type SetType = 'WARMUP' | 'WORKING' | 'AMRAP' | 'DROPSET' | 'INTERVAL_ROUND'
export type WallAngle = 'SLAB' | 'VERTICAL' | 'OVERHANG' | 'ROOF'
export type SendStatus = 'FLASH' | 'SEND' | 'ATTEMPT'

/** Polymorphic entry: one row per set / round / run / climb. */
export interface WorkoutEntry extends Syncable {
  id: string
  session_id: string
  exercise_id: string
  exercise_order: number
  set_number: number
  set_type: SetType
  superset_group: string | null
  // WEIGHT_REPS / BODYWEIGHT_REPS
  target_weight_lbs: number | null
  actual_weight_lbs: number | null
  target_reps_min: number | null
  target_reps_max: number | null
  actual_reps: number | null
  rpe: number | null
  e1rm_lbs: number | null
  // DURATION_HOLD / ROUNDS_INTERVAL
  work_duration_sec?: number | null
  rest_duration_sec?: number | null
  rounds_completed?: number | null
  total_rounds_target?: number | null
  // DISTANCE_PACE
  distance_value?: number | null
  distance_unit?: 'mi' | 'km' | 'm' | null
  pace_sec_per_unit?: number | null
  elevation_gain_ft?: number | null
  avg_heart_rate_bpm?: number | null
  hr_zone?: number | null
  pack_weight_lbs?: number | null
  // CLIMB_BOULDER
  climb_grade?: string | null
  wall_angle?: WallAngle | null
  send_status?: SendStatus | null
  attempts_count?: number | null
  // Evaluation
  target_met: boolean | null
  completed_at: string | null
}

export interface UserProgram extends Syncable {
  id: string
  definition: ProgramDef
  created_at: string
}

export interface CustomExercise extends Syncable {
  id: string
  definition: ExerciseDef
}

// ─── Nutrition (step 3 — schema ready, UI pending) ──────────────────────────

export interface NutritionRecipe extends Syncable {
  id: string
  name: string
  total_servings: number
  remaining_fridge_servings: number
  calories_per_serving: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  ingredients_json: unknown[]
  tags: string[]
}

export type MealSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'POST_WORKOUT'

export interface NutritionLog extends Syncable {
  id: string
  log_date: string
  meal_slot: MealSlot
  item_name: string
  recipe_id: string | null
  servings_logged: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  logged_at: string
}

// ─── Engine I/O ─────────────────────────────────────────────────────────────

export interface PlannedWarmup {
  weight_lbs: number
  reps: number
  reps_label: string
  rest_sec: number
  note?: string
}

export interface PlannedSet {
  index: number
  is_amrap: boolean
  /** The rep count a single tap logs. */
  target_reps: number
}

export interface PlannedExercise {
  key: string
  order: number
  exercise_id: string
  name: string
  equipment: Equipment
  progression_type: ProgressionType
  is_primary: boolean
  per_hand: boolean
  weight_lbs: number
  reps_min: number
  reps_max: number
  amrap_last_set: boolean
  rest_sec: number
  superset_group: string | null
  sets: PlannedSet[]
  warmups: PlannedWarmup[]
  substitutions: string[]
}

export interface ReadinessItem {
  id: string
  label: string
  detail: string
  /** Optional guided countdown for this item. */
  duration_sec?: number
}

export interface SessionPlan {
  phase: PhaseNumber
  rotation_code: RotationCode
  title: string
  subtitle: string
  readiness: ReadinessItem[]
  exercises: PlannedExercise[]
}

/** What the lifter logged, keyed by PlannedExercise.key. null = set not done. */
export interface SessionLog {
  reps: Record<string, (number | null)[]>
  weights: Record<string, number>
}

export type LoadAction = 'INCREASE' | 'HOLD' | 'DELOAD' | 'DECREASE'

export interface ExerciseResult {
  exercise_id: string
  name: string
  is_primary: boolean
  target_met: boolean
  upgrade_load: boolean
  weight_used_lbs: number
  next_weight_lbs: number
  action: LoadAction
  consecutive_failures: number
  reps: number[]
  reps_min: number
  reps_max: number
}

export interface SessionResult {
  exercises: ExerciseResult[]
  session_target_met: boolean
  counted_toward_gate: boolean
  gate_blocked_by_joint_pain: boolean
  gate_before: number
  gate_after: number
  gate_required: number | null
  phase_before: PhaseNumber
  phase_after: PhaseNumber
  promoted: boolean
  next_rotation_index: number
}
