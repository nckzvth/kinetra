import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ActiveWorkout } from '../data/db'
import {
  loadFeed,
  markInboxSeen,
  sendKudos,
  subscribeSocial,
  unsendFist,
  weeklyLeaderboard,
  type Kudos,
  type PublicProfile,
  type SharedActivity,
  type SocialFeed,
} from '../data/social'
import { dayAt } from '../domain/program'
import type { Profile, ProgramDef, WorkoutSession } from '../domain/types'
import { rulesFor } from '../domain/units'
import { Avatar } from './Friends'
import { fmtDuration, fmtWeight } from './hooks'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { formatClock, useNow } from './timer'

/** Friends' data for the Feed, kept fresh by Supabase live updates. */
function useSocial(session: Session | null) {
  const [feed, setFeed] = useState<SocialFeed | null>(null)
  const userId = session?.user.id
  const reload = useCallback(() => {
    if (!userId) return setFeed(null)
    void loadFeed().then(setFeed).catch(() => {})
  }, [userId])
  useEffect(() => {
    reload()
    if (!userId) return
    let off = () => {}
    let t: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (t) clearTimeout(t)
      t = setTimeout(reload, 350)
    }
    void subscribeSocial(debounced).then((u) => (off = u))
    const onVis = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      off()
      if (t) clearTimeout(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reload, userId])
  return { feed, reload }
}

type Item = { at: string; own: WorkoutSession } | { at: string; friend: SharedActivity }

export function FeedView({
  profile,
  program,
  sessions,
  active,
  session,
  onGoWork,
  onOpenSession,
  onLog,
  onOpenFriends,
  installBanner,
  notify,
}: {
  profile: Profile
  program: ProgramDef | null
  sessions: WorkoutSession[]
  active: ActiveWorkout | null
  session: Session | null
  onGoWork: () => void
  onOpenSession: (id: string) => void
  onLog: () => void
  onOpenFriends: () => void
  installBanner?: ReactNode
  notify: (m: string) => void
}) {
  const unit = rulesFor(profile.unit_system).label
  const next = program ? dayAt(program, profile.next_rotation_index) : null
  const firstName = profile.display_name.split(/\s+/)[0]
  const { feed, reload } = useSocial(session)
  const [noteFor, setNoteFor] = useState<SharedActivity | null>(null)
  const [board, setBoard] = useState(false)

  const me = feed?.me
  const myProfile = me ? feed?.profiles[me] : undefined
  const hasFriends = (feed?.friendIds.length ?? 0) > 0

  // Your sessions come from this device; friends' from Supabase. Skip your own shared copies.
  const items: Item[] = useMemo(() => {
    const own: Item[] = sessions.slice(0, 30).map((s) => ({ at: s.started_at, own: s }))
    const friends: Item[] = (feed?.activities ?? []).filter((a) => a.user_id !== me).map((a) => ({ at: a.started_at, friend: a }))
    return [...own, ...friends].sort((a, b) => b.at.localeCompare(a.at))
  }, [sessions, feed, me])
  const groups = groupByDay(items)

  const unseen = (feed?.inbox ?? []).filter((k) => !k.seen_at)
  useEffect(() => {
    if (!unseen.length) return
    const t = setTimeout(() => void markInboxSeen().then(reload), 4000)
    return () => clearTimeout(t)
  }, [unseen.length, reload])

  const kudosFor = (id: string) => (feed?.kudos ?? []).filter((k) => k.activity_id === id)

  return (
    <>
      <h1 className="page-title">Feed</h1>
      {firstName && <p className="muted" style={{ margin: '4px 2px 0' }}>{greeting()}, {firstName}.</p>}
      {installBanner && <div style={{ marginTop: 18 }}>{installBanner}</div>}

      {feed && feed.live.length > 0 && <LiveStrip feed={feed} notify={notify} />}

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

      {feed && feed.inbox.length > 0 && <ForYou feed={feed} />}

      {feed && hasFriends && <LeaderboardCard feed={feed} onOpen={() => setBoard(true)} />}

      {!session ? (
        <FriendsCta title="Train with friends" body="Sign in to see when friends are training, cheer them on and climb weekly leaderboards." action="Get started" onClick={onOpenFriends} />
      ) : feed && !myProfile ? (
        <FriendsCta title="Set up your friend profile" body="Pick a username so friends can find you. It takes a few seconds." action="Set up" onClick={onOpenFriends} />
      ) : feed && !hasFriends ? (
        <FriendsCta title="Invite your training crew" body="Share your link or search for friends. Their workouts show up right here." action="Add friends" onClick={onOpenFriends} />
      ) : null}

      <div className="section-title"><h2>Activity</h2></div>
      {groups.length === 0 ? (
        <div className="card empty">
          <p style={{ fontWeight: 600, color: 'var(--text)' }}>Nothing here yet</p>
          <p className="small" style={{ marginTop: 4 }}>Finish a workout or log an activity and it shows up here.</p>
        </div>
      ) : (
        groups.map(([label, list]) => (
          <div key={label}>
            <div className="group-header" style={{ marginTop: 14 }}>{label}</div>
            <div className="card list">
              {list.map((it) =>
                'own' in it ? (
                  <OwnItem key={it.own.id} s={it.own} unit={unit} name={firstName || 'You'} avatar={myProfile ?? null} kudos={kudosFor(it.own.id)} onOpen={() => onOpenSession(it.own.id)} />
                ) : (
                  <FriendItem
                    key={it.friend.id}
                    a={it.friend}
                    who={feed!.profiles[it.friend.user_id]}
                    me={feed!.me}
                    kudos={kudosFor(it.friend.id)}
                    onNote={() => setNoteFor(it.friend)}
                    onChanged={reload}
                    notify={notify}
                  />
                ),
              )}
            </div>
          </div>
        ))
      )}

      {noteFor && feed && (
        <NoteSheet
          to={feed.profiles[noteFor.user_id]}
          about={noteFor.title}
          onClose={() => setNoteFor(null)}
          onSend={async (msg) => {
            await sendKudos(noteFor.user_id, noteFor.id, 'note', msg)
            setNoteFor(null)
            notify('Note sent')
            reload()
          }}
        />
      )}
      {board && feed && <LeaderboardSheet feed={feed} onClose={() => setBoard(false)} />}
    </>
  )
}

