import type { Session } from '@supabase/supabase-js'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { getMeta } from '../data/db'
import { enabledProviders, pendingChanges, sendLoginEmail, signInWithPassword, signInWithProvider, signOut, signUpWithPassword, type SocialProvider } from '../data/sync'

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
  const [providers, setProviders] = useState<SocialProvider[]>([])
  // Once we've left for the provider, keep the buttons locked so a second tap can't start a second sign-in.
  const [leavingFor, setLeavingFor] = useState<SocialProvider | null>(null)
  useEffect(() => {
    void enabledProviders().then(setProviders)
  }, [])
  return (
    <div className="stack" style={{ gap: 12 }}>
      {providers.length > 0 && (
        <>
          {providers.map((p) => (
            <button
              key={p}
              className={`btn block social social-${p}`}
              disabled={busy || leavingFor !== null}
              onClick={() => {
                setLeavingFor(p)
                void run(() => signInWithProvider(p)).finally(() => setTimeout(() => setLeavingFor(null), 8000))
              }}
            >
              <ProviderMark provider={p} /> {leavingFor === p ? `Opening ${PROVIDER_NAME[p]}…` : `Continue with ${PROVIDER_NAME[p]}`}
            </button>
          ))}
          <div className="or-divider"><span>or use email</span></div>
        </>
      )}
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

const PROVIDER_NAME: Record<SocialProvider, string> = { google: 'Google', apple: 'Apple', github: 'GitHub', discord: 'Discord', facebook: 'Facebook' }

/** Official-style marks for each provider's sign-in button. */
function ProviderMark({ provider }: { provider: SocialProvider }) {
  const size = { width: 20, height: 20, 'aria-hidden': true } as const
  switch (provider) {
    case 'google':
      return (
        <svg viewBox="0 0 48 48" {...size}>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
      )
    case 'apple':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...size}>
          <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.97.9-3.77 2.29-1.61 2.79-.41 6.92 1.16 9.18.77 1.11 1.68 2.35 2.88 2.31 1.16-.05 1.59-.75 2.99-.75 1.39 0 1.79.75 3.01.72 1.24-.02 2.03-1.13 2.79-2.24.88-1.29 1.24-2.53 1.26-2.6-.03-.01-2.42-.93-2.47-3.69zM14.09 5.84c.64-.77 1.07-1.85.95-2.92-.92.04-2.03.61-2.69 1.38-.59.68-1.11 1.77-.97 2.82 1.03.08 2.07-.52 2.71-1.28z" />
        </svg>
      )
    case 'github':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...size}>
          <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
        </svg>
      )
    case 'discord':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...size}>
          <path d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.8a13.7 13.7 0 0 0-.63 1.29 18.4 18.4 0 0 0-5.52 0A12.6 12.6 0 0 0 8.6 2.8a19.7 19.7 0 0 0-4.93 1.57C.55 9.05-.3 13.6.12 18.09a19.9 19.9 0 0 0 6.05 3.06c.49-.67.92-1.38 1.3-2.12a12.9 12.9 0 0 1-2.04-.98l.5-.39a14.2 14.2 0 0 0 12.14 0l.5.39c-.65.39-1.33.71-2.05.98.38.74.82 1.45 1.3 2.12a19.8 19.8 0 0 0 6.06-3.06c.5-5.2-.84-9.71-3.56-13.72zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.95-2.42 2.16-2.42 2.18 1.1 2.16 2.42c0 1.33-.95 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42s.95-2.42 2.16-2.42 2.18 1.1 2.16 2.42c0 1.33-.94 2.42-2.16 2.42z" />
        </svg>
      )
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...size}>
          <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
        </svg>
      )
  }
}
