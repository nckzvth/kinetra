import { getExercise, registerCustomExercises } from '../domain/catalog'
import { createDefaultProfile } from '../domain/defaults'
import { instantiateProgram, makeCustomProgram, TEMPLATES } from '../domain/program'
import type {
  EquipmentPreset,
  ExerciseDef,
  ExerciseState,
  PrescribedExercise,
  Profile,
  ProgramDef,
  SessionResult,
  UnitSystem,
  WorkoutEntry,
  WorkoutSession,
} from '../domain/types'
import { convertWeight, platesFor, rulesFor } from '../domain/units'
import { epley } from '../engine/e1rm'
import { buildSessionPlan, emptyPlan, planExercise } from '../engine/plan'
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
  await db.transaction('rw', db.profile, async () => {
    if (await db.profile.get('me')) return
    await db.profile.put(createDefaultProfile(nowISO()))
  })
  registerCustomExercises((await db.custom_exercises.toArray()).map((c) => c.definition))
}

export async function loadProgram(profile: Profile): Promise<ProgramDef | null> {
  if (!profile.active_program_id) return null
  return (await db.programs.get(profile.active_program_id))?.definition ?? null
}

// ─── Onboarding ─────────────────────────────────────────────────────────────

export type ProgramChoice = { kind: 'template'; templateId: string } | { kind: 'custom'; days: number } | { kind: 'track' }

export interface OnboardingInput {
  name: string
  choice: ProgramChoice
  preset: EquipmentPreset
  unit: UnitSystem
  startWeights: Record<string, number>
}

export function programForChoice(choice: ProgramChoice): ProgramDef | null {
  if (choice.kind === 'track') return null
  if (choice.kind === 'custom') return makeCustomProgram(choice.days)
  return TEMPLATES.find((t) => t.template_id === choice.templateId) ?? null
}

export async function completeOnboarding(input: OnboardingInput) {
  const now = nowISO()
  const template = programForChoice(input.choice)
  const r = rulesFor(input.unit)
  await db.transaction('rw', [db.profile, db.programs, db.exercise_states], async () => {
    let programId: string | null = null
    if (template) {
      programId = uuid()
      await db.programs.put({ id: programId, definition: instantiateProgram(template, programId), created_at: now, updated_at: now, dirty: 1 })
    }
    await db.profile.update('me', {
      display_name: input.name.trim(),
      unit_system: input.unit,
      equipment_preset: input.preset,
      barbell_weight_lbs: r.bar,
      plates_lbs: platesFor(input.unit, input.preset),
      dumbbell_step_lbs: r.dumbbellStep,
      active_program_id: programId,
      current_phase: 1,
      phase_gate_progress: 0,
      next_rotation_index: 0,
      onboarded: true,
      updated_at: now,
      dirty: 1,
    })
    for (const [id, w] of Object.entries(input.startWeights)) await putWeight(id, w, now)
  })
}

// ─── Programs ───────────────────────────────────────────────────────────────

export async function saveProgram(def: ProgramDef) {
  const existing = await db.programs.get(def.id)
  const now = nowISO()
  await db.programs.put({ id: def.id, definition: def, created_at: existing?.created_at ?? now, updated_at: now, dirty: 1 })
}

/** Switches to another program (a template copy or an existing one) from its first day. */
export async function switchProgram(choice: ProgramChoice) {
  const template = programForChoice(choice)
  let id: string | null = null
  if (template) {
    id = uuid()
    await saveProgram(instantiateProgram(template, id))
  }
  await updateProfile({ active_program_id: id, current_phase: 1, phase_gate_progress: 0, next_rotation_index: 0 })
}

// ─── Exercises ──────────────────────────────────────────────────────────────

export async function saveCustomExercise(def: ExerciseDef) {
  await db.custom_exercises.put({ id: def.id, definition: def, updated_at: nowISO(), dirty: 1 })
  registerCustomExercises((await db.custom_exercises.toArray()).map((c) => c.definition))
}

// ─── Units ──────────────────────────────────────────────────────────────────

