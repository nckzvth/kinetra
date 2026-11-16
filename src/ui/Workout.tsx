import { useState } from 'react'
import type { ActiveWorkout } from '../data/db'
import { addExerciseToActive, changeSetCount, discardWorkout, finishWorkout, patchActive, removeExerciseFromActive } from '../data/repo'
import { getExercise } from '../domain/catalog'
import { phaseOf } from '../domain/program'
import type { PlannedExercise, Profile, ProgramDef } from '../domain/types'
import { rulesFor } from '../domain/units'
import { calculatePlatesPerSide } from '../engine/plates'
import { prescriptionLabel } from '../engine/plan'
import { incrementFor } from '../engine/progression'
import { ExercisePicker } from './ExercisePicker'
import { fmtWeight } from './hooks'
import { Icon } from './Icon'
import { PlateGraphic } from './PlateGraphic'
import { Sheet, Stepper } from './Sheet'
import { timer, useTimer, useWakeLock } from './timer'

const MISSED_REST_SEC = 270
const setRef = (key: string, i: number) => `${key}#${i}`

function restFor(ex: PlannedExercise, reps: number): { sec: number; missed: boolean } {
  const missed = reps < ex.reps_min
  if (ex.is_primary) return { sec: missed ? MISSED_REST_SEC : ex.rest_sec, missed }
  return { sec: ex.rest_sec, missed }
}

/** Where the lifter goes next: superset partner first, then remaining sets in order. */
function nextPending(active: ActiveWorkout, from: PlannedExercise): string | null {
  const exs = active.plan.exercises
  const pending = (e: PlannedExercise) => active.log.reps[e.key]?.findIndex((r) => r === null) ?? -1
  if (from.superset_group) {
    const partner = exs.find((e) => e.superset_group === from.superset_group && e.key !== from.key && pending(e) >= 0)
    if (partner) return `${partner.name} · set ${pending(partner) + 1}`
  }
  if (pending(from) >= 0) return `${from.name} · set ${pending(from) + 1}`
  for (const e of exs) if (pending(e) >= 0) return `${e.name} · set ${pending(e) + 1}`
  return null
}

const plateText = (w: number, profile: Profile) => {
  const b = calculatePlatesPerSide(w, profile.barbell_weight_lbs, profile.plates_lbs)
  return b.platesPerSide.length ? `${b.platesPerSide.map((p) => (p.count > 1 ? `${p.count}×${fmtWeight(p.weight)}` : fmtWeight(p.weight))).join(' + ')} a side` : 'Empty bar'
}

