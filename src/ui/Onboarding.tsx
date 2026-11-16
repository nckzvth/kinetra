import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { completeOnboarding, programForChoice, type ProgramChoice } from '../data/repo'
import { enabledProviders, isSyncConfigured, signInWithProvider, signOut, type SocialProvider } from '../data/sync'
import { isStandalone, detectPlatform } from './install'
import { InstallSteps } from './InstallBanner'
import type { Session } from '@supabase/supabase-js'
import { defaultStart, getExercise } from '../domain/catalog'
import type { EquipmentPreset, UnitSystem } from '../domain/types'
import { rulesFor } from '../domain/units'
import { PROVIDER_NAME, ProviderMark, SignInForm } from './Account'
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

export function Onboarding({ notify, session, restoring }: { notify: (m: string) => void; session: Session | null; restoring: boolean }) {
  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState<ProgramChoice>(PROGRAMS[0].choice)
  const [customDays, setCustomDays] = useState(3)
  const [preset, setPreset] = useState<EquipmentPreset>('GYM')
  const [unit, setUnit] = useState<UnitSystem>(() => (navigator.language === 'en-US' ? 'IMPERIAL' : 'METRIC'))
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [signingIn, setSigningIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const wide = useMediaQuery('(min-width: 900px)')
  const [providers, setProviders] = useState<SocialProvider[]>([])
  const [leaving, setLeaving] = useState(false)
  const platform = detectPlatform()
  useEffect(() => {
    void enabledProviders().then(setProviders)
  }, [])

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
      name: fullName,
      choice: effectiveChoice,
      preset,
      unit,
      startWeights: Object.fromEntries(mainLifts.map((id) => [id, weightOf(id)])),
    })
  }

  const next = () => (current >= lastStep ? void finish() : setStep(current + 1))

  const hero = (
    <>
      <div className="row" style={{ gap: 12, marginBottom: 10 }}>
        <div className="app-glyph" style={{ marginBottom: 0 }}><Icon name="barbell" size={40} /></div>
        <span className="wordmark">Kinetra</span>
      </div>
      <h1 className="hero-title">Train with a plan that adapts.</h1>
      <div className="feature"><Icon name="check" size={22} /><div><b>Tap to log.</b> <span className="muted">One tap per set. The rest timer starts on its own.</span></div></div>
      <div className="feature"><Icon name="arrowUp" size={22} /><div><b>Knows what's next.</b> <span className="muted">Adds weight when you're ready, eases off when you stall.</span></div></div>
      <div className="feature"><Icon name="activity" size={22} /><div><b>More than lifting.</b> <span className="muted">Runs, rounds, climbs and holds in the same place.</span></div></div>
      <div className="feature"><Icon name="cloud" size={22} /><div><b>Phone and computer.</b> <span className="muted">Sign in once and your training follows you.</span></div></div>
    </>
  )

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

  const email = session?.user.email ?? null
  const meta = (session?.user.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string }
  const fullName = (meta.full_name ?? meta.name ?? '').trim()
  const firstName = fullName.split(/\s+/)[0] ?? ''
  const avatar = meta.avatar_url ?? meta.picture ?? null

  if (restoring) {
    return shell(
      <div className="ob">
        <div className="ob-body ob-center" style={{ alignItems: 'center', textAlign: 'center', justifyContent: 'center', display: 'flex', flex: 1 }}>
          <div className="spinner" aria-hidden="true" />
          <h1 style={{ fontSize: 24, marginTop: 18 }}>{firstName ? `Welcome back, ${firstName}` : 'Signing you in'}</h1>
          <p className="lede" style={{ marginTop: 6 }}>Getting your training ready…</p>
        </div>
      </div>,
    )
  }

  // Signed-in users have already chosen to be here: skip the pitch and start at question one.
  const current = session && step === 0 ? 1 : step

  if (current === 0) {
    const iphoneSafari = (platform === 'ios' || platform === 'ios-other-browser') && !isStandalone()
    const actions = (
      <div className="stack" style={{ gap: 10, width: '100%', maxWidth: wide ? 380 : undefined }}>
        {providers.map((p) => (
          <button
            key={p}
            className={`btn lg block social social-${p}`}
            disabled={leaving}
            onClick={() => {
              setLeaving(true)
              void signInWithProvider(p).catch(() => setLeaving(false))
            }}
          >
            <ProviderMark provider={p} /> {leaving ? `Opening ${PROVIDER_NAME[p]}…` : `Continue with ${PROVIDER_NAME[p]}`}
          </button>
        ))}
        {isSyncConfigured() && (
          <button className={`btn lg block${providers.length ? '' : ' tint'}`} style={providers.length ? { background: 'var(--surface)' } : undefined} onClick={() => setSigningIn(true)}>
            Continue with email
          </button>
        )}
        <button className="btn ghost block" onClick={() => setStep(1)}>Set up without an account</button>
        <p className="tiny muted" style={{ textAlign: 'center', margin: '-4px 8px 0' }}>
          Without an account, your training stays on this device. You can add one any time.
        </p>
      </div>
    )
    const iphoneNote = iphoneSafari ? (
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600 }}>On iPhone? Add to your Home Screen first.</div>
        <p className="small muted" style={{ marginTop: 4 }}>
          iPhone keeps home-screen apps separate from Safari, so signing in here means signing in again there. Install first and you'll only do it once.
        </p>
        <div style={{ marginTop: 12 }}><InstallSteps /></div>
      </div>
    ) : null
    const emailSheet = signingIn && (
      <Sheet title="Continue with email" onClose={() => setSigningIn(false)} right={<button className="btn ghost" onClick={() => setSigningIn(false)}>Cancel</button>}>
        <SignInForm notify={notify} showProviders={false} onDone={() => setSigningIn(false)} />
      </Sheet>
    )

    if (wide)
      return shell(
        <div className="ob">
          <div className="ob-body ob-center">
            <h1>Get started</h1>
            <p className="lede">Sign in to keep your training backed up and on all your devices, or start right away on this one.</p>
            {actions}
          </div>
          {emailSheet}
        </div>,
      )
    return (
      <div className="ob">
        <div className="welcome-hero" style={{ paddingBottom: 16 }}>{hero}</div>
        <div className="ob-foot">
          {iphoneNote}
          {actions}
        </div>
        {emailSheet}
      </div>
    )
  }

  return shell(
    <div className="ob" onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON' && !busy && next()}>
      <div className="ob-top">
        {session && current === 1 ? (
          <span style={{ width: 80 }} />
        ) : (
          <button className="back-btn" onClick={() => setStep(current - 1)} aria-label="Back">
            <Icon name="chevronLeft" size={24} /> Back
          </button>
        )}
        <div className="ob-dots" aria-label={`Step ${current} of ${lastStep}`}>
          {Array.from({ length: lastStep }, (_, i) => <span key={i} className={i + 1 === current ? 'on' : ''} />)}
        </div>
        {session ? <AccountBadge name={firstName} email={email} avatar={avatar} /> : <span style={{ width: 80 }} />}
      </div>

      <div className="ob-body">
        {current === 1 && (
          <>
            {session && <p className="eyebrow" style={{ fontSize: 15, marginBottom: 6 }}>{firstName ? `Welcome, ${firstName}` : 'Welcome'}</p>}
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

        {current === 2 && (
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

        {current === 3 && (
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
          {current >= lastStep ? (choice.kind === 'track' ? 'Start tracking' : 'Start training') : 'Continue'}
        </button>
      </div>
    </div>,
  )
}

/** Avatar + first name, with a menu to switch accounts. */
function AccountBadge({ name, email, avatar }: { name: string; email: string | null; avatar: string | null }) {
  const [open, setOpen] = useState(false)
  const initials = (name || email || '?').slice(0, 1).toUpperCase()
  return (
    <div style={{ position: 'relative' }}>
      <button className="account-badge" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Signed in as ${email ?? name}`}>
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="avatar-fallback">{initials}</span>}
        <span className="account-badge-name">{name || 'Account'}</span>
      </button>
      {open && (
        <div className="popover" role="menu">
          <div className="small muted" style={{ padding: '10px 14px 6px' }}>Signed in as<br /><span style={{ color: 'var(--text)' }}>{email}</span></div>
          <button className="cell" role="menuitem" style={{ color: 'var(--tint)' }} onClick={() => void signOut()}>Use a different account</button>
        </div>
      )}
    </div>
  )
}
