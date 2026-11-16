import type { ReactNode } from 'react'
import type { ActiveWorkout } from '../data/db'
import { dayAt } from '../domain/program'
import type { Profile, ProgramDef, WorkoutSession } from '../domain/types'
import { rulesFor } from '../domain/units'
import { fmtDuration, fmtWeight } from './hooks'
import { Icon, type IconName } from './Icon'
import { formatClock, useNow } from './timer'

/**
 * Feed: the home tab. Friends' activity will live here; until Friends ships it shows your own
 * recent activity, a resume card for a workout in progress, and what's up next.
 */
export function FeedView({
  profile,
  program,
  sessions,
  active,
  onGoWork,
  onOpenSession,
  onLog,
  installBanner,
}: {
  profile: Profile
  program: ProgramDef | null
  sessions: WorkoutSession[]
  active: ActiveWorkout | null
  onGoWork: () => void
  onOpenSession: (id: string) => void
  onLog: () => void
  installBanner?: ReactNode
}) {
  const unit = rulesFor(profile.unit_system).label
  const next = program ? dayAt(program, profile.next_rotation_index) : null
  const groups = groupByDay(sessions.slice(0, 30))
  const firstName = profile.display_name.split(/\s+/)[0]

  return (
    <>
      <h1 className="page-title">Feed</h1>
      {firstName && <p className="muted" style={{ margin: '4px 2px 0' }}>{greeting()}, {firstName}.</p>}
      {installBanner && <div style={{ marginTop: 18 }}>{installBanner}</div>}

      {active ? (
        <ResumeCard active={active} onResume={onGoWork} />
      ) : next ? (
        <button className="card feed-hero" onClick={onGoWork}>
          <span className="eyebrow">Up next</span>
          <span className="feed-hero-title">{next.name}</span>
          {next.focus && <span className="small muted">{next.focus}</span>}
          <span className="btn primary" style={{ marginTop: 14, alignSelf: 'stretch' }}>Go to workout</span>
        </button>
      ) : (
        <div className="card feed-hero">
          <span className="feed-hero-title">Ready when you are</span>
          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn primary grow" onClick={onGoWork}>Start a workout</button>
            <button className="btn grow" style={{ background: 'var(--surface-2)' }} onClick={onLog}>Log activity</button>
          </div>
        </div>
      )}

      <div className="card card-pad feed-friends">
        <span className="cell-icon" style={{ background: '#ff375f' }}><Icon name="user" size={18} /></span>
        <div className="grow">
          <div className="row" style={{ gap: 8 }}>
            <b>Train with friends</b>
            <span className="chip info">Coming next</span>
          </div>
          <p className="small muted" style={{ marginTop: 3, lineHeight: 1.4 }}>
            See when friends are training, cheer them on with a tap, and climb weekly leaderboards together.
          </p>
        </div>
      </div>

      <div className="section-title"><h2>Your activity</h2></div>
      {groups.length === 0 ? (
        <div className="card empty">
          <p style={{ fontWeight: 600, color: 'var(--text)' }}>Nothing here yet</p>
          <p className="small" style={{ marginTop: 4 }}>Finish a workout or log an activity and it shows up here.</p>
        </div>
      ) : (
        groups.map(([label, items]) => (
          <div key={label}>
            <div className="group-header" style={{ marginTop: 14 }}>{label}</div>
            <div className="card list">
              {items.map((s) => (
                <FeedItem key={s.id} s={s} unit={unit} name={firstName || 'You'} onOpen={() => onOpenSession(s.id)} />
              ))}
            </div>
          </div>
        ))
      )}
    </>
  )
}

function ResumeCard({ active, onResume }: { active: ActiveWorkout; onResume: () => void }) {
  const now = useNow(1000)
  const elapsed = (now - Date.parse(active.started_at)) / 1000
  const done = Object.values(active.log.reps).flat().filter((r) => r !== null).length
  const total = active.plan.exercises.reduce((n, e) => n + e.sets.length, 0)
  return (
    <button className="card feed-hero live" onClick={onResume}>
      <span className="row" style={{ gap: 8 }}>
        <span className="live-dot" aria-hidden="true" />
        <span className="eyebrow" style={{ color: 'var(--accent-text)' }}>Workout in progress</span>
      </span>
      <span className="feed-hero-title">{active.plan.title}</span>
      <span className="small muted num">{formatClock(Math.floor(elapsed))} · {done} of {total} sets</span>
      <span className="btn primary" style={{ marginTop: 14, alignSelf: 'stretch' }}>Resume</span>
    </button>
  )
}

function FeedItem({ s, unit, name, onOpen }: { s: WorkoutSession; unit: string; name: string; onOpen: () => void }) {
  const r = s.result_json
  const activity = s.rotation_code === 'CUSTOM'
  const ups = r?.exercises.filter((e) => e.action === 'INCREASE' && e.is_primary) ?? []
  const icon: IconName = activity ? 'activity' : 'barbell'
  const highlight = activity
    ? null
    : r?.promoted
      ? `Unlocked phase ${r.phase_after}`
      : ups.length
        ? ups.map((e) => `${e.name} ${fmtWeight(e.next_weight_lbs)} ${unit} next`).slice(0, 2).join(' · ')
        : r?.session_target_met
          ? 'Hit every rep'
          : null
  return (
    <button className="feed-item" onClick={onOpen}>
      <span className="feed-avatar" aria-hidden="true"><Icon name={icon} size={18} /></span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="feed-line">
          <b>{name}</b> {activity ? 'logged' : 'finished'} <b>{s.title}</b>
        </span>
        <span className="tiny muted" style={{ display: 'block', marginTop: 2 }}>
          {new Date(s.started_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          {s.duration_seconds ? ` · ${fmtDuration(s.duration_seconds)}` : ''}
          {s.session_rpe ? ` · effort ${s.session_rpe}` : ''}
        </span>
        {highlight && (
          <span className={`chip ${r?.promoted ? 'accent' : ups.length ? 'accent' : ''}`} style={{ marginTop: 8 }}>
            {r?.promoted ? <Icon name="trophy" size={12} /> : ups.length ? <Icon name="arrowUp" size={12} /> : <Icon name="check" size={12} />}
            {highlight}
          </span>
        )}
      </span>
      <Icon name="chevronRight" className="chev" />
    </button>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function groupByDay(sessions: WorkoutSession[]): [string, WorkoutSession[]][] {
  const out = new Map<string, WorkoutSession[]>()
  const today = new Date()
  const key = (d: Date) => d.toDateString()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  for (const s of sessions) {
    const d = new Date(s.started_at)
    const label =
      key(d) === key(today) ? 'Today' : key(d) === key(yesterday) ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    out.set(label, [...(out.get(label) ?? []), s])
  }
  return [...out.entries()]
}
