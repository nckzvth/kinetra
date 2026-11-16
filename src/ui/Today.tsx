import { useMemo, useState } from 'react'
import { setWorkingWeight, startWorkout } from '../data/repo'
import { getExercise } from '../domain/catalog'
import { dayAt, hasGates, phaseOf } from '../domain/program'
import type { ExerciseState, PlannedExercise, Profile, ProgramDef, WorkoutSession } from '../domain/types'
import { rulesFor } from '../domain/units'
import { buildSessionPlan, prescriptionLabel } from '../engine/plan'
import { incrementFor } from '../engine/progression'
import { projectSchedule, relativeDayLabel, toISODate } from '../engine/schedule'
import { fmtWeight } from './hooks'
import { Icon, type IconName } from './Icon'
import { PlateGraphic } from './PlateGraphic'
import { Sheet, Stepper } from './Sheet'

const todayLine = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

export function TodayView({
  profile,
  states,
  program,
  sessions,
  onEditDay,
  onLogActivity,
}: {
  profile: Profile
  states: Record<string, ExerciseState>
  program: ProgramDef | null
  sessions: WorkoutSession[]
  onEditDay: (dayId: string) => void
  onLogActivity: () => void
}) {
  if (!program) return <JustTrack profile={profile} onLogActivity={onLogActivity} />
  return <ProgramToday profile={profile} states={states} program={program} sessions={sessions} onEditDay={onEditDay} />
}

