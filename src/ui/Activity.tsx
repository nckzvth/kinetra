import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getMeta, setMeta } from '../data/db'
import { saveActivity } from '../data/repo'
import { EXERCISES, getExercise } from '../domain/catalog'
import type { ExerciseDef, TrackingArchetype, WallAngle, WorkoutEntry, WorkoutSession } from '../domain/types'
import {
  climbStats,
  cueBetween,
  formatHMS,
  formatPace,
  paceSecPerUnit,
  parseDuration,
  roundStateAt,
  totalRoundSeconds,
  V_GRADES,
  YDS_GRADES,
  type ClimbLog,
  type DistanceUnit,
  type RoundConfig,
  type RoundState,
} from '../engine/activity'
import { fmtDuration, fmtWeight } from './hooks'
import { Icon, type IconName } from './Icon'
import { Sheet } from './Sheet'
import { chime, playCue, primeAudio, timer, useNow, useWakeLock } from './timer'
import { useSessionEntries } from './data'

// ─── Draft (persisted so a reload or lock screen never loses an activity) ───

interface Stopwatch {
  startedAt: number | null
  pausedAt: number | null
  pausedTotal: number
}
const idleWatch = (): Stopwatch => ({ startedAt: null, pausedAt: null, pausedTotal: 0 })
const elapsedOf = (w: Stopwatch, now: number) =>
  w.startedAt === null ? 0 : Math.max(0, ((w.pausedAt ?? now) - w.startedAt - w.pausedTotal) / 1000)
const startWatch = (w: Stopwatch, now = Date.now()): Stopwatch =>
  w.startedAt === null ? { ...w, startedAt: now } : w.pausedAt !== null ? { ...w, pausedAt: null, pausedTotal: w.pausedTotal + (now - w.pausedAt) } : w
const pauseWatch = (w: Stopwatch, now = Date.now()): Stopwatch => (w.startedAt !== null && w.pausedAt === null ? { ...w, pausedAt: now } : w)

interface Base {
  exercise_id: string
  started_at: string
}
type Draft =
  | (Base & {
      kind: 'DISTANCE_PACE'
      mode: 'live' | 'manual'
      watch: Stopwatch
      laps: number[]
      distance: string
      unit: DistanceUnit
      duration: string
      elevation: string
      pack: string
      hr: string
      zone: number | null
    })
  | (Base & { kind: 'ROUNDS_INTERVAL'; config: RoundConfig; watch: Stopwatch; stopped: boolean; combos: string })
  | (Base & { kind: 'CLIMB_BOULDER'; scale: 'V' | 'YDS'; angle: WallAngle; grade: string | null; climbs: (ClimbLog & { angle: WallAngle })[] })
  | (Base & { kind: 'DURATION_HOLD'; target: number; added: number; sets: number[]; watch: Stopwatch })
  | (Base & { kind: 'BODYWEIGHT_REPS'; added: number; reps: number; sets: { reps: number; added: number }[] })

const DRAFT_KEY = 'activity_draft'
const saveDraft = (d: Draft | null) => setMeta(DRAFT_KEY, d)

function newDraft(ex: ExerciseDef): Draft {
  const base = { exercise_id: ex.id, started_at: new Date().toISOString() }
  switch (ex.tracking_archetype) {
    case 'DISTANCE_PACE':
      return { ...base, kind: 'DISTANCE_PACE', mode: 'live', watch: idleWatch(), laps: [], distance: '', unit: 'mi', duration: '', elevation: '', pack: '', hr: '', zone: null }
    case 'ROUNDS_INTERVAL':
      return { ...base, kind: 'ROUNDS_INTERVAL', config: { rounds: 6, work_sec: 180, rest_sec: 60, prep_sec: 10, warn_sec: 10 }, watch: idleWatch(), stopped: false, combos: '' }
    case 'CLIMB_BOULDER':
      return { ...base, kind: 'CLIMB_BOULDER', scale: 'V', angle: 'VERTICAL', grade: null, climbs: [] }
    case 'DURATION_HOLD':
      return { ...base, kind: 'DURATION_HOLD', target: 60, added: 0, sets: [], watch: idleWatch() }
    default:
      return { ...base, kind: 'BODYWEIGHT_REPS', added: 0, reps: 8, sets: [] }
  }
}

// ─── Picker ─────────────────────────────────────────────────────────────────

const ARCH: { arch: TrackingArchetype; label: string; icon: IconName; blurb: string }[] = [
  { arch: 'DISTANCE_PACE', label: 'Distance & pace', icon: 'run', blurb: 'Stopwatch with laps, or enter it after' },
  { arch: 'ROUNDS_INTERVAL', label: 'Rounds & intervals', icon: 'boxing', blurb: 'Round timer with bell and 10 s warning' },
  { arch: 'CLIMB_BOULDER', label: 'Climb & boulder', icon: 'mountain', blurb: 'Tap grade, then flash / send / attempt' },
  { arch: 'DURATION_HOLD', label: 'Timed holds', icon: 'timer', blurb: 'Countdown per set, rest starts itself' },
  { arch: 'BODYWEIGHT_REPS', label: 'Bodyweight reps', icon: 'body', blurb: 'Reps with assistance or added load' },
]

