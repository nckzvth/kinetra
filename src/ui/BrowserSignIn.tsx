import type { Session } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import {
  approveHandoff,
  cancelBrowserSignIn,
  claimBrowserSignIn,
  clearPendingHandoff,
  consumeHandoffParam,
  currentBrowserSignIn,
  openBrowserForHandoff,
  startBrowserSignIn,
  type ApproveResult,
} from '../data/sync'
import { SignInForm } from './Account'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

// ─── Home-screen app side ──────────────────────────────────────────────────

/** "Sign in with your browser" button plus the waiting sheet. Shown only in the installed app. */
export function BrowserSignInButton({ notify, className = 'btn tint lg block' }: { notify: (m: string) => void; className?: string }) {
  const [id, setId] = useState<string | null>(currentBrowserSignIn)
  const [starting, setStarting] = useState(false)

  const start = async () => {
    setStarting(true)
    try {
      setId(await startBrowserSignIn())
    } catch {
      notify("Couldn't start sign-in. Check your connection and try again.")
    } finally {
      setStarting(false)
    }
  }

  return (
    <>
      <button className={className} disabled={starting} onClick={() => void start()}>
        <Icon name="external" size={18} /> {starting ? 'Opening your browser…' : 'Sign in with your browser'}
      </button>
      {id && (
        <WaitingSheet
          id={id}
          onCancel={() => {
            cancelBrowserSignIn()
            setId(null)
          }}
          onDone={() => {
            setId(null)
            notify('Signed in')
          }}
          onError={() => {
            cancelBrowserSignIn()
            setId(null)
            notify("That sign-in didn't complete. Please try again.")
          }}
        />
      )}
    </>
  )
}

function WaitingSheet({ id, onCancel, onDone, onError }: { id: string; onCancel: () => void; onDone: () => void; onError: () => void }) {
  const busy = useRef(false)
  useEffect(() => {
    let stopped = false
    const check = async () => {
      if (busy.current || stopped || document.visibilityState !== 'visible') return
      busy.current = true
      try {
        if (await claimBrowserSignIn(id)) onDone()
      } catch {
        onError()
      } finally {
        busy.current = false
      }
    }
    void check()
    const t = setInterval(() => void check(), 2000)
    const onVis = () => void check()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stopped = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [id, onDone, onError])

  return (
    <Sheet onClose={onCancel}>
      <div style={{ textAlign: 'center', padding: '8px 8px 4px' }}>
        <div className="spinner" style={{ margin: '6px auto 16px' }} aria-hidden="true" />
        <h3 style={{ fontSize: 20, fontWeight: 700 }}>Finish in your browser</h3>
        <p className="muted" style={{ margin: '8px 0 20px', lineHeight: 1.45 }}>
          Tap <b>Allow</b> in the browser that just opened, then come back here. You'll be signed in automatically.
        </p>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <button className="btn block" style={{ background: 'var(--surface)' }} onClick={() => openBrowserForHandoff(id)}>Open browser again</button>
        <button className="btn ghost block" onClick={onCancel}>Cancel</button>
      </div>
    </Sheet>
  )
}

// ─── Browser side ──────────────────────────────────────────────────────────

/**
 * When the browser was opened by the installed app (?handoff=…), ask the signed-in user to
 * allow it. If nobody is signed in here yet, sign in first; the request survives the redirect.
 */
export function HandoffApprover({ session, notify }: { session: Session | null; notify: (m: string) => void }) {
  const [id, setId] = useState<string | null>(consumeHandoffParam)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ApproveResult | null>(null)
  if (!id) return null

  const close = () => {
    clearPendingHandoff()
    setId(null)
  }

  if (result?.ok)
    return (
      <Sheet onClose={close}>
        <div style={{ textAlign: 'center', padding: '8px 8px 4px' }}>
          <span className="app-glyph" style={{ width: 56, height: 56, borderRadius: 14, margin: '4px auto 14px' }}><Icon name="check" size={30} /></span>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>You're all set</h3>
          <p className="muted" style={{ margin: '8px 0 20px', lineHeight: 1.45 }}>Switch back to Kinetra on your Home Screen. It's signing you in now. You can close this tab.</p>
        </div>
        <button className="btn block" style={{ background: 'var(--surface)' }} onClick={close}>Done</button>
      </Sheet>
    )

  if (result && !result.ok)
    return (
      <Sheet title="Couldn't connect the app" onClose={close}>
        <p className="muted" style={{ textAlign: 'center', margin: '0 8px 18px', lineHeight: 1.45 }}>
          {result.reason === 'expired'
            ? 'This request has expired. Go back to the Kinetra app and tap "Sign in with your browser" again.'
            : result.reason === 'used'
              ? 'This request was already used. If the app still isn’t signed in, start again from the app.'
              : 'Something went wrong. Go back to the Kinetra app and try again.'}
        </p>
        <button className="btn block" style={{ background: 'var(--surface)' }} onClick={close}>OK</button>
      </Sheet>
    )

  if (!session)
    return (
      <Sheet title="Connect the app" onClose={close} right={<button className="btn ghost" onClick={close}>Cancel</button>}>
        <p className="small muted" style={{ margin: '0 4px 14px', lineHeight: 1.45 }}>
          The Kinetra app on your Home Screen wants to sign in. Sign in here first, then allow it.
        </p>
        <SignInForm notify={notify} />
      </Sheet>
    )

  return (
    <Sheet onClose={close}>
      <div style={{ textAlign: 'center', padding: '8px 8px 4px' }}>
        <span className="app-glyph" style={{ width: 56, height: 56, borderRadius: 14, margin: '4px auto 14px' }}><Icon name="barbell" size={30} /></span>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}>Sign in to the Kinetra app?</h3>
        <p className="muted" style={{ margin: '8px 0 20px', lineHeight: 1.45 }}>
          The app on your Home Screen will use the account you're signed into here:<br />
          <b style={{ color: 'var(--text)' }}>{session.user.email}</b>
        </p>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <button
          className="btn tint block"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setResult(await approveHandoff(id))
            setBusy(false)
          }}
        >
          {busy ? 'Allowing…' : 'Allow'}
        </button>
        <button className="btn ghost block" onClick={close}>Don't allow</button>
      </div>
    </Sheet>
  )
}
