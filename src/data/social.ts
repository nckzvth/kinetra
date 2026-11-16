import type { SupabaseClient } from '@supabase/supabase-js'
import { getClient } from './sync'
import type { WorkoutSession } from '../domain/types'

/**
 * Friends layer. Unlike training data (offline-first, synced), social data is online-only and
 * read straight from Supabase, where row-level security limits everything to accepted friends.
 */

export interface PublicProfile {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  share_activity: boolean
  share_weights: boolean
}

export interface Friendship {
  id: string
  requester: string
  addressee: string
  status: 'pending' | 'accepted'
  created_at: string
}

export interface FriendEntry {
  friendship: Friendship
  profile: PublicProfile
  direction: 'friend' | 'incoming' | 'outgoing'
}

export interface SharedSummary {
  highlights?: string[]
  promoted_to?: number | null
  sets_done?: number
  /** Present only when the owner shares weights. */
  lifts?: { name: string; weight: number; unit: string; reps: number[] }[]
  ups?: number
}

export interface SharedActivity {
  id: string
  user_id: string
  kind: 'lift' | 'activity'
  title: string
  started_at: string
  duration_seconds: number | null
  summary: SharedSummary
}

export interface Kudos {
  id: string
  from_user: string
  to_user: string
  activity_id: string | null
  kind: 'fist' | 'note' | 'react'
  /** For reactions (legacy 'fist' rows count as 👊). */
  emoji: string | null
  message: string | null
  /** A GIPHY GIF attached to a note. */
  gif?: NoteGif | null
  created_at: string
  seen_at: string | null
}

export interface NoteGif {
  url: string
  still?: string | null
  w: number
  h: number
  title?: string
}

export interface GifResult extends NoteGif {
  id: string
}

/** Searches GIPHY through our server function (empty query = trending). */
export async function searchGifs(q: string, offset = 0): Promise<{ gifs: GifResult[]; more: boolean }> {
  const c = await getClient()
  if (!c) throw new Error('Sign in first')
  const { data, error } = await c.functions.invoke('gif-search', { body: { q, offset } })
  if (error) throw new Error('GIFs are unavailable right now')
  return data as { gifs: GifResult[]; more: boolean }
}

export interface LiveSession {
  user_id: string
  title: string
  started_at: string
  updated_at: string
}

async function ctx(): Promise<{ c: SupabaseClient; me: string } | null> {
  const c = await getClient()
  if (!c) return null
  const { data } = await c.auth.getSession()
  const me = data.session?.user.id
  return me ? { c, me } : null
}

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message)
}

// ─── Profile ────────────────────────────────────────────────────────────────

export async function getMyProfile(): Promise<PublicProfile | null> {
  const x = await ctx()
  if (!x) return null
  const { data, error } = await x.c.from('public_profiles').select('*').eq('user_id', x.me).maybeSingle()
  fail(error)
  return data as PublicProfile | null
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export function suggestUsername(name: string, email: string | null | undefined): string {
  const base = (name || email?.split('@')[0] || 'lifter').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return (base.length >= 3 ? base : `${base}_lifts`).slice(0, 20)
}

export async function isUsernameFree(username: string): Promise<boolean> {
  const x = await ctx()
  if (!x) return false
  const { data } = await x.c.from('public_profiles').select('user_id').eq('username', username).maybeSingle()
  return !data || (data as { user_id: string }).user_id === x.me
}

export async function saveMyProfile(p: Omit<PublicProfile, 'user_id'>): Promise<void> {
  const x = await ctx()
  if (!x) throw new Error('Sign in first')
  const { error } = await x.c.from('public_profiles').upsert({ ...p, user_id: x.me, updated_at: new Date().toISOString() })
  if (error?.code === '23505') throw new Error('That username is taken')
  fail(error)
}

export async function searchProfiles(q: string): Promise<PublicProfile[]> {
  const x = await ctx()
  // Only letters, digits, spaces and underscores reach the filter, so the query string can't be malformed.
  const term = q.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_ ]/g, '')
  if (!x || term.length < 2) return []
  const { data, error } = await x.c
    .from('public_profiles')
    .select('*')
    .or(`username.ilike.${term.replace(/ /g, '_')}*,display_name.ilike.*${term}*`)
    .neq('user_id', x.me)
    .limit(12)
  fail(error)
  return (data ?? []) as PublicProfile[]
}

