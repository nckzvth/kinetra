import { useMemo, useState, type ReactNode } from 'react'
import { completeOnboarding, programForChoice, type ProgramChoice } from '../data/repo'
import { isSyncConfigured } from '../data/sync'
import { defaultStart, getExercise } from '../domain/catalog'
import type { EquipmentPreset, UnitSystem } from '../domain/types'
import { rulesFor } from '../domain/units'
import { SignInForm } from './Account'
import { fmtWeight, useMediaQuery } from './hooks'
import { Icon, type IconName } from './Icon'
import { Sheet, Stepper } from './Sheet'

const PROGRAMS: { choice: ProgramChoice; icon: IconName; title: string; sub: string }[] = [
  { choice: { kind: 'template', templateId: 'ppl_ramp' }, icon: 'stairs', title: 'Return to lifting', sub: 'Ramp up safely to a 6-day push/pull/legs' },
  { choice: { kind: 'template', templateId: 'full_body_3' }, icon: 'barbell', title: 'Get strong, 3 days a week', sub: 'Full-body barbell basics' },
  { choice: { kind: 'template', templateId: 'upper_lower_4' }, icon: 'columns', title: 'Upper / lower, 4 days', sub: 'Strength and size' },
  { choice: { kind: 'custom', days: 3 }, icon: 'pencil', title: 'Build my own', sub: 'Choose your days and exercises' },
  { choice: { kind: 'track' }, icon: 'activity', title: 'Just track', sub: 'No plan — log any workout or activity' },
]

const PLACES: { preset: EquipmentPreset; icon: IconName; title: string; sub: string }[] = [
  { preset: 'GYM', icon: 'building', title: 'At a gym', sub: 'Barbells, dumbbells, cables and machines' },
  { preset: 'HOME', icon: 'home', title: 'At home', sub: 'A barbell or dumbbells and a few plates' },
  { preset: 'NONE', icon: 'walk', title: 'No equipment', sub: 'Bodyweight, running and other activities' },
]

const sameChoice = (a: ProgramChoice, b: ProgramChoice) =>
  a.kind === b.kind && (a.kind !== 'template' || (b.kind === 'template' && a.templateId === b.templateId))

