import Dexie, { type EntityTable } from 'dexie'
import type {
  ExerciseState,
  NutritionLog,
  NutritionRecipe,
  Profile,
  SessionLog,
  SessionPlan,
  WorkoutEntry,
  WorkoutSession,
} from '../domain/types'

/** In-progress workout. Device-local only; becomes a WorkoutSession + entries on finish. */
export interface ActiveWorkout {
  id: 'active'
  session_id: string
  started_at: string
  plan: SessionPlan
  log: SessionLog
  warmups_done: Record<string, boolean[]>
  readiness_done: string[]
  /** Key of the set last touched, so the inline stepper knows what to adjust. */
  focus: { key: string; set: number } | null
}

export interface MetaRow {
  key: string
  value: unknown
}

export class AppDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>
  exercise_states!: EntityTable<ExerciseState, 'exercise_id'>
  sessions!: EntityTable<WorkoutSession, 'id'>
  entries!: EntityTable<WorkoutEntry, 'id'>
  recipes!: EntityTable<NutritionRecipe, 'id'>
  nutrition_logs!: EntityTable<NutritionLog, 'id'>
  active!: EntityTable<ActiveWorkout, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor() {
    super('ppl-platform')
    this.version(1).stores({
      profile: 'id, dirty',
      exercise_states: 'exercise_id, dirty',
      sessions: 'id, session_date, status, dirty',
      entries: 'id, session_id, exercise_id, dirty',
      recipes: 'id, dirty',
      nutrition_logs: 'id, log_date, dirty',
      active: 'id',
      meta: 'key',
    })
  }
}

export const db = new AppDB()

/** Tables that sync to Supabase, mapped to their server table names. */
export const SYNC_TABLES = [
  { local: 'profile', remote: 'user_profiles', key: 'id' },
  { local: 'exercise_states', remote: 'user_exercise_states', key: 'exercise_id' },
  { local: 'sessions', remote: 'workout_sessions', key: 'id' },
  { local: 'entries', remote: 'workout_entries', key: 'id' },
  { local: 'recipes', remote: 'nutrition_recipes', key: 'id' },
  { local: 'nutrition_logs', remote: 'nutrition_logs', key: 'id' },
] as const

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}
