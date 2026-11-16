import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { ensureSeeded } from './data/repo'
import { consumeAuthError, describeAuthError, enabledProviders, getClient, isSyncConfigured, signInWithProvider, syncNow } from './data/sync'
import { Sheet } from './ui/Sheet'
import { registerCustomExercises } from './domain/catalog'
import { rulesFor } from './domain/units'
import { ActivityView } from './ui/Activity'
import { useActive, useCompletedSessions, useCustomExercises, useProfile, useProgram, useStates } from './ui/data'
import { useMediaQuery } from './ui/hooks'
import { Icon, type IconName } from './ui/Icon'
import { Onboarding } from './ui/Onboarding'
import { TimerDock } from './ui/TimerDock'
import { TodayView } from './ui/Today'
import { InstallBanner } from './ui/InstallBanner'
import { HistoryView, ProgressView, SessionResultView, useToast } from './ui/Views'
import { ActiveWorkoutView } from './ui/Workout'
import { YouView } from './ui/You'

type View = 'today' | 'history' | 'log' | 'progress' | 'you'

const NAV: { view: View; label: string; icon: IconName }[] = [
  { view: 'today', label: 'Today', icon: 'barbell' },
  { view: 'history', label: 'History', icon: 'history' },
  { view: 'log', label: 'Log', icon: 'plus' },
  { view: 'progress', label: 'Progress', icon: 'chart' },
  { view: 'you', label: 'You', icon: 'user' },
]

