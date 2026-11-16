import { useMemo, useState } from 'react'
import type { ActiveWorkout } from '../data/db'
import { discardWorkout, finishWorkout, patchActive, startWorkout } from '../data/repo'
import { getExercise } from '../domain/catalog'
import { PHASES, ROTATION_LABEL, rotationAt } from '../domain/program'
import type { ExerciseState, PlannedExercise, Profile, WorkoutSession } from '../domain/types'
import { calculatePlatesPerSide, describePlates } from '../engine/plates'
import { buildSessionPlan, prescriptionLabel } from '../engine/plan'
import { incrementFor } from '../engine/progression'
import { projectSchedule, relativeDayLabel, toISODate } from '../engine/schedule'
import { fmtWeight } from './hooks'
import { Icon } from './Icon'
import { PlateGraphic } from './PlateGraphic'
import { Sheet } from './Sheet'
import { timer, useTimer, useWakeLock } from './timer'

const MISSED_REST_SEC = 270

// ─── Preview (no workout running) ───────────────────────────────────────────

export function SessionPreview({
  profile,
  states,
  sessions,
  onStarted,
}: {
  profile: Profile
  states: Record<string, ExerciseState>
  sessions: WorkoutSession[]
  onStarted?: () => void
}) {
  const plan = useMemo(() => buildSessionPlan(profile, states), [profile, states])
  const def = PHASES[profile.current_phase]
  const programSessions = sessions.filter((s) => s.rotation_code && s.rotation_code !== 'CUSTOM')
  const last = programSessions[0]?.session_date ?? null
  const today = new Date()
  const [nextDate] = projectSchedule(profile.current_phase, last, today, 1)
  const [busy, setBusy] = useState(false)

  return (
    <>
      <div className="card">
        <div className="next-hero">
          <div className="spread">
            <span className="eyebrow">Session {programSessions.length + 1} · Next up</span>
            <span className="chip">
              <Icon name="calendar" size={12} /> {relativeDayLabel(nextDate, today)}
            </span>
          </div>
          <h1 className="title" style={{ marginTop: 8 }}>{plan.title}</h1>
          <div className="meta-row">
            <span>{plan.subtitle}</span>
            <span><Icon name="clock" size={14} /> ~{def.target_duration_minutes} min</span>
            <span>{plan.exercises.length} exercises</span>
          </div>
          <button
            className="btn primary lg block"
            style={{ marginTop: 18 }}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await startWorkout()
              onStarted?.()
              setBusy(false)
            }}
          >
            Start workout
          </button>
        </div>
        <div className="list" style={{ borderTop: '1px solid var(--line)' }}>
          {plan.exercises.map((ex) => (
            <div key={ex.key} className="preview-row">
              <span className="order num">{ex.order}</span>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{ex.name}</div>
                <div className="small muted">
                  <span className="num">{prescriptionLabel(ex)}</span>
                  {ex.superset_group && <span> · superset {ex.superset_group.endsWith('2') ? 2 : 1}</span>}
                  {ex.warmups.length > 0 && (
                    <span className="faint"> · warmup {ex.warmups.map((w) => fmtWeight(w.weight_lbs)).join(' → ')}</span>
                  )}
                </div>
              </div>
              <div className="w num">
                {fmtWeight(ex.weight_lbs)}
                <span className="faint small"> lb{ex.per_hand ? '/hand' : ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export function UpNextList({ profile, sessions, live = false }: { profile: Profile; sessions: WorkoutSession[]; live?: boolean }) {
  const last = sessions.find((s) => s.rotation_code && s.rotation_code !== 'CUSTOM')?.session_date ?? null
  const today = new Date()
  // While a workout is running, it occupies today and the projection starts after it.
  const dates = live
    ? [today, ...projectSchedule(profile.current_phase, toISODate(today), today, 5)]
    : projectSchedule(profile.current_phase, last, today, 6)
  return (
    <div className="list">
      {dates.map((d, i) => {
        const code = rotationAt(profile.next_rotation_index + i)
        return (
          <div key={i} className="stream-row">
            <span className="when">{relativeDayLabel(d, today)}</span>
            <div className="grow">
              <div style={{ fontWeight: i === 0 ? 650 : 500 }}>{ROTATION_LABEL[code]}</div>
            </div>
            {i === 0 && <span className="chip accent">{live ? 'In progress' : 'Next'}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Active workout ─────────────────────────────────────────────────────────

const setRef = (key: string, i: number) => `${key}#${i}`

function restFor(ex: PlannedExercise, reps: number, target: number): { sec: number; missed: boolean } {
  void target
  const missed = reps < ex.reps_min
  if (ex.is_primary) return { sec: missed ? MISSED_REST_SEC : ex.rest_sec, missed }
  return { sec: ex.rest_sec, missed }
}

/** Where the lifter goes next: superset partner first, then remaining sets in order. */
function nextPending(active: ActiveWorkout, from: PlannedExercise): string | null {
  const exs = active.plan.exercises
  const pending = (e: PlannedExercise) => active.log.reps[e.key].findIndex((r) => r === null)
  if (from.superset_group) {
    const group = exs.filter((e) => e.superset_group === from.superset_group)
    const partner = group.find((e) => e.key !== from.key && pending(e) >= 0)
    if (partner) return `${partner.name} · set ${pending(partner) + 1}`
  }
  if (pending(from) >= 0) return `${from.name} · set ${pending(from) + 1}`
  for (const e of exs) if (pending(e) >= 0) return `${e.name} · set ${pending(e) + 1}`
  return null
}

export function ActiveWorkoutView({ active, profile, onFinished }: { active: ActiveWorkout; profile: Profile; onFinished: (id: string) => void }) {
  useWakeLock(true)
  const [weightFor, setWeightFor] = useState<PlannedExercise | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const tapSet = (ex: PlannedExercise, i: number) => {
    const cur = active.log.reps[ex.key][i]
    const target = ex.sets[i].target_reps
    const next = cur === null ? target : cur > 0 ? cur - 1 : null
    void patchActive((a) => {
      a.log.reps[ex.key][i] = next
      a.focus = next === null ? null : { key: ex.key, set: i }
    })
    const ref = setRef(ex.key, i)
    if (next === null) {
      if (timer.get()?.ref === ref) timer.clear()
      return
    }
    const { sec, missed } = restFor(ex, next, target)
    const after: ActiveWorkout = { ...active, log: { ...active.log, reps: { ...active.log.reps, [ex.key]: active.log.reps[ex.key].map((r, j) => (j === i ? next : r)) } } }
    const up = nextPending(after, ex)
    const label = missed ? `Missed reps — rest longer${up ? ` · next ${up}` : ''}` : up ? `Next: ${up}` : 'Last set logged'
    if (sec <= 0) return
    if (cur === null) timer.start(sec, label, ref, missed)
    else timer.retime(ref, sec, label, missed)
  }

  const stepSet = (ex: PlannedExercise, i: number, delta: number) => {
    void patchActive((a) => {
      const cur = a.log.reps[ex.key][i] ?? ex.sets[i].target_reps
      a.log.reps[ex.key][i] = Math.max(0, Math.min(50, cur + delta))
    })
  }

  const toggleWarmup = (ex: PlannedExercise, i: number) => {
    const done = !active.warmups_done[ex.key]?.[i]
    void patchActive((a) => {
      a.warmups_done[ex.key][i] = done
    })
    if (done) {
      const w = ex.warmups[i]
      const nextW = ex.warmups[i + 1]
      timer.start(w.rest_sec, nextW ? `Next warmup: ${fmtWeight(nextW.weight_lbs)} × ${nextW.reps_label}` : `Next: working sets @ ${fmtWeight(ex.weight_lbs)} lb`, `${ex.key}#w${i}`)
    }
  }

  const toggleReadiness = (id: string) =>
    void patchActive((a) => {
      a.readiness_done = a.readiness_done.includes(id) ? a.readiness_done.filter((x) => x !== id) : [...a.readiness_done, id]
    })

  // Group consecutive superset members.
  const blocks: PlannedExercise[][] = []
  for (const ex of active.plan.exercises) {
    const last = blocks.at(-1)
    if (ex.superset_group && last && last[0].superset_group === ex.superset_group) last.push(ex)
    else blocks.push([ex])
  }

  const totalSets = active.plan.exercises.reduce((n, e) => n + e.sets.length, 0)
  const doneSets = Object.values(active.log.reps).flat().filter((r) => r !== null).length
  const readyDone = active.readiness_done.length
  const readyTotal = active.plan.readiness.length

  return (
    <>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">In progress · {doneSets}/{totalSets} sets</div>
          <h1 className="page-title" style={{ marginTop: 2 }}>{active.plan.title}</h1>
        </div>
        <button className="btn sm ghost danger" onClick={() => setConfirmDiscard(true)}>Discard</button>
      </div>

      <details className="card drawer" open={readyDone < readyTotal}>
        <summary>
          <span className={`check${readyDone === readyTotal ? ' on' : ''}`}><Icon name="check" size={14} /></span>
          Readiness warmup
          <span className="faint small num">{readyDone}/{readyTotal}</span>
          <Icon name="chevron" className="chev" />
        </summary>
        {active.plan.readiness.map((r) => {
          const on = active.readiness_done.includes(r.id)
          return (
            <button key={r.id} className="check-row" onClick={() => toggleReadiness(r.id)} aria-pressed={on}>
              <span className={`check${on ? ' on' : ''}`}><Icon name="check" size={14} /></span>
              <span>
                <span style={{ fontWeight: 600 }}>{r.label}</span>
                <span className="small muted" style={{ display: 'block' }}>{r.detail}</span>
              </span>
            </button>
          )
        })}
      </details>

      {blocks.map((block) =>
        block.length > 1 ? (
          <div key={block[0].key} className="superset">
            <div className="superset-head">
              <span className="chip info">Superset</span>
              <span className="small muted">Alternate sets · rest after {block.at(-1)!.name.split(' ').slice(-2).join(' ')}</span>
            </div>
            {block.map((ex, i) => (
              <ExerciseCard key={ex.key} ex={ex} label={String.fromCharCode(65 + i)} active={active} profile={profile} onTap={tapSet} onStep={stepSet} onWarmup={toggleWarmup} onWeight={setWeightFor} />
            ))}
          </div>
        ) : (
          <ExerciseCard key={block[0].key} ex={block[0]} active={active} profile={profile} onTap={tapSet} onStep={stepSet} onWarmup={toggleWarmup} onWeight={setWeightFor} />
        ),
      )}

      <button className="btn ink lg block" style={{ marginTop: 20 }} onClick={() => setFinishing(true)}>
        Finish workout
      </button>
      <p className="small faint" style={{ textAlign: 'center', marginTop: 10 }}>
        Tap a set once to log the target · tap again to remove a rep
      </p>

      {weightFor && <WeightSheet ex={weightFor} active={active} profile={profile} onClose={() => setWeightFor(null)} />}
      {finishing && (
        <FinishSheet
          active={active}
          profile={profile}
          onClose={() => setFinishing(false)}
          onDone={(id) => {
            setFinishing(false)
            timer.clear()
            onFinished(id)
          }}
        />
      )}
      {confirmDiscard && (
        <Sheet title="Discard this workout?" onClose={() => setConfirmDiscard(false)}>
          <p className="muted">Logged sets will be deleted. Weights, gate progress and the rotation stay exactly where they were.</p>
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn grow" onClick={() => setConfirmDiscard(false)}>Keep going</button>
            <button
              className="btn grow"
              style={{ background: 'var(--danger)', color: '#fff', borderColor: 'transparent' }}
              onClick={async () => {
                timer.clear()
                await discardWorkout()
              }}
            >
              Discard
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function ExerciseCard({
  ex,
  label,
  active,
  profile,
  onTap,
  onStep,
  onWarmup,
  onWeight,
}: {
  ex: PlannedExercise
  label?: string
  active: ActiveWorkout
  profile: Profile
  onTap: (ex: PlannedExercise, i: number) => void
  onStep: (ex: PlannedExercise, i: number, d: number) => void
  onWarmup: (ex: PlannedExercise, i: number) => void
  onWeight: (ex: PlannedExercise) => void
}) {
  const reps = active.log.reps[ex.key]
  const weight = active.log.weights[ex.key] ?? ex.weight_lbs
  const edited = weight !== ex.weight_lbs
  const focus = active.focus?.key === ex.key ? active.focus.set : null
  const warmDone = active.warmups_done[ex.key] ?? []
  const allWarm = warmDone.length > 0 && warmDone.every(Boolean)
  const t = useTimer()

  return (
    <section className="card ex-card" aria-label={ex.name}>
      <div className="ex-head">
        <div className="grow">
          <div className="row" style={{ gap: 6, marginBottom: 3 }}>
            {label && <span className="chip">{label}</span>}
            {ex.is_primary && <span className="chip accent">Main lift</span>}
            <span className="small muted num">{prescriptionLabel(ex)}</span>
          </div>
          <h3 className="ex-name">{ex.name}</h3>
        </div>
        <button className={`weight-btn${edited ? ' edited' : ''}`} onClick={() => onWeight(ex)} aria-label={`Weight ${weight} pounds. Adjust or show plates`}>
          <span className="v num">{fmtWeight(weight)}</span>
          <span className="u">{ex.per_hand ? 'lb / hand' : 'lb'}{ex.equipment === 'BARBELL' ? ' · plates' : ''}</span>
        </button>
      </div>

      {ex.warmups.length > 0 && (
        <details className="drawer" open={!allWarm} style={{ borderTop: '1px solid var(--line)' }}>
          <summary style={{ minHeight: 40, padding: '8px 16px', fontSize: 14 }}>
            <span className="muted">{ex.is_primary ? 'Warmup ramp' : 'Feeler set · optional'}</span>
            <span className="faint small num">{warmDone.filter(Boolean).length}/{ex.warmups.length}</span>
            <Icon name="chevron" className="chev" />
          </summary>
          <div className="warmup-list">
            {ex.warmups.map((w, i) => (
              <div key={i} className="warmup-row">
                <button
                  className={`set-circle warmup${warmDone[i] ? ' done' : ''}`}
                  onClick={() => onWarmup(ex, i)}
                  aria-pressed={!!warmDone[i]}
                  aria-label={`Warmup ${i + 1}: ${w.weight_lbs} pounds for ${w.reps_label} reps`}
                >
                  {w.reps}
                </button>
                <div className="grow">
                  <div className="num" style={{ fontWeight: 600 }}>{fmtWeight(w.weight_lbs)} lb × {w.reps_label}</div>
                  <div className="tiny faint">
                    {w.note ?? describePlates(calculatePlatesPerSide(w.weight_lbs, profile.barbell_weight_lbs, profile.plates_lbs))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="sets" style={ex.warmups.length ? { paddingTop: 12, borderTop: '1px solid var(--line)' } : undefined}>
        {ex.sets.map((s, i) => {
          const r = reps[i]
          const target = s.target_reps
          const cls = r === null ? '' : r >= ex.reps_min ? ' done' : ' miss'
          const running = t?.ref === setRef(ex.key, i) && !t.fired
          return (
            <button
              key={i}
              className={`set-circle${cls}${focus === i ? ' focus' : ''}`}
              onClick={() => onTap(ex, i)}
              aria-label={`Set ${i + 1}${s.is_amrap ? ' AMRAP' : ''}: ${r === null ? `not logged, target ${target}` : `${r} reps`}`}
              style={running ? { outline: `2px solid ${cls === ' miss' ? 'var(--warn)' : 'var(--accent)'}`, outlineOffset: 3 } : undefined}
            >
              {r ?? target}
              {s.is_amrap && <span className="plus">+</span>}
            </button>
          )
        })}
      </div>

      {focus !== null && reps[focus] !== null && (
        <div className="stepper">
          <span className="small muted grow">
            Set {focus + 1}
            {ex.sets[focus].is_amrap ? ' · AMRAP — log every clean rep' : ex.reps_min !== ex.reps_max ? ` · target ${ex.reps_min}–${ex.reps_max}` : ''}
          </span>
          <button className="btn" onClick={() => onStep(ex, focus, -1)} aria-label="One fewer rep">−</button>
          <span className="num" style={{ fontSize: 22, fontWeight: 700, minWidth: 34, textAlign: 'center' }}>{reps[focus]}</span>
          <button className="btn" onClick={() => onStep(ex, focus, 1)} aria-label="One more rep">+</button>
        </div>
      )}
    </section>
  )
}

function WeightSheet({ ex, active, profile, onClose }: { ex: PlannedExercise; active: ActiveWorkout; profile: Profile; onClose: () => void }) {
  const weight = active.log.weights[ex.key] ?? ex.weight_lbs
  const inc = ex.equipment === 'BARBELL' ? 5 : incrementFor(ex.exercise_id, weight, profile)
  const setW = (w: number) =>
    void patchActive((a) => {
      for (const e of a.plan.exercises) if (e.exercise_id === ex.exercise_id) a.log.weights[e.key] = w
    })
  const def = getExercise(ex.exercise_id)
  const nextInc = incrementFor(ex.exercise_id, weight, profile)
  return (
    <Sheet title={ex.name} onClose={onClose}>
      {ex.equipment === 'BARBELL' && weight >= profile.barbell_weight_lbs && (
        <PlateGraphic weight={weight} bar={profile.barbell_weight_lbs} plates={profile.plates_lbs} />
      )}
      <div className="card card-pad" style={{ marginTop: 14 }}>
        <div className="spread">
          <div>
            <div className="small muted">Today's weight{ex.per_hand ? ' (per hand)' : ''}</div>
            <div className="num" style={{ fontSize: 28, fontWeight: 700 }}>{fmtWeight(weight)} lb</div>
          </div>
          <div className="row">
            <button className="btn" style={{ width: 52 }} onClick={() => setW(Math.max(0, weight - inc))}>−{fmtWeight(inc)}</button>
            <button className="btn" style={{ width: 52 }} onClick={() => setW(weight + inc)}>+{fmtWeight(inc)}</button>
          </div>
        </div>
        {weight !== ex.weight_lbs && (
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setW(ex.weight_lbs)}>Reset to plan ({fmtWeight(ex.weight_lbs)} lb)</button>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        {ex.is_primary
          ? `Hit every set${ex.amrap_last_set ? ' and 5+ on the AMRAP' : ''} → +${nextInc} lb next time. Miss twice in a row → automatic 10% deload.`
          : `All sets at ${ex.reps_max} reps → +${fmtWeight(nextInc)} lb next time. Below ${ex.reps_min} two sessions running → drop one step.`}
      </p>
      {def.substitutions.length > 0 && (
        <p className="small faint" style={{ marginTop: 8 }}>Substitutes: {def.substitutions.join(' · ')}</p>
      )}
      <button className="btn block" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
    </Sheet>
  )
}

function FinishSheet({ active, profile, onClose, onDone }: { active: ActiveWorkout; profile: Profile; onClose: () => void; onDone: (id: string) => void }) {
  const [joint, setJoint] = useState<boolean | null>(null)
  const [rpe, setRpe] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const unlogged = Object.values(active.log.reps).flat().filter((r) => r === null).length
  const phase3 = profile.current_phase === 3
  const canFinish = !busy && (!phase3 || joint !== null)

  return (
    <Sheet title="Finish workout" onClose={onClose}>
      {unlogged > 0 && (
        <div className="card card-pad" style={{ background: 'var(--warn-soft)', borderColor: 'transparent', color: 'var(--warn-text)', marginBottom: 14 }}>
          <b>{unlogged} set{unlogged > 1 ? 's' : ''} not logged.</b> They count as 0 reps, so this session won't count toward the gate.
        </div>
      )}
      <div className="field">
        <span className="label">Any joint pain or lingering ache?{phase3 && ' (required in Phase 3)'}</span>
        <div className="seg" role="group">
          <button aria-pressed={joint === false} onClick={() => setJoint(false)}>No</button>
          <button aria-pressed={joint === true} onClick={() => setJoint(true)}>Yes</button>
        </div>
        {phase3 && <span className="tiny faint">In Phase 3 a "Yes" means this session doesn't count toward the gate.</span>}
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <span className="label">Session effort (RPE, optional)</span>
        <div className="seg" role="group">
          {[6, 7, 8, 9, 10].map((n) => (
            <button key={n} aria-pressed={rpe === n} onClick={() => setRpe(rpe === n ? null : n)}>{n}</button>
          ))}
        </div>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
      <button
        className="btn primary lg block"
        style={{ marginTop: 20 }}
        disabled={!canFinish}
        onClick={async () => {
          setBusy(true)
          const s = await finishWorkout({ joint_pain: joint, session_rpe: rpe, notes: notes.trim() || null })
          onDone(s.id)
        }}
      >
        Save &amp; calculate next session
      </button>
    </Sheet>
  )
}
