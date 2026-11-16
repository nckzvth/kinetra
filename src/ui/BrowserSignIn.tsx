import type { Session } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import {
  approveHandoff,
  cancelBrowserSignIn,
  claimBrowserSignIn,
  clearPendingHandoff,
  consumeHandoffParam,
  currentBrowserSignIn,
  HANDOFF_BROWSERS,
  openBrowserForHandoff,
  startBrowserSignIn,
  type ApproveResult,
  type HandoffBrowser,
  type PendingBrowserSignIn,
} from '../data/sync'
import { SignInForm } from './Account'
import { BrandMark } from './BrandMark'
import { Icon } from './Icon'
import { canUseBrowserHandoff } from './install'
import { Sheet } from './Sheet'

const nameOf = (b: HandoffBrowser) => HANDOFF_BROWSERS.find((x) => x.id === b)?.name ?? 'your browser'

// ─── Home-screen app side ──────────────────────────────────────────────────

/**
 * "Continue with Safari" (plus "Use another browser"). Only rendered inside the iPhone/iPad
 * home-screen app on iOS 17+, where the in-app sign-in can't see the browser's saved accounts.
 */
export function BrowserSignInButton({ notify }: { notify: (m: string) => void }) {
  const [pending, setPending] = useState<PendingBrowserSignIn | null>(currentBrowserSignIn)
  const [starting, setStarting] = useState<HandoffBrowser | null>(null)
  const [choosing, setChoosing] = useState(false)
  if (!canUseBrowserHandoff()) return null

  const start = async (browser: HandoffBrowser) => {
    setChoosing(false)
    setStarting(browser)
    try {
      const id = await startBrowserSignIn(browser)
      setPending({ id, browser, at: Date.now() })
    } catch {
      notify("Couldn't start sign-in. Check your connection and try again.")
    } finally {
      setStarting(null)
    }
  }

  return (
    <>
      <button className="btn tint lg block" disabled={starting !== null} onClick={() => void start('safari')}>
        <Icon name="compass" size={20} /> {starting === 'safari' ? 'Opening Safari…' : 'Continue with Safari'}
      </button>
      <p className="tiny muted" style={{ textAlign: 'center', margin: '-2px 12px 0', lineHeight: 1.45 }}>
        Uses the account already signed in on Safari. No passwords to type.{' '}
        <button className="link" style={{ fontSize: 'inherit' }} onClick={() => setChoosing(true)}>Use another browser</button>
      </p>

      {choosing && (
        <Sheet title="Choose a browser" onClose={() => setChoosing(false)} right={<button className="btn ghost" onClick={() => setChoosing(false)}>Cancel</button>}>
          <div className="card list">
            {HANDOFF_BROWSERS.filter((b) => b.id !== 'safari').map((b) => (
              <button key={b.id} className="cell" onClick={() => void start(b.id)}>
                <span className="cell-icon" style={{ background: 'var(--surface-3)', color: 'var(--text)' }}><Icon name="compass" size={18} /></span>
                <span className="grow">{b.name}</span>
                <Icon name="chevronRight" className="chev" />
              </button>
            ))}
          </div>
          <p className="group-footer">Pick the browser where you're signed in to Google. It needs to be installed on this iPhone.</p>
        </Sheet>
      )}

      {pending && (
        <WaitingSheet
          pending={pending}
          onCancel={() => {
            cancelBrowserSignIn()
            setPending(null)
          }}
          onDone={() => {
            setPending(null)
            notify('Signed in')
          }}
          onError={() => {
            cancelBrowserSignIn()
            setPending(null)
            notify("That sign-in didn't complete. Please try again.")
          }}
        />
      )}
    </>
  )
}

