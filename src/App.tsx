import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta } from './data/db'
import { ensureSeeded } from './data/repo'
import { getClient, isSyncConfigured, syncNow } from './data/sync'
import { useMediaQuery } from './ui/hooks'
import { Icon, type IconName } from './ui/Icon'
import { PhaseHeader } from './ui/PhaseHeader'
import { SettingsView } from './ui/Settings'
import { TimerDock } from './ui/TimerDock'
import { useActive, useCompletedSessions, useProfile, useStates } from './ui/data'
import { HistoryList, HistoryView, NutritionRoadmap, ProgressView, SessionResultView, useToast } from './ui/Views'
import { ActiveWorkoutView, SessionPreview, UpNextList } from './ui/Workout'
import { Welcome } from './ui/Welcome'
import { ActivityView } from './ui/Activity'

type View = 'today' | 'history' | 'progress' | 'activity' | 'nutrition' | 'settings'

const NAV: { view: View; label: string; short: string; icon: IconName; soon?: boolean }[] = [
  { view: 'today', label: 'Today', short: 'Today', icon: 'barbell' },
  { view: 'history', label: 'History', short: 'History', icon: 'history' },
  { view: 'progress', label: 'Progress', short: 'Progress', icon: 'chart' },
  { view: 'activity', label: 'Log activity', short: 'Log', icon: 'plus' },
  { view: 'nutrition', label: 'Nutrition', short: 'Food', icon: 'leaf', soon: true },
  { view: 'settings', label: 'Settings', short: 'More', icon: 'settings' },
]
const MOBILE_TABS: View[] = ['today', 'history', 'progress', 'activity', 'nutrition', 'settings']