function ProgramToday({
  profile,
  states,
  program,
  sessions,
  onEditDay,
}: {
  profile: Profile
  states: Record<string, ExerciseState>
  program: ProgramDef
  sessions: WorkoutSession[]
  onEditDay: (dayId: string) => void
}) {
  const plan = useMemo(() => buildSessionPlan(profile, states, program), [profile, states, program])
  const phase = phaseOf(program, profile.current_phase)
  const programSessions = sessions.filter((s) => s.rotation_code && program.days.some((d) => d.id === s.rotation_code))
  const last = programSessions[0]?.session_date ?? null
  const today = new Date()
  const upcoming = projectSchedule(phase.schedule, last, today, Math.min(6, program.days.length + 1))
  const suggested = upcoming[0]
  const isToday = toISODate(suggested) === toISODate(today)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<PlannedExercise | null>(null)
  const gates = hasGates(program) && phase.gate_required !== null
  const nextPhase = program.phases.find((p) => p.phase === phase.phase + 1)

  const start = async (day?: string) => {
    setBusy(true)
    await startWorkout({ day })
    setBusy(false)
  }

  return (
    <div className="today-grid">
      <div className="t-head">
      <div className="today-date">{todayLine()}</div>
      <h1 className="today-title">{plan.title}</h1>
      <div className="meta-row">
        {plan.subtitle && <span>{plan.subtitle}</span>}
        {plan.exercises.length > 0 && <span>{plan.exercises.length} exercises</span>}
        <span><Icon name="clock" size={15} />~{phase.target_duration_minutes} min</span>
        {!isToday && <span><Icon name="calendar" size={15} />Suggested {relativeDayLabel(suggested, today)}</span>}
      </div>
      </div>

      {gates && (
        <div className="card card-pad t-gate">
          <div className="spread small">
            <span style={{ fontWeight: 600 }}>{phase.name.replace(/^Phase \d+: /, '')}</span>
            <span className="muted num">{profile.phase_gate_progress} of {phase.gate_required}</span>
          </div>
          <div className="progress"><div style={{ width: `${(profile.phase_gate_progress / phase.gate_required!) * 100}%` }} /></div>
          {nextPhase && (
            <p className="tiny muted" style={{ marginTop: 8 }}>
              {phase.gate_required! - profile.phase_gate_progress} more complete sessions unlock {nextPhase.name.replace(/^Phase \d+: /, '')}.
            </p>
          )}
        </div>
      )}

      <div className="t-main">
      {plan.exercises.length === 0 ? (
        <div className="card empty">
          <p style={{ fontWeight: 600, color: 'var(--text)' }}>{plan.title} has no exercises yet</p>
          <p className="small" style={{ marginTop: 4 }}>Add a few and they'll show up here every time this day comes around.</p>
          <button className="btn tint" style={{ marginTop: 16 }} onClick={() => onEditDay(plan.rotation_code)}>Add exercises</button>
        </div>
      ) : (
        <>
          <div className="card list">
            {plan.exercises.map((ex) => (
              <button key={ex.key} className="ex-row" onClick={() => setEditing(ex)}>
                <div className="grow">
                  <div className="name">{ex.name}</div>
                  <div className="sub num">
                    {prescriptionLabel(ex)}
                    {ex.weight_lbs > 0 && ` · ${fmtWeight(ex.weight_lbs)} ${rulesFor(profile.unit_system).label}${ex.per_hand ? ' each' : ''}`}
                  </div>
                </div>
                <div className="mini-rings" aria-hidden="true">
                  {ex.sets.slice(0, 5).map((s) => <span key={s.index}>{s.target_reps}{s.is_amrap ? '+' : ''}</span>)}
                  {ex.sets.length > 5 && <span className="more">+{ex.sets.length - 5}</span>}
                </div>
              </button>
            ))}
          </div>
          <button className="btn primary lg block" style={{ marginTop: 16 }} disabled={busy} onClick={() => void start(plan.rotation_code)}>
            Start workout
          </button>
        </>
      )}
      <button className="btn ghost block" style={{ marginTop: 4 }} onClick={() => setPicking(true)}>Do a different workout</button>
      </div>

      <div className="t-up">
      <div className="section-title"><h2>Coming up</h2></div>
      <div className="card list">
        {upcoming.slice(1).map((d, i) => {
          const day = dayAt(program, profile.next_rotation_index + i + 1)
          return (
            <div key={i} className="stream-row">
              <span className="when">{relativeDayLabel(d, today)}</span>
              <span className="grow" style={{ fontWeight: 500 }}>{day.name}</span>
              <span className="tiny muted">{day.focus}</span>
            </div>
          )
        })}
      </div>
      </div>

      {picking && (
        <Sheet title="Choose a workout" onClose={() => setPicking(false)} right={<button className="btn ghost" onClick={() => setPicking(false)}>Cancel</button>}>
          <div className="card list">
            {program.days.map((d) => (
              <button key={d.id} className="cell" onClick={() => { setPicking(false); void start(d.id) }}>
                <span className="grow">
                  <span style={{ display: 'block' }}>{d.name}</span>
                  {d.focus && <span className="tiny muted">{d.focus}</span>}
                </span>
                {d.id === plan.rotation_code && <span className="chip accent">Up next</span>}
                <Icon name="chevronRight" className="chev" />
              </button>
            ))}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <button className="cell" onClick={() => { setPicking(false); void startWorkout({ free: true }) }}>
              <span className="grow">Empty workout<span className="tiny muted" style={{ display: 'block' }}>Add exercises as you go. Doesn't move your plan.</span></span>
              <Icon name="chevronRight" className="chev" />
            </button>
          </div>
        </Sheet>
      )}
      {editing && <WorkingWeightSheet ex={editing} profile={profile} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Adjust an exercise's working weight before the workout starts. */
function WorkingWeightSheet({ ex, profile, onClose }: { ex: PlannedExercise; profile: Profile; onClose: () => void }) {
  const [w, setW] = useState(ex.weight_lbs)
  const r = rulesFor(profile.unit_system)
  const step = ex.equipment === 'BARBELL' ? r.round : incrementFor(ex.exercise_id, w, profile)
  const def = getExercise(ex.exercise_id)
  return (
    <Sheet
      title={ex.name}
      onClose={onClose}
      left={<button className="btn ghost" onClick={onClose}>Cancel</button>}
      right={<button className="btn ghost" style={{ fontWeight: 600 }} onClick={() => { void setWorkingWeight(ex.exercise_id, w); onClose() }}>Done</button>}
    >
      {ex.equipment === 'BARBELL' && w >= profile.barbell_weight_lbs && <PlateGraphic weight={w} bar={profile.barbell_weight_lbs} plates={profile.plates_lbs} unit={r.label} />}
      <div className="card" style={{ marginTop: 12 }}>
        <Stepper label="Working weight" sub={ex.per_hand ? 'Per dumbbell' : undefined} value={w} step={step} min={0} unit={r.label} format={fmtWeight} onChange={setW} />
      </div>
      <p className="group-footer">
        {ex.is_primary
          ? 'Goes up automatically each time you hit every rep. Two misses in a row brings it down 10%.'
          : `Goes up once every set reaches ${ex.reps_max} reps.`}
        {def.substitutions.length > 0 && ` Alternatives: ${def.substitutions.join(', ')}.`}
      </p>
    </Sheet>
  )
}

const QUICK: { label: string; icon: IconName }[] = [
  { label: 'Run', icon: 'run' },
  { label: 'Boxing rounds', icon: 'boxing' },
  { label: 'Climbing', icon: 'mountain' },
  { label: 'Timed holds', icon: 'timer' },
]

function JustTrack({ profile, onLogActivity }: { profile: Profile; onLogActivity: () => void }) {
  void profile
  return (
    <>
      <div className="today-date">{todayLine()}</div>
      <h1 className="today-title">Today</h1>
      <button className="btn primary lg block" style={{ marginTop: 20 }} onClick={() => void startWorkout({ free: true })}>
        Start a workout
      </button>
      <p className="group-footer" style={{ textAlign: 'center' }}>Add exercises as you go. Weights are remembered for next time.</p>
      <div className="section-title"><h2>Or log an activity</h2></div>
      <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {QUICK.map((q) => (
          <button key={q.label} className="tile" style={{ textAlign: 'left' }} onClick={onLogActivity}>
            <span className="icon"><Icon name={q.icon} /></span>
            <span style={{ fontWeight: 600 }}>{q.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}
