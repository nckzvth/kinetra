import { describe, expect, it } from 'vitest'
import { createDefaultProfile, createSeedStates } from '../domain/defaults'
import type { ExerciseState, Profile, SessionLog, SessionPlan } from '../domain/types'
import { buildSessionPlan as build, feelerSet, prescriptionLabel } from './plan'
import { FULL_BODY_3, PPL_RAMP, PHASES } from '../domain/program'
import { evaluateSession as evaluate } from './progression'
import { calculatePlatesPerSide } from './plates'
import { projectSchedule, suggestNextDate, toISODate } from './schedule'
import { calculateWarmups } from './warmup'

const NOW = '2026-11-16T12:00:00.000Z'

const buildSessionPlan = (p: Profile, st: Record<string, ExerciseState>, o?: Parameters<typeof build>[3]) => build(p, st, PPL_RAMP, o)
const evaluateSession = (...a: [SessionPlan, SessionLog, Record<string, ExerciseState>, Profile, { now?: string; joint_pain?: boolean }]) =>
  evaluate(a[0], a[1], a[2], a[3], PPL_RAMP, a[4])

function fresh() {
  const profile: Profile = { ...createDefaultProfile(NOW), active_program_id: 'p1' }
  const states: Record<string, ExerciseState> = Object.fromEntries(createSeedStates(NOW).map((s) => [s.exercise_id, s]))
  return { profile, states }
}

/** Logs every set at its tap target, with optional per-exercise overrides. */
function logFor(plan: SessionPlan, overrides: Record<string, number[]> = {}): SessionLog {
  const reps: SessionLog['reps'] = {}
  const weights: SessionLog['weights'] = {}
  for (const ex of plan.exercises) {
    reps[ex.key] = overrides[ex.exercise_id] ?? ex.sets.map((s) => s.target_reps)
    weights[ex.key] = ex.weight_lbs
  }
  return { reps, weights }
}

/** Runs one session through the engine and returns the updated world. */
function run(
  w: { profile: Profile; states: Record<string, ExerciseState> },
  overrides: Record<string, number[]> = {},
  joint_pain = false,
) {
  const plan = buildSessionPlan(w.profile, w.states)
  const out = evaluateSession(plan, logFor(plan, overrides), w.states, w.profile, { now: NOW, joint_pain })
  return { plan, result: out.result, world: { profile: { ...w.profile, ...out.profile }, states: out.states } }
}

const ws = (plan: SessionPlan) => plan.exercises[0].warmups.map((s) => `${s.weight_lbs}x${s.reps}`)

describe('warmup ramp (resolution #1)', () => {
  it('produces strictly increasing sets with >=10 lb steps and a gap below working weight', () => {
    for (let w = 45; w <= 405; w += 5) {
      const sets = calculateWarmups(w)
      for (let i = 1; i < sets.length; i++) {
        expect(sets[i].weight_lbs).toBeGreaterThanOrEqual(sets[i - 1].weight_lbs + 10)
      }
      expect(sets.at(-1)!.weight_lbs).toBeLessThanOrEqual(Math.max(45, w - 10))
    }
  })

  it('matches the Day-0 starting weights', () => {
    expect(calculateWarmups(75).map((s) => `${s.weight_lbs}x${s.reps}`)).toEqual(['45x8', '55x5'])
    expect(calculateWarmups(50).map((s) => `${s.weight_lbs}x${s.reps}`)).toEqual(['45x8'])
    expect(calculateWarmups(115, { exerciseId: 'barbell_deadlift' }).map((s) => `${s.weight_lbs}x${s.reps}`)).toEqual(['45x8', '65x5', '85x3'])
    expect(calculateWarmups(115, { exerciseId: 'barbell_deadlift' })[0].note).toMatch(/RDL/)
    expect(calculateWarmups(65).map((s) => `${s.weight_lbs}x${s.reps}`)).toEqual(['45x8'])
    expect(calculateWarmups(95, { exerciseId: 'barbell_back_squat' }).map((s) => `${s.weight_lbs}x${s.reps}`)).toEqual(['45x10', '70x5'])
  })

  it('adds the ~88% CNS primer at 135+', () => {
    expect(calculateWarmups(185).map((s) => `${s.weight_lbs}x${s.reps_label}`)).toEqual(['45x8–10', '100x5', '140x3', '165x1–2'])
  })
})