function useSync(notify: (m: string) => void) {
  const [session, setSession] = useState<Session | null>(null)
  const [syncing, setSyncing] = useState(false)

  const run = useCallback(
    async (quiet = false) => {
      if (!isSyncConfigured()) return
      setSyncing(true)
      try {
        const r = await syncNow()
        if (!quiet) notify(`Synced · ${r.pushed} up, ${r.pulled} down`)
      } catch (e) {
        if (!quiet) notify(e instanceof Error ? e.message : 'Sync failed')
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
        if (evt === 'SIGNED_IN') setTimeout(() => void run(), 0)
      })
      unsub = () => data.subscription.unsubscribe()
    })
    const onOnline = () => void run(true)
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      unsub?.()
      window.removeEventListener('online', onOnline)
    }
    // Re-subscribe when the project is (dis)connected from Settings.
  }, [run, session?.user.id])

  return { session, syncing, sync: run }
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>('today')
  const [summaryId, setSummaryId] = useState<string | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const desktop = useMediaQuery('(min-width: 1100px)')
  const tablet = useMediaQuery('(min-width: 768px)')
  const { toast, show } = useToast()
  const { session, syncing, sync } = useSync(show)

  useEffect(() => {
    void ensureSeeded().then(() => setReady(true))
  }, [])
  useEffect(() => {
    if (session) void sync(true)
  }, [session, sync])

  const profile = useProfile()
  const states = useStates()
  const active = useActive()
  const sessions = useCompletedSessions()
  const onboarded = useLiveQuery(async () => (await getMeta<boolean>('onboarded')) ?? false, [])

  if (!ready || !profile || !states || active === undefined || !sessions || onboarded === undefined) return null
  const needsWelcome = !onboarded && sessions.length === 0 && !active

  const summary = summaryId ? sessions.find((s) => s.id === summaryId) : undefined

  const content = (() => {
    switch (view) {
      case 'today':
        if (summary)
          return (
            <SessionResultView
              session={summary}
              onDone={() => setSummaryId(null)}
              onFinisher={() => {
                setSummaryId(null)
                go('activity')
              }}
            />
          )
        if (needsWelcome)
          return <Welcome profile={profile} states={states} canRestore={isSyncConfigured() && !session} onRestore={() => go('settings')} />
        if (active)
          return (
            <ActiveWorkoutView
              active={active}
              profile={profile}
              onFinished={(id) => {
                setSummaryId(id)
                if (session) void sync(true)
              }}
            />
          )
        return (
          <>
            <SessionPreview profile={profile} states={states} sessions={sessions} />
            {!desktop && (
              <>
                <div className="section-title"><h2>Up next</h2><span className="tiny faint">Order is fixed · dates are suggestions</span></div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <UpNextList profile={profile} sessions={sessions} live={!!active} />
                </div>
              </>
            )}
          </>
        )
      case 'history':
        return <HistoryView sessions={sessions} selected={historyId} onSelect={setHistoryId} />
      case 'progress':
        return <ProgressView profile={profile} states={states} />
      case 'activity':
        return (
          <ActivityView
            onSaved={(id) => {
              setView('history')
              setHistoryId(id)
              if (session) void sync(true)
            }}
          />
        )
      case 'nutrition':
        return <NutritionRoadmap profile={profile} />
      case 'settings':
        return <SettingsView profile={profile} states={states} session={session} syncing={syncing} onSync={() => void sync()} notify={show} />
    }
  })()

  const go = (v: View) => {
    setView(v)
    if (v !== 'history') setHistoryId(null)
    document.querySelector('.stage-scroll')?.scrollTo({ top: 0 })
  }

  const stage = (
    <main className="stage">
      <PhaseHeader profile={profile} compact={!tablet} />
      <div className="stage-scroll">
        <div className="stage-inner">{content}</div>
      </div>
      <TimerDock />
    </main>
  )

  if (!tablet) {
    return (
      <div className="mobile">
        {stage}
        <nav className="tabbar" aria-label="Main">
          {MOBILE_TABS.map((v) => {
            const n = NAV.find((x) => x.view === v)!
            return (
              <button key={v} className="tab" aria-current={view === v ? 'page' : undefined} onClick={() => go(v)}>
                <Icon name={n.icon} size={22} />
                {n.short}
              </button>
            )
          })}
        </nav>
        {toast}
      </div>
    )
  }

  return (
    <div className={`shell${desktop ? '' : ' no-stream'}`}>
      <nav className="rail" aria-label="Main">
        <div className="brand">
          <span className="brand-mark"><Icon name="barbell" size={16} /></span>
          PPL Ramp
        </div>
        {NAV.map((n) => (
          <button key={n.view} className="rail-item" aria-current={view === n.view ? 'page' : undefined} onClick={() => go(n.view)}>
            <Icon name={n.icon} />
            {n.label}
            {n.soon && <span className="chip" style={{ marginLeft: 'auto', height: 18, fontSize: 10 }}>Soon</span>}
            {n.view === 'today' && active && <span className="chip accent" style={{ marginLeft: 'auto', height: 18, fontSize: 10 }}>Live</span>}
          </button>
        ))}
        <div className="rail-foot">
          <button className="row small muted" onClick={() => go('settings')}>
            <Icon name={session ? 'cloud' : 'cloudOff'} size={16} />
            {session ? (syncing ? 'Syncing…' : 'Synced to cloud') : 'On this device only'}
          </button>
        </div>
      </nav>

      {desktop && (
        <aside className="stream" aria-label="Queue and history">
          <div className="stream-head">
            <div className="eyebrow">Hi {profile.display_name}</div>
            <div style={{ fontWeight: 650, fontSize: 17, marginTop: 2 }}>Training queue</div>
          </div>
          <div className="stream-body">
            <div className="stream-group spread">
              <span className="eyebrow">Up next</span>
              <span className="tiny faint">dates are suggestions</span>
            </div>
            <UpNextList profile={profile} sessions={sessions} live={!!active} />
            <div className="stream-group" style={{ marginTop: 10 }}>
              <span className="eyebrow">Completed · {sessions.length}</span>
            </div>
            <HistoryList
              sessions={sessions}
              selected={view === 'history' ? historyId : null}
              onSelect={(id) => {
                setView('history')
                setHistoryId(id)
              }}
            />
          </div>
        </aside>
      )}

      {stage}
      {toast}
    </div>
  )
}
