import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../data/db'
import { EXERCISE_BY_ID, PRIMARY_LIFT_IDS } from '../domain/catalog'
import { PHASES } from '../domain/program'
import type { ExerciseResult, ExerciseState, PhaseNumber, Profile, WorkoutSession } from '../domain/types'
import { fmtDuration, fmtWeight } from './hooks'
import { Icon, type IconName } from './Icon'
import { ActivityDetail } from './Activity'

// ─── Session result (post-workout summary & history detail) ─────────────────

const ACTION_CHIP: Record<ExerciseResult['action'], { cls: string; label: (r: ExerciseResult) => string; icon: IconName }> = {
  INCREASE: { cls: 'accent', label: (r) => `+${fmtWeight(r.next_weight_lbs - r.weight_used_lbs)}`, icon: 'arrowUp' },
  HOLD: { cls: '', label: (r) => (r.target_met ? 'Hold' : `Repeat · miss ${r.consecutive_failures}`), icon: 'equal' },
  DELOAD: { cls: 'warn', label: () => 'Deload 10%', icon: 'arrowDown' },
  DECREASE: { cls: 'warn', label: () => 'Step down', icon: 'arrowDown' },
}

export function SessionResultView({ session, onDone, onFinisher }: { session: WorkoutSession; onDone?: () => void; onFinisher?: () => void }) {
  const r = session.result_json
  if (session.rotation_code === 'CUSTOM') return <ActivityDetail session={session} />
  if (!r) return <div className="empty">No result recorded for this session.</div>
  const missed = r.exercises.filter((e) => !e.target_met)
  const nextPhase = PHASES[r.phase_after]

  return (
    <>
      {r.promoted && (
        <div className="card card-pad" style={{ background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'transparent', marginBottom: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <Icon name="trophy" size={22} />
            <div>
              <div style={{ fontWeight: 750, fontSize: 18 }}>Gate cleared — welcome to Phase {r.phase_after}</div>
              <div className="small" style={{ opacity: 0.85 }}>{nextPhase.summary}</div>
            </div>
          </div>
        </div>
      )}
      <div className="card card-pad">
        <div className="eyebrow">
          {new Date(session.started_at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · Phase {r.phase_before} · {fmtDuration(session.duration_seconds)}
        </div>
        <h1 className="page-title" style={{ marginTop: 4 }}>{session.title}</h1>
        <div className="row" style={{ marginTop: 14, gap: 24, alignItems: 'flex-end' }}>
          <div>
            <div className="big-stat num">
              {r.counted_toward_gate ? '+1' : '+0'}
            </div>
            <div className="small muted">gate progress</div>
          </div>
          <div className="grow small" style={{ paddingBottom: 2 }}>
            {r.counted_toward_gate ? (
              <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>Every target met.</span>
            ) : r.gate_blocked_by_joint_pain ? (
              <span style={{ color: 'var(--warn-text)', fontWeight: 600 }}>Targets met, but joint pain was reported, so Phase 3 pauses this one.</span>
            ) : r.gate_required === null ? (
              <span className="muted">Phase 4 has no gate — progression only.</span>
            ) : (
              <span style={{ color: 'var(--warn-text)', fontWeight: 600 }}>
                Paused, not reset — {missed.length} exercise{missed.length === 1 ? '' : 's'} below minimum.
              </span>
            )}
            {r.gate_required !== null && !r.promoted && (
              <div className="muted num">{r.gate_after} / {r.gate_required} toward Phase {r.phase_before + 1}</div>
            )}
          </div>
        </div>
      </div>

      <div className="section-title"><h2>Next exposure</h2></div>
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
                <div style={{ fontWeight: 650 }}>{fmtWeight(e.next_weight_lbs)} lb</div>
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

export function HistoryView({ sessions, selected, onSelect }: { sessions: WorkoutSession[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const s = sessions.find((x) => x.id === selected)
  if (s) {
    return (
      <>
        <button className="btn sm ghost" style={{ marginBottom: 10, marginLeft: -12 }} onClick={() => onSelect(null)}>← All workouts</button>
        <SessionResultView session={s} />
      </>
    )
  }
  return (
    <>
      <h1 className="page-title" style={{ marginBottom: 14 }}>History</h1>
      <div className="card" style={{ overflow: 'hidden' }}>
        <HistoryList sessions={sessions} onSelect={onSelect} />
      </div>
    </>
  )
}

// ─── Progress ───────────────────────────────────────────────────────────────

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="tiny faint" style={{ height: 36, display: 'grid', placeItems: 'center' }}>Needs 2+ sessions</div>
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

export function ProgressView({ profile, states }: { profile: Profile; states: Record<string, ExerciseState> }) {
  const curves = useLiveQuery(async () => {
    const entries = await db.entries.where('exercise_id').anyOf([...PRIMARY_LIFT_IDS]).toArray()
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
  }, [])

  const phase = profile.current_phase
  return (
    <>
      <h1 className="page-title" style={{ marginBottom: 14 }}>Progress</h1>
      <div className="section-title"><h2>Program roadmap</h2></div>
      <div className="phase-track">
        {([1, 2, 3, 4] as PhaseNumber[]).map((p) => {
          const def = PHASES[p]
          const cls = p < phase ? 'done' : p === phase ? 'current' : ''
          return (
            <div key={p} className={`phase-step ${cls}`}>
              <div className="eyebrow">Phase {p}</div>
              <div style={{ fontWeight: 650, marginTop: 2 }}>{def.short_name}</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                {def.days_per_week}×/wk · {def.gate_required ? `${def.gate_required} sessions` : 'ongoing'}
              </div>
              {p === phase && def.gate_required && (
                <div className="tiny num" style={{ marginTop: 6, fontWeight: 600, color: 'var(--accent-text)' }}>
                  {profile.phase_gate_progress} / {def.gate_required}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>{PHASES[phase].summary}</p>

      <div className="section-title"><h2>Main lifts · estimated 1RM</h2></div>
      <div className="card list">
        {PRIMARY_LIFT_IDS.map((id) => {
          const s = states[id]
          const pts = curves?.[id] ?? []
          return (
            <div key={id} className="result-row">
              <div style={{ width: '38%', minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{EXERCISE_BY_ID[id].name}</div>
                <div className="tiny faint num">
                  Working {fmtWeight(s?.current_working_weight_lbs ?? 0)} lb
                  {s?.consecutive_failures ? <span style={{ color: 'var(--warn-text)' }}> · miss {s.consecutive_failures}</span> : null}
                </div>
              </div>
              <div className="grow"><Sparkline points={pts} /></div>
              <div className="num" style={{ textAlign: 'right', width: 64 }}>
                <div style={{ fontWeight: 650 }}>{s?.best_e1rm_lbs ? Math.round(s.best_e1rm_lbs) : '—'}</div>
                <div className="tiny faint">best e1RM</div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="tiny faint" style={{ marginTop: 8 }}>Epley: weight × (1 + reps/30), sets of 1–12 reps.</p>
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