describe('plate calculator', () => {
  it('loads 60 lb as 5 + 2.5 per side', () => {
    const b = calculatePlatesPerSide(60)
    expect(b.platesPerSide).toEqual([{ weight: 5, count: 1 }, { weight: 2.5, count: 1 }])
    expect(b.remainderUnloadable).toBe(0)
  })
  it('loads 225 as 45 + 45 per side', () => {
    expect(calculatePlatesPerSide(225).platesPerSide).toEqual([{ weight: 45, count: 2 }])
  })
  it('reports unloadable remainder', () => {
    expect(calculatePlatesPerSide(46).remainderUnloadable).toBe(0.5)
  })
})

describe('QA Test Case 1 — Day 0 queue', () => {
  it('queues Push A with bench 75, DB OHP 25, pushdown 30', () => {
    const { profile, states } = fresh()
    const plan = buildSessionPlan(profile, states)
    expect(plan.rotation_code).toBe('PUSH_A')
    expect(plan.readiness.map((r) => r.id)).toEqual(['temp', 'shoulder'])
    expect(plan.exercises.map((e) => [e.exercise_id, e.weight_lbs, prescriptionLabel(e)])).toEqual([
      ['barbell_bench_press_heavy', 75, '3×5'],
      ['dumbbell_overhead_press_volume', 25, '3×8–10'],
      ['triceps_rope_pushdown', 30, '3×10–12'],
    ])
    expect(ws(plan)).toEqual(['45x8', '55x5'])
  })
})

describe('QA Test Case 2 — cross-week A/B carryover', () => {
  it('progresses each lift independently', () => {
    let w = fresh()
    const s1 = run(w, { barbell_bench_press_heavy: [5, 5, 5], dumbbell_overhead_press_volume: [10, 10, 10], triceps_rope_pushdown: [12, 11, 10] })
    expect(s1.result.gate_after).toBe(1)
    w = s1.world
    const plans: SessionPlan[] = []
    for (let i = 2; i <= 6; i++) {
      const r = run(w)
      plans.push(r.plan)
      w = r.world
    }
    // Session 4 = Push B: OHP untouched by bench progress
    expect(plans[2].rotation_code).toBe('PUSH_B')
    expect(plans[2].exercises[0].weight_lbs).toBe(50)
    // Session 7 = Push A
    const s7 = buildSessionPlan(w.profile, w.states)
    expect(s7.rotation_code).toBe('PUSH_A')
    const byId = Object.fromEntries(s7.exercises.map((e) => [e.exercise_id, e]))
    expect(byId.barbell_bench_press_heavy.weight_lbs).toBe(80)
    expect(byId.dumbbell_overhead_press_volume.weight_lbs).toBe(30)
    expect(byId.triceps_rope_pushdown.weight_lbs).toBe(30)
    // Double progression suggests last +1 within the window: 12,11,10 -> 12,12,11
    expect(byId.triceps_rope_pushdown.sets.map((s) => s.target_reps)).toEqual([12, 12, 11])
  })
})

describe('QA Test Case 3 — single miss pauses the gate', () => {
  it('holds gate at 7 and deadlift at 125', () => {
    let w = fresh()
    for (let i = 1; i <= 7; i++) w = run(w).world
    expect(w.profile.phase_gate_progress).toBe(7)
    const s8 = run(w, { barbell_deadlift: [4] })
    expect(s8.plan.rotation_code).toBe('PULL_A')
    expect(s8.plan.exercises[0].weight_lbs).toBe(125)
    expect(s8.result.counted_toward_gate).toBe(false)
    expect(s8.world.profile.phase_gate_progress).toBe(7)
    expect(s8.world.states.barbell_deadlift.consecutive_failures).toBe(1)
    w = s8.world
    for (let i = 9; i <= 13; i++) w = run(w).world
    const s14 = buildSessionPlan(w.profile, w.states)
    expect(s14.rotation_code).toBe('PULL_A')
    expect(s14.exercises[0].weight_lbs).toBe(125)
  })
})

