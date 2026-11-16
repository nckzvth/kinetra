import type { Session } from '@supabase/supabase-js'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { getMeta } from '../data/db'
import { exportAll, importAll, resetAll, setWorkingWeight, updateProfile } from '../data/repo'
import { getSyncConfig, isCustomSyncConfig, pendingChanges, saveSyncConfig, sendLoginEmail, signInWithPassword, signOut, signUpWithPassword, verifyLoginCode } from '../data/sync'
import { EXERCISE_BY_ID, STARTING_WEIGHTS_LBS } from '../domain/catalog'
import { PHASES } from '../domain/program'
import type { ExerciseState, PhaseNumber, Profile } from '../domain/types'
import { fmtWeight } from './hooks'
import { Sheet } from './Sheet'

const ALL_PLATES = [45, 35, 25, 10, 5, 2.5, 1.25]

export function SettingsView({
  profile,
  states,
  session,
  syncing,
  onSync,
  notify,
}: {
  profile: Profile
  states: Record<string, ExerciseState>
  session: Session | null
  syncing: boolean
  onSync: () => void
  notify: (m: string) => void
}) {
  return (
    <>
      <h1 className="page-title" style={{ marginBottom: 4 }}>Settings</h1>
      <SyncPanel session={session} syncing={syncing} onSync={onSync} notify={notify} />
      <ProfilePanel profile={profile} />
      <WeightsPanel states={states} profile={profile} />
      <ProgramPanel profile={profile} />
      <DataPanel notify={notify} />
    </>
  )
}

function SyncPanel({ session, syncing, onSync, notify }: { session: Session | null; syncing: boolean; onSync: () => void; notify: (m: string) => void }) {
  const [cfg, setCfg] = useState(getSyncConfig)
  const [url, setUrl] = useState(cfg?.url ?? '')
  const [key, setKey] = useState(cfg?.anonKey ?? '')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [password, setPassword] = useState('')
  const [confirmSent, setConfirmSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useLiveQuery(() => pendingChanges(), [], 0)
  const lastSync = useLiveQuery(() => getMeta<string>('last_sync_at'), [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="section-title"><h2>Cloud sync</h2></div>
      <div className="card card-pad">
        {!cfg ? (
          <div className="stack" style={{ gap: 12 }}>
            <p className="small muted">
              Everything is saved on this device and works offline. Connect a free Supabase project to back up and sync between your phone and
              computer. Setup steps are in <code>SETUP.md</code>.
            </p>
            <div className="field">
              <label htmlFor="sb-url">Project URL</label>
              <input id="sb-url" className="input" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value.trim())} />
            </div>
            <div className="field">
              <label htmlFor="sb-key">Publishable (anon) key</label>
              <input id="sb-key" className="input" placeholder="sb_publishable_… or eyJ…" value={key} onChange={(e) => setKey(e.target.value.trim())} />
            </div>
            <button
              className="btn ink"
              disabled={!url.startsWith('https://') || key.length < 20}
              onClick={() => {
                saveSyncConfig({ url, anonKey: key })
                setCfg(getSyncConfig())
              }}
            >
              Connect
            </button>
          </div>
        ) : !session ? (
          <div className="stack" style={{ gap: 12 }}>
            <p className="small muted">Sign in to back up your training and sync it between your phone and computer.</p>
            <div className="seg" role="group" style={{ alignSelf: 'flex-start' }}>
              <button aria-pressed={mode === 'password'} onClick={() => setMode('password')}>Password</button>
              <button aria-pressed={mode === 'link'} onClick={() => setMode('link')}>Email link</button>
            </div>
            <div className="field">
              <label htmlFor="sb-email">Email</label>
              <input id="sb-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
            </div>
            {mode === 'password' ? (
              <>
                <div className="field">
                  <label htmlFor="sb-pass">Password</label>
                  <input id="sb-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="row">
                  <button className="btn ink grow" disabled={busy || !email.includes('@') || password.length < 6} onClick={() => run(() => signInWithPassword(email, password))}>
                    Sign in
                  </button>
                  <button
                    className="btn grow"
                    disabled={busy || !email.includes('@') || password.length < 8}
                    onClick={() => run(async () => { if (await signUpWithPassword(email, password)) setConfirmSent(true) })}
                  >
                    Create account
                  </button>
                </div>
                {confirmSent ? (
                  <p className="small" style={{ color: 'var(--accent-text)' }}>Check your inbox and tap the confirmation link (any browser works), then come back here and sign in.</p>
                ) : (
                  <p className="tiny faint">New here? Use at least 8 characters, tap Create account, confirm the email once, then sign in on each device.</p>
                )}
              </>
            ) : (
              <>
                <button className="btn ink" disabled={busy || !email.includes('@')} onClick={() => run(async () => { await sendLoginEmail(email); setSent(true) })}>
                  {sent ? 'Resend sign-in email' : 'Send sign-in email'}
                </button>
                {sent && (
                  <>
                    <p className="small muted">Open the link on this device. If your email shows a 6-digit code instead, enter it here.</p>
                    <div className="row">
                      <input className="input num" inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} />
                      <button className="btn" disabled={busy || code.length < 6} onClick={() => run(() => verifyLoginCode(email, code))}>Verify</button>
                    </div>
                  </>
                )}
              </>
            )}
            {isCustomSyncConfig() && (
              <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { saveSyncConfig(null); setCfg(getSyncConfig()) }}>
                Disconnect project
              </button>
            )}
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <div className="spread">
              <div>
                <div style={{ fontWeight: 600 }}>{session.user.email}</div>
                <div className="small muted">
                  {lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : 'Not synced yet'} · {pending} pending
                </div>
              </div>
              <button className="btn sm" disabled={syncing} onClick={onSync}>{syncing ? 'Syncing…' : 'Sync now'}</button>
            </div>
            <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => run(signOut)}>Sign out</button>
          </div>
        )}
      </div>
    </>
  )
}

