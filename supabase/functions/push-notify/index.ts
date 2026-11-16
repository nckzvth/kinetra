// Sends a web push to the person on the other end of a reaction, note or friend request.
//
// The sender's app calls this right after creating the row. We re-read that row with the
// service role and check the caller really sent it, so nobody can push arbitrary messages.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const APP_URL = 'https://nckzvth.github.io/kinetra/'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: who } = await admin.auth.getUser(jwt)
  const caller = who?.user?.id
  if (!caller) return json(401, { error: 'not_signed_in' })

  let kind = ''
  let id = ''
  try {
    const b = await req.json()
    kind = String(b.kind ?? '')
    id = String(b.id ?? '')
  } catch {
    return json(400, { error: 'bad_request' })
  }

  const nameOf = async (userId: string) => {
    const { data } = await admin.from('public_profiles').select('display_name, username').eq('user_id', userId).maybeSingle()
    return (data?.display_name || '').split(/\s+/)[0] || (data?.username ? `@${data.username}` : 'A friend')
  }

  let to = ''
  let title = ''
  let body = ''
  let tag = ''

  if (kind === 'kudos') {
    const { data: k } = await admin.from('kudos').select('*').eq('id', id).maybeSingle()
    if (!k || k.from_user !== caller) return json(403, { error: 'forbidden' })
    to = k.to_user
    const from = await nameOf(k.from_user)
    let about = ''
    if (k.activity_id) {
      const { data: a } = await admin.from('shared_activities').select('title').eq('id', k.activity_id).maybeSingle()
      about = a?.title ?? ''
    }
    if (k.kind === 'note') {
      title = about ? `${from} on your ${about}` : `${from} sent you a note`
      body = k.message || (k.gif ? 'Sent you a GIF' : '')
    } else {
      const emoji = k.kind === 'fist' ? '👊' : k.emoji ?? '👊'
      title = `${from} ${emoji}`
      body = about ? `Reacted to your ${about}` : 'Cheering you on while you train'
    }
    tag = `kudos-${k.activity_id ?? 'live'}`
  } else if (kind === 'friendship') {
    const { data: f } = await admin.from('friendships').select('*').eq('id', id).maybeSingle()
    if (!f) return json(404, { error: 'not_found' })
    if (f.status === 'pending' && f.requester === caller) {
      to = f.addressee
      title = `${await nameOf(f.requester)} wants to be friends`
      body = 'Open Kinetra to accept.'
    } else if (f.status === 'accepted' && f.addressee === caller) {
      to = f.requester
      title = `${await nameOf(f.addressee)} accepted your friend request`
      body = 'You can now see each other’s training.'
    } else return json(403, { error: 'forbidden' })
    tag = `friend-${f.id}`
  } else return json(400, { error: 'unknown_kind' })

  const [{ data: pub }, { data: priv }] = await Promise.all([
    admin.rpc('get_app_secret', { p_name: 'vapid_public' }),
    admin.rpc('get_app_secret', { p_name: 'vapid_private' }),
  ])
  if (!pub || !priv) return json(500, { error: 'push_not_configured' })
  webpush.setVapidDetails('mailto:push@kinetra.app', pub as string, priv as string)

  const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', to)
  const payload = JSON.stringify({ title, body, tag, url: APP_URL })
  let sent = 0
  await Promise.all(
    (subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 })
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // The device unsubscribed or the subscription expired: forget it.
        if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    }),
  )
  return json(200, { ok: true, sent })
})