/** Converts every stored weight so switching lb ↔ kg never changes how heavy anything is. */
export async function changeUnits(to: UnitSystem) {
  const profile = (await db.profile.get('me'))!
  const from = profile.unit_system
  if (from === to) return
  const r = rulesFor(to)
  const now = nowISO()
  await db.transaction('rw', db.profile, db.exercise_states, async () => {
    const states = await db.exercise_states.toArray()
    await db.exercise_states.bulkPut(
      states.map((s) => {
        const step = getExercise(s.exercise_id).equipment === 'DUMBBELL' ? r.dumbbellStep : r.round
        return {
          ...s,
          current_working_weight_lbs: convertWeight(s.current_working_weight_lbs, from, to, step),
          last_weight_lbs: s.last_weight_lbs === null ? null : convertWeight(s.last_weight_lbs, from, to, step),
          best_e1rm_lbs: s.best_e1rm_lbs === null ? null : convertWeight(s.best_e1rm_lbs, from, to, 0.1),
          updated_at: now,
          dirty: 1 as const,
        }
      }),
    )
    await db.profile.update('me', {
      unit_system: to,
      barbell_weight_lbs: r.bar,
      plates_lbs: platesFor(to, profile.equipment_preset),
      dumbbell_step_lbs: r.dumbbellStep,
      updated_at: now,
      dirty: 1,
    })
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
  await putWeight(exerciseId, weight, nowISO())
}

async function putWeight(exerciseId: string, weight: number, now: string) {
  const existing = await db.exercise_states.get(exerciseId)
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

export async function startWorkout(opts: { free?: boolean; day?: string } = {}): Promise<ActiveWorkout> {
  const profile = (await db.profile.get('me'))!
  const program = await loadProgram(profile)
  const plan =
    program && !opts.free
      ? buildSessionPlan(profile, await loadStates(), program, { rotation: opts.day })
      : emptyPlan(program ? 'Extra workout' : 'Workout')
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

/** Adds an exercise to the running workout (today only; edit the program to keep it). */
export async function addExerciseToActive(exerciseId: string) {
  const profile = (await db.profile.get('me'))!
  const states = await loadStates()
  const ex = getExercise(exerciseId)
  const linear = ex.progression_type === 'LINEAR' || ex.progression_type === 'LINEAR_DEADLIFT'
  const p: PrescribedExercise = {
    exercise_id: exerciseId,
    name: ex.name,
    sets: 3,
    reps_min: linear ? 5 : 8,
    reps_max: linear ? 5 : 12,
    amrap_last_set: false,
    rest_sec: ex.default_rest_sec,
    warmup_enabled: false,
  }
  await patchActive((a) => {
    const planned = planExercise(p, a.plan.exercises.length, profile, states, false)
    a.plan.exercises.push(planned)
    a.log.reps[planned.key] = planned.sets.map(() => null)
    a.log.weights[planned.key] = planned.weight_lbs
    a.warmups_done[planned.key] = planned.warmups.map(() => false)
  })
}

/** Adds or removes a set on an exercise in the running workout. */
export async function changeSetCount(key: string, delta: 1 | -1) {
  await patchActive((a) => {
    const ex = a.plan.exercises.find((e) => e.key === key)
    if (!ex) return
    if (delta > 0) {
      const last = ex.sets[ex.sets.length - 1]
      ex.sets.push({ index: ex.sets.length, is_amrap: false, target_reps: last?.target_reps ?? ex.reps_min })
      a.log.reps[key].push(null)
    } else if (ex.sets.length > 1) {
      ex.sets.pop()
      a.log.reps[key].pop()
    }
  })
}

export async function removeExerciseFromActive(key: string) {
  await patchActive((a) => {
    a.plan.exercises = a.plan.exercises.filter((e) => e.key !== key)
    delete a.log.reps[key]
    delete a.log.weights[key]
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
  return db.transaction('rw', [db.active, db.profile, db.programs, db.exercise_states, db.sessions, db.entries], async () => {
    const active = await db.active.get('active')
    if (!active) throw new Error('No active workout')
    const profile = (await db.profile.get('me'))!
    const program = await loadProgram(profile)
    const states = await loadStates()
    const now = nowISO()
    const out = evaluateSession(active.plan, active.log, states, profile, program, { joint_pain: input.joint_pain, now })

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
      program_phase: active.plan.phase || null,
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
    programs: await db.programs.toArray(),
    custom_exercises: await db.custom_exercises.toArray(),
    recipes: await db.recipes.toArray(),
    nutrition_logs: await db.nutrition_logs.toArray(),
  }
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  await db.transaction('rw', [db.profile, db.exercise_states, db.sessions, db.entries, db.programs, db.custom_exercises, db.recipes, db.nutrition_logs], async () => {
    await Promise.all([db.profile.clear(), db.exercise_states.clear(), db.sessions.clear(), db.entries.clear(), db.programs.clear(), db.custom_exercises.clear(), db.recipes.clear(), db.nutrition_logs.clear()])
    await db.programs.bulkPut(data.programs ?? [])
    await db.custom_exercises.bulkPut(data.custom_exercises ?? [])
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
  registerCustomExercises([])
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
