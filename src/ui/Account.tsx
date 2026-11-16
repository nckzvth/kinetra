import type { Session } from '@supabase/supabase-js'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getMeta } from '../data/db'
import { pendingChanges, sendLoginEmail, signInWithPassword, signOut, signUpWithPassword } from '../data/sync'

/** Email + password sign-in (with an email-link fallback). Used in onboarding and You → Account. */
export function SignInForm({ notify, onDone }: { notify: (m: string) => void; onDone?: () => void }) {
  const [mode, setMode] = useState<'signin' | 'create'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setMessage(/invalid login/i.test(m) ? "That email and password don't match." : m)
    } finally {
      setBusy(false)
    }
  }

  const valid = email.includes('@') && password.length >= (mode === 'create' ? 8 : 6)
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="seg block">
        <button aria-pressed={mode === 'signin'} onClick={() => setMode('signin')}>Sign in</button>
        <button aria-pressed={mode === 'create'} onClick={() => setMode('create')}>Create account</button>
      </div>
      <div className="card">
        <input className="input" style={{ borderRadius: 0, background: 'transparent' }} type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
        <div style={{ height: 0.5, background: 'var(--line-strong)', marginLeft: 14 }} />
        <input
          className="input"
          style={{ borderRadius: 0, background: 'transparent' }}
          type="password"
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          placeholder={mode === 'create' ? 'Password (8+ characters)' : 'Password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && valid && document.getElementById('signin-go')?.click()}
        />
      </div>
      {message && <p className="small" style={{ color: 'var(--danger)', marginLeft: 4 }}>{message}</p>}
      <button
        id="signin-go"
        className="btn tint block"
        disabled={busy || !valid}
        onClick={() =>
          run(async () => {
            if (mode === 'signin') {
              await signInWithPassword(email, password)
              onDone?.()
            } else if (await signUpWithPassword(email, password)) {
              setMessage(null)
              notify('Check your email to confirm, then sign in')
              setMode('signin')
            } else onDone?.()
          })
        }
      >
        {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>
      {mode === 'signin' && (
        <button
          className="btn ghost sm"
          style={{ alignSelf: 'center' }}
          disabled={busy || !email.includes('@')}
          onClick={() => run(async () => { await sendLoginEmail(email); notify('Sign-in link sent') })}
        >
          Email me a sign-in link instead
        </button>
      )}
    </div>
  )
}

export function AccountStatus({ session, syncing, onSync }: { session: Session; syncing: boolean; onSync: () => void }) {
  const pending = useLiveQuery(() => pendingChanges(), [], 0)
  const lastSync = useLiveQuery(() => getMeta<string>('last_sync_at'), [])
  return (
    <div className="card list">
      <div className="cell">
        <div className="grow">
          <div style={{ fontWeight: 600 }}>{session.user.email}</div>
          <div className="tiny muted">
            {syncing ? 'Syncing…' : lastSync ? `Synced ${relTime(lastSync)}` : 'Not synced yet'}
            {pending ? ` · ${pending} change${pending === 1 ? '' : 's'} waiting` : ''}
          </div>
        </div>
        <button className="btn sm" disabled={syncing} onClick={onSync}>Sync now</button>
      </div>
      <button className="cell" style={{ color: 'var(--danger)' }} onClick={() => void signOut()}>Sign out</button>
    </div>
  )
}

function relTime(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}