describe('QA Test Case 4 — two misses trigger 10% deload', () => {
  it('deloads bench 90 -> 80 and resets failures', () => {
    let w = fresh()
    w.states.barbell_bench_press_heavy.current_working_weight_lbs = 90
    const a = run(w, { barbell_bench_press_heavy: [5, 5, 4] })
    expect(a.world.states.barbell_bench_press_heavy.current_working_weight_lbs).toBe(90)
    w = a.world
    for (let i = 0; i < 5; i++) w = run(w).world
    const b = run(w, { barbell_bench_press_heavy: [5, 4, 4] })
    expect(b.plan.rotation_code).toBe('PUSH_A')
    expect(b.world.states.barbell_bench_press_heavy.current_working_weight_lbs).toBe(80)
    expect(b.world.states.barbell_bench_press_heavy.consecutive_failures).toBe(0)
    expect(b.result.exercises[0].action).toBe('DELOAD')
  })

  it('counts a successful deloaded session toward the gate', () => {
    let w = fresh()
    w.states.barbell_bench_press_heavy.current_working_weight_lbs = 80
    const r = run(w)
    expect(r.result.counted_toward_gate).toBe(true)
  })
})

describe('QA Test Case 5 — Phase 1 -> 2 promotion', () => {
  it('promotes after 12 counted sessions and injects Phase 2 structure', () => {
    let w = fresh()
    let last
    for (let i = 1; i <= 12; i++) {
      last = run(w)
      w = last.world
    }
    expect(last!.result.promoted).toBe(true)
    expect(w.profile.current_phase).toBe(2)
    expect(w.profile.phase_gate_progress).toBe(0)
    // Rotation continues: session 13 is Push A
    const pushA = buildSessionPlan(w.profile, w.states)
    expect(pushA.rotation_code).toBe('PUSH_A')
    expect(prescriptionLabel(pushA.exercises[0])).toBe('4×5, 1×5+')
    expect(pushA.exercises.map((e) => e.exercise_id)).toContain('incline_dumbbell_press')
    expect(pushA.exercises.filter((e) => e.superset_group === 'PUSH_SS_1')).toHaveLength(2)
    expect(pushA.exercises.some((e) => e.superset_group === 'PUSH_SS_2')).toBe(false)
    const legs = buildSessionPlan(w.profile, w.states, { rotation: 'LEGS_A' })
    expect(prescriptionLabel(legs.exercises[0])).toBe('2×5, 1×5+')
    const pull = buildSessionPlan(w.profile, w.states, { rotation: 'PULL_A' })
    expect(pull.exercises.find((e) => e.exercise_id === 'hammer_curls')!.sets).toHaveLength(3)
    expect(pull.exercises.find((e) => e.exercise_id === 'seated_cable_row')).toBeTruthy()
  })
})

describe('gate rules', () => {
  it('an accessory miss pauses the gate but never deloads the main lift (resolution #2)', () => {
    const r = run(fresh(), { triceps_rope_pushdown: [10, 9, 9] })
    expect(r.result.counted_toward_gate).toBe(false)
    expect(r.world.states.barbell_bench_press_heavy.current_working_weight_lbs).toBe(80)
  })

  it('AMRAP below 5 fails the main lift in Phase 2', () => {
    const w = fresh()
    w.profile.current_phase = 2
    const r = run(w, { barbell_bench_press_heavy: [5, 5, 5, 5, 4] })
    expect(r.result.exercises[0].target_met).toBe(false)
    const r2 = run(w, { barbell_bench_press_heavy: [5, 5, 5, 5, 9] })
    expect(r2.result.exercises[0].target_met).toBe(true)
  })

  it('joint pain blocks the gate only in Phase 3 (resolution #3)', () => {
    const w = fresh()
    expect(run(w, {}, true).result.counted_toward_gate).toBe(true)
    w.profile.current_phase = 3
    const r = run(w, {}, true)
    expect(r.result.counted_toward_gate).toBe(false)
    expect(r.result.gate_blocked_by_joint_pain).toBe(true)
  })

  it('Phase 3 needs 16 sessions; Phase 4 has no gate', () => {
    let w = fresh()
    w.profile.current_phase = 3
    for (let i = 0; i < 15; i++) w = run(w).world
    expect(w.profile.current_phase).toBe(3)
    w = run(w).world
    expect(w.profile.current_phase).toBe(4)
    for (let i = 0; i < 30; i++) w = run(w).world
    expect(w.profile.current_phase).toBe(4)
    expect(w.profile.phase_gate_progress).toBe(0)
  })
})

