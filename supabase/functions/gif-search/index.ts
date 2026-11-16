// GIF search for notes, proxied so the GIPHY key stays server-side (private.app_secrets).
// Signed-in users only; results are trimmed to what the picker needs.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } })

let cachedKey: string | null = null

interface GiphyImage {
  url: string
  width: string
  height: string
}
interface GiphyGif {
  id: string
  title: string
  images: { fixed_width: GiphyImage; fixed_width_still: GiphyImage; downsized_medium?: GiphyImage }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: who } = await admin.auth.getUser(jwt)
  if (!who?.user) return json(401, { error: 'not_signed_in' })

  let q = ''
  let offset = 0
  try {
    const b = await req.json()
    q = String(b.q ?? '').slice(0, 50)
    offset = Math.max(0, Math.min(500, Number(b.offset ?? 0) || 0))
  } catch {
    /* empty body = trending */
  }

  if (!cachedKey) {
    const { data } = await admin.rpc('get_app_secret', { p_name: 'giphy_key' })
    cachedKey = (data as string) ?? null
  }
  if (!cachedKey) return json(500, { error: 'gifs_not_configured' })

  const params = new URLSearchParams({ api_key: cachedKey, limit: '24', offset: String(offset), rating: 'pg-13', bundle: 'messaging_non_clips' })
  const endpoint = q.trim() ? 'search' : 'trending'
  if (q.trim()) params.set('q', q.trim())
  const res = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params}`)
  if (!res.ok) return json(502, { error: 'giphy_unavailable', status: res.status })
  const body = (await res.json()) as { data: GiphyGif[]; pagination?: { total_count: number } }
  const gifs = body.data.map((g) => ({
    id: g.id,
    title: g.title,
    url: g.images.fixed_width.url,
    still: g.images.fixed_width_still?.url ?? null,
    w: Number(g.images.fixed_width.width),
    h: Number(g.images.fixed_width.height),
  }))
  return json(200, { gifs, more: (body.pagination?.total_count ?? 0) > offset + gifs.length }, { 'Cache-Control': 'private, max-age=300' })
})
