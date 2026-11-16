import { useEffect, useState } from 'react'
import { disablePush, enablePush, pushState, type PushState } from '../data/push'
import { Icon } from './Icon'

export function usePushState() {
  const [state, setState] = useState<PushState | null>(null)
  useEffect(() => {
    void pushState().then(setState)
  }, [])
  return [state, setState] as const
}

const HELP: Record<Exclude<PushState, 'on' | 'off'>, string> = {
  unsupported: "This browser can't show notifications.",
  'needs-install': 'On iPhone, notifications work once Kinetra is on your Home Screen. Add it, open it from there, then turn this on.',
  denied: 'Notifications are blocked. Turn them on for Kinetra in your phone or browser settings, then come back.',
}

/** Settings row: on/off switch with plain-language help for every state. */
export function NotificationsRow({ notify }: { notify: (m: string) => void }) {
  const [state, setState] = usePushState()
  const [busy, setBusy] = useState(false)
  if (state === null) return null
  const on = state === 'on'
  const toggle = async () => {
    setBusy(true)
    try {
      const next = on ? await disablePush() : await enablePush()
      setState(next)
      if (next === 'on') notify("Notifications on — you'll hear when friends cheer you on")
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't change notifications")
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="group-header">Notifications</div>
      <div className="card">
        <div className="cell">
          <span className="cell-icon" style={{ background: '#ff3b30' }}><Icon name="bell" size={18} /></span>
          <span className="grow">Reactions, notes and friend requests</span>
          {state === 'on' || state === 'off' ? (
            <button className="switch" role="switch" aria-checked={on} aria-label="Notifications" disabled={busy} onClick={() => void toggle()} />
          ) : (
            <span className="tiny muted">Off</span>
          )}
        </div>
      </div>
      <p className="group-footer">{state === 'on' || state === 'off' ? 'Only for things friends send you. No marketing, ever.' : HELP[state]}</p>
    </>
  )
}

const PROMPT_KEY = 'push-prompt-dismissed'

/** One-time Feed prompt, shown once you have friends and notifications are available but off. */
export function NotificationsPrompt({ notify }: { notify: (m: string) => void }) {
  const [state, setState] = usePushState()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(PROMPT_KEY) === '1'
    } catch {
      return false
    }
  })
  if (hidden || state !== 'off') return null
  const dismiss = () => {
    try {
      localStorage.setItem(PROMPT_KEY, '1')
    } catch {
      /* ignore */
    }
    setHidden(true)
  }
  return (
    <div className="card card-pad feed-friends" style={{ position: 'relative' }}>
      <span className="cell-icon" style={{ background: '#ff3b30' }}><Icon name="bell" size={18} /></span>
      <div className="grow">
        <b>Know when friends cheer you on</b>
        <p className="small muted" style={{ marginTop: 3, lineHeight: 1.4 }}>Get a notification for reactions, notes and friend requests.</p>
        <button
          className="btn sm tint"
          style={{ marginTop: 10 }}
          onClick={async () => {
            try {
              const s = await enablePush()
              setState(s)
              if (s === 'on') notify('Notifications on')
              dismiss()
            } catch (e) {
              notify(e instanceof Error ? e.message : "Couldn't turn on notifications")
            }
          }}
        >
          Turn on
        </button>
      </div>
      <button className="icon-btn" style={{ position: 'absolute', top: 6, right: 6, color: 'var(--text-3)' }} aria-label="Not now" onClick={dismiss}>
        <Icon name="x" size={18} />
      </button>
    </div>
  )
}
