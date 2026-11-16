import type { Session } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { changeUnits, exportAll, importAll, resetAll, saveProgram, setWorkingWeight, switchProgram, updateProfile, type ProgramChoice } from '../data/repo'
import { defaultStart, getExercise } from '../domain/catalog'
import { phaseOf } from '../domain/program'
import type { EquipmentPreset, ExerciseState, PrescribedExercise, Profile, ProgramDef } from '../domain/types'
import { platesFor, rulesFor } from '../domain/units'
import { incrementFor } from '../engine/progression'
import { AccountStatus, SignInForm } from './Account'
import { useCustomExercises } from './data'
import { CreateExercise, ExercisePicker } from './ExercisePicker'
import { fmtWeight, useMediaQuery } from './hooks'
import { Icon, type IconName } from './Icon'
import { Sheet, Stepper } from './Sheet'
import { NutritionRoadmap } from './Views'
import { InstallContent } from './InstallBanner'
import { isStandalone } from './install'

type Page = 'home' | 'program' | 'day' | 'exercises' | 'equipment' | 'account' | 'data' | 'nutrition' | 'friends' | 'install'

export function YouView({
  profile,
  states,
  program,
  session,
  syncing,
  onSync,
  notify,
  openDay,
  onOpenedDay,
}: {
  profile: Profile
  states: Record<string, ExerciseState>
  program: ProgramDef | null
  session: Session | null
  syncing: boolean
  onSync: () => void
  notify: (m: string) => void
  openDay: string | null
  onOpenedDay: () => void
}) {
  const wide = useMediaQuery('(min-width: 900px)')
  const [page, setPage] = useState<Page>('home')
  const [dayId, setDayId] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  useEffect(() => {
    if (openDay) {
      setDayId(openDay)
      setPage('day')
      onOpenedDay()
    }
  }, [openDay, onOpenedDay])
  useEffect(() => {
    if (!wide) document.querySelector('.stage-scroll')?.scrollTo({ top: 0 })
  }, [page, wide])

  // On wide screens the menu stays on the left and the selected page fills the right.
  const shown: Page = wide && page === 'home' ? 'program' : page
  const back = (to: Page = 'home') =>
    wide && to === 'home' ? null : (
      <button className="back-btn" onClick={() => setPage(to)}>
        <Icon name="chevronLeft" size={24} /> {to === 'home' ? 'You' : 'Program'}
      </button>
    )

  const detail = (() => {
    switch (shown) {
      case 'program':
        return program ? (
          <>{back()}<ProgramPage profile={profile} program={program} onOpenDay={(id) => { setDayId(id); setPage('day') }} notify={notify} /></>
        ) : (
          <>
            {back()}
            <h1 className="page-title">Program</h1>
            <p className="muted" style={{ margin: '8px 4px 18px' }}>You're logging workouts without a plan. Pick one any time.</p>
            <button className="btn tint" onClick={() => setChanging(true)}>Choose a program</button>
          </>
        )
      case 'day':
        return program && dayId ? <>{back('program')}<DayEditor profile={profile} states={states} program={program} dayId={dayId} onDeleted={() => setPage('program')} /></> : null
      case 'exercises':
        return <>{back()}<ExercisesPage profile={profile} states={states} program={program} /></>
      case 'equipment':
        return <>{back()}<EquipmentPage profile={profile} notify={notify} /></>
      case 'account':
        return (
          <>
            {back()}
            <h1 className="page-title">Account</h1>
            <p className="muted" style={{ margin: '8px 4px 18px' }}>Back up your training and use it on your phone and computer.</p>
            {session ? <AccountStatus session={session} syncing={syncing} onSync={onSync} /> : <SignInForm notify={notify} />}
          </>
        )
      case 'data':
        return <>{back()}<DataPage notify={notify} /></>
      case 'nutrition':
        return <>{back()}<NutritionRoadmap profile={profile} /></>
      case 'friends':
        return <>{back()}<FriendsRoadmap /></>
      case 'install':
        return (
          <>
            {back()}
            <h1 className="page-title">Install the app</h1>
            <div className="card card-pad" style={{ marginTop: 18 }}><InstallContent /></div>
            <p className="group-footer">Installed, Kinetra keeps your screen awake during workouts and opens straight to Today. Your data is the same either way.</p>
          </>
        )
      default:
        return null
    }
  })()

  const r = rulesFor(profile.unit_system)
  const presetLabel = { GYM: 'Gym', HOME: 'Home', NONE: 'No equipment' }[profile.equipment_preset]
  const cur = (p: Page) => shown === p || (p === 'program' && shown === 'day')
  const menu = (
    <>
      <h1 className="page-title">You</h1>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="cell">
          <span className="cell-icon" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}><Icon name="user" size={18} /></span>
          <NameField profile={profile} />
        </div>
      </div>
      <div className="group-header">Training</div>
      <div className="card list">
        <NavCell icon="list" color="#0a84ff" label="Program" value={program ? program.name : 'Just tracking'} current={wide && cur('program')} onClick={() => setPage('program')} />
        <NavCell icon="dumbbell" color="#ff9f0a" label="Exercises and weights" current={wide && cur('exercises')} onClick={() => setPage('exercises')} />
        <NavCell icon="building" color="#8e8e93" label="Equipment and units" value={`${presetLabel} · ${r.label}`} current={wide && cur('equipment')} onClick={() => setPage('equipment')} />
      </div>
      <div className="group-header">More</div>
      <div className="card list">
        <NavCell icon="user" color="#ff375f" label="Friends and teams" value="Coming next" current={wide && cur('friends')} onClick={() => setPage('friends')} />
        <NavCell icon="leaf" color="#30d158" label="Nutrition" value="Coming soon" current={wide && cur('nutrition')} onClick={() => setPage('nutrition')} />
        <NavCell icon={session ? 'cloud' : 'cloudOff'} color="#5e5ce6" label="Account and sync" value={session ? 'On' : 'Off'} current={wide && cur('account')} onClick={() => setPage('account')} />
        <NavCell icon="database" color="#636366" label="Backup and reset" current={wide && cur('data')} onClick={() => setPage('data')} />
        <NavCell icon="arrowDown" color="#30d158" label="Add to Home Screen" value={isStandalone() ? 'Installed' : undefined} current={wide && cur('install')} onClick={() => setPage('install')} />
      </div>
    </>
  )

  return (
    <>
      {wide ? (
        <div className="split">
          <div className="split-list">{menu}</div>
          <div className="split-detail" style={{ paddingTop: 4 }}>{detail}</div>
        </div>
      ) : page === 'home' ? (
        menu
      ) : (
        detail
      )}
      {changing && <ChangeProgramSheet onClose={() => setChanging(false)} notify={notify} />}
    </>
  )
}