function WaitingSheet({
  pending,
  onCancel,
  onDone,
  onError,
}: {
  pending: PendingBrowserSignIn
  onCancel: () => void
  onDone: () => void
  onError: () => void
}) {
  const busy = useRef(false)
  const name = nameOf(pending.browser)
  useEffect(() => {
    let stopped = false
    const check = async () => {
      if (busy.current || stopped || document.visibilityState !== 'visible') return
      busy.current = true
      try {
        if (await claimBrowserSignIn(pending.id)) onDone()
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
  }, [pending.id, onDone, onError])

  return (
    <Sheet onClose={onCancel}>
      <div style={{ padding: '4px 4px 0' }}>
        <h3 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center' }}>Finish in {name}</h3>
        <ol className="handoff-steps">
          <li><span className="n">1</span><span>In {name}, tap <b>Allow</b>.</span></li>
          <li><span className="n">2</span><span>Come back to Kinetra. You'll be signed in automatically.</span></li>
        </ol>
        <div className="row" style={{ justifyContent: 'center', gap: 10, margin: '6px 0 20px' }}>
          <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} aria-hidden="true" />
          <span className="small muted">Waiting for you to allow…</span>
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <button className="btn block" style={{ background: 'var(--surface)' }} onClick={() => openBrowserForHandoff(pending.id, pending.browser)}>
          Open {name} again
        </button>
        <button className="btn ghost block" onClick={onCancel}>Cancel</button>
      </div>
    </Sheet>
  )
}

// ─── Browser side ──────────────────────────────────────────────────────────

/**
 * When the browser was opened by the home-screen app (?handoff=…), ask the signed-in user
 * to allow it. If nobody is signed in here yet, sign in first; the request survives the redirect.
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
        <div style={{ textAlign: 'center', padding: '10px 8px 4px' }}>
          <span className="success-badge" aria-hidden="true"><Icon name="check" size={32} /></span>
          <h3 style={{ fontSize: 22, fontWeight: 700, marginTop: 14 }}>You're all set</h3>
          <p className="muted" style={{ margin: '8px 0 22px', lineHeight: 1.45 }}>
            Go back to Kinetra on your Home Screen. It's signing you in now.
          </p>
        </div>
        <button className="btn block" style={{ background: 'var(--surface)' }} onClick={close}>Done</button>
        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 12 }}>You can close this tab.</p>
      </Sheet>
    )

  if (result && !result.ok)
    return (
      <Sheet title="Couldn't connect the app" onClose={close}>
        <p className="muted" style={{ textAlign: 'center', margin: '0 8px 18px', lineHeight: 1.45 }}>
          {result.reason === 'expired'
            ? 'This request has expired. Go back to Kinetra and tap Continue with Safari again.'
            : result.reason === 'used'
              ? 'This request was already used. If Kinetra still isn’t signed in, start again from the app.'
              : 'Something went wrong. Go back to Kinetra and try again.'}
        </p>
        <button className="btn block" style={{ background: 'var(--surface)' }} onClick={close}>OK</button>
      </Sheet>
    )

  if (!session)
    return (
      <Sheet title="Connect the app" onClose={close} right={<button className="btn ghost" onClick={close}>Cancel</button>}>
        <p className="small muted" style={{ margin: '0 4px 16px', lineHeight: 1.45 }}>
          Kinetra on your Home Screen wants to sign in. Sign in here first, then you'll be asked to allow it.
        </p>
        <SignInForm notify={notify} />
      </Sheet>
    )

  const meta = (session.user.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string }
  const avatar = meta.avatar_url ?? meta.picture ?? null
  const fullName = meta.full_name ?? meta.name ?? ''
  return (
    <Sheet onClose={close}>
      <div style={{ textAlign: 'center', padding: '10px 4px 0' }}>
        <span style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><BrandMark size={64} /></span>
        <h3 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>Sign in to Kinetra on your Home Screen?</h3>
        <div className="account-chip">
          {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="avatar-fallback">{(fullName || session.user.email || '?').slice(0, 1).toUpperCase()}</span>}
          <span style={{ textAlign: 'left' }}>
            {fullName && <span style={{ display: 'block', fontWeight: 600 }}>{fullName}</span>}
            <span className="small muted">{session.user.email}</span>
          </span>
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <button
          className="btn tint lg block"
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
      <p className="tiny muted" style={{ marginTop: 10, textAlign: 'center', lineHeight: 1.45 }}>
        <Icon name="shield" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
        Only allow if you just asked from the Kinetra app. Works once and expires in 10 minutes.
      </p>
    </Sheet>
  )
}
