import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../data/db'
import { getExercise, PRIMARY_LIFT_IDS } from '../domain/catalog'
import { phaseOf } from '../domain/program'
import { rulesFor } from '../domain/units'
import type { ExerciseResult, ExerciseState, Profile, ProgramDef, WorkoutSession } from '../domain/types'
import { fmtDuration, fmtWeight, useMediaQuery } from './hooks'
import { Icon, type IconName } from './Icon'
import { ActivityDetail } from './Activity'

// ─── Session result (post-workout summary & history detail) ─────────────────

const ACTION_CHIP: Record<ExerciseResult['action'], { cls: string; label: (r: ExerciseResult) => string; icon: IconName }> = {
  INCREASE: { cls: 'accent', label: (r) => `+${fmtWeight(r.next_weight_lbs - r.weight_used_lbs)}`, icon: 'arrowUp' },
  HOLD: { cls: '', label: (r) => (r.target_met ? 'Same' : 'Try again'), icon: 'equal' },
  DELOAD: { cls: 'warn', label: () => 'Down 10%', icon: 'arrowDown' },
  DECREASE: { cls: 'warn', label: () => 'Lighter', icon: 'arrowDown' },
}

export function SessionResultView({
  session,
  program,
  unit = 'lb',
  onDone,
  onFinisher,
}: {
  session: WorkoutSession
  program?: ProgramDef | null
  unit?: string
  onDone?: () => void
  onFinisher?: () => void
}) {
  const r = session.result_json
  if (session.rotation_code === 'CUSTOM') return <ActivityDetail session={session} />
  if (!r) return <div className="empty">No result recorded for this session.</div>
  const missed = r.exercises.filter((e) => !e.target_met)
  const nextPhase = program ? phaseOf(program, r.phase_after) : null

  return (
    <>
      {r.promoted && (
        <div className="card card-pad" style={{ background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent', marginBottom: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <Icon name="trophy" size={22} />
            <div>
              <div style={{ fontWeight: 750, fontSize: 18 }}>Phase {r.phase_after} unlocked</div>
              {nextPhase && <div className="small" style={{ opacity: 0.85 }}>{nextPhase.summary}</div>}
            </div>
          </div>
        </div>
      )}
      <div className="card card-pad">
        <div className="eyebrow">
          {new Date(session.started_at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · {fmtDuration(session.duration_seconds)}
        </div>
        <h1 className="page-title" style={{ marginTop: 4 }}>{session.title}</h1>
        <p className="small" style={{ marginTop: 10, fontWeight: 500, color: r.session_target_met && !r.gate_blocked_by_joint_pain ? 'var(--accent-text)' : 'var(--warn-text)' }}>
          {r.gate_blocked_by_joint_pain
            ? "You hit every rep, but reported joint pain, so this one doesn't count toward the next phase."
            : r.session_target_met
              ? 'You hit every rep.'
              : `${missed.length} exercise${missed.length === 1 ? '' : 's'} came up short. That's normal — you'll repeat the weight next time.`}
        </p>
        {r.gate_required !== null && !r.promoted && (
          <>
            <div className="spread small" style={{ marginTop: 14 }}>
              <span className="muted">{r.counted_toward_gate ? 'Counts toward' : "Doesn't count toward"} phase {r.phase_before + 1}</span>
              <span className="num" style={{ fontWeight: 600 }}>{r.gate_after} of {r.gate_required}</span>
            </div>
            <div className="progress"><div style={{ width: `${(r.gate_after / r.gate_required) * 100}%` }} /></div>
          </>
        )}
      </div>

      <div className="section-title"><h2>Next time</h2></div>
      <div className="card list">
        {r.exercises.map((e) => {
          const chip = ACTION_CHIP[e.action]
          return (
            <div key={e.exercise_id} className="result-row">
              <div className="grow">
                <div style={{ fontWeight: 600 }}>
                  {e.name} {!e.target_met && <span className="chip warn" style={{ marginLeft: 4 }}>Below min</span>}
                </div>
                <div className="reps-inline">{e.reps.join(' · ')} <span className="faint">@ {fmtWeight(e.weight_used_lbs)}</span></div>
              </div>
              <div className="num" style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 650 }}>{fmtWeight(e.next_weight_lbs)} {unit}</div>
                <span className={`chip ${chip.cls}`}><Icon name={chip.icon} size={11} /> {chip.label(e)}</span>
              </div>
            </div>
          )
        })}
      </div>
      {session.notes && <p className="small muted" style={{ marginTop: 12 }}>“{session.notes}”</p>}
      {onDone && (
        <div className="row" style={{ marginTop: 20 }}>
          {onFinisher && (
            <button className="btn lg grow" onClick={onFinisher}><Icon name="plus" size={16} /> Add a finisher</button>
          )}
          <button className="btn ink lg grow" onClick={onDone}>Done</button>
        </div>
      )}
    </>
  )
}

// ─── History ────────────────────────────────────────────────────────────────

export function HistoryList({ sessions, selected, onSelect }: { sessions: WorkoutSession[]; selected?: string | null; onSelect: (id: string) => void }) {
  if (sessions.length === 0) return <div className="empty small">Completed workouts show up here.</div>
  return (
    <div>
      {sessions.map((s) => {
        const r = s.result_json
        return (
          <button key={s.id} className="stream-row" aria-current={selected === s.id} onClick={() => onSelect(s.id)}>
            <span className="when">
              {new Date(s.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{s.title}</div>
              <div className="tiny faint">{s.program_phase ? `Phase ${s.program_phase} · ` : ''}{fmtDuration(s.duration_seconds)}</div>
            </div>
            {s.rotation_code === 'CUSTOM' ? (
              <span className="chip info">Activity</span>
            ) : r?.promoted ? (
              <span className="chip accent">Promoted</span>
            ) : s.counted_toward_phase_gate ? (
              <span className="chip accent"><Icon name="check" size={11} /> Gate</span>
            ) : r?.gate_required === null ? null : (
              <span className="chip warn">Paused</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function HistoryView({
  sessions,
  selected,
  onSelect,
  program,
  unit,
  embedded = false,
}: {
  sessions: WorkoutSession[]
  selected: string | null
  onSelect: (id: string | null) => void
  program: ProgramDef | null
  unit: string
  /** Inside the Progress tab, which supplies its own title. */
  embedded?: boolean
}) {
  const s = sessions.find((x) => x.id === selected)
  const wide = useMediaQuery('(min-width: 900px)')
  if (wide) {
    // List and detail side by side, like Mail on a Mac.
    const shown = s ?? sessions[0]
    return (
      <div className="split">
        <div className="split-list">
          {!embedded && <h1 className="page-title" style={{ marginBottom: 14 }}>History</h1>}
          <div className="card" style={{ maxHeight: 'calc(100dvh - 200px)', overflowY: 'auto' }}>
            <HistoryList sessions={sessions} selected={shown?.id ?? null} onSelect={onSelect} />
          </div>
        </div>
        <div className="split-detail" style={{ paddingTop: embedded ? 0 : 52 }}>
          {shown ? <SessionResultView session={shown} program={program} unit={unit} /> : <div className="card empty">Finish a workout and it shows up here.</div>}
        </div>
      </div>
    )
  }
  if (s) {
    return (
      <>
        <button className="back-btn" onClick={() => onSelect(null)}><Icon name="chevronLeft" size={24} /> History</button>
        <SessionResultView session={s} program={program} unit={unit} />
      </>
    )
  }
  return (
    <>
      {!embedded && <h1 className="page-title" style={{ marginBottom: 14 }}>History</h1>}
      <div className="card" style={{ overflow: 'hidden' }}>
        <HistoryList sessions={sessions} onSelect={onSelect} />
      </div>
    </>
  )
}

// ─── Progress ───────────────────────────────────────────────────────────────

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="tiny faint" style={{ height: 36, display: 'grid', placeItems: 'center' }}>After 2 workouts</div>
  const w = 160
  const h = 36
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / (points.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((p - min) / span) * (h - 6)).toFixed(1)}`)
    .join(' ')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

export function ProgressView({ profile, states, program, embedded = false }: { profile: Profile; states: Record<string, ExerciseState>; program: ProgramDef | null; embedded?: boolean }) {
  const unit = rulesFor(profile.unit_system).label
  // Lifts worth charting: the program's main lifts, else anything with an e1RM.
  const lifts = (() => {
    const fromProgram = program
      ? [...new Set(program.phases.flatMap((ph) => Object.values(ph.workouts).flat().map((p) => p.exercise_id)))].filter((id) => {
          const t = getExercise(id).progression_type
          return t === 'LINEAR' || t === 'LINEAR_DEADLIFT'
        })
      : []
    const withData = Object.values(states).filter((s) => s.best_e1rm_lbs).sort((a, b) => (b.best_e1rm_lbs ?? 0) - (a.best_e1rm_lbs ?? 0)).map((s) => s.exercise_id)
    const ids = fromProgram.length ? fromProgram : withData.length ? withData.slice(0, 6) : [...PRIMARY_LIFT_IDS]
    return ids
  })()

  const curves = useLiveQuery(async () => {
    const entries = await db.entries.where('exercise_id').anyOf(lifts).toArray()
    const bySession = new Map<string, { at: string; ex: string; e: number }>()
    for (const e of entries) {
      if (e.set_type === 'WARMUP' || !e.e1rm_lbs || !e.completed_at) continue
      const k = `${e.session_id}:${e.exercise_id}`
      const cur = bySession.get(k)
      if (!cur || e.e1rm_lbs > cur.e) bySession.set(k, { at: e.completed_at, ex: e.exercise_id, e: e.e1rm_lbs })
    }
    const out: Record<string, number[]> = {}
    for (const v of [...bySession.values()].sort((a, b) => a.at.localeCompare(b.at))) (out[v.ex] ??= []).push(v.e)
    return out
  }, [lifts.join(',')])

  const phase = profile.current_phase
  return (
    <>
      {!embedded && <h1 className="page-title">Progress</h1>}
      {program && program.phases.length > 1 && (
        <>
          <div className="section-title" style={embedded ? { marginTop: 4 } : undefined}><h2>{program.name}</h2></div>
          <div className="phase-track">
            {program.phases.map((def) => {
              const p = def.phase
              const cls = p < phase ? 'done' : p === phase ? 'current' : ''
              return (
                <div key={p} className={`phase-step ${cls}`}>
                  <div className="eyebrow">Phase {p}</div>
                  <div style={{ fontWeight: 650, marginTop: 2 }}>{def.short_name}</div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>
                    {def.schedule.type === 'EVERY_N_DAYS' ? 'Every other day' : `${def.days_per_week} days a week`}{def.gate_required ? ` · ${def.gate_required} workouts` : ''}
                  </div>
                  {p === phase && def.gate_required && (
                    <div className="tiny num" style={{ marginTop: 6, fontWeight: 600, color: 'var(--accent-text)' }}>
                      {profile.phase_gate_progress} of {def.gate_required} done
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="small muted" style={{ margin: '10px 4px 0' }}>{phaseOf(program, phase).summary}</p>
        </>
      )}

      <div className="section-title"><h2>Strength</h2><span className="tiny muted">Estimated 1-rep max</span></div>
      <div className="card list">
        {lifts.map((id) => {
          const s = states[id]
          const pts = curves?.[id] ?? []
          return (
            <div key={id} className="result-row">
              <div style={{ width: '40%', minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getExercise(id).name}</div>
                <div className="tiny muted num">
                  {s ? `Working ${fmtWeight(s.current_working_weight_lbs)} ${unit}` : 'Not started'}
                  {s?.consecutive_failures ? <span style={{ color: 'var(--warn-text)' }}> · missed last time</span> : null}
                </div>
              </div>
              <div className="grow"><Sparkline points={pts} /></div>
              <div className="num" style={{ textAlign: 'right', width: 60 }}>
                <div style={{ fontWeight: 700, fontSize: 19 }}>{s?.best_e1rm_lbs ? Math.round(s.best_e1rm_lbs) : '—'}</div>
                <div className="tiny muted">{unit}</div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="group-footer">Estimated from your best set each session (sets of 1–12 reps).</p>
    </>
  )
}

// ─── Roadmap screens (full vision, next build steps) ───────────────────────

export function NutritionRoadmap({ profile }: { profile: Profile }) {
  const macros = [
    { k: 'Calories', v: `${profile.rest_day_calories} / ${profile.training_day_calories}`, u: 'kcal rest / training' },
    { k: 'Protein', v: profile.protein_target_g, u: 'g' },
    { k: 'Carbs', v: profile.carbs_target_g, u: 'g' },
    { k: 'Fat', v: profile.fat_target_g, u: 'g' },
    { k: 'Fiber', v: profile.fiber_target_g, u: 'g' },
  ]
  return (
    <>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="chip info">Next build · step 3</span>
      </div>
      <h1 className="page-title">Nutrition &amp; batch prep</h1>
      <p className="muted" style={{ marginTop: 6, maxWidth: 560 }}>
        A plant-based macro ledger with training-day targets, and a recipe builder that splits a batch into servings and counts down the
        containers left in the fridge.
      </p>
      <div className="section-title"><h2>Your daily targets</h2></div>
      <div className="tile-grid">
        {macros.map((m) => (
          <div key={m.k} className="tile">
            <div className="eyebrow">{m.k}</div>
            <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{m.v}</div>
            <div className="tiny faint">{m.u}</div>
          </div>
        ))}
      </div>
      <div className="section-title"><h2>Coming next</h2></div>
      <div className="card list">
        {[
          ['Macro strip', 'Calories, protein, carbs, fat, fiber and water at the top of every screen.'],
          ['Training-day scaling', '+250 kcal (+45 g carbs, +15 g protein) when a workout is logged that day.'],
          ['Recipe batches', 'Enter bulk ingredients once, set servings, log 1 or 1.5 servings with a tap.'],
          ['Dietary guardrails', '100% plant-based and custom exclusions when filtering saved meals.'],
        ].map(([t, d]) => (
          <div key={t} className="result-row">
            <div>
              <div style={{ fontWeight: 600 }}>{t}</div>
              <div className="small muted">{d}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const id = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(id)
  }, [msg])
  return { toast: msg ? <div className="toast" role="status">{msg}</div> : null, show: setMsg }
}