export function ActiveWorkoutView({
  active,
  profile,
  program,
  onFinished,
}: {
  active: ActiveWorkout
  profile: Profile
  program: ProgramDef | null
  onFinished: (id: string) => void
}) {
  useWakeLock(true)
  const [weightFor, setWeightFor] = useState<PlannedExercise | null>(null)
  const [menuFor, setMenuFor] = useState<PlannedExercise | null>(null)
  const [adding, setAdding] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const unit = rulesFor(profile.unit_system).label

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
    const { sec, missed } = restFor(ex, next)
    const after: ActiveWorkout = { ...active, log: { ...active.log, reps: { ...active.log.reps, [ex.key]: active.log.reps[ex.key].map((r, j) => (j === i ? next : r)) } } }
    const up = nextPending(after, ex)
    const label = missed ? `Missed reps — rest longer${up ? ` · then ${up}` : ''}` : up ? `Next: ${up}` : 'Last set done'
    if (sec <= 0) return
    if (cur === null) timer.start(sec, label, ref, missed)
    else timer.retime(ref, sec, label, missed)
  }

  const stepSet = (ex: PlannedExercise, i: number, delta: number) =>
    void patchActive((a) => {
      const cur = a.log.reps[ex.key][i] ?? ex.sets[i].target_reps
      a.log.reps[ex.key][i] = Math.max(0, Math.min(99, cur + delta))
    })

  const toggleWarmup = (ex: PlannedExercise, i: number) => {
    const done = !active.warmups_done[ex.key]?.[i]
    void patchActive((a) => {
      a.warmups_done[ex.key] ??= ex.warmups.map(() => false)
      a.warmups_done[ex.key][i] = done
    })
    if (done) {
      const nextW = ex.warmups[i + 1]
      timer.start(ex.warmups[i].rest_sec, nextW ? `Next warm-up: ${fmtWeight(nextW.weight_lbs)} × ${nextW.reps_label}` : `Next: working sets at ${fmtWeight(ex.weight_lbs)} ${unit}`, `${ex.key}#w${i}`)
    }
  }

  const toggleReadiness = (id: string) =>
    void patchActive((a) => {
      a.readiness_done = a.readiness_done.includes(id) ? a.readiness_done.filter((x) => x !== id) : [...a.readiness_done, id]
    })

  const blocks: PlannedExercise[][] = []
  for (const ex of active.plan.exercises) {
    const last = blocks.at(-1)
    if (ex.superset_group && last && last[0].superset_group === ex.superset_group) last.push(ex)
    else blocks.push([ex])
  }

  const totalSets = active.plan.exercises.reduce((n, e) => n + e.sets.length, 0)
  const doneSets = active.plan.exercises.reduce((n, e) => n + (active.log.reps[e.key] ?? []).filter((r) => r !== null).length, 0)
  const readyDone = active.readiness_done.length
  const readyTotal = active.plan.readiness.length
  const card = (ex: PlannedExercise, label?: string) => (
    <ExerciseCard key={ex.key} ex={ex} label={label} active={active} profile={profile} onTap={tapSet} onStep={stepSet} onWarmup={toggleWarmup} onWeight={setWeightFor} onMenu={setMenuFor} />
  )

  return (
    <>
      <div className="spread" style={{ marginBottom: 2 }}>
        <span className="today-date">{doneSets} of {totalSets} sets</span>
        <button className="btn ghost danger" style={{ height: 32, padding: 0 }} onClick={() => setConfirmDiscard(true)}>Discard</button>
      </div>
      <h1 className="today-title">{active.plan.title}</h1>

      {readyTotal > 0 && (
        <details className="card drawer" style={{ marginTop: 14 }} open={readyDone === 0}>
          <summary>
            <span className={`check${readyDone === readyTotal ? ' on' : ''}`}><Icon name="check" size={14} /></span>
            Warm up
            <span className="tiny muted num">{readyDone}/{readyTotal}</span>
            <Icon name="chevron" className="chev" />
          </summary>
          {active.plan.readiness.map((r) => {
            const on = active.readiness_done.includes(r.id)
            return (
              <button key={r.id} className="check-row" onClick={() => toggleReadiness(r.id)} aria-pressed={on}>
                <span className={`check${on ? ' on' : ''}`}><Icon name="check" size={14} /></span>
                <span>
                  <span style={{ fontWeight: 500 }}>{r.label}</span>
                  <span className="small muted" style={{ display: 'block' }}>{r.detail}</span>
                </span>
              </button>
            )
          })}
        </details>
      )}

      {blocks.map((block) =>
        block.length > 1 ? (
          <div key={block[0].key} className="superset">
            <div className="superset-head">
              <span className="chip info">Superset</span>
              <span className="tiny muted">Alternate sets, rest after the last one</span>
            </div>
            {block.map((ex, i) => card(ex, String.fromCharCode(65 + i)))}
          </div>
        ) : (
          card(block[0])
        ),
      )}

      {active.plan.exercises.length === 0 && <div className="card empty" style={{ marginTop: 14 }}>Add your first exercise to get going.</div>}
      <button className="btn block" style={{ marginTop: 12, color: 'var(--tint)', background: 'var(--surface)' }} onClick={() => setAdding(true)}>
        <Icon name="plus" /> Add exercise
      </button>
      <button className="btn primary lg block" style={{ marginTop: 12 }} disabled={doneSets === 0} onClick={() => setFinishing(true)}>
        Finish workout
      </button>

      {adding && (
        <ExercisePicker
          onClose={() => setAdding(false)}
          onPick={(id) => {
            setAdding(false)
            void addExerciseToActive(id)
          }}
        />
      )}
      {weightFor && <WeightSheet ex={weightFor} active={active} profile={profile} onClose={() => setWeightFor(null)} />}
      {menuFor && (
        <Sheet title={menuFor.name} onClose={() => setMenuFor(null)} right={<button className="btn ghost" onClick={() => setMenuFor(null)}>Done</button>}>
          <div className="card list">
            <button className="cell" onClick={() => void changeSetCount(menuFor.key, 1)}><Icon name="plus" /> Add a set</button>
            <button className="cell" onClick={() => void changeSetCount(menuFor.key, -1)}><Icon name="minus" /> Remove last set</button>
            {getExercise(menuFor.exercise_id).equipment !== 'BODYWEIGHT' && (
              <button className="cell" onClick={() => { setWeightFor(menuFor); setMenuFor(null) }}><Icon name="scale" /> Change weight</button>
            )}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <button className="cell" style={{ color: 'var(--danger)' }} onClick={() => { void removeExerciseFromActive(menuFor.key); setMenuFor(null) }}>
              <Icon name="trash" /> Remove from today
            </button>
          </div>
          <p className="group-footer">These changes are for today only. To keep them, edit your program in You → Program.</p>
        </Sheet>
      )}
      {finishing && (
        <FinishSheet
          active={active}
          profile={profile}
          program={program}
          onClose={() => setFinishing(false)}
          onDone={(id) => {
            setFinishing(false)
            timer.clear()
            onFinished(id)
          }}
        />
      )}
      {confirmDiscard && (
        <Sheet title="Discard workout?" onClose={() => setConfirmDiscard(false)}>
          <p className="muted" style={{ textAlign: 'center', margin: '0 8px 18px' }}>Logged sets are deleted. Your weights and plan stay as they were.</p>
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn block" style={{ color: 'var(--danger)', background: 'var(--surface)' }} onClick={async () => { timer.clear(); await discardWorkout() }}>Discard workout</button>
            <button className="btn block" style={{ background: 'var(--surface)' }} onClick={() => setConfirmDiscard(false)}>Keep going</button>
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
  onMenu,
}: {
  ex: PlannedExercise
  label?: string
  active: ActiveWorkout
  profile: Profile
  onTap: (ex: PlannedExercise, i: number) => void
  onStep: (ex: PlannedExercise, i: number, d: number) => void
  onWarmup: (ex: PlannedExercise, i: number) => void
  onWeight: (ex: PlannedExercise) => void
  onMenu: (ex: PlannedExercise) => void
}) {
  const reps = active.log.reps[ex.key] ?? []
  const weight = active.log.weights[ex.key] ?? ex.weight_lbs
  const edited = weight !== ex.weight_lbs
  const focus = active.focus?.key === ex.key ? active.focus.set : null
  const warmDone = active.warmups_done[ex.key] ?? []
  const allWarm = warmDone.length > 0 && warmDone.every(Boolean)
  const t = useTimer()
  const unit = rulesFor(profile.unit_system).label
  const bodyweight = getExercise(ex.exercise_id).equipment === 'BODYWEIGHT'
  const divider = { boxShadow: 'inset 0 0.5px 0 0 var(--line-strong)' }

  return (
    <section className="card ex-card" aria-label={ex.name}>
      <div className="ex-head">
        <div className="grow">
          <h3 className="ex-name">{label && <span className="faint">{label} · </span>}{ex.name}</h3>
          <div className="small muted num" style={{ marginTop: 2 }}>{prescriptionLabel(ex)}</div>
        </div>
        {!bodyweight && (
          <button className={`weight-btn${edited ? ' edited' : ''}`} onClick={() => onWeight(ex)} aria-label={`${weight} ${unit}. Change weight or see plates`}>
            <span className="v">{fmtWeight(weight)}</span>
            <span className="u">{unit}{ex.per_hand ? ' each' : ''}{ex.equipment === 'BARBELL' ? ' · plates' : ''}</span>
          </button>
        )}
        <button className="icon-btn" style={{ marginRight: -8 }} onClick={() => onMenu(ex)} aria-label={`More options for ${ex.name}`}>
          <Icon name="more" size={22} />
        </button>
      </div>

      {ex.warmups.length > 0 && (
        <details className="drawer" open={!allWarm} style={divider}>
          <summary style={{ minHeight: 40, padding: '8px 16px', fontSize: 15, fontWeight: 500 }}>
            <span className="muted">{ex.is_primary ? 'Warm-up sets' : 'Optional feeler set'}</span>
            <span className="tiny faint num">{warmDone.filter(Boolean).length}/{ex.warmups.length}</span>
            <Icon name="chevron" className="chev" />
          </summary>
          {ex.warmups.map((w, i) => (
            <div key={i} className="warmup-row">
              <button className={`set-circle warmup${warmDone[i] ? ' done' : ''}`} onClick={() => onWarmup(ex, i)} aria-pressed={!!warmDone[i]} aria-label={`Warm-up ${i + 1}: ${w.weight_lbs} ${unit} for ${w.reps_label} reps`}>
                {w.reps}
              </button>
              <div className="grow">
                <div className="num" style={{ fontWeight: 600 }}>{fmtWeight(w.weight_lbs)} {unit} × {w.reps_label}</div>
                <div className="tiny muted">{w.note && i === 0 ? w.note : plateText(w.weight_lbs, profile)}</div>
              </div>
            </div>
          ))}
        </details>
      )}

      <div className="sets" style={ex.warmups.length ? { paddingTop: 12, ...divider } : undefined}>
        {ex.sets.map((s, i) => {
          const r = reps[i]
          const cls = r === null || r === undefined ? '' : r >= ex.reps_min ? ' done' : ' miss'
          const running = t?.ref === setRef(ex.key, i) && !t.fired
          return (
            <button
              key={i}
              className={`set-circle${cls}${focus === i ? ' focus' : ''}`}
              onClick={() => onTap(ex, i)}
              aria-label={`Set ${i + 1}${s.is_amrap ? ', as many reps as possible' : ''}: ${r === null ? `not logged, target ${s.target_reps}` : `${r} reps`}`}
              style={running && focus !== i ? { boxShadow: `0 0 0 3px var(--surface), 0 0 0 5px ${cls === ' miss' ? 'var(--warn)' : 'var(--accent)'}` } : undefined}
            >
              {r ?? s.target_reps}
              {s.is_amrap && <span className="plus">+</span>}
            </button>
          )
        })}
      </div>

      {focus !== null && reps[focus] !== null && reps[focus] !== undefined && (
        <div className="stepper">
          <span className="small muted grow">
            Set {focus + 1}
            {ex.sets[focus]?.is_amrap ? ' · log every clean rep' : ex.reps_min !== ex.reps_max ? ` · aim for ${ex.reps_min}–${ex.reps_max}` : ''}
          </span>
          <button className="btn" onClick={() => onStep(ex, focus, -1)} aria-label="One fewer rep">−</button>
          <span className="num" style={{ fontSize: 24, fontWeight: 700, minWidth: 36, textAlign: 'center' }}>{reps[focus]}</span>
          <button className="btn" onClick={() => onStep(ex, focus, 1)} aria-label="One more rep">+</button>
        </div>
      )}
    </section>
  )
}

function WeightSheet({ ex, active, profile, onClose }: { ex: PlannedExercise; active: ActiveWorkout; profile: Profile; onClose: () => void }) {
  const weight = active.log.weights[ex.key] ?? ex.weight_lbs
  const r = rulesFor(profile.unit_system)
  const step = ex.equipment === 'BARBELL' ? r.round : incrementFor(ex.exercise_id, weight, profile)
  const setW = (w: number) =>
    void patchActive((a) => {
      for (const e of a.plan.exercises) if (e.exercise_id === ex.exercise_id) a.log.weights[e.key] = w
    })
  return (
    <Sheet title={ex.name} onClose={onClose} right={<button className="btn ghost" style={{ fontWeight: 600 }} onClick={onClose}>Done</button>}>
      {ex.equipment === 'BARBELL' && weight >= profile.barbell_weight_lbs && <PlateGraphic weight={weight} bar={profile.barbell_weight_lbs} plates={profile.plates_lbs} unit={r.label} />}
      <div className="card" style={{ marginTop: 12 }}>
        <Stepper label="Today's weight" sub={ex.per_hand ? 'Per dumbbell' : undefined} value={weight} step={step} min={0} unit={r.label} format={fmtWeight} onChange={setW} />
      </div>
      {weight !== ex.weight_lbs && (
        <button className="btn ghost block" onClick={() => setW(ex.weight_lbs)}>Reset to planned {fmtWeight(ex.weight_lbs)} {r.label}</button>
      )}
      <p className="group-footer">Next time is worked out from what you actually lift today.</p>
    </Sheet>
  )
}

function FinishSheet({
  active,
  profile,
  program,
  onClose,
  onDone,
}: {
  active: ActiveWorkout
  profile: Profile
  program: ProgramDef | null
  onClose: () => void
  onDone: (id: string) => void
}) {
  const [joint, setJoint] = useState<boolean | null>(null)
  const [rpe, setRpe] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const unlogged = active.plan.exercises.reduce((n, e) => n + (active.log.reps[e.key] ?? []).filter((r) => r === null).length, 0)
  const onProgram = !!program && program.days.some((d) => d.id === active.plan.rotation_code)
  const askJoints = onProgram && phaseOf(program!, profile.current_phase).schedule.type === 'EVERY_N_DAYS'

  return (
    <Sheet
      title="Finish workout"
      onClose={onClose}
      left={<button className="btn ghost" onClick={onClose}>Cancel</button>}
      right={
        <button
          className="btn ghost"
          style={{ fontWeight: 600 }}
          disabled={busy || (askJoints && joint === null)}
          onClick={async () => {
            setBusy(true)
            const s = await finishWorkout({ joint_pain: joint, session_rpe: rpe, notes: notes.trim() || null })
            onDone(s.id)
          }}
        >
          Save
        </button>
      }
    >
      {unlogged > 0 && (
        <div className="card card-pad small" style={{ background: 'var(--warn-soft)', color: 'var(--warn-text)', marginBottom: 6 }}>
          {unlogged} set{unlogged > 1 ? 's' : ''} not logged. They count as 0 reps{onProgram ? ", so this workout won't count toward your next phase" : ''}.
        </div>
      )}
      {askJoints && (
        <>
          <div className="group-header">Any joint pain or lingering ache?</div>
          <div className="seg block">
            <button aria-pressed={joint === false} onClick={() => setJoint(false)}>No</button>
            <button aria-pressed={joint === true} onClick={() => setJoint(true)}>Yes</button>
          </div>
          <p className="group-footer">If yes, this workout won't count toward the next phase, to give your joints time.</p>
        </>
      )}
      <div className="group-header">How hard was it?</div>
      <div className="seg block">
        {[6, 7, 8, 9, 10].map((n) => (
          <button key={n} aria-pressed={rpe === n} onClick={() => setRpe(rpe === n ? null : n)}>{n}</button>
        ))}
      </div>
      <p className="group-footer">Optional. 10 means nothing left in the tank.</p>
      <div className="group-header">Notes</div>
      <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
    </Sheet>
  )
}