export function ActivityView({ onSaved }: { onSaved: (id: string) => void }) {
  const draft = useLiveQuery(async () => (await getMeta<Draft | null>(DRAFT_KEY)) ?? null, [])
  if (draft === undefined) return null
  if (draft) return <ActivityLogger key={draft.started_at} initial={draft} onSaved={onSaved} />
  return (
    <>
      <h1 className="page-title">Log activity</h1>
      <p className="muted" style={{ marginTop: 6 }}>Rest-day conditioning or a finisher after lifting. Activities never affect your lifting gate.</p>
      {ARCH.map((a) => {
        const items = EXERCISES.filter((e) => e.tracking_archetype === a.arch)
        return (
          <div key={a.arch}>
            <div className="section-title" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <h2>{a.label}</h2>
              <span className="small muted">{a.blurb}</span>
            </div>
            <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {items.map((ex) => (
                <button key={ex.id} className="tile row" style={{ textAlign: 'left' }} onClick={() => { primeAudio(); void saveDraft(newDraft(ex)) }}>
                  <span className="icon" style={{ marginBottom: 0 }}><Icon name={a.icon} /></span>
                  <span style={{ fontWeight: 600 }}>{ex.name}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ─── Logger shell ───────────────────────────────────────────────────────────

function ActivityLogger({ initial, onSaved }: { initial: Draft; onSaved: (id: string) => void }) {
  // Local state is the source of truth while logging; every change is mirrored to IndexedDB
  // so a reload or lock screen resumes exactly here.
  const [draft, setDraft] = useState<Draft>(initial)
  const ex = getExercise(draft.exercise_id)
  const [finishing, setFinishing] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const update = (patch: Partial<Draft>) =>
    setDraft((prev) => {
      const next = { ...prev, ...patch } as Draft
      void saveDraft(next)
      return next
    })

  const body = (() => {
    switch (draft.kind) {
      case 'DISTANCE_PACE':
        return <DistanceLogger d={draft} update={update} ex={ex} />
      case 'ROUNDS_INTERVAL':
        return <RoundsLogger d={draft} update={update} />
      case 'CLIMB_BOULDER':
        return <ClimbLogger d={draft} update={update} />
      case 'DURATION_HOLD':
        return <HoldLogger d={draft} update={update} ex={ex} />
      case 'BODYWEIGHT_REPS':
        return <BodyweightLogger d={draft} update={update} ex={ex} />
    }
  })()

  const canFinish = hasData(draft)
  return (
    <>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Activity · {ARCH.find((a) => a.arch === ex.tracking_archetype)?.label}</div>
          <h1 className="page-title" style={{ marginTop: 2 }}>{ex.name}</h1>
        </div>
        <button className="btn sm ghost danger" onClick={() => setDiscarding(true)}>Discard</button>
      </div>
      {body}
      <button className="btn ink lg block" style={{ marginTop: 20 }} disabled={!canFinish} onClick={() => setFinishing(true)}>
        Finish &amp; save
      </button>
      {finishing && <FinishActivity draft={draft} onClose={() => setFinishing(false)} onSaved={onSaved} />}
      {discarding && (
        <Sheet title="Discard this activity?" onClose={() => setDiscarding(false)}>
          <p className="muted">Nothing from it will be saved.</p>
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn grow" onClick={() => setDiscarding(false)}>Keep going</button>
            <button className="btn grow" style={{ background: 'var(--danger)', color: '#fff', borderColor: 'transparent' }} onClick={() => void saveDraft(null)}>
              Discard
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function hasData(d: Draft): boolean {
  switch (d.kind) {
    case 'DISTANCE_PACE':
      return d.mode === 'live' ? d.watch.startedAt !== null : (parseDuration(d.duration) ?? 0) > 0 || Number(d.distance) > 0
    case 'ROUNDS_INTERVAL':
      return d.watch.startedAt !== null
    case 'CLIMB_BOULDER':
      return d.climbs.length > 0
    case 'DURATION_HOLD':
    case 'BODYWEIGHT_REPS':
      return d.sets.length > 0
  }
}

function FinishActivity({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: (id: string) => void }) {
  const [rpe, setRpe] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title="Save activity" onClose={onClose}>
      <div className="field">
        <span className="label">Effort (RPE, optional)</span>
        <div className="seg" role="group">
          {[5, 6, 7, 8, 9, 10].map((n) => (
            <button key={n} aria-pressed={rpe === n} onClick={() => setRpe(rpe === n ? null : n)}>{n}</button>
          ))}
        </div>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="act-notes">Notes</label>
        <textarea id="act-notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
      <button
        className="btn primary lg block"
        style={{ marginTop: 20 }}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const combos = draft.kind === 'ROUNDS_INTERVAL' ? draft.combos.trim() : ''
          const allNotes = [combos, notes.trim()].filter(Boolean).join('\n') || null
          const s = await saveActivity({ ...toActivity(draft, Date.now()), session_rpe: rpe, notes: allNotes })
          await saveDraft(null)
          timer.clear()
          onSaved(s.id)
        }}
      >
        Save
      </button>
    </Sheet>
  )
}

/** Converts a draft into session fields + polymorphic entries. */
export function toActivity(d: Draft, now: number) {
  const ex = getExercise(d.exercise_id)
  const base = { exercise_id: d.exercise_id, title: ex.name, started_at: d.started_at }
  switch (d.kind) {
    case 'DISTANCE_PACE': {
      const duration = Math.round(d.mode === 'live' ? elapsedOf(d.watch, now) : (parseDuration(d.duration) ?? 0))
      const distance = Number(d.distance) || null
      const num = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Math.round(Number(s)) : null)
      const total: Partial<WorkoutEntry> = {
        set_type: 'WORKING',
        distance_value: distance,
        distance_unit: d.unit,
        work_duration_sec: duration,
        pace_sec_per_unit: distance ? paceSecPerUnit(distance, duration) : null,
        elevation_gain_ft: num(d.elevation),
        pack_weight_lbs: num(d.pack),
        avg_heart_rate_bpm: num(d.hr),
        hr_zone: d.zone,
      }
      const laps = d.mode === 'live' ? d.laps.map((t, i) => ({ set_type: 'INTERVAL_ROUND' as const, work_duration_sec: Math.round(t - (d.laps[i - 1] ?? 0)) })) : []
      return { ...base, duration_seconds: duration, entries: [total, ...laps] }
    }
    case 'ROUNDS_INTERVAL': {
      const st = roundStateAt(d.config, elapsedOf(d.watch, now))
      const completed = st.completed
      const hasPartial = st.phase === 'WORK' && st.remaining < d.config.work_sec
      const entries = Array.from({ length: completed + (hasPartial ? 1 : 0) }, (_, i) => {
        const partial = hasPartial && i === completed
        return {
          set_type: 'INTERVAL_ROUND' as const,
          rounds_completed: partial ? 0 : 1,
          total_rounds_target: d.config.rounds,
          work_duration_sec: partial ? Math.round(d.config.work_sec - st.remaining) : d.config.work_sec,
          rest_duration_sec: d.config.rest_sec,
          target_met: !partial,
        }
      })
      return { ...base, duration_seconds: Math.round(elapsedOf(d.watch, now)), entries }
    }
    case 'CLIMB_BOULDER':
      return {
        ...base,
        duration_seconds: Math.round((now - Date.parse(d.started_at)) / 1000),
        entries: d.climbs.map((c) => ({ set_type: 'WORKING' as const, climb_grade: c.grade, wall_angle: c.angle, send_status: c.outcome, attempts_count: c.attempts, target_met: c.outcome !== 'ATTEMPT' })),
      }
    case 'DURATION_HOLD':
      return {
        ...base,
        duration_seconds: Math.round((now - Date.parse(d.started_at)) / 1000),
        entries: d.sets.map((sec) => ({ set_type: 'WORKING' as const, work_duration_sec: Math.round(sec), actual_weight_lbs: d.added || null, target_met: sec >= d.target })),
      }
    case 'BODYWEIGHT_REPS':
      return {
        ...base,
        duration_seconds: Math.round((now - Date.parse(d.started_at)) / 1000),
        entries: d.sets.map((s) => ({ set_type: 'WORKING' as const, actual_reps: s.reps, actual_weight_lbs: s.added, target_met: true })),
      }
  }
}

// ─── Distance & pace ────────────────────────────────────────────────────────

type DistanceDraft = Extract<Draft, { kind: 'DISTANCE_PACE' }>
function DistanceLogger({ d, update, ex }: { d: DistanceDraft; update: (p: Partial<DistanceDraft>) => void; ex: ExerciseDef }) {
  const running = d.watch.startedAt !== null && d.watch.pausedAt === null
  useWakeLock(running)
  const now = useNow(250, running)
  const elapsed = elapsedOf(d.watch, now)
  const duration = d.mode === 'live' ? elapsed : (parseDuration(d.duration) ?? 0)
  const pace = paceSecPerUnit(Number(d.distance), duration)
  const isRuck = ex.id === 'rucking'

  return (
    <>
      <div className="seg" role="group" style={{ marginBottom: 12 }}>
        <button aria-pressed={d.mode === 'live'} onClick={() => update({ mode: 'live' })}>Live stopwatch</button>
        <button aria-pressed={d.mode === 'manual'} onClick={() => update({ mode: 'manual' })}>Enter after</button>
      </div>

      {d.mode === 'live' ? (
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div className="num" style={{ fontSize: 64, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em' }}>{formatHMS(elapsed)}</div>
          <div className="small muted" style={{ marginTop: 6 }}>{d.watch.pausedAt ? 'Paused' : running ? 'Running' : 'Ready'}</div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            {running ? (
              <>
                <button className="btn lg" style={{ minWidth: 110 }} onClick={() => update({ laps: [...d.laps, elapsed] })}>Lap</button>
                <button className="btn lg ink" style={{ minWidth: 110 }} onClick={() => update({ watch: pauseWatch(d.watch) })}>Pause</button>
              </>
            ) : (
              <button className="btn lg primary" style={{ minWidth: 160 }} onClick={() => update({ watch: startWatch(d.watch) })}>
                {d.watch.startedAt ? 'Resume' : 'Start'}
              </button>
            )}
          </div>
          {d.laps.length > 0 && (
            <div className="list" style={{ marginTop: 16, textAlign: 'left', borderTop: '1px solid var(--line)' }}>
              {d.laps.map((t, i) => (
                <div key={i} className="spread small" style={{ padding: '8px 4px' }}>
                  <span className="muted">Lap {i + 1}</span>
                  <span className="num">{formatHMS(t - (d.laps[i - 1] ?? 0))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card list">
          <div className="setting-row">
            <label className="grow" htmlFor="dur">Time <span className="faint small">mm:ss or h:mm:ss</span></label>
            <input id="dur" className="input num" style={{ width: 120 }} inputMode="numeric" placeholder="27:54" value={d.duration} onChange={(e) => update({ duration: e.target.value })} />
          </div>
        </div>
      )}

      <div className="section-title"><h2>Details</h2>{pace !== null && <span className="chip accent num">{formatPace(pace, d.unit)}</span>}</div>
      <div className="card list">
        <div className="setting-row">
          <label className="grow" htmlFor="dist">Distance</label>
          <input id="dist" className="input num" style={{ width: 90 }} inputMode="decimal" placeholder="0.0" value={d.distance} onChange={(e) => update({ distance: e.target.value.replace(/[^\d.]/g, '') })} />
          <div className="seg">
            {(['mi', 'km'] as const).map((u) => (
              <button key={u} aria-pressed={d.unit === u} onClick={() => update({ unit: u })}>{u}</button>
            ))}
          </div>
        </div>
        <Field label="Elevation gain" unit="ft" value={d.elevation} onChange={(v) => update({ elevation: v })} />
        {isRuck && <Field label="Pack weight" unit="lb" value={d.pack} onChange={(v) => update({ pack: v })} />}
        <Field label="Average heart rate" unit="bpm" value={d.hr} onChange={(v) => update({ hr: v })} />
        <div className="setting-row">
          <span className="grow">Heart-rate zone</span>
          <div className="seg">
            {[1, 2, 3, 4, 5].map((z) => (
              <button key={z} aria-pressed={d.zone === z} onClick={() => update({ zone: d.zone === z ? null : z })}>{z}</button>
            ))}
          </div>
        </div>
      </div>
      {d.mode === 'live' && <p className="tiny faint" style={{ marginTop: 8 }}>Enter the distance from your watch or treadmill when you finish. Pace updates as you type.</p>}
    </>
  )
}

function Field({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  const id = label.replace(/\s+/g, '-').toLowerCase()
  return (
    <div className="setting-row">
      <label className="grow" htmlFor={id}>{label} <span className="faint small">{unit}</span></label>
      <input id={id} className="input num" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} />
    </div>
  )
}

// ─── Rounds & bell timer ────────────────────────────────────────────────────

type RoundsDraft = Extract<Draft, { kind: 'ROUNDS_INTERVAL' }>
const PHASE_STYLE: Record<RoundState['phase'], { label: string; color: string }> = {
  PREP: { label: 'Get ready', color: 'var(--info)' },
  WORK: { label: 'Work', color: 'var(--accent)' },
  REST: { label: 'Rest', color: 'var(--warn)' },
  DONE: { label: 'Done · total work', color: 'var(--accent)' },
}

function Stepper({ label, value, step, min, max, format, onChange }: { label: string; value: number; step: number; min: number; max: number; format?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="setting-row">
      <span className="grow">{label}</span>
      <button className="btn sm" style={{ width: 40 }} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label={`Less ${label}`}>−</button>
      <span className="num" style={{ minWidth: 56, textAlign: 'center', fontWeight: 650 }}>{format ? format(value) : value}</span>
      <button className="btn sm" style={{ width: 40 }} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label={`More ${label}`}>+</button>
    </div>
  )
}

function RoundsLogger({ d, update }: { d: RoundsDraft; update: (p: Partial<RoundsDraft>) => void }) {
  const started = d.watch.startedAt !== null
  const running = started && d.watch.pausedAt === null && !d.stopped
  useWakeLock(running)
  const now = useNow(200, running)
  const state = roundStateAt(d.config, elapsedOf(d.watch, now))
  const prev = useRef<RoundState | null>(null)
  const ended = useRef(false)

  useEffect(() => {
    if (!running) {
      prev.current = state
      return
    }
    if (prev.current) {
      const cue = cueBetween(prev.current, state)
      if (cue) playCue(cue)
    }
    prev.current = state
    if (state.phase === 'DONE' && !ended.current) {
      ended.current = true
      update({ stopped: true, watch: pauseWatch(d.watch) })
    }
  })

  const setCfg = (p: Partial<RoundConfig>) => update({ config: { ...d.config, ...p } })

  if (!started) {
    return (
      <>
        <div className="card list">
          <Stepper label="Rounds" value={d.config.rounds} step={1} min={1} max={30} onChange={(v) => setCfg({ rounds: v })} />
          <Stepper label="Work" value={d.config.work_sec} step={15} min={15} max={600} format={formatHMS} onChange={(v) => setCfg({ work_sec: v })} />
          <Stepper label="Rest" value={d.config.rest_sec} step={15} min={0} max={300} format={formatHMS} onChange={(v) => setCfg({ rest_sec: v })} />
          <Stepper label="Warning before end" value={d.config.warn_sec} step={5} min={0} max={30} format={(v) => `${v}s`} onChange={(v) => setCfg({ warn_sec: v })} />
        </div>
        <div className="row tiny faint" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          {[
            ['Boxing 6×3:00', { rounds: 6, work_sec: 180, rest_sec: 60 }],
            ['Bag 5×2:00', { rounds: 5, work_sec: 120, rest_sec: 45 }],
            ['Tabata 8×0:20', { rounds: 8, work_sec: 20, rest_sec: 10, warn_sec: 3 }],
            ['EMOM 10', { rounds: 10, work_sec: 60, rest_sec: 0, warn_sec: 5 }],
          ].map(([label, p]) => (
            <button key={label as string} className="chip" style={{ height: 28 }} onClick={() => setCfg(p as Partial<RoundConfig>)}>{label as string}</button>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Total {formatHMS(totalRoundSeconds(d.config))} including a {d.config.prep_sec}s get-ready. Single bell to start each round, double clack at the warning, triple bell to end it.
        </p>
        <button className="btn primary lg block" style={{ marginTop: 14 }} onClick={() => { primeAudio(); update({ watch: startWatch(d.watch) }) }}>
          Start timer
        </button>
      </>
    )
  }

  const ps = PHASE_STYLE[state.phase]
  const pct = state.phaseLength ? 1 - state.remaining / state.phaseLength : 1
  return (
    <>
      <div className="card" style={{ padding: '24px 16px', textAlign: 'center', borderColor: ps.color, boxShadow: `inset 0 0 0 1px ${ps.color}` }}>
        <div className="eyebrow" style={{ color: ps.color, fontSize: 13 }}>{ps.label}</div>
        <div className="num" style={{ fontSize: 'min(26vw, 120px)', fontWeight: 750, lineHeight: 1, letterSpacing: '-0.04em', margin: '6px 0', color: state.warning ? 'var(--warn-text)' : undefined }}>
          {state.phase === 'DONE' ? formatHMS(d.config.rounds * d.config.work_sec) : formatHMS(Math.ceil(state.remaining))}
        </div>
        <div className="num" style={{ fontSize: 20, fontWeight: 650 }}>
          Round {state.round} / {d.config.rounds}
        </div>
        <div className="dock-progress" style={{ position: 'static', height: 6, background: 'var(--surface-3)', borderRadius: 3, marginTop: 16 }}>
          <div style={{ width: `${pct * 100}%`, background: ps.color, borderRadius: 3 }} />
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 14 }}>
          {Array.from({ length: d.config.rounds }, (_, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: 5, background: i < state.completed ? 'var(--accent)' : 'var(--surface-3)' }} />
          ))}
        </div>
      </div>
      {!d.stopped && (
        <div className="row" style={{ marginTop: 12 }}>
          {d.watch.pausedAt ? (
            <button className="btn primary lg grow" onClick={() => update({ watch: startWatch(d.watch) })}>Resume</button>
          ) : (
            <button className="btn lg grow" onClick={() => update({ watch: pauseWatch(d.watch) })}>Pause</button>
          )}
          <button className="btn lg grow" onClick={() => update({ stopped: true, watch: pauseWatch(d.watch) })}>End early</button>
        </div>
      )}
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="combos">Combinations &amp; technique notes</label>
        <textarea id="combos" className="input" rows={2} value={d.combos} placeholder="e.g. jab-cross-hook, slip-roll" onChange={(e) => update({ combos: e.target.value })} />
      </div>
    </>
  )
}

// ─── Climbing ───────────────────────────────────────────────────────────────

type ClimbDraft = Extract<Draft, { kind: 'CLIMB_BOULDER' }>
const ANGLES: { v: WallAngle; label: string }[] = [
  { v: 'SLAB', label: 'Slab' },
  { v: 'VERTICAL', label: 'Vert' },
  { v: 'OVERHANG', label: 'Overhang' },
  { v: 'ROOF', label: 'Roof' },
]

function ClimbLogger({ d, update }: { d: ClimbDraft; update: (p: Partial<ClimbDraft>) => void }) {
  const [attempts, setAttempts] = useState(1)
  const grades = d.scale === 'V' ? V_GRADES : YDS_GRADES
  const stats = climbStats(d.climbs)
  const log = (outcome: ClimbLog['outcome']) => {
    if (!d.grade) return
    update({ climbs: [...d.climbs, { grade: d.grade, outcome, attempts: outcome === 'FLASH' ? 1 : attempts, angle: d.angle }] })
    setAttempts(1)
  }
  return (
    <>
      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="seg">
          <button aria-pressed={d.scale === 'V'} onClick={() => update({ scale: 'V', grade: null })}>Boulder (V)</button>
          <button aria-pressed={d.scale === 'YDS'} onClick={() => update({ scale: 'YDS', grade: null })}>Rope (YDS)</button>
        </div>
      </div>
      <div className="card card-pad">
        <div className="eyebrow">1 · Grade</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {grades.map((g) => (
            <button key={g} className={`chip${d.grade === g ? ' accent' : ''}`} style={{ height: 36, padding: '0 12px', fontSize: 14 }} aria-pressed={d.grade === g} onClick={() => update({ grade: g })}>
              {g}
            </button>
          ))}
        </div>
        <div className="eyebrow" style={{ marginTop: 16 }}>2 · Wall</div>
        <div className="seg" style={{ marginTop: 8 }}>
          {ANGLES.map((a) => (
            <button key={a.v} aria-pressed={d.angle === a.v} onClick={() => update({ angle: a.v })}>{a.label}</button>
          ))}
        </div>
        <div className="spread" style={{ marginTop: 16 }}>
          <div className="eyebrow">3 · Outcome</div>
          <div className="row small">
            <span className="muted">Attempts</span>
            <button className="btn sm" style={{ width: 34 }} onClick={() => setAttempts((a) => Math.max(1, a - 1))} aria-label="Fewer attempts">−</button>
            <span className="num" style={{ minWidth: 20, textAlign: 'center', fontWeight: 650 }}>{attempts}</span>
            <button className="btn sm" style={{ width: 34 }} onClick={() => setAttempts((a) => a + 1)} aria-label="More attempts">+</button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn grow primary" disabled={!d.grade} onClick={() => log('FLASH')}>Flash</button>
          <button className="btn grow ink" disabled={!d.grade} onClick={() => log('SEND')}>Send</button>
          <button className="btn grow" disabled={!d.grade} onClick={() => log('ATTEMPT')}>Attempt</button>
        </div>
      </div>

      <div className="section-title">
        <h2>Session</h2>
        <span className="small num muted">{stats.sends}/{stats.problems} sent · {stats.sendRate}% · {stats.points} pts</span>
      </div>
      {d.climbs.length === 0 ? (
        <div className="empty small card">Pick a grade, then tap the outcome.</div>
      ) : (
        <div className="card list">
          {[...d.climbs].reverse().map((c, ri) => {
            const i = d.climbs.length - 1 - ri
            return (
              <div key={i} className="result-row">
                <span className="num" style={{ fontWeight: 700, minWidth: 54 }}>{c.grade}</span>
                <span className="grow small muted">{ANGLES.find((a) => a.v === c.angle)?.label} · {c.attempts} {c.attempts === 1 ? 'try' : 'tries'}</span>
                <span className={`chip ${c.outcome === 'ATTEMPT' ? '' : 'accent'}`}>{c.outcome.toLowerCase()}</span>
                <button className="icon-btn" aria-label="Remove climb" onClick={() => update({ climbs: d.climbs.filter((_, j) => j !== i) })}><Icon name="x" size={16} /></button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// ─── Timed holds ────────────────────────────────────────────────────────────

type HoldDraft = Extract<Draft, { kind: 'DURATION_HOLD' }>
function HoldLogger({ d, update, ex }: { d: HoldDraft; update: (p: Partial<HoldDraft>) => void; ex: ExerciseDef }) {
  const running = d.watch.startedAt !== null
  useWakeLock(running)
  const now = useNow(200, running)
  const elapsed = elapsedOf(d.watch, now)
  const remaining = d.target - elapsed

  const finished = useRef<number | null>(null)
  const finishSet = (sec: number) => {
    if (finished.current === d.watch.startedAt) return
    finished.current = d.watch.startedAt
    update({ sets: [...d.sets, Math.round(sec)], watch: idleWatch() })
    timer.start(ex.default_rest_sec, `Next ${ex.name} set`, null)
  }
  useEffect(() => {
    if (running && remaining <= 0 && finished.current !== d.watch.startedAt) {
      chime(2)
      finishSet(d.target)
    }
  })

  return (
    <>
      <div className="card list">
        <div className="setting-row">
          <span className="grow">Target</span>
          <div className="seg">
            {[20, 30, 45, 60, 90].map((s) => (
              <button key={s} aria-pressed={d.target === s} disabled={running} onClick={() => update({ target: s })}>{s}s</button>
            ))}
          </div>
        </div>
        <Stepper label="Added weight (lb)" value={d.added} step={5} min={0} max={200} onChange={(v) => update({ added: v })} />
      </div>
      <div className="card card-pad" style={{ marginTop: 12, textAlign: 'center' }}>
        <div className="num" style={{ fontSize: 72, fontWeight: 750, lineHeight: 1 }}>{formatHMS(Math.ceil(running ? Math.max(0, remaining) : d.target))}</div>
        <div className="small muted" style={{ marginTop: 6 }}>Set {d.sets.length + 1}</div>
        {running ? (
          <button className="btn lg ink" style={{ marginTop: 16, minWidth: 180 }} onClick={() => finishSet(elapsed)}>Stop early ({formatHMS(elapsed)})</button>
        ) : (
          <button className="btn lg primary" style={{ marginTop: 16, minWidth: 180 }} onClick={() => { primeAudio(); timer.clear(); update({ watch: startWatch(idleWatch()) }) }}>Start hold</button>
        )}
      </div>
      <SetList items={d.sets.map((s) => `${formatHMS(s)}${d.added ? ` · +${d.added} lb` : ''}`)} met={d.sets.map((s) => s >= d.target)} onRemove={(i) => update({ sets: d.sets.filter((_, j) => j !== i) })} />
    </>
  )
}

// ─── Bodyweight reps ────────────────────────────────────────────────────────

type BwDraft = Extract<Draft, { kind: 'BODYWEIGHT_REPS' }>
function BodyweightLogger({ d, update, ex }: { d: BwDraft; update: (p: Partial<BwDraft>) => void; ex: ExerciseDef }) {
  return (
    <>
      <div className="card list">
        <Stepper label="Reps" value={d.reps} step={1} min={1} max={100} onChange={(v) => update({ reps: v })} />
        <Stepper label="Load (lb)" value={d.added} step={5} min={-150} max={150} format={(v) => (v > 0 ? `+${v}` : v < 0 ? `${v} assist` : 'BW')} onChange={(v) => update({ added: v })} />
      </div>
      <button
        className="btn primary lg block"
        style={{ marginTop: 12 }}
        onClick={() => {
          update({ sets: [...d.sets, { reps: d.reps, added: d.added }] })
          timer.start(ex.default_rest_sec, `Next ${ex.name} set`, null)
        }}
      >
        Log set {d.sets.length + 1}: {d.reps} reps
      </button>
      <SetList
        items={d.sets.map((s) => `${s.reps} reps${s.added > 0 ? ` · +${fmtWeight(s.added)} lb` : s.added < 0 ? ` · ${fmtWeight(-s.added)} lb assist` : ''}`)}
        onRemove={(i) => update({ sets: d.sets.filter((_, j) => j !== i) })}
      />
    </>
  )
}

function SetList({ items, met, onRemove }: { items: string[]; met?: boolean[]; onRemove: (i: number) => void }) {
  if (!items.length) return null
  return (
    <>
      <div className="section-title"><h2>Sets</h2><span className="tiny faint">{items.length} logged</span></div>
      <div className="card list">
        {items.map((t, i) => (
          <div key={i} className="result-row">
            <span className="faint small num" style={{ width: 20 }}>{i + 1}</span>
            <span className="grow num">{t}</span>
            {met && <span className={`chip ${met[i] ? 'accent' : 'warn'}`}>{met[i] ? 'Target' : 'Short'}</span>}
            <button className="icon-btn" aria-label="Remove set" onClick={() => onRemove(i)}><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── History detail ─────────────────────────────────────────────────────────

export function ActivityDetail({ session }: { session: WorkoutSession }) {
  const entries = useSessionEntries(session.id)
  if (!entries) return null
  const exId = entries[0]?.exercise_id
  const ex = exId ? getExercise(exId) : null
  const sorted = [...entries].sort((a, b) => a.set_number - b.set_number)
  let body: ReactNode = null
  let stats: [string, string][] = []

  switch (ex?.tracking_archetype) {
    case 'DISTANCE_PACE': {
      const total = sorted.find((e) => e.set_type === 'WORKING')
      const laps = sorted.filter((e) => e.set_type === 'INTERVAL_ROUND')
      const unit = (total?.distance_unit ?? 'mi') as DistanceUnit
      stats = [
        ['Distance', total?.distance_value ? `${total.distance_value} ${unit}` : '—'],
        ['Time', formatHMS(total?.work_duration_sec ?? 0)],
        ['Pace', formatPace(total?.pace_sec_per_unit ?? null, unit)],
      ]
      if (total?.elevation_gain_ft) stats.push(['Elevation', `${total.elevation_gain_ft} ft`])
      if (total?.pack_weight_lbs) stats.push(['Pack', `${total.pack_weight_lbs} lb`])
      if (total?.avg_heart_rate_bpm) stats.push(['Avg HR', `${total.avg_heart_rate_bpm} bpm`])
      if (total?.hr_zone) stats.push(['Zone', `Z${total.hr_zone}`])
      if (laps.length) body = <Rows rows={laps.map((l, i) => [`Lap ${i + 1}`, formatHMS(l.work_duration_sec ?? 0)])} />
      break
    }
    case 'ROUNDS_INTERVAL': {
      const done = sorted.filter((e) => e.rounds_completed).length
      const work = sorted.reduce((n, e) => n + (e.work_duration_sec ?? 0), 0)
      stats = [
        ['Rounds', `${done} / ${sorted[0]?.total_rounds_target ?? done}`],
        ['Work time', formatHMS(work)],
        ['Round', `${formatHMS(sorted[0]?.work_duration_sec ?? 0)} / ${formatHMS(sorted[0]?.rest_duration_sec ?? 0)} rest`],
      ]
      break
    }
    case 'CLIMB_BOULDER': {
      const s = climbStats(sorted.map((e) => ({ grade: e.climb_grade ?? '', outcome: (e.send_status ?? 'ATTEMPT') as ClimbLog['outcome'], attempts: e.attempts_count ?? 1 })))
      stats = [
        ['Sent', `${s.sends} / ${s.problems}`],
        ['Send rate', `${s.sendRate}%`],
        ['Hardest', s.hardest ?? '—'],
        ['Points', String(s.points)],
      ]
      body = <Rows rows={sorted.map((e) => [`${e.climb_grade} · ${(e.wall_angle ?? '').toLowerCase()}`, `${(e.send_status ?? '').toLowerCase()} · ${e.attempts_count ?? 1}×`])} />
      break
    }
    case 'DURATION_HOLD':
      stats = [['Sets', String(sorted.length)], ['Total', formatHMS(sorted.reduce((n, e) => n + (e.work_duration_sec ?? 0), 0))]]
      body = <Rows rows={sorted.map((e, i) => [`Set ${i + 1}`, `${formatHMS(e.work_duration_sec ?? 0)}${e.actual_weight_lbs ? ` · +${e.actual_weight_lbs} lb` : ''}`])} />
      break
    case 'BODYWEIGHT_REPS':
      stats = [['Sets', String(sorted.length)], ['Total reps', String(sorted.reduce((n, e) => n + (e.actual_reps ?? 0), 0))]]
      body = <Rows rows={sorted.map((e, i) => [`Set ${i + 1}`, `${e.actual_reps} reps${e.actual_weight_lbs ? ` · ${e.actual_weight_lbs > 0 ? '+' : ''}${e.actual_weight_lbs} lb` : ''}`])} />
      break
  }

  return (
    <>
      <div className="card card-pad">
        <div className="eyebrow">
          {new Date(session.started_at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · {fmtDuration(session.duration_seconds)}
          {session.session_rpe ? ` · RPE ${session.session_rpe}` : ''}
        </div>
        <h1 className="page-title" style={{ marginTop: 4 }}>{session.title}</h1>
        <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', marginTop: 14 }}>
          {stats.map(([k, v]) => (
            <div key={k}>
              <div className="eyebrow">{k}</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      {body && <div style={{ marginTop: 12 }}>{body}</div>}
      {session.notes && <p className="small muted" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>“{session.notes}”</p>}
    </>
  )
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="card list">
      {rows.map(([a, b], i) => (
        <div key={i} className="spread result-row">
          <span className="muted">{a}</span>
          <span className="num">{b}</span>
        </div>
      ))}
    </div>
  )
}

export const ARCHETYPE_ICON: Partial<Record<TrackingArchetype, IconName>> = Object.fromEntries(ARCH.map((a) => [a.arch, a.icon]))
