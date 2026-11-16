import { getClient } from './sync'
import { isStandalone } from '../ui/install'

/**
 * Web push for reactions, notes and friend requests. On iPhone this only works in the
 * home-screen app (iOS 16.4+); elsewhere any modern browser can subscribe.
 */

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function pushState(): Promise<PushState> {
  if (!VAPID || !('serviceWorker' in navigator)) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (!('PushManager' in window) || !('Notification' in window)) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Must be called from a tap (browsers only allow the permission prompt from a user gesture). */
export async function enablePush(): Promise<PushState> {
  if (!VAPID) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) as BufferSource }))
  const c = await getClient()
  const { data } = (await c?.auth.getSession()) ?? { data: { session: null } }
  const userId = data.session?.user.id
  if (!c || !userId) throw new Error('Sign in first')
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await c.from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: userId, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) })
  if (error) throw new Error(error.message)
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    const c = await getClient()
    await c?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  return 'off'
}