export async function profileByUsername(username: string): Promise<PublicProfile | null> {
  const x = await ctx()
  if (!x) return null
  const { data } = await x.c.from('public_profiles').select('*').eq('username', username.toLowerCase()).maybeSingle()
  return data as PublicProfile | null
}

// ─── Friends ────────────────────────────────────────────────────────────────

export async function listFriends(): Promise<{ me: string; entries: FriendEntry[] }> {
  const x = await ctx()
  if (!x) return { me: '', entries: [] }
  const { data, error } = await x.c.from('friendships').select('*').order('created_at', { ascending: false })
  fail(error)
  const rows = (data ?? []) as Friendship[]
  const others = rows.map((f) => (f.requester === x.me ? f.addressee : f.requester))
  const profiles = await profilesById(x.c, others)
  return {
    me: x.me,
    entries: rows
      .map((f) => {
        const other = f.requester === x.me ? f.addressee : f.requester
        const profile = profiles[other]
        if (!profile) return null
        const direction: FriendEntry['direction'] = f.status === 'accepted' ? 'friend' : f.requester === x.me ? 'outgoing' : 'incoming'
        return { friendship: f, profile, direction }
      })
      .filter((e): e is FriendEntry => e !== null),
  }
}

async function profilesById(c: SupabaseClient, ids: string[]): Promise<Record<string, PublicProfile>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (!unique.length) return {}
  const { data } = await c.from('public_profiles').select('*').in('user_id', unique)
  return Object.fromEntries(((data ?? []) as PublicProfile[]).map((p) => [p.user_id, p]))
}

/** Sends a request, or accepts theirs if they already asked you. */
export async function addFriend(userId: string): Promise<'requested' | 'accepted'> {
  const x = await ctx()
  if (!x) throw new Error('Sign in first')
  const { data: theirs } = await x.c.from('friendships').select('*').eq('requester', userId).eq('addressee', x.me).maybeSingle()
  if (theirs) {
    await acceptFriend((theirs as Friendship).id)
    return 'accepted'
  }
  const { data, error } = await x.c.from('friendships').insert({ requester: x.me, addressee: userId }).select('id').single()
  if (error?.code === '23505') return 'requested'
  fail(error)
  void notifyFriendRequest((data as { id: string }).id)
  return 'requested'
}

export async function acceptFriend(id: string) {
  const x = await ctx()
  if (!x) return
  const { error } = await x.c.from('friendships').update({ status: 'accepted' }).eq('id', id)
  fail(error)
  void notifyFriendRequest(id)
}

export async function removeFriendship(id: string) {
  const x = await ctx()
  if (!x) return
  const { error } = await x.c.from('friendships').delete().eq('id', id)
  fail(error)
}

export function inviteLink(username: string): string {
  const url = new URL(import.meta.env.BASE_URL, location.origin)
  url.searchParams.set('invite', username)
  return url.href
}

/** Reads ?invite=username once and tidies the URL (kept through a sign-in redirect). */
export function consumeInviteParam(): string | null {
  const params = new URLSearchParams(location.search)
  const u = params.get('invite')
  if (u && USERNAME_RE.test(u)) {
    params.delete('invite')
    const rest = params.toString()
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash)
    try {
      sessionStorage.setItem('pending-invite', u)
    } catch {
      /* ignore */
    }
    return u
  }
  try {
    return sessionStorage.getItem('pending-invite')
  } catch {
    return null
  }
}

export function clearPendingInvite() {
  try {
    sessionStorage.removeItem('pending-invite')
  } catch {
    /* ignore */
  }
}

// ─── Sharing your activity ─────────────────────────────────────────────────