describe('progression details', () => {
  it('deadlift jumps 10 below 185 and 5 from 185', () => {
    const w = fresh()
    w.profile.next_rotation_index = 1
    w.states.barbell_deadlift.current_working_weight_lbs = 175
    const a = run(w)
    expect(a.world.states.barbell_deadlift.current_working_weight_lbs).toBe(185)
    const w2 = fresh()
    w2.profile.next_rotation_index = 1
    w2.states.barbell_deadlift.current_working_weight_lbs = 185
    expect(run(w2).world.states.barbell_deadlift.current_working_weight_lbs).toBe(190)
  })

  it('squat progresses on both Legs A and Legs B (resolution #6)', () => {
    let w = fresh()
    for (let i = 0; i < 6; i++) w = run(w).world
    expect(w.states.barbell_back_squat.current_working_weight_lbs).toBe(105)
  })

  it('double progression drops a step after two sub-minimum exposures', () => {
    let w = fresh()
    const a = run(w, { triceps_rope_pushdown: [9, 9, 8] })
    expect(a.world.states.triceps_rope_pushdown.current_working_weight_lbs).toBe(30)
    w = a.world
    for (let i = 0; i < 5; i++) w = run(w).world
    const b = run(w, { triceps_rope_pushdown: [9, 8, 8] })
    expect(b.world.states.triceps_rope_pushdown.current_working_weight_lbs).toBe(25)
  })

  it('dumbbell increments follow the equipment step (resolution #5)', () => {
    const w = fresh()
    w.profile.dumbbell_step_lbs = 2.5
    const r = run(w, { dumbbell_overhead_press_volume: [10, 10, 10] })
    expect(r.world.states.dumbbell_overhead_press_volume.current_working_weight_lbs).toBe(27.5)
  })

  it('lateral raises across both Phase 4 supersets are judged together (resolution #6)', () => {
    const w = fresh()
    w.profile.current_phase = 4
    const all20 = run(w, { dumbbell_lateral_raise: [20, 20, 20] })
    expect(all20.result.exercises.filter((e) => e.exercise_id === 'dumbbell_lateral_raise')).toHaveLength(1)
    expect(all20.world.states.dumbbell_lateral_raise.current_working_weight_lbs).toBe(20)
    expect(all20.world.states.dumbbell_lateral_raise.last_reps).toHaveLength(6)
  })

  it('keeps weights when rep windows widen between phases (resolution #8)', () => {
    let w = fresh()
    for (let i = 0; i < 12; i++) w = run(w).world
    const plan = buildSessionPlan(w.profile, w.states)
    const ohp = plan.exercises.find((e) => e.exercise_id === 'dumbbell_overhead_press_volume')!
    expect(ohp.weight_lbs).toBe(w.states.dumbbell_overhead_press_volume.current_working_weight_lbs)
    expect([ohp.reps_min, ohp.reps_max]).toEqual([8, 12])
  })

  it('tracks best e1RM', () => {
    const r = run(fresh())
    expect(r.world.states.barbell_bench_press_heavy.best_e1rm_lbs).toBe(87.5)
  })
})

describe('schedule suggestions (resolution #7)', () => {
  const mon = new Date(2026, 10, 16)
  it('Phase 1 suggests Mon/Wed/Fri with a rest day between', () => {
    const days = projectSchedule(PHASES[1].schedule, null, mon, 6).map(toISODate)
    expect(days).toEqual(['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-23', '2026-11-25', '2026-11-27'])
  })
  it('a missed day shifts the queue instead of skipping a workout', () => {
    // Last session Monday, today is Thursday (missed Wed) -> Friday
    expect(toISODate(suggestNextDate(PHASES[1].schedule, '2026-11-16', new Date(2026, 10, 19)))).toBe('2026-11-20')
  })
  it('Phase 3 rolls every other day', () => {
    expect(projectSchedule(PHASES[3].schedule, '2026-11-16', mon, 3).map(toISODate)).toEqual(['2026-11-18', '2026-11-20', '2026-11-22'])
  })
  it('Phase 4 skips Sundays', () => {
    expect(projectSchedule(PHASES[4].schedule, '2026-11-20', mon, 3).map(toISODate)).toEqual(['2026-11-21', '2026-11-23', '2026-11-24'])
  })
})