// ─── Live ───────────────────────────────────────────────────────────────────

export function LiveStrip({ feed, notify }: { feed: SocialFeed; notify: (m: string) => void }) {
  const now = useNow(30000)
  const [sent, setSent] = useState<Record<string, boolean>>({})
  return (
    <>
      <div className="section-title" style={{ marginTop: 22 }}>
        <h2 className="row" style={{ gap: 8 }}><span className="live-dot" aria-hidden="true" />Training now</h2>
      </div>
      <div className="live-strip">
        {feed.live.map((l) => {
          const p = feed.profiles[l.user_id]
          const mins = Math.max(1, Math.round((now - Date.parse(l.started_at)) / 60000))
          return (
            <div key={l.user_id} className="live-card">
              <span className="live-ring"><Avatar p={p ?? null} size={44} /></span>
              <span style={{ fontWeight: 600, marginTop: 6 }}>{p?.display_name.split(/\s+/)[0] || p?.username || 'Friend'}</span>
              <span className="tiny muted">{l.title} · {mins} min</span>
              <button
                className={`fist-btn${sent[l.user_id] ? ' on' : ''}`}
                disabled={sent[l.user_id]}
                onClick={async () => {
                  setSent((s) => ({ ...s, [l.user_id]: true }))
                  try {
                    await sendKudos(l.user_id, null, 'fist')
                    notify(`Fist-bump sent to ${p?.display_name.split(/\s+/)[0] || 'your friend'}`)
                  } catch {
                    setSent((s) => ({ ...s, [l.user_id]: false }))
                  }
                }}
              >
                👊 {sent[l.user_id] ? 'Sent' : 'Send'}
              </button>
            </div>
          )
        })}
      </div>
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

// ─── For you, leaderboard, CTA ─────────────────────────────────────────────

export function ForYou({ feed }: { feed: SocialFeed }) {
  const titleOf = (k: Kudos) => feed.activities.find((a) => a.id === k.activity_id)?.title
  return (
    <>
      <div className="section-title"><h2>For you</h2></div>
      <div className="card list">
        {feed.inbox.slice(0, 5).map((k) => {
          const p = feed.profiles[k.from_user]
          const who = p?.display_name.split(/\s+/)[0] || p?.username || 'A friend'
          const title = titleOf(k)
          return (
            <div key={k.id} className="cell" style={{ alignItems: 'flex-start' }}>
              <Avatar p={p ?? null} size={36} />
              <span className="grow">
                <span style={{ display: 'block', lineHeight: 1.35 }}>
                  <b>{who}</b>{' '}
                  {k.kind === 'fist' ? <>sent you a fist-bump{title ? <> on <b>{title}</b></> : ' while you trained'} 👊</> : <>left a note{title ? <> on <b>{title}</b></> : ''}</>}
                </span>
                {k.kind === 'note' && k.message && <span className="note-bubble">{k.message}</span>}
                <span className="tiny muted" style={{ display: 'block', marginTop: 4 }}>{ago(k.created_at)}</span>
              </span>
              {!k.seen_at && <span className="unseen-dot" aria-label="New" />}
            </div>
          )
        })}
      </div>
    </>
  )
}

export function LeaderboardCard({ feed, onOpen }: { feed: SocialFeed; onOpen: () => void }) {
  const rows = weeklyLeaderboard(feed)
  const myRank = rows.findIndex((r) => r.user_id === feed.me) + 1
  return (
    <button className="card card-pad" style={{ width: '100%', textAlign: 'left', marginTop: 12 }} onClick={onOpen}>
      <div className="spread">
        <span style={{ fontWeight: 700 }}><Icon name="trophy" size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />This week</span>
        <span className="small muted">You're #{myRank} of {rows.length} <Icon name="chevronRight" size={14} style={{ verticalAlign: '-2px' }} /></span>
      </div>
      <div className="podium">
        {rows.slice(0, 3).map((r, i) => {
          const p = feed.profiles[r.user_id]
          return (
            <span key={r.user_id} className={`podium-spot${r.user_id === feed.me ? ' me' : ''}`}>
              <span className="podium-rank">{i + 1}</span>
              <Avatar p={p ?? null} size={36} />
              <span className="tiny" style={{ fontWeight: 600, marginTop: 4 }}>{r.user_id === feed.me ? 'You' : p?.display_name.split(/\s+/)[0] || p?.username}</span>
              <span className="tiny muted">{r.sessions} {r.sessions === 1 ? 'session' : 'sessions'}</span>
            </span>
          )
        })}
      </div>
    </button>
  )
}

function LeaderboardSheet({ feed, onClose }: { feed: SocialFeed; onClose: () => void }) {
  const rows = weeklyLeaderboard(feed)
  return (
    <Sheet title="This week" onClose={onClose} right={<button className="btn ghost" onClick={onClose}>Done</button>}>
      <div className="card list">
        {rows.map((r, i) => {
          const p = feed.profiles[r.user_id]
          return (
            <div key={r.user_id} className="cell" style={r.user_id === feed.me ? { background: 'var(--info-soft)' } : undefined}>
              <span className="num" style={{ width: 22, fontWeight: 700, color: i < 3 ? 'var(--accent-text)' : 'var(--text-2)' }}>{i + 1}</span>
              <Avatar p={p ?? null} size={34} />
              <span className="grow">
                <span style={{ display: 'block', fontWeight: 600 }}>{r.user_id === feed.me ? 'You' : p?.display_name || p?.username}</span>
                <span className="tiny muted">{r.sessions} sessions · {r.minutes} min{r.ups ? ` · ${r.ups} weight increases` : ''}</span>
              </span>
              <span className="num" style={{ fontWeight: 700 }}>{Math.round(r.score)}</span>
            </div>
          )
        })}
      </div>
      <p className="group-footer">Points: 10 per session, 1 per 6 active minutes (up to 100) and 5 per weight increase. Resets every Monday.</p>
    </Sheet>
  )
}

function FriendsCta({ title, body, action, onClick }: { title: string; body: string; action: string; onClick: () => void }) {
  return (
    <div className="card card-pad feed-friends">
      <span className="cell-icon" style={{ background: '#ff375f' }}><Icon name="user" size={18} /></span>
      <div className="grow">
        <b>{title}</b>
        <p className="small muted" style={{ marginTop: 3, lineHeight: 1.4 }}>{body}</p>
        <button className="btn sm tint" style={{ marginTop: 10 }} onClick={onClick}>{action}</button>
      </div>
    </div>
  )
}

// ─── Feed items ─────────────────────────────────────────────────────────────

export function OwnItem({ s, unit, name, avatar, kudos, onOpen }: { s: WorkoutSession; unit: string; name: string; avatar: PublicProfile | null; kudos: Kudos[]; onOpen: () => void }) {
  const r = s.result_json
  const activity = s.rotation_code === 'CUSTOM'
  const ups = r?.exercises.filter((e) => e.action === 'INCREASE' && e.is_primary) ?? []
  const highlights = activity
    ? []
    : [
        ...(r?.promoted ? [`Unlocked phase ${r.phase_after}`] : []),
        ...ups.slice(0, 2).map((e) => `${e.name} ${fmtWeight(e.next_weight_lbs)} ${unit} next`),
        ...(!ups.length && !r?.promoted && r?.session_target_met ? ['Hit every rep'] : []),
      ]
  const fists = kudos.filter((k) => k.kind === 'fist').length
  const notes = kudos.filter((k) => k.kind === 'note').length
  return (
    <button className="feed-item" onClick={onOpen}>
      {avatar ? <Avatar p={avatar} size={36} /> : <span className="feed-avatar" aria-hidden="true"><Icon name={activity ? 'activity' : 'barbell'} size={18} /></span>}
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="feed-line"><b>{name}</b> {activity ? 'logged' : 'finished'} <b>{s.title}</b></span>
        <Meta at={s.started_at} duration={s.duration_seconds} rpe={s.session_rpe} />
        <Highlights items={highlights} />
        {(fists > 0 || notes > 0) && (
          <span className="tiny muted" style={{ display: 'block', marginTop: 8 }}>
            {fists > 0 && `👊 ${fists}`}{fists > 0 && notes > 0 && '  ·  '}{notes > 0 && `${notes} ${notes === 1 ? 'note' : 'notes'}`}
          </span>
        )}
      </span>
      <Icon name="chevronRight" className="chev" />
    </button>
  )
}

export function FriendItem({
  a,
  who,
  me,
  kudos,
  onNote,
  onChanged,
  notify,
}: {
  a: SharedActivity
  who: PublicProfile | undefined
  me: string
  kudos: Kudos[]
  onNote: () => void
  onChanged: () => void
  notify: (m: string) => void
}) {
  const fists = kudos.filter((k) => k.kind === 'fist')
  const mine = fists.some((k) => k.from_user === me)
  const myNotes = kudos.filter((k) => k.kind === 'note' && k.from_user === me).length
  const [pending, setPending] = useState<boolean | null>(null)
  const on = pending ?? mine
  const count = fists.length + (pending === null ? 0 : pending && !mine ? 1 : !pending && mine ? -1 : 0)
  const name = who?.display_name.split(/\s+/)[0] || who?.username || 'A friend'

  return (
    <div className="feed-item">
      <Avatar p={who ?? null} size={36} />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="feed-line"><b>{name}</b> {a.kind === 'activity' ? 'logged' : 'finished'} <b>{a.title}</b></span>
        <Meta at={a.started_at} duration={a.duration_seconds} />
        <Highlights items={a.summary.highlights ?? []} />
        {a.summary.lifts && a.summary.lifts.length > 0 && (
          <span className="lift-lines">
            {a.summary.lifts.slice(0, 3).map((l) => (
              <span key={l.name} className="tiny"><b>{l.name}</b> <span className="muted num">{fmtWeight(l.weight)} {l.unit} · {l.reps.join(' · ')}</span></span>
            ))}
          </span>
        )}
        <span className="react-row">
          <button
            className={`fist-btn${on ? ' on' : ''}`}
            aria-pressed={on}
            aria-label={on ? 'Remove fist-bump' : `Fist-bump ${name}`}
            onClick={async () => {
              const next = !on
              setPending(next)
              try {
                if (next) await sendKudos(a.user_id, a.id, 'fist')
                else await unsendFist(a.id)
                onChanged()
              } catch {
                notify("Couldn't send that. Check your connection.")
              } finally {
                setPending(null)
              }
            }}
          >
            👊 {count > 0 ? count : ''}
          </button>
          <button className="fist-btn" onClick={onNote}>
            <Icon name="pencil" size={14} /> {myNotes ? 'Noted' : 'Note'}
          </button>
        </span>
      </span>
    </div>
  )
}

function Meta({ at, duration, rpe }: { at: string; duration: number | null; rpe?: number | null }) {
  return (
    <span className="tiny muted" style={{ display: 'block', marginTop: 2 }}>
      {new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
      {duration ? ` · ${fmtDuration(duration)}` : ''}
      {rpe ? ` · effort ${rpe}` : ''}
    </span>
  )
}

function Highlights({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <span className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {items.map((h) => (
        <span key={h} className="chip accent"><Icon name={h.startsWith('Unlocked') ? 'trophy' : h === 'Hit every rep' ? 'check' : 'arrowUp'} size={12} />{h}</span>
      ))}
    </span>
  )
}

const QUICK_NOTES = ['Strong work 💪', "Let's go!", 'Proud of you', 'Beast mode']

function NoteSheet({ to, about, onClose, onSend }: { to: PublicProfile | undefined; about: string; onClose: () => void; onSend: (m: string) => Promise<void> }) {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async (m: string) => {
    if (!m.trim()) return
    setBusy(true)
    try {
      await onSend(m.trim())
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      title={`Note to ${to?.display_name.split(/\s+/)[0] || to?.username || 'your friend'}`}
      onClose={onClose}
      left={<button className="btn ghost" onClick={onClose}>Cancel</button>}
      right={<button className="btn ghost" style={{ fontWeight: 600 }} disabled={busy || !msg.trim()} onClick={() => void send(msg)}>Send</button>}
    >
      <p className="small muted" style={{ margin: '0 4px 12px' }}>On {about}. Only they will see it.</p>
      <textarea className="input" rows={3} maxLength={280} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write something encouraging" autoFocus />
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {QUICK_NOTES.map((q) => (
          <button key={q} className="chip" style={{ height: 32, padding: '0 12px', fontSize: 14 }} disabled={busy} onClick={() => void send(q)}>{q}</button>
        ))}
      </div>
    </Sheet>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function groupByDay(items: Item[]): [string, Item[]][] {
  const out = new Map<string, Item[]>()
  const today = new Date()
  const key = (d: Date) => d.toDateString()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  for (const it of items) {
    const d = new Date(it.at)
    const label =
      key(d) === key(today) ? 'Today' : key(d) === key(yesterday) ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    out.set(label, [...(out.get(label) ?? []), it])
  }
  return [...out.entries()]
}