/** Publishes a summary of a finished session to friends (if you've set up a profile and sharing is on). */
export async function shareSession(s: WorkoutSession, unit: string): Promise<void> {
  const x = await ctx()
  if (!x) return
  const me = await getMyProfile()
  if (!me?.share_activity) return
  const r = s.result_json
  const activity = s.rotation_code === 'CUSTOM'
  const ups = r?.exercises.filter((e) => e.action === 'INCREASE' && e.is_primary) ?? []
  const summary: SharedSummary = {
    promoted_to: r?.promoted ? r.phase_after : null,
    sets_done: r ? r.exercises.reduce((n, e) => n + e.reps.filter((v) => v > 0).length, 0) : undefined,
    ups: ups.length,
    highlights: activity
      ? []
      : [
          ...(r?.promoted ? [`Unlocked phase ${r.phase_after}`] : []),
          ...(r?.session_target_met ? ['Hit every rep'] : []),
          ...(me.share_weights ? ups.map((e) => `${e.name} up to ${e.next_weight_lbs} ${unit}`) : ups.map((e) => `${e.name} going up`)),
        ].slice(0, 3),
    lifts: me.share_weights && r ? r.exercises.filter((e) => e.is_primary).map((e) => ({ name: e.name, weight: e.weight_used_lbs, unit, reps: e.reps })) : undefined,
  }
  const { error } = await x.c.from('shared_activities').upsert({
    id: s.id,
    user_id: x.me,
    kind: activity ? 'activity' : 'lift',
    title: s.title,
    started_at: s.started_at,
    duration_seconds: s.duration_seconds,
    summary,
  })
  fail(error)
}

export async function setLive(title: string, startedAt: string) {
  const x = await ctx()
  if (!x) return
  const me = await getMyProfile()
  if (!me?.share_activity) return
  await x.c.from('live_sessions').upsert({ user_id: x.me, title, started_at: startedAt, updated_at: new Date().toISOString() })
}

export async function clearLive() {
  const x = await ctx()
  if (!x) return
  await x.c.from('live_sessions').delete().eq('user_id', x.me)
}

// ─── Feed ───────────────────────────────────────────────────────────────────

export interface SocialFeed {
  me: string
  profiles: Record<string, PublicProfile>
  live: LiveSession[]
  activities: SharedActivity[]
  kudos: Kudos[]
  inbox: Kudos[]
  friendIds: string[]
}

export async function loadFeed(): Promise<SocialFeed | null> {
  const x = await ctx()
  if (!x) return null
  const since = new Date(Date.now() - 14 * 86400000).toISOString()
  const liveSince = new Date(Date.now() - 4 * 3600000).toISOString()
  const [fr, acts, live, inbox] = await Promise.all([
    x.c.from('friendships').select('*').eq('status', 'accepted'),
    x.c.from('shared_activities').select('*').gte('started_at', since).order('started_at', { ascending: false }).limit(80),
    x.c.from('live_sessions').select('*').neq('user_id', x.me).gte('updated_at', liveSince),
    x.c.from('kudos').select('*').eq('to_user', x.me).order('created_at', { ascending: false }).limit(30),
  ])
  const friendIds = ((fr.data ?? []) as Friendship[]).map((f) => (f.requester === x.me ? f.addressee : f.requester))
  const activities = (acts.data ?? []) as SharedActivity[]
  const activityIds = activities.map((a) => a.id)
  const kudos = activityIds.length ? (((await x.c.from('kudos').select('*').in('activity_id', activityIds)).data ?? []) as Kudos[]) : []
  const inboxRows = (inbox.data ?? []) as Kudos[]
  const profiles = await profilesById(x.c, [...friendIds, x.me, ...inboxRows.map((k) => k.from_user)])
  return { me: x.me, profiles, live: (live.data ?? []) as LiveSession[], activities, kudos, inbox: inboxRows, friendIds }
}

export const emojiOf = (k: Kudos) => (k.kind === 'fist' ? '👊' : k.emoji ?? '👊')
export const isReaction = (k: Kudos) => k.kind === 'fist' || k.kind === 'react'

/** React to a post (or to someone training now, with activityId null) with any emoji. */
export async function sendReaction(toUser: string, activityId: string | null, emoji: string) {
  const x = await ctx()
  if (!x) throw new Error('Sign in first')
  const { data, error } = await x.c.from('kudos').insert({ to_user: toUser, activity_id: activityId, kind: 'react', emoji }).select('id').single()
  if (error?.code === '23505') return
  fail(error)
  void notifyKudos((data as { id: string }).id)
}

export async function removeReaction(activityId: string, emoji: string) {
  const x = await ctx()
  if (!x) return
  await x.c.from('kudos').delete().eq('activity_id', activityId).eq('from_user', x.me).eq('kind', 'react').eq('emoji', emoji)
  if (emoji === '👊') await x.c.from('kudos').delete().eq('activity_id', activityId).eq('from_user', x.me).eq('kind', 'fist')
}