describe('feeler set before a second barbell compound', () => {
  it('adds ~60% × 6–8 only when it is a real step above the bar', () => {
    expect(feelerSet(65, 45)).toEqual([])
    expect(feelerSet(135, 45)).toEqual([{ weight_lbs: 80, reps: 6, reps_label: '6–8', rest_sec: 60, note: 'Optional feeler set' }])
  })
  it('appears on Push B volume bench once heavy enough, never on dumbbells', () => {
    const w = fresh()
    w.states.barbell_bench_press_volume.current_working_weight_lbs = 135
    const plan = buildSessionPlan(w.profile, w.states, { rotation: 'PUSH_B' })
    expect(plan.exercises[1].warmups.map((x) => x.weight_lbs)).toEqual([80])
    const pushA = buildSessionPlan(w.profile, w.states, { rotation: 'PUSH_A' })
    expect(pushA.exercises[1].warmups).toEqual([])
  })
})

describe('other programs and units', () => {
  it('full-body template alternates A/B and never gates', () => {
    let w = fresh()
    const run2 = () => {
      const plan = build(w.profile, w.states, FULL_BODY_3)
      const out = evaluate(plan, logFor(plan), w.states, w.profile, FULL_BODY_3, { now: NOW })
      w = { profile: { ...w.profile, ...out.profile }, states: out.states }
      return { plan, out }
    }
    const a = run2()
    expect(a.plan.rotation_code).toBe('FULL_A')
    expect(a.out.result.counted_toward_gate).toBe(false)
    const b = run2()
    expect(b.plan.rotation_code).toBe('FULL_B')
    expect(b.plan.exercises.map((e) => e.exercise_id)).toContain('barbell_deadlift')
    expect(run2().plan.rotation_code).toBe('FULL_A')
    expect(w.profile.current_phase).toBe(1)
  })

  it('uses kg jumps, bar and rounding in metric', () => {
    const w = fresh()
    w.profile.unit_system = 'METRIC'
    w.profile.barbell_weight_lbs = 20
    w.profile.dumbbell_step_lbs = 2
    w.states.barbell_bench_press_heavy.current_working_weight_lbs = 40
    w.states.barbell_deadlift.current_working_weight_lbs = 60
    const r = run(w)
    expect(r.world.states.barbell_bench_press_heavy.current_working_weight_lbs).toBe(42.5)
    expect(r.world.states.dumbbell_overhead_press_volume.current_working_weight_lbs).toBe(25)
    expect(calculateWarmups(60, { unit: 'METRIC', barWeight: 20 }).map((s) => s.weight_lbs)).toEqual([20, 32.5, 45, 52.5])
    const dl = evaluate(
      { ...build(w.profile, w.states, PPL_RAMP, { rotation: 'PULL_A' }) },
      logFor(build(w.profile, w.states, PPL_RAMP, { rotation: 'PULL_A' })),
      w.states,
      w.profile,
      PPL_RAMP,
      { now: NOW },
    )
    expect(dl.states.barbell_deadlift.current_working_weight_lbs).toBe(65)
  })

  it('free-form workouts leave the rotation and gate alone', () => {
    const w = fresh()
    const plan = { ...buildSessionPlan(w.profile, w.states), rotation_code: 'FREE' }
    const out = evaluate(plan, logFor(plan), w.states, w.profile, PPL_RAMP, { now: NOW })
    expect(out.profile.next_rotation_index).toBe(0)
    expect(out.result.counted_toward_gate).toBe(false)
    expect(out.states.barbell_bench_press_heavy.current_working_weight_lbs).toBe(80)
  })
})
