import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import type { ExerciseState } from '../domain/types'

export function useProfile() {
  return useLiveQuery(() => db.profile.get('me'), [])
}

export function useStates(): Record<string, ExerciseState> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.exercise_states.toArray()
    return Object.fromEntries(rows.map((r) => [r.exercise_id, r]))
  }, [])
}

export function useActive() {
  return useLiveQuery(async () => (await db.active.get('active')) ?? null, [])
}

export function useCompletedSessions() {
  return useLiveQuery(
    async () => (await db.sessions.where('status').equals('COMPLETED').toArray()).sort((a, b) => b.started_at.localeCompare(a.started_at)),
    [],
  )
}

export function useSessionEntries(sessionId: string | null) {
  return useLiveQuery(async () => (sessionId ? db.entries.where('session_id').equals(sessionId).toArray() : []), [sessionId])
}

export function useProgram(id: string | null | undefined) {
  return useLiveQuery(async () => (id ? ((await db.programs.get(id))?.definition ?? null) : null), [id])
}

export function useCustomExercises() {
  return useLiveQuery(() => db.custom_exercises.toArray(), [])
}
