import { STARTING_WEIGHTS_LBS } from './catalog'
import { PROGRAM_ID } from './program'
import type { ExerciseState, Profile } from './types'

export function createDefaultProfile(now = new Date().toISOString()): Profile {
  return {
    id: 'me',
    display_name: 'Lifter',
    unit_system: 'IMPERIAL',
    barbell_weight_lbs: 45,
    plates_lbs: [45, 35, 25, 10, 5, 2.5],
    dumbbell_step_lbs: 5,
    active_program_id: PROGRAM_ID,
    current_phase: 1,
    phase_gate_progress: 0,
    next_rotation_index: 0,
    rest_day_calories: 2100,
    training_day_calories: 2350,
    protein_target_g: 145,
    carbs_target_g: 250,
    fat_target_g: 65,
    fiber_target_g: 35,
    created_at: now,
    updated_at: now,
    dirty: 1,
  }
}

export function createSeedStates(now = new Date().toISOString()): ExerciseState[] {
  return Object.entries(STARTING_WEIGHTS_LBS).map(([exercise_id, w]) => ({
    exercise_id,
    current_working_weight_lbs: w,
    consecutive_failures: 0,
    last_performed_at: null,
    best_e1rm_lbs: null,
    last_reps: null,
    last_weight_lbs: null,
    updated_at: now,
    dirty: 1,
  }))
}
