// Approves a "Sign in with your browser" handoff.
//
// Called by the phone's browser, where the user is already signed in. It confirms who the
// caller is, then stores a one-time sign-in token on the handoff row. The home-screen app
// claims that token once (claim_auth_handoff) and exchanges it for its own session.
// generateLink only creates the token; no email is sent.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  let id = ''
  try {
    id = String((await req.json()).id ?? '')
  } catch {
    return json(400, { error: 'bad_request' })
  }
  if (!/^[0-9a-f]{32,}$/.test(id)) return json(400, { error: 'invalid_id' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: who, error: whoErr } = await admin.auth.getUser(jwt)
  const user = who?.user
  if (whoErr || !user?.email) return json(401, { error: 'not_signed_in' })

  const { data: row } = await admin.from('auth_handoffs').select('id, expires_at, approved_at').eq('id', id).maybeSingle()
  if (!row) return json(404, { error: 'not_found' })
  if (row.approved_at) return json(409, { error: 'already_used' })
  if (new Date(row.expires_at).getTime() < Date.now()) return json(410, { error: 'expired' })

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email })
  const tokenHash = link?.properties?.hashed_token
  if (linkErr || !tokenHash) return json(500, { error: 'could_not_create_token' })

  const { error: upErr } = await admin
    .from('auth_handoffs')
    .update({ token_hash: tokenHash, user_id: user.id, approved_at: new Date().toISOString() })
    .eq('id', id)
    .is('approved_at', null)
  if (upErr) return json(500, { error: 'could_not_save' })

  return json(200, { ok: true, email: user.email })
})