export async function sendNote(toUser: string, activityId: string | null, message: string, gif: NoteGif | null = null) {
  const x = await ctx()
  if (!x) throw new Error('Sign in first')
  const g = gif ? { url: gif.url, still: gif.still ?? null, w: gif.w, h: gif.h, title: gif.title ?? '' } : null
  const { data, error } = await x.c
    .from('kudos')
    .insert({ to_user: toUser, activity_id: activityId, kind: 'note', message: message.trim() || null, gif: g })
    .select('id')
    .single()
  fail(error)
  void notifyKudos((data as { id: string }).id)
}

/** Asks the server to push a notification about this reaction or note to its recipient. */
export async function notifyKudos(kudosId: string) {
  const c = await getClient()
  await c?.functions.invoke('push-notify', { body: { kind: 'kudos', id: kudosId } }).catch(() => {})
}

export async function notifyFriendRequest(friendshipId: string) {
  const c = await getClient()
  await c?.functions.invoke('push-notify', { body: { kind: 'friendship', id: friendshipId } }).catch(() => {})
}

export async function markInboxSeen() {
  const x = await ctx()
  if (!x) return
  await x.c.from('kudos').update({ seen_at: new Date().toISOString() }).eq('to_user', x.me).is('seen_at', null)
}

/** Live updates: calls `onChange` whenever friends' activity, live status, kudos or requests change. */
export async function subscribeSocial(onChange: () => void): Promise<() => void> {
  const c = await getClient()
  if (!c) return () => {}
  const ch = c.channel(`social-${Math.random().toString(36).slice(2)}`)
  for (const table of ['live_sessions', 'shared_activities', 'kudos', 'friendships'])
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
  ch.subscribe()
  return () => void c.removeChannel(ch)
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export interface LeaderRow {
  user_id: string
  sessions: number
  minutes: number
  ups: number
  score: number
}

/** This week (Monday start): sessions, active minutes and weight increases among you and your friends. */
export function weeklyLeaderboard(feed: SocialFeed): LeaderRow[] {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const rows = new Map<string, LeaderRow>()
  for (const id of [feed.me, ...feed.friendIds]) rows.set(id, { user_id: id, sessions: 0, minutes: 0, ups: 0, score: 0 })
  for (const a of feed.activities) {
    if (new Date(a.started_at) < monday) continue
    const r = rows.get(a.user_id)
    if (!r) continue
    r.sessions += 1
    r.minutes += Math.round((a.duration_seconds ?? 0) / 60)
    r.ups += a.summary.ups ?? 0
  }
  // Score rewards showing up first, then effort and progress, so beginners can top the board too.
  for (const r of rows.values()) r.score = r.sessions * 10 + Math.min(r.minutes, 600) / 6 + r.ups * 5
  return [...rows.values()].sort((a, b) => b.score - a.score || b.sessions - a.sessions)
}

// ─── Block and report ───────────────────────────────────────────────────────

/** Blocks someone: removes any friendship and stops requests and reactions in both directions. */
export async function blockUser(userId: string) {
  const x = await ctx()
  if (!x) throw new Error('Sign in first')
  const { error } = await x.c.from('blocks').upsert({ blocker: x.me, blocked: userId })
  fail(error)
  await x.c.from('friendships').delete().or(`and(requester.eq.${x.me},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${x.me})`)
}

export async function unblockUser(userId: string) {
  const x = await ctx()
  if (!x) return
  await x.c.from('blocks').delete().eq('blocker', x.me).eq('blocked', userId)
}

export async function listBlocked(): Promise<PublicProfile[]> {
  const x = await ctx()
  if (!x) return []
  const { data } = await x.c.from('blocks').select('blocked').eq('blocker', x.me)
  const ids = ((data ?? []) as { blocked: string }[]).map((b) => b.blocked)
  return Object.values(await profilesById(x.c, ids))
}

export async function reportUser(userId: string, reason: string, kudosId?: string) {
  const x = await ctx()
  if (!x) throw new Error('Sign in first')
  const { error } = await x.c.from('reports').insert({ reporter: x.me, reported_user: userId, reason, kudos_id: kudosId ?? null })
  fail(error)
}