function useSync(notify: (m: string) => void) {
  const [session, setSession] = useState<Session | null>(null)
  const [syncing, setSyncing] = useState(false)

  const run = useCallback(
    async (quiet = false) => {
      if (!isSyncConfigured()) return
      setSyncing(true)
      try {
        const r = await syncNow()
        if (!quiet) notify(r.pushed || r.pulled ? 'Synced' : 'Up to date')
      } catch (e) {
        if (!quiet) notify(e instanceof Error ? e.message : "Couldn't sync")
      } finally {
        setSyncing(false)
      }
    },
    [notify],
  )

  useEffect(() => {
    const pending = getClient()
    if (!pending) return
    let unsub: (() => void) | null = null
    let cancelled = false
    void pending.then((c) => {
      if (cancelled) return
      void c.auth.getSession().then(({ data }) => setSession(data.session))
      const { data } = c.auth.onAuthStateChange((evt, s) => {
        setSession(s)
        if (evt === 'SIGNED_IN') setTimeout(() => void run(true), 0)
      })
      unsub = () => data.subscription.unsubscribe()
    })
    const onOnline = () => void run(true)
    const onVisible = () => document.visibilityState === 'visible' && void run(true)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      unsub?.()
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [run])

  // True from the moment a session appears until its first sync finishes, so a fresh sign-in
  // shows "restoring" instead of flashing setup before the cloud data has arrived.
  const [restoring, setRestoring] = useState(false)
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    setRestoring(true)
    void run(true).finally(() => setRestoring(false))
  }, [userId, run])

  return { session, syncing, restoring, sync: run }
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>('today')
  const [summaryId, setSummaryId] = useState<string | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const wide = useMediaQuery('(min-width: 900px)')
  const { toast, show } = useToast()
  const { session, syncing, restoring, sync } = useSync(show)
  // A sign-in that failed on the way back from Google lands here with ?error=… in the URL.
  const [authError, setAuthError] = useState(consumeAuthError)
  const [googleOn, setGoogleOn] = useState(false)
  const [retrying, setRetrying] = useState(false)
  useEffect(() => {
    if (authError) void enabledProviders().then((p) => setGoogleOn(p.includes('google')))
  }, [authError])
  const authSheet =
    authError && !session ? (
      <Sheet title="Sign-in didn't finish" onClose={() => setAuthError(null)}>
        <p className="muted" style={{ textAlign: 'center', margin: '0 8px 18px', lineHeight: 1.45 }}>{describeAuthError(authError)}</p>
        <div className="stack" style={{ gap: 8 }}>
          {googleOn && (
            <button
              className="btn tint block"
              disabled={retrying}
              onClick={() => {
                setRetrying(true)
                void signInWithProvider('google').catch(() => setRetrying(false))
              }}
            >
              {retrying ? 'Opening Google…' : 'Try again with Google'}
            </button>
          )}
          <button className="btn block" style={{ background: 'var(--surface)' }} onClick={() => setAuthError(null)}>Not now</button>
        </div>
      </Sheet>
    ) : null

  useEffect(() => {
    void ensureSeeded().then(() => setReady(true))
  }, [])

  const profile = useProfile()
  const states = useStates()
  const active = useActive()
  const sessions = useCompletedSessions()
  const program = useProgram(profile?.active_program_id)
  const custom = useCustomExercises()
  useEffect(() => {
    if (custom) registerCustomExercises(custom.map((c) => c.definition))
  }, [custom])
  const clearOpenDay = useCallback(() => setOpenDay(null), [])
  // Back up right after setup finishes so a second device can restore it immediately.
  const onboarded = profile?.onboarded
  useEffect(() => {
    if (session && onboarded) void sync(true)
  }, [session, onboarded, sync])

  if (!ready || !profile || !states || active === undefined || !sessions || program === undefined) return null

  if (!profile.onboarded && !active) {
    return (
      <>
        <Onboarding notify={show} session={session} restoring={restoring} />
        {authSheet}
        {toast}
      </>
    )
  }

  const unit = rulesFor(profile.unit_system).label
  const summary = summaryId ? sessions.find((s) => s.id === summaryId) : undefined

  const go = (v: View) => {
    setView(v)
    if (v !== 'history') setHistoryId(null)
    document.querySelector('.stage-scroll')?.scrollTo({ top: 0 })
  }

  const content = (() => {
    switch (view) {
      case 'today':
        if (summary)
          return (
            <SessionResultView
              session={summary}
              program={program}
              unit={unit}
              onDone={() => setSummaryId(null)}
              onFinisher={() => {
                setSummaryId(null)
                go('log')
              }}
            />
          )
        if (active)
          return (
            <ActiveWorkoutView
              active={active}
              profile={profile}
              program={program}
              onFinished={(id) => {
                setSummaryId(id)
                if (session) void sync(true)
              }}
            />
          )
        return (
          <>
          <InstallBanner />
          <TodayView
            profile={profile}
            states={states}
            program={program}
            sessions={sessions}
            onEditDay={(id) => {
              setOpenDay(id)
              go('you')
            }}
            onLogActivity={() => go('log')}
          />
          </>
        )
      case 'history':
        return <HistoryView sessions={sessions} selected={historyId} onSelect={setHistoryId} program={program} unit={unit} />
      case 'log':
        return (
          <ActivityView
            onSaved={(id) => {
              setView('history')
              setHistoryId(id)
              if (session) void sync(true)
            }}
          />
        )
      case 'progress':
        return <ProgressView profile={profile} states={states} program={program} />
      case 'you':
        return (
          <YouView
            profile={profile}
            states={states}
            program={program}
            session={session}
            syncing={syncing}
            onSync={() => void sync()}
            notify={show}
            openDay={openDay}
            onOpenedDay={clearOpenDay}
          />
        )
    }
  })()

  const stage = (
    <main className="stage">
      <div className="stage-scroll">
        <div className={`stage-inner${(view === 'today' && (active || summary)) || view === 'log' ? ' narrow' : ''}`}>{content}</div>
      </div>
      <TimerDock />
    </main>
  )

  if (!wide) {
    return (
      <div className="mobile">
        {stage}
        <nav className="tabbar" aria-label="Main">
          {NAV.map((n) => (
            <button key={n.view} className="tab" aria-current={view === n.view ? 'page' : undefined} onClick={() => go(n.view)}>
              <Icon name={n.icon} size={24} />
              {n.view === 'today' && active ? 'Workout' : n.label}
            </button>
          ))}
        </nav>
        {authSheet}
        {toast}
      </div>
    )
  }

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="brand">
          <span className="brand-mark"><Icon name="barbell" size={17} /></span>
          Kinetra
        </div>
        {NAV.map((n) => (
          <button key={n.view} className="rail-item" aria-current={view === n.view ? 'page' : undefined} onClick={() => go(n.view)}>
            <Icon name={n.icon} />
            {n.view === 'today' && active ? 'Workout' : n.view === 'log' ? 'Log activity' : n.label}
          </button>
        ))}
        <div className="rail-foot row">
          <Icon name={session ? 'cloud' : 'cloudOff'} size={16} />
          {session ? (syncing ? 'Syncing…' : 'Backed up') : 'On this device only'}
        </div>
      </nav>
      {stage}
      {authSheet}
      {toast}
    </div>
  )
}