function NavCell({ icon, color, label, value, current, onClick }: { icon: IconName; color: string; label: string; value?: string; current?: boolean; onClick: () => void }) {
  return (
    <button className="cell" aria-current={current ? 'true' : undefined} onClick={onClick}>
      <span className="cell-icon" style={{ background: color }}><Icon name={icon} size={18} /></span>
      <span className="grow">{label}</span>
      {value && <span className="cell-value small" style={{ maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>}
      <Icon name="chevronRight" className="chev" />
    </button>
  )
}

function NameField({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.display_name)
  return (
    <input
      className="inline-input"
      style={{ textAlign: 'left', color: 'var(--text)', fontWeight: 600, fontSize: 19 }}
      placeholder="Your name"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => name.trim() !== profile.display_name && void updateProfile({ display_name: name.trim() })}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
}

// ─── Program ────────────────────────────────────────────────────────────────

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function ProgramPage({ profile, program, onOpenDay, notify }: { profile: Profile; program: ProgramDef; onOpenDay: (id: string) => void; notify: (m: string) => void }) {
  const [changing, setChanging] = useState(false)
  const phase = phaseOf(program, profile.current_phase)
  const gated = program.phases.length > 1
  const update = (fn: (p: ProgramDef) => void) => {
    const next = structuredClone(program)
    fn(next)
    void saveProgram(next)
  }
  const currentPhase = (p: ProgramDef) => p.phases.find((x) => x.phase === phase.phase)!

  return (
    <>
      <input
        className="inline-input page-title"
        style={{ textAlign: 'left', color: 'var(--text)', fontSize: 34, fontWeight: 700 }}
        defaultValue={program.name}
        aria-label="Program name"
        onBlur={(e) => e.target.value.trim() && e.target.value !== program.name && update((p) => { p.name = e.target.value.trim() })}
      />
      <p className="muted" style={{ margin: '4px 2px 0' }}>{program.tagline}</p>

      {gated && (
        <>
          <div className="group-header">Phase</div>
          <div className="card list">
            {program.phases.map((p) => (
              <button
                key={p.phase}
                className="cell"
                onClick={() => p.phase !== profile.current_phase && void updateProfile({ current_phase: p.phase, phase_gate_progress: 0 })}
              >
                <span className="grow">
                  <span style={{ display: 'block' }}>{p.name}</span>
                  <span className="tiny muted">{p.schedule.type === 'EVERY_N_DAYS' ? 'Every other day' : `${p.days_per_week} days a week`}{p.gate_required ? ` · ${p.gate_required} workouts to finish` : ''}</span>
                </span>
                {p.phase === profile.current_phase && <Icon name="check" className="link" />}
              </button>
            ))}
          </div>
          <p className="group-footer">You move up automatically. Tap a phase to jump there yourself — your progress in the current phase resets.</p>
        </>
      )}

      <div className="group-header">Days{gated ? ` in phase ${phase.phase}` : ''}</div>
      <div className="card list">
        {program.days.map((d, i) => {
          const n = phase.workouts[d.id]?.length ?? 0
          return (
            <button key={d.id} className="cell" onClick={() => onOpenDay(d.id)}>
              <span className="grow">
                <span style={{ display: 'block' }}>{d.name}</span>
                <span className="tiny muted">{n ? `${n} exercise${n === 1 ? '' : 's'}` : 'No exercises yet'}{d.focus ? ` · ${d.focus}` : ''}</span>
              </span>
              {i === profile.next_rotation_index % program.days.length && <span className="chip accent">Next</span>}
              <Icon name="chevronRight" className="chev" />
            </button>
          )
        })}
        {program.days.length < 7 && (
          <button
            className="cell link"
            onClick={() =>
              update((p) => {
                const id = `DAY_${Date.now().toString(36)}`
                p.days.push({ id, name: `Day ${p.days.length + 1}`, focus: '' })
                for (const ph of p.phases) ph.workouts[id] = []
              })
            }
          >
            <Icon name="plus" /> Add a day
          </button>
        )}
      </div>

      {phase.schedule.type === 'WEEKDAYS' && (
        <>
          <div className="group-header">Training days</div>
          <div className="card card-pad">
            <div className="day-chips" style={{ justifyContent: 'space-between' }}>
              {WEEKDAYS.map((w, i) => {
                const days = (phase.schedule as { days: number[] }).days
                const on = days.includes(i)
                return (
                  <button
                    key={i}
                    aria-pressed={on}
                    aria-label={new Date(2026, 10, 15 + i).toLocaleDateString(undefined, { weekday: 'long' })}
                    onClick={() =>
                      update((p) => {
                        const s = currentPhase(p).schedule as { type: 'WEEKDAYS'; days: number[] }
                        s.days = on ? s.days.filter((x) => x !== i) : [...s.days, i].sort()
                        if (!s.days.length) s.days = [i]
                        currentPhase(p).days_per_week = s.days.length
                      })
                    }
                  >
                    {w}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="group-footer">Used to suggest when to train. Your workouts always go in order, so a missed day just shifts everything along.</p>
        </>
      )}

      <div className="card" style={{ marginTop: 26 }}>
        <button className="cell link" onClick={() => setChanging(true)}>Change program</button>
      </div>
      {changing && <ChangeProgramSheet onClose={() => setChanging(false)} notify={notify} />}
    </>
  )
}

const CHOICES: { choice: ProgramChoice; title: string; sub: string }[] = [
  { choice: { kind: 'template', templateId: 'ppl_ramp' }, title: 'Return to lifting', sub: 'Ramp up to a 6-day push/pull/legs' },
  { choice: { kind: 'template', templateId: 'full_body_3' }, title: 'Full-body strength', sub: '3 days a week' },
  { choice: { kind: 'template', templateId: 'upper_lower_4' }, title: 'Upper / lower', sub: '4 days a week' },
  { choice: { kind: 'custom', days: 3 }, title: 'Build my own', sub: 'Start from blank days' },
  { choice: { kind: 'track' }, title: 'Just track', sub: 'No plan' },
]

function ChangeProgramSheet({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  return (
    <Sheet title="Change program" onClose={onClose} right={<button className="btn ghost" onClick={onClose}>Cancel</button>}>
      <div className="card list">
        {CHOICES.map((c) => (
          <button
            key={c.title}
            className="cell"
            onClick={async () => {
              await switchProgram(c.choice)
              notify(`Switched to ${c.title.toLowerCase()}`)
              onClose()
            }}
          >
            <span className="grow">
              <span style={{ display: 'block' }}>{c.title}</span>
              <span className="tiny muted">{c.sub}</span>
            </span>
            <Icon name="chevronRight" className="chev" />
          </button>
        ))}
      </div>
      <p className="group-footer">Your history and working weights stay. The new program starts from its first day.</p>
    </Sheet>
  )
}

// ─── Day editor ─────────────────────────────────────────────────────────────

function DayEditor({ profile, states, program, dayId, onDeleted }: { profile: Profile; states: Record<string, ExerciseState>; program: ProgramDef; dayId: string; onDeleted: () => void }) {
  const phase = phaseOf(program, profile.current_phase)
  const day = program.days.find((d) => d.id === dayId)
  const [editing, setEditing] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  if (!day) return <div className="empty">That day no longer exists.</div>
  const list = phase.workouts[dayId] ?? []
  const unit = rulesFor(profile.unit_system).label

  const update = (fn: (items: PrescribedExercise[], p: ProgramDef) => void) => {
    const next = structuredClone(program)
    const ph = next.phases.find((x) => x.phase === phase.phase)!
    ph.workouts[dayId] ??= []
    fn(ph.workouts[dayId], next)
    void saveProgram(next)
  }

  return (
    <>
      <input
        className="inline-input page-title"
        style={{ textAlign: 'left', color: 'var(--text)', fontSize: 34, fontWeight: 700 }}
        defaultValue={day.name}
        aria-label="Day name"
        onBlur={(e) => e.target.value.trim() && e.target.value !== day.name && update((_, p) => { p.days.find((d) => d.id === dayId)!.name = e.target.value.trim() })}
      />
      <input
        className="inline-input"
        style={{ textAlign: 'left', margin: '4px 2px 0' }}
        placeholder="Add a short description"
        defaultValue={day.focus}
        aria-label="Day description"
        onBlur={(e) => e.target.value !== day.focus && update((_, p) => { p.days.find((d) => d.id === dayId)!.focus = e.target.value.trim() })}
      />

      <div className="group-header">Exercises</div>
      <div className="card list">
        {list.map((p, i) => (
          <button key={`${p.exercise_id}-${i}`} className="ex-row" onClick={() => setEditing(i)}>
            <div className="grow">
              <div className="name">{p.name || getExercise(p.exercise_id).name}</div>
              <div className="sub num">
                {p.sets} × {p.reps_min === p.reps_max ? p.reps_min : `${p.reps_min}–${p.reps_max}`}
                {p.amrap_last_set ? ', last set max' : ''}
                {getExercise(p.exercise_id).equipment !== 'BODYWEIGHT' && ` · ${fmtWeight(states[p.exercise_id]?.current_working_weight_lbs ?? defaultStart(p.exercise_id, profile.unit_system))} ${unit}`}
              </div>
            </div>
            <Icon name="chevronRight" className="chev" />
          </button>
        ))}
        <button className="cell link" onClick={() => setAdding(true)}><Icon name="plus" /> Add exercise</button>
      </div>
      {program.phases.length > 1 && <p className="group-footer">Changes apply to {phase.name.split(':')[0].toLowerCase()} of your program.</p>}

      {program.days.length > 1 && (
        <div className="card" style={{ marginTop: 26 }}>
          <button
            className="cell"
            style={{ color: 'var(--danger)' }}
            onClick={() => setDeleting(true)}
          >
            Delete this day
          </button>
        </div>
      )}

      {deleting && (
        <Sheet title={`Delete ${day.name}?`} onClose={() => setDeleting(false)}>
          <p className="muted" style={{ textAlign: 'center', margin: '0 8px 18px' }}>It's removed from your program. Past workouts stay in your history.</p>
          <div className="stack" style={{ gap: 8 }}>
            <button
              className="btn block"
              style={{ color: 'var(--danger)', background: 'var(--surface)' }}
              onClick={() => {
                update((_, p) => {
                  p.days = p.days.filter((d) => d.id !== dayId)
                  for (const ph of p.phases) delete ph.workouts[dayId]
                })
                void updateProfile({ next_rotation_index: 0 })
                onDeleted()
              }}
            >
              Delete day
            </button>
            <button className="btn block" style={{ background: 'var(--surface)' }} onClick={() => setDeleting(false)}>Cancel</button>
          </div>
        </Sheet>
      )}
      {adding && (
        <ExercisePicker
          onClose={() => setAdding(false)}
          onPick={(id) => {
            setAdding(false)
            const ex = getExercise(id)
            const linear = ex.progression_type === 'LINEAR' || ex.progression_type === 'LINEAR_DEADLIFT'
            update((items) => {
              items.push({
                exercise_id: id,
                name: ex.name,
                sets: 3,
                reps_min: linear ? 5 : 8,
                reps_max: linear ? 5 : 12,
                amrap_last_set: false,
                rest_sec: ex.default_rest_sec,
                // Heavy barbell lifts get warm-up sets wherever they sit in the day.
                warmup_enabled: linear && ex.equipment === 'BARBELL',
              })
            })
          }}
        />
      )}
      {editing !== null && list[editing] && (
        <PrescriptionSheet
          item={list[editing]}
          index={editing}
          count={list.length}
          profile={profile}
          weight={states[list[editing].exercise_id]?.current_working_weight_lbs ?? defaultStart(list[editing].exercise_id, profile.unit_system)}
          onClose={() => setEditing(null)}
          onSave={(item, weight) => {
            update((items) => { items[editing] = item })
            if (weight !== null) void setWorkingWeight(item.exercise_id, weight)
            setEditing(null)
          }}
          onMove={(d) => {
            update((items) => {
              const [it] = items.splice(editing, 1)
              items.splice(editing + d, 0, it)
            })
            setEditing(editing + d)
          }}
          onRemove={() => {
            update((items) => { items.splice(editing, 1) })
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function PrescriptionSheet({
  item,
  index,
  count,
  profile,
  weight,
  onClose,
  onSave,
  onMove,
  onRemove,
}: {
  item: PrescribedExercise
  index: number
  count: number
  profile: Profile
  weight: number
  onClose: () => void
  onSave: (item: PrescribedExercise, weight: number | null) => void
  onMove: (delta: 1 | -1) => void
  onRemove: () => void
}) {
  const [p, setP] = useState(item)
  const [w, setW] = useState(weight)
  const [swapping, setSwapping] = useState(false)
  const ex = getExercise(p.exercise_id)
  const r = rulesFor(profile.unit_system)
  const set = (patch: Partial<PrescribedExercise>) => setP((x) => ({ ...x, ...patch }))
  const range = p.reps_min !== p.reps_max

  if (swapping)
    return (
      <ExercisePicker
        title="Swap exercise"
        onClose={() => setSwapping(false)}
        onPick={(id) => {
          setSwapping(false)
          set({ exercise_id: id, name: getExercise(id).name })
          setW(defaultStart(id, profile.unit_system))
        }}
      />
    )

  return (
    <Sheet
      title={p.name || ex.name}
      onClose={onClose}
      left={<button className="btn ghost" onClick={onClose}>Cancel</button>}
      right={<button className="btn ghost" style={{ fontWeight: 600 }} onClick={() => onSave(p, ex.equipment === 'BODYWEIGHT' ? null : w)}>Done</button>}
    >
      <div className="card list">
        <Stepper label="Sets" value={p.sets} step={1} min={1} max={10} onChange={(v) => set({ sets: v })} />
        <div className="cell">
          <span className="grow">Rep range</span>
          <Switch on={range} label="Use a rep range" onChange={(on) => set(on ? { reps_max: p.reps_min + 4, amrap_last_set: false } : { reps_max: p.reps_min })} />
        </div>
        <Stepper label={range ? 'Fewest reps' : 'Reps'} value={p.reps_min} step={1} min={1} max={50} onChange={(v) => set({ reps_min: v, reps_max: range ? Math.max(v + 1, p.reps_max) : v })} />
        {range && <Stepper label="Most reps" value={p.reps_max} step={1} min={p.reps_min + 1} max={60} onChange={(v) => set({ reps_max: v })} />}
        {!range && (
          <div className="cell">
            <span className="grow">Last set: as many as possible<span className="tiny muted" style={{ display: 'block' }}>Push for extra reps on the final set</span></span>
            <Switch on={p.amrap_last_set} label="Last set as many as possible" onChange={(v) => set({ amrap_last_set: v })} />
          </div>
        )}
        <Stepper label="Rest" value={p.rest_sec} step={15} min={0} max={600} format={(v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`} onChange={(v) => set({ rest_sec: v })} />
        {ex.equipment === 'BARBELL' && (
          <div className="cell">
            <span className="grow">Warm-up sets<span className="tiny muted" style={{ display: 'block' }}>Ramp up from the empty bar</span></span>
            <Switch on={p.warmup_enabled} label="Warm-up sets" onChange={(v) => set({ warmup_enabled: v })} />
          </div>
        )}
      </div>
      <p className="group-footer">
        {range ? `Weight goes up once every set reaches ${p.reps_max} reps.` : 'Weight goes up each time you hit every rep.'}
      </p>

      {ex.equipment !== 'BODYWEIGHT' && (
        <div className="card" style={{ marginTop: 16 }}>
          <Stepper label="Working weight" sub={ex.per_hand ? 'Per dumbbell' : undefined} value={w} step={ex.equipment === 'BARBELL' ? r.round : incrementFor(p.exercise_id, w, profile)} min={0} unit={r.label} format={fmtWeight} onChange={setW} />
        </div>
      )}

      <div className="card list" style={{ marginTop: 16 }}>
        <button className="cell link" onClick={() => setSwapping(true)}><Icon name="swap" /> Swap exercise</button>
        {index > 0 && <button className="cell link" onClick={() => onMove(-1)}><Icon name="arrowUp" /> Move up</button>}
        {index < count - 1 && <button className="cell link" onClick={() => onMove(1)}><Icon name="arrowDown" /> Move down</button>}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <button className="cell" style={{ color: 'var(--danger)' }} onClick={onRemove}><Icon name="trash" /> Remove from this day</button>
      </div>
    </Sheet>
  )
}

// ─── Exercises & weights ────────────────────────────────────────────────────

function ExercisesPage({ profile, states, program }: { profile: Profile; states: Record<string, ExerciseState>; program: ProgramDef | null }) {
  const custom = useCustomExercises() ?? []
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const unit = rulesFor(profile.unit_system).label
  const inProgram = new Set(program ? program.phases.flatMap((ph) => Object.values(ph.workouts).flat().map((p) => p.exercise_id)) : [])
  const ids = [...new Set([...inProgram, ...Object.keys(states)])].filter((id) => getExercise(id).equipment !== 'BODYWEIGHT' && getExercise(id).tracking_archetype === 'WEIGHT_REPS')
  ids.sort((a, b) => getExercise(a).name.localeCompare(getExercise(b).name))

  return (
    <>
      <h1 className="page-title">Exercises</h1>
      <div className="group-header">Working weights</div>
      <div className="card list">
        {ids.map((id) => {
          const s = states[id]
          const w = s?.current_working_weight_lbs ?? defaultStart(id, profile.unit_system)
          return (
            <button key={id} className="cell" onClick={() => setEditing(id)}>
              <span className="grow">
                <span style={{ display: 'block' }}>{getExercise(id).name}</span>
                {s?.consecutive_failures ? <span className="tiny" style={{ color: 'var(--warn-text)' }}>Missed last time</span> : null}
              </span>
              <span className="cell-value num">{fmtWeight(w)} {unit}</span>
              <Icon name="chevronRight" className="chev" />
            </button>
          )
        })}
      </div>
      <p className="group-footer">These update automatically after every workout. Change one here if it feels off.</p>

      <div className="group-header">Your exercises</div>
      <div className="card list">
        {custom.map((c) => (
          <div key={c.id} className="cell">
            <span className="grow">{c.definition.name}</span>
            <span className="tiny muted">{c.definition.equipment.toLowerCase()}</span>
          </div>
        ))}
        <button className="cell link" onClick={() => setCreating(true)}><Icon name="plus" /> New exercise</button>
      </div>

      {editing && <WeightEditSheet id={editing} profile={profile} weight={states[editing]?.current_working_weight_lbs ?? defaultStart(editing, profile.unit_system)} onClose={() => setEditing(null)} />}
      {creating && <CreateExercise onClose={() => setCreating(false)} onCreated={() => setCreating(false)} />}
    </>
  )
}

function WeightEditSheet({ id, profile, weight, onClose }: { id: string; profile: Profile; weight: number; onClose: () => void }) {
  const [w, setW] = useState(weight)
  const ex = getExercise(id)
  const r = rulesFor(profile.unit_system)
  return (
    <Sheet
      title={ex.name}
      onClose={onClose}
      left={<button className="btn ghost" onClick={onClose}>Cancel</button>}
      right={<button className="btn ghost" style={{ fontWeight: 600 }} onClick={() => { void setWorkingWeight(id, w); onClose() }}>Done</button>}
    >
      <div className="card">
        <Stepper label="Working weight" sub={ex.per_hand ? 'Per dumbbell' : undefined} value={w} step={ex.equipment === 'BARBELL' ? r.round : incrementFor(id, w, profile)} min={0} unit={r.label} format={fmtWeight} onChange={setW} />
      </div>
    </Sheet>
  )
}

// ─── Equipment & units ──────────────────────────────────────────────────────

const PLACES: { preset: EquipmentPreset; title: string; sub: string }[] = [
  { preset: 'GYM', title: 'Gym', sub: 'Full set of plates' },
  { preset: 'HOME', title: 'Home', sub: 'The common plates' },
  { preset: 'NONE', title: 'No equipment', sub: 'Bodyweight and activities' },
]

function EquipmentPage({ profile, notify }: { profile: Profile; notify: (m: string) => void }) {
  const r = rulesFor(profile.unit_system)
  const [advanced, setAdvanced] = useState(false)
  const allPlates = profile.unit_system === 'METRIC' ? [25, 20, 15, 10, 5, 2.5, 1.25, 0.5] : [55, 45, 35, 25, 10, 5, 2.5, 1.25]
  return (
    <>
      <h1 className="page-title">Equipment</h1>
      <div className="group-header">Where you train</div>
      <div className="card list">
        {PLACES.map((p) => (
          <button key={p.preset} className="cell" onClick={() => void updateProfile({ equipment_preset: p.preset, plates_lbs: platesFor(profile.unit_system, p.preset) })}>
            <span className="grow">
              <span style={{ display: 'block' }}>{p.title}</span>
              <span className="tiny muted">{p.sub}</span>
            </span>
            {profile.equipment_preset === p.preset && <Icon name="check" className="link" />}
          </button>
        ))}
      </div>

      <div className="group-header">Units</div>
      <div className="card">
        <div className="cell">
          <span className="grow">Weight</span>
          <div className="seg">
            {(['IMPERIAL', 'METRIC'] as const).map((u) => (
              <button
                key={u}
                aria-pressed={profile.unit_system === u}
                onClick={async () => {
                  if (u === profile.unit_system) return
                  await changeUnits(u)
                  notify(`All weights converted to ${u === 'METRIC' ? 'kilograms' : 'pounds'}`)
                }}
              >
                {u === 'METRIC' ? 'kg' : 'lb'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="group-footer">Switching converts every saved weight, rounded to the nearest plate jump.</p>

      <div className="card" style={{ marginTop: 26 }}>
        <button className="cell" onClick={() => setAdvanced((a) => !a)}>
          <span className="grow">Fine-tune bar, plates and dumbbells</span>
          <Icon name="chevron" className="chev" style={{ transform: advanced ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
      {advanced && (
        <>
          <div className="card list" style={{ marginTop: 10 }}>
            <Stepper label="Barbell" value={profile.barbell_weight_lbs} step={r.unit === 'METRIC' ? 1 : 5} min={0} unit={r.label} format={fmtWeight} onChange={(v) => void updateProfile({ barbell_weight_lbs: v })} />
            <Stepper label="Dumbbell jump" sub="Smallest step between dumbbells" value={profile.dumbbell_step_lbs} step={r.unit === 'METRIC' ? 0.5 : 2.5} min={0.5} unit={r.label} format={fmtWeight} onChange={(v) => void updateProfile({ dumbbell_step_lbs: v })} />
          </div>
          <div className="group-header">Plates you have</div>
          <div className="card card-pad">
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {allPlates.map((p) => {
                const on = profile.plates_lbs.includes(p)
                return (
                  <button
                    key={p}
                    className={`chip${on ? ' info' : ''}`}
                    style={{ height: 34, padding: '0 14px', fontSize: 15 }}
                    aria-pressed={on}
                    onClick={() => void updateProfile({ plates_lbs: (on ? profile.plates_lbs.filter((x) => x !== p) : [...profile.plates_lbs, p]).sort((a, b) => b - a) })}
                  >
                    {fmtWeight(p)}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="group-footer">Used to show which plates to put on each side of the bar.</p>
        </>
      )}
    </>
  )
}

// ─── Data ───────────────────────────────────────────────────────────────────

function DataPage({ notify }: { notify: (m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  return (
    <>
      <h1 className="page-title">Backup and reset</h1>
      <div className="card list" style={{ marginTop: 18 }}>
        <button
          className="cell link"
          onClick={async () => {
            const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `kinetra-backup-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(a.href)
          }}
        >
          Export a backup file
        </button>
        <button className="cell link" onClick={() => fileRef.current?.click()}>Restore from a backup file</button>
      </div>
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
            notify("That file isn't a backup from this app")
          }
          e.target.value = ''
        }}
      />
      <div className="card" style={{ marginTop: 26 }}>
        <button className="cell" style={{ color: 'var(--danger)' }} onClick={() => setConfirmReset(true)}>Erase this device and start over</button>
      </div>
      <p className="group-footer">If you're signed in, your cloud copy is kept and comes back when you sign in again.</p>
      {confirmReset && (
        <Sheet title="Start over?" onClose={() => setConfirmReset(false)}>
          <p className="muted" style={{ textAlign: 'center', margin: '0 8px 18px' }}>Everything on this device is erased and you'll go through setup again.</p>
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn block" style={{ color: 'var(--danger)', background: 'var(--surface)' }} onClick={async () => { await resetAll(); setConfirmReset(false) }}>Erase and start over</button>
            <button className="btn block" style={{ background: 'var(--surface)' }} onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        </Sheet>
      )}
    </>
  )
}


const FRIEND_FEATURES: [string, string][] = [
  ['Training together', 'See when friends are working out, live, right on Today.'],
  ['A feed of real effort', 'Finished workouts, new personal bests, runs, rounds and climbs.'],
  ['Encouragement', 'One-tap fist-bumps, short notes and GIFs, mid-set or after.'],
  ['Weekly high scores', 'Sessions, volume, streaks and personal records among friends.'],
  ['Teams and seasons', 'Form a team, take on other teams over a season. Works for friend groups and workplaces.'],
  ['You control sharing', 'Friends see summaries only. Choose whether they see your weights.'],
]

function FriendsRoadmap() {
  return (
    <>
      <span className="chip info">Coming next</span>
      <h1 className="page-title" style={{ marginTop: 8 }}>Friends and teams</h1>
      <p className="muted" style={{ margin: '8px 4px 0' }}>Train with the people who keep you showing up.</p>
      <div className="card list" style={{ marginTop: 18 }}>
        {FRIEND_FEATURES.map(([t, d]) => (
          <div key={t} className="cell" style={{ alignItems: 'flex-start' }}>
            <span className="grow">
              <span style={{ display: 'block', fontWeight: 600 }}>{t}</span>
              <span className="small muted">{d}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