export function Onboarding({ notify }: { notify: (m: string) => void }) {
  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState<ProgramChoice>(PROGRAMS[0].choice)
  const [customDays, setCustomDays] = useState(3)
  const [preset, setPreset] = useState<EquipmentPreset>('GYM')
  const [unit, setUnit] = useState<UnitSystem>(() => (navigator.language === 'en-US' ? 'IMPERIAL' : 'METRIC'))
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [signingIn, setSigningIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const wide = useMediaQuery('(min-width: 900px)')

  const effectiveChoice: ProgramChoice = choice.kind === 'custom' ? { kind: 'custom', days: customDays } : choice
  const program = useMemo(() => programForChoice(effectiveChoice), [effectiveChoice.kind, customDays, choice])

  /** Main barbell lifts that progress linearly — the only weights worth asking for up front. */
  const mainLifts = useMemo(() => {
    if (!program) return []
    const ids = new Set<string>()
    for (const day of program.days)
      for (const p of program.phases[0].workouts[day.id] ?? []) {
        const t = getExercise(p.exercise_id).progression_type
        if (t === 'LINEAR' || t === 'LINEAR_DEADLIFT') ids.add(p.exercise_id)
      }
    return [...ids]
  }, [program])

  const r = rulesFor(unit)
  const weightOf = (id: string) => weights[id] ?? defaultStart(id, unit)
  const hasWeightsStep = mainLifts.length > 0
  const lastStep = hasWeightsStep ? 3 : 2

  const finish = async () => {
    setBusy(true)
    await completeOnboarding({
      name: '',
      choice: effectiveChoice,
      preset,
      unit,
      startWeights: Object.fromEntries(mainLifts.map((id) => [id, weightOf(id)])),
    })
  }

  const next = () => (step >= lastStep ? void finish() : setStep(step + 1))

  const hero = (
    <>
      <div className="app-glyph"><Icon name="barbell" size={40} /></div>
      <h1 className="hero-title">Train with a plan that adapts.</h1>
      <div className="feature"><Icon name="check" size={22} /><div><b>Tap to log.</b> <span className="muted">One tap per set. The rest timer starts on its own.</span></div></div>
      <div className="feature"><Icon name="arrowUp" size={22} /><div><b>Knows what's next.</b> <span className="muted">Adds weight when you're ready, eases off when you stall.</span></div></div>
      <div className="feature"><Icon name="activity" size={22} /><div><b>More than lifting.</b> <span className="muted">Runs, rounds, climbs and holds in the same place.</span></div></div>
      <div className="feature"><Icon name="cloud" size={22} /><div><b>Phone and computer.</b> <span className="muted">Sign in once and your training follows you.</span></div></div>
    </>
  )
  const signIn = <SignInForm notify={notify} onDone={() => { setSigningIn(false); notify('Signed in — restoring your data') }} />

  // On wide screens the pitch stays in a side panel and the steps sit beside it.
  const shell = (main: ReactNode) =>
    wide ? (
      <div className="ob-shell">
        <aside className="ob-aside">{hero}</aside>
        {main}
      </div>
    ) : (
      main
    )

  if (step === 0) {
    if (wide)
      return shell(
        <div className="ob">
          <div className="ob-body ob-center">
            {signingIn ? (
              <>
                <button className="back-btn" onClick={() => setSigningIn(false)}><Icon name="chevronLeft" size={24} /> Back</button>
                <h1>Sign in</h1>
                <p className="lede">Your program and history will download to this computer.</p>
                {signIn}
              </>
            ) : (
              <>
                <h1>Let's set up your training</h1>
                <p className="lede">Three quick questions. It takes less than a minute, and you can change everything later.</p>
                <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                  <button className="btn tint lg" style={{ minWidth: 200 }} onClick={() => setStep(1)}>Get started</button>
                  {isSyncConfigured() && <button className="btn lg" style={{ background: 'var(--surface)' }} onClick={() => setSigningIn(true)}>I already have an account</button>}
                </div>
              </>
            )}
          </div>
        </div>,
      )
    return (
      <div className="ob">
        <div className="welcome-hero">{hero}</div>
        <div className="ob-foot stack" style={{ gap: 6 }}>
          <button className="btn tint lg block" onClick={() => setStep(1)}>Get started</button>
          {isSyncConfigured() && (
            <button className="btn ghost block" onClick={() => setSigningIn(true)}>I already have an account</button>
          )}
        </div>
        {signingIn && (
          <Sheet title="Sign in" onClose={() => setSigningIn(false)} right={<button className="btn ghost" onClick={() => setSigningIn(false)}>Cancel</button>}>
            <p className="small muted" style={{ margin: '0 4px 14px' }}>Your program and history will download to this device.</p>
            {signIn}
          </Sheet>
        )}
      </div>
    )
  }

  return shell(
    <div className="ob" onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON' && !busy && next()}>
      <div className="ob-top">
        <button className="back-btn" onClick={() => setStep(step - 1)} aria-label="Back">
          <Icon name="chevronLeft" size={24} /> Back
        </button>
        <div className="ob-dots" aria-label={`Step ${step} of ${lastStep}`}>
          {Array.from({ length: lastStep }, (_, i) => <span key={i} className={i + 1 === step ? 'on' : ''} />)}
        </div>
        <span style={{ width: 64 }} />
      </div>

      <div className="ob-body">
        {step === 1 && (
          <>
            <h1>What do you want to do?</h1>
            <p className="lede">Pick a starting point. You can edit every day and exercise later.</p>
            {PROGRAMS.map((p) => {
              const on = sameChoice(p.choice, choice)
              return (
                <div key={p.title}>
                  <button className="choice" aria-pressed={on} onClick={() => setChoice(p.choice)}>
                    <span className="ic"><Icon name={p.icon} size={22} /></span>
                    <span><b>{p.title}</b><small>{p.sub}</small></span>
                    <Icon name="check" size={22} className="tick" />
                  </button>
                  {on && p.choice.kind === 'custom' && (
                    <div className="card" style={{ marginTop: -4, marginBottom: 10 }}>
                      <Stepper label="Days per week" value={customDays} step={1} min={1} max={6} onChange={setCustomDays} />
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {step === 2 && (
          <>
            <h1>Where do you train?</h1>
            <p className="lede">This sets your bar, plates and weight jumps, so the app can do the math.</p>
            {PLACES.map((p) => (
              <button key={p.preset} className="choice" aria-pressed={preset === p.preset} onClick={() => setPreset(p.preset)}>
                <span className="ic"><Icon name={p.icon} size={22} /></span>
                <span><b>{p.title}</b><small>{p.sub}</small></span>
                <Icon name="check" size={22} className="tick" />
              </button>
            ))}
            <div className="card" style={{ marginTop: 18 }}>
              <div className="cell">
                <span className="grow">Units</span>
                <div className="seg">
                  <button aria-pressed={unit === 'IMPERIAL'} onClick={() => setUnit('IMPERIAL')}>lb</button>
                  <button aria-pressed={unit === 'METRIC'} onClick={() => setUnit('METRIC')}>kg</button>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>Starting weights</h1>
            <p className="lede">
              {choice.kind === 'template' && choice.templateId === 'ppl_ramp'
                ? 'Start at about half of what you used to lift. Your tendons will thank you.'
                : 'Pick something you can lift for 5 clean reps. Not sure? Start with the empty bar.'}
            </p>
            <div className="card list">
              {mainLifts.map((id) => (
                <Stepper
                  key={id}
                  label={<span style={{ fontWeight: 500 }}>{getExercise(id).name}</span>}
                  value={weightOf(id)}
                  step={r.barbellIncrement}
                  min={r.bar}
                  unit={r.label}
                  format={fmtWeight}
                  onChange={(v) => setWeights((w) => ({ ...w, [id]: v }))}
                />
              ))}
            </div>
            <button className="btn ghost block" style={{ marginTop: 6 }} onClick={() => setWeights(Object.fromEntries(mainLifts.map((id) => [id, r.bar])))}>
              Start everything at the empty bar ({r.bar} {r.label})
            </button>
            <p className="group-footer">Other exercises start light and adjust after your first session.</p>
          </>
        )}
      </div>

      <div className="ob-foot">
        <button className="btn tint lg block" disabled={busy} onClick={next}>
          {step >= lastStep ? (choice.kind === 'track' ? 'Start tracking' : 'Start training') : 'Continue'}
        </button>
      </div>
    </div>,
  )
}
