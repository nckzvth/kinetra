import Dexie, { type EntityTable } from 'dexie'
import type {
  CustomExercise,
  ExerciseState,
  NutritionLog,
  NutritionRecipe,
  Profile,
  SessionLog,
  SessionPlan,
  UserProgram,
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
  programs!: EntityTable<UserProgram, 'id'>
  custom_exercises!: EntityTable<CustomExercise, 'id'>
  active!: EntityTable<ActiveWorkout, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'kinetra') {
    super(name)
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
    this.version(2)
      .stores({ programs: 'id, dirty', custom_exercises: 'id, dirty' })
      .upgrade(async (tx) => {
        // Profiles from the first release predate onboarding and editable programs.
        const sessions = await tx.table('sessions').count()
        await tx.table('profile').toCollection().modify((p: Record<string, unknown>) => {
          p.equipment_preset ??= 'GYM'
          p.onboarded = sessions > 0
          if (typeof p.active_program_id === 'string' && !String(p.active_program_id).match(/^[0-9a-f-]{36}$/)) p.active_program_id = null
          if (p.display_name === 'Lifter') p.display_name = ''
        })
      })
  }
}

export const db = new AppDB()

/** Name of the on-device database before the app was renamed to Kinetra. */
const LEGACY_DB = 'ppl-platform'

/** One-time copy of on-device data from the pre-rename database, then removes it. */
export async function migrateLegacyDb() {
  if (!(await Dexie.exists(LEGACY_DB))) return
  const old = new AppDB(LEGACY_DB)
  await old.open()
  if ((await db.profile.count()) === 0) {
    // Read everything first: awaiting another database inside a transaction would end it.
    const copies = await Promise.all(old.tables.map(async (t) => ({ name: t.name, rows: await t.toArray() })))
    await db.transaction('rw', db.tables, async () => {
      for (const c of copies) if (c.rows.length) await db.table(c.name).bulkPut(c.rows)
    })
  }
  old.close()
  await Dexie.delete(LEGACY_DB)
}

/** Tables that sync to Supabase, mapped to their server table names. */
export const SYNC_TABLES = [
  { local: 'profile', remote: 'user_profiles', key: 'id' },
  { local: 'exercise_states', remote: 'user_exercise_states', key: 'exercise_id' },
  { local: 'sessions', remote: 'workout_sessions', key: 'id' },
  { local: 'entries', remote: 'workout_entries', key: 'id' },
  { local: 'programs', remote: 'user_programs', key: 'id' },
  { local: 'custom_exercises', remote: 'custom_exercises', key: 'id' },
  { local: 'recipes', remote: 'nutrition_recipes', key: 'id' },
  { local: 'nutrition_logs', remote: 'nutrition_logs', key: 'id' },
] as const

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}
