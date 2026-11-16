import { createDefaultProfile, createSeedStates } from '../domain/defaults'
import type { ExerciseState, Profile, SessionResult, WorkoutEntry, WorkoutSession } from '../domain/types'
import { epley } from '../engine/e1rm'
import { buildSessionPlan } from '../engine/plan'
import { evaluateSession } from '../engine/progression'
import { toISODate } from '../engine/schedule'
import { db, type ActiveWorkout } from './db'

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Fallback for non-secure contexts (e.g. LAN http during development).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const nowISO = () => new Date().toISOString()

export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.profile, db.exercise_states, async () => {
    if (await db.profile.get('me')) return
    const now = nowISO()
    await db.profile.put(createDefaultProfile(now))
    await db.exercise_states.bulkPut(createSeedStates(now))
  })
}

export async function loadStates(): Promise<Record<string, ExerciseState>> {
  const rows = await db.exercise_states.toArray()
  return Object.fromEntries(rows.map((r) => [r.exercise_id, r]))
}

export async function updateProfile(patch: Partial<Profile>) {
  await db.profile.update('me', { ...patch, updated_at: nowISO(), dirty: 1 })
}

export async function setWorkingWeight(exerciseId: string, weight: number) {
  const existing = await db.exercise_states.get(exerciseId)
  const now = nowISO()
  await db.exercise_states.put({
    exercise_id: exerciseId,
    current_working_weight_lbs: weight,
    consecutive_failures: existing?.consecutive_failures ?? 0,
    last_performed_at: existing?.last_performed_at ?? null,
    best_e1rm_lbs: existing?.best_e1rm_lbs ?? null,
    last_reps: existing?.last_reps ?? null,
    last_weight_lbs: existing?.last_weight_lbs ?? null,
    updated_at: now,
    dirty: 1,
  })
}

// ─── Active workout ─────────────────────────────────────────────────────────

export async function startWorkout(): Promise<ActiveWorkout> {
  const profile = (await db.profile.get('me'))!
  const plan = buildSessionPlan(profile, await loadStates())
  const active: ActiveWorkout = {
    id: 'active',
    session_id: uuid(),
    started_at: nowISO(),
    plan,
    log: {
      reps: Object.fromEntries(plan.exercises.map((e) => [e.key, e.sets.map(() => null)])),
      weights: Object.fromEntries(plan.exercises.map((e) => [e.key, e.weight_lbs])),
    },
    warmups_done: Object.fromEntries(plan.exercises.map((e) => [e.key, e.warmups.map(() => false)])),
    readiness_done: [],
    focus: null,
  }
  await db.active.put(active)
  return active
}

export async function patchActive(fn: (a: ActiveWorkout) => void) {
  await db.transaction('rw', db.active, async () => {
    const a = await db.active.get('active')
    if (!a) return
    fn(a)
    await db.active.put(a)
  })
}

export async function discardWorkout() {
  await db.active.delete('active')
}

export interface FinishInput {
  joint_pain: boolean | null
  session_rpe: number | null
  notes: string | null
}

export async function finishWorkout(input: FinishInput): Promise<WorkoutSession> {
  return db.transaction('rw', [db.active, db.profile, db.exercise_states, db.sessions, db.entries], async () => {
    const active = await db.active.get('active')
    if (!active) throw new Error('No active workout')
    const profile = (await db.profile.get('me'))!
    const states = await loadStates()
    const now = nowISO()
    const out = evaluateSession(active.plan, active.log, states, profile, { joint_pain: input.joint_pain, now })

    const entries: WorkoutEntry[] = []
    for (const ex of active.plan.exercises) {
      const weight = active.log.weights[ex.key] ?? ex.weight_lbs
      ex.warmups.forEach((w, i) => {
        if (!active.warmups_done[ex.key]?.[i]) return
        entries.push(baseEntry(active.session_id, ex.exercise_id, ex.order, i + 1, 'WARMUP', ex.superset_group, {
          target_weight_lbs: w.weight_lbs,
          actual_weight_lbs: w.weight_lbs,
          target_reps_min: w.reps,
          target_reps_max: w.reps,
          actual_reps: w.reps,
          target_met: true,
          completed_at: now,
        }))
      })
      ex.sets.forEach((s, i) => {
        const reps = active.log.reps[ex.key]?.[i] ?? null
        entries.push(baseEntry(active.session_id, ex.exercise_id, ex.order, ex.warmups.length + i + 1, s.is_amrap ? 'AMRAP' : 'WORKING', ex.superset_group, {
          target_weight_lbs: ex.weight_lbs,
          actual_weight_lbs: weight,
          target_reps_min: ex.reps_min,
          target_reps_max: s.is_amrap ? null : ex.reps_max,
          actual_reps: reps,
          e1rm_lbs: reps ? epley(weight, reps) : null,
          target_met: reps !== null && reps >= ex.reps_min,
          completed_at: reps !== null ? now : null,
        }))
      })
    }

    const started = new Date(active.started_at)
    const session: WorkoutSession = {
      id: active.session_id,
      session_date: toISODate(started),
      program_phase: active.plan.phase,
      rotation_code: active.plan.rotation_code,
      title: active.plan.title,
      started_at: active.started_at,
      completed_at: now,
      duration_seconds: Math.round((Date.now() - started.getTime()) / 1000),
      session_rpe: input.session_rpe,
      counted_toward_phase_gate: out.result.counted_toward_gate,
      joint_pain: input.joint_pain,
      status: 'COMPLETED',
      notes: input.notes,
      result_json: out.result,
      updated_at: now,
      dirty: 1,
    }

    await db.sessions.put(session)
    await db.entries.bulkPut(entries)
    await db.exercise_states.bulkPut(Object.values(out.states).filter((s) => s.dirty === 1 && s.updated_at === now))
    await db.profile.update('me', { ...out.profile, updated_at: now, dirty: 1 })
    await db.active.delete('active')
    return session
  })
}

