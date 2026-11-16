import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Table } from 'dexie'
import { db, getMeta, setMeta, SYNC_TABLES } from './db'

/**
 * Offline-first sync with Supabase.
 *
 * - Every local write sets `dirty = 1` and a client `updated_at`.
 * - Sync = pull, then push. Pull fetches rows whose server `synced_at` is newer than
 *   the last pull and keeps whichever side has the newer `updated_at`.
 * - The first sync on a device with no workouts takes the server copy wholesale,
 *   so a fresh install never overwrites real progress with Day-0 seed data.
 * - The in-progress workout never syncs; it lives on the device it started on.
 */

const CONFIG_KEY = 'supabase-config'

export interface SyncConfig {
  url: string
  anonKey: string
}

export function getSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return JSON.parse(raw) as SyncConfig
  } catch {
    /* storage unavailable */
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return url && anonKey ? { url, anonKey } : null
}

export function saveSyncConfig(cfg: SyncConfig | null) {
  try {
    if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
    else localStorage.removeItem(CONFIG_KEY)
  } catch {
    /* storage unavailable */
  }
  client = null
}

/** Absolute URL of the app root, including the GitHub Pages sub-path. */
const appUrl = () => new URL(import.meta.env.BASE_URL, location.origin).href

export const isSyncConfigured = () => getSyncConfig() !== null

/** True when the project was pasted in Settings rather than built into the app. */
export function isCustomSyncConfig(): boolean {
  try {
    return localStorage.getItem(CONFIG_KEY) !== null
  } catch {
    return false
  }
}

/** The Supabase library is loaded on demand so it stays out of the first-paint bundle. */
let client: Promise<SupabaseClient> | null = null
export function getClient(): Promise<SupabaseClient> | null {
  if (client) return client
  const cfg = getSyncConfig()
  if (!cfg) return null
  client = import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, detectSessionInUrl: true } }),
  )
  return client
}

export async function getSession(): Promise<Session | null> {
  const c = await getClient()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return data.session
}

export async function sendLoginEmail(email: string) {
  const c = await getClient()
  if (!c) throw new Error('Supabase is not configured')
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: appUrl() } })
  if (error) throw error
}

export async function verifyLoginCode(email: string, token: string) {
  const c = await getClient()
  if (!c) throw new Error('Supabase is not configured')
  const { error } = await c.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
}

export async function signOut() {
  await (await getClient())?.auth.signOut()
}

type Row = Record<string, unknown> & { updated_at: string; dirty?: 0 | 1 }

function toRemote(local: string, row: Row, uid: string): Record<string, unknown> {
  const { dirty: _dirty, ...rest } = row
  void _dirty
  if (local === 'profile') return { ...rest, id: uid }
  return { ...rest, user_id: uid }
}

function toLocal(local: string, row: Record<string, unknown>): Row {
  const { user_id: _u, synced_at: _s, ...rest } = row
  void _u
  void _s
  const out = { ...rest, dirty: 0 } as Row
  // Postgres returns "+00:00" offsets; normalise so local string compares stay valid.
  out.updated_at = new Date(out.updated_at).toISOString()
  if (local === 'profile') out.id = 'me'
  return out
}

export interface SyncReport {
  pulled: number
  pushed: number
  at: string
}

let inflight: Promise<SyncReport> | null = null

export function syncNow(): Promise<SyncReport> {
  inflight ??= doSync().finally(() => {
    inflight = null
  })
  return inflight
}

async function doSync(): Promise<SyncReport> {
  const c = await getClient()
  if (!c) throw new Error('Supabase is not configured')
  const session = await getSession()
  if (!session) throw new Error('Not signed in')
  const uid = session.user.id

  const firstSyncForUser = (await getMeta<string>('synced_user')) !== uid
  const hasLocalHistory = (await db.sessions.count()) > 0
  const serverWins = firstSyncForUser && !hasLocalHistory
  let pulled = 0
  let pushed = 0

  for (const t of SYNC_TABLES) {
    const table = db.table(t.local) as Table<Row, string>
    const cursorKey = `pull_cursor:${uid}:${t.remote}`
    const cursor = firstSyncForUser ? null : await getMeta<string>(cursorKey)

    // ── Pull ──
    let maxSynced = cursor
    for (let from = 0; ; from += 1000) {
      let q = c.from(t.remote).select('*').order('synced_at', { ascending: true }).range(from, from + 999)
      if (cursor) q = q.gt('synced_at', cursor)
      const { data, error } = await q
      if (error) throw new Error(`${t.remote}: ${error.message}`)
      if (!data?.length) break
      await db.transaction('rw', table, async () => {
        for (const remote of data as Record<string, unknown>[]) {
          const row = toLocal(t.local, remote)
          const key = row[t.key] as string
          const existing = await table.get(key)
          if (!existing || serverWins || Date.parse(row.updated_at) >= Date.parse(existing.updated_at)) {
            await table.put(row)
            pulled++
          }
          const s = remote.synced_at as string
          if (!maxSynced || s > maxSynced) maxSynced = s
        }
      })
      if (data.length < 1000) break
    }
    if (maxSynced) await setMeta(cursorKey, maxSynced)

    // ── Push ──
    const dirty = await table.where('dirty').equals(1).toArray()
    for (let i = 0; i < dirty.length; i += 500) {
      const chunk = dirty.slice(i, i + 500)
      const onConflict = t.local === 'exercise_states' ? 'user_id,exercise_id' : 'id'
      const { error } = await c.from(t.remote).upsert(chunk.map((r) => toRemote(t.local, r, uid)), { onConflict })
      if (error) throw new Error(`${t.remote}: ${error.message}`)
      await db.transaction('rw', table, async () => {
        for (const r of chunk) {
          const key = r[t.key] as string
          const current = await table.get(key)
          // Only clear the flag if nothing changed locally while we were pushing.
          if (current && current.updated_at === r.updated_at) await table.update(key, { dirty: 0 } as Partial<Row>)
        }
      })
      pushed += chunk.length
    }
  }

  await setMeta('synced_user', uid)
  const at = new Date().toISOString()
  await setMeta('last_sync_at', at)
  return { pulled, pushed, at }
}

/** Count of rows waiting to be pushed. */
export async function pendingChanges(): Promise<number> {
  let n = 0
  for (const t of SYNC_TABLES) n += await db.table(t.local).where('dirty').equals(1).count()
  return n
}

export async function signInWithPassword(email: string, password: string) {
  const c = await getClient()
  if (!c) throw new Error('Supabase is not configured')
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** Creates the account. Returns true when Supabase wants the email confirmed first. */
export async function signUpWithPassword(email: string, password: string): Promise<boolean> {
  const c = await getClient()
  if (!c) throw new Error('Supabase is not configured')
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } })
  if (error) throw error
  return !data.session
}