export function NumField({ value, onCommit, step = 5, width = 96 }: { value: number; onCommit: (v: number) => void; step?: number; width?: number }) {
  const [v, setV] = useState(String(value))
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) {
      last.current = value
      setV(String(value))
    }
  }, [value])
  return (
    <input
      className="input num"
      style={{ width }}
      inputMode="decimal"
      step={step}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v)
        if (Number.isFinite(n) && n >= 0 && n !== value) {
          last.current = n
          onCommit(n)
        } else setV(String(value))
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function ProfilePanel({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.display_name)
  return (
    <>
      <div className="section-title"><h2>Profile & equipment</h2></div>
      <div className="card list">
        <div className="setting-row">
          <span className="grow">Name</span>
          <input className="input" style={{ width: 180 }} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== profile.display_name && updateProfile({ display_name: name.trim() })} />
        </div>
        <div className="setting-row">
          <span className="grow">Barbell weight <span className="faint small">lb</span></span>
          <NumField value={profile.barbell_weight_lbs} onCommit={(v) => updateProfile({ barbell_weight_lbs: v })} />
        </div>
        <div className="setting-row" style={{ flexWrap: 'wrap' }}>
          <span className="grow">Plates per side</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {ALL_PLATES.map((p) => {
              const on = profile.plates_lbs.includes(p)
              return (
                <button
                  key={p}
                  className={`chip${on ? ' accent' : ''}`}
                  style={{ height: 30, padding: '0 10px', fontSize: 13 }}
                  aria-pressed={on}
                  onClick={() => updateProfile({ plates_lbs: (on ? profile.plates_lbs.filter((x) => x !== p) : [...profile.plates_lbs, p]).sort((a, b) => b - a) })}
                >
                  {fmtWeight(p)}
                </button>
              )
            })}
          </div>
        </div>
        <div className="setting-row">
          <span className="grow">Dumbbell step <span className="faint small">lb per hand</span></span>
          <div className="seg">
            {[2.5, 5].map((s) => (
              <button key={s} aria-pressed={profile.dumbbell_step_lbs === s} onClick={() => updateProfile({ dumbbell_step_lbs: s })}>{fmtWeight(s)}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function WeightsPanel({ states, profile }: { states: Record<string, ExerciseState>; profile: Profile }) {
  void profile
  return (
    <>
      <div className="section-title">
        <h2>Working weights</h2>
        <span className="tiny faint">Used for the next exposure</span>
      </div>
      <div className="card list">
        {Object.keys(STARTING_WEIGHTS_LBS).map((id) => {
          const ex = EXERCISE_BY_ID[id]
          const s = states[id]
          return (
            <div key={id} className="setting-row">
              <div className="grow">
                <div>{ex.name}</div>
                {s?.consecutive_failures ? <div className="tiny" style={{ color: 'var(--warn-text)' }}>{s.consecutive_failures} miss in a row</div> : null}
              </div>
              <span className="tiny faint">{ex.per_hand ? 'lb/hand' : 'lb'}</span>
              <NumField value={s?.current_working_weight_lbs ?? STARTING_WEIGHTS_LBS[id]} onCommit={(v) => setWorkingWeight(id, v)} />
            </div>
          )
        })}
      </div>
    </>
  )
}

function ProgramPanel({ profile }: { profile: Profile }) {
  const req = PHASES[profile.current_phase].gate_required
  return (
    <>
      <div className="section-title">
        <h2>Program position</h2>
        <span className="tiny faint">Manual override</span>
      </div>
      <div className="card list">
        <div className="setting-row">
          <span className="grow">Current phase</span>
          <div className="seg">
            {([1, 2, 3, 4] as PhaseNumber[]).map((p) => (
              <button key={p} aria-pressed={profile.current_phase === p} onClick={() => updateProfile({ current_phase: p, phase_gate_progress: 0 })}>{p}</button>
            ))}
          </div>
        </div>
        {req !== null && (
          <div className="setting-row">
            <span className="grow">Gate progress <span className="faint small">of {req}</span></span>
            <NumField value={profile.phase_gate_progress} step={1} width={72} onCommit={(v) => updateProfile({ phase_gate_progress: Math.min(req - 1, Math.round(v)) })} />
          </div>
        )}
        <div className="setting-row">
          <span className="grow">Next workout</span>
          <select className="input" style={{ width: 120 }} value={profile.next_rotation_index} onChange={(e) => updateProfile({ next_rotation_index: Number(e.target.value) })}>
            {['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B'].map((l, i) => (
              <option key={l} value={i}>{l}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  )
}

function DataPanel({ notify }: { notify: (m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  return (
    <>
      <div className="section-title"><h2>Data</h2></div>
      <div className="card card-pad row" style={{ flexWrap: 'wrap' }}>
        <button
          className="btn sm"
          onClick={async () => {
            const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `ppl-backup-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(a.href)
          }}
        >
          Export backup
        </button>
        <button className="btn sm" onClick={() => fileRef.current?.click()}>Import backup</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              await importAll(JSON.parse(await f.text()))
              notify('Backup restored')
            } catch {
              notify('That file is not a valid backup')
            }
            e.target.value = ''
          }}
        />
        <button className="btn sm danger" style={{ marginLeft: 'auto' }} onClick={() => setConfirmReset(true)}>Reset to Day 0</button>
      </div>
      {confirmReset && (
        <Sheet title="Reset everything on this device?" onClose={() => setConfirmReset(false)}>
          <p className="muted">All workouts, weights and gate progress on this device go back to the Day-0 seed. Export a backup first if you might want it. Your Supabase copy is not deleted — if you're signed in, the next sync restores it.</p>
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn grow" onClick={() => setConfirmReset(false)}>Cancel</button>
            <button
              className="btn grow"
              style={{ background: 'var(--danger)', color: '#fff', borderColor: 'transparent' }}
              onClick={async () => {
                await resetAll()
                setConfirmReset(false)
                notify('Reset to Day 0')
              }}
            >
              Reset
            </button>
          </div>
        </Sheet>
      )}
      <p className="tiny faint" style={{ marginTop: 16, textAlign: 'center' }}>PPL Ramp · {PHASES[4].name.replace(/^Phase 4: /, '')} gated ramp-up</p>
    </>
  )
}