function baseEntry(
  session_id: string,
  exercise_id: string,
  exercise_order: number,
  set_number: number,
  set_type: WorkoutEntry['set_type'],
  superset_group: string | null,
  fields: Partial<WorkoutEntry>,
): WorkoutEntry {
  return {
    id: uuid(),
    session_id,
    exercise_id,
    exercise_order,
    set_number,
    set_type,
    superset_group,
    target_weight_lbs: null,
    actual_weight_lbs: null,
    target_reps_min: null,
    target_reps_max: null,
    actual_reps: null,
    rpe: null,
    e1rm_lbs: null,
    target_met: null,
    completed_at: null,
    updated_at: new Date().toISOString(),
    dirty: 1,
    ...fields,
  }
}

// ─── Backup ─────────────────────────────────────────────────────────────────

export async function exportAll() {
  return {
    exported_at: nowISO(),
    version: 1,
    profile: await db.profile.toArray(),
    exercise_states: await db.exercise_states.toArray(),
    sessions: await db.sessions.toArray(),
    entries: await db.entries.toArray(),
    recipes: await db.recipes.toArray(),
    nutrition_logs: await db.nutrition_logs.toArray(),
  }
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  await db.transaction('rw', [db.profile, db.exercise_states, db.sessions, db.entries, db.recipes, db.nutrition_logs], async () => {
    await Promise.all([db.profile.clear(), db.exercise_states.clear(), db.sessions.clear(), db.entries.clear(), db.recipes.clear(), db.nutrition_logs.clear()])
    await db.profile.bulkPut(data.profile)
    await db.exercise_states.bulkPut(data.exercise_states)
    await db.sessions.bulkPut(data.sessions)
    await db.entries.bulkPut(data.entries)
    await db.recipes.bulkPut(data.recipes ?? [])
    await db.nutrition_logs.bulkPut(data.nutrition_logs ?? [])
  })
}

export async function resetAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
  await ensureSeeded()
}

export type { SessionResult }

// ─── Activities (Release 2) ────────────────────────────────────────────────

export interface ActivityInput {
  exercise_id: string
  title: string
  started_at: string
  duration_seconds: number | null
  session_rpe: number | null
  notes: string | null
  entries: Partial<WorkoutEntry>[]
}

/** Saves a non-program activity as a CUSTOM session with polymorphic entries. */
export async function saveActivity(input: ActivityInput): Promise<WorkoutSession> {
  const now = nowISO()
  const session: WorkoutSession = {
    id: uuid(),
    session_date: toISODate(new Date(input.started_at)),
    program_phase: null,
    rotation_code: 'CUSTOM',
    title: input.title,
    started_at: input.started_at,
    completed_at: now,
    duration_seconds: input.duration_seconds,
    session_rpe: input.session_rpe,
    counted_toward_phase_gate: false,
    joint_pain: null,
    status: 'COMPLETED',
    notes: input.notes,
    result_json: null,
    updated_at: now,
    dirty: 1,
  }
  const entries = input.entries.map((e, i) =>
    baseEntry(session.id, input.exercise_id, 1, i + 1, e.set_type ?? 'WORKING', null, { completed_at: now, ...e }),
  )
  await db.transaction('rw', db.sessions, db.entries, async () => {
    await db.sessions.put(session)
    await db.entries.bulkPut(entries)
  })
  return session
}
