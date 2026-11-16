import { useState } from 'react'
import { setMeta } from '../data/db'
import { setWorkingWeight, updateProfile } from '../data/repo'
import { EXERCISE_BY_ID, PRIMARY_LIFT_IDS, STARTING_WEIGHTS_LBS } from '../domain/catalog'
import type { ExerciseState, Profile } from '../domain/types'
import { Icon } from './Icon'
import { NumField } from './Settings'

/** First-run screen: confirm name, equipment and Day-0 weights before session 1. */
export function Welcome({
  profile,
  states,
  canRestore,
  onRestore,
}: {
  profile: Profile
  states: Record<string, ExerciseState>
  canRestore: boolean
  onRestore: () => void
}) {
  const [name, setName] = useState(profile.display_name === 'Lifter' ? '' : profile.display_name)
  const [showAll, setShowAll] = useState(false)
  const accessories = Object.keys(STARTING_WEIGHTS_LBS).filter((id) => !(PRIMARY_LIFT_IDS as readonly string[]).includes(id))

  const row = (id: string) => {
    const ex = EXERCISE_BY_ID[id]
    return (
      <div key={id} className="setting-row">
        <span className="grow">{ex.name}</span>
        <span className="tiny faint">{ex.per_hand ? 'lb/hand' : 'lb'}</span>
        <NumField value={states[id]?.current_working_weight_lbs ?? STARTING_WEIGHTS_LBS[id]} onCommit={(v) => setWorkingWeight(id, v)} />
      </div>
    )
  }

  return (
    <>
      <div className="eyebrow">Welcome</div>
      <h1 className="page-title" style={{ marginTop: 4 }}>Set your starting point</h1>
      <p className="muted" style={{ marginTop: 8 }}>
        You start in Phase 1: three short sessions a week at about half your old working weights, so tendons can catch up with muscle. The
        app adds weight, volume and training days as you clear each gate.
      </p>

      {canRestore && (
        <button className="card card-pad row" style={{ marginTop: 16, width: '100%', textAlign: 'left' }} onClick={onRestore}>
          <Icon name="cloud" size={22} />
          <span className="grow">
            <span style={{ fontWeight: 600, display: 'block' }}>Already training with PPL Ramp?</span>
            <span className="small muted">Sign in to restore your progress from the cloud.</span>
          </span>
          <Icon name="chevron" className="faint" style={{ transform: 'rotate(-90deg)' }} />
        </button>
      )}

      <div className="section-title"><h2>You</h2></div>
      <div className="card list">
        <div className="setting-row">
          <label className="grow" htmlFor="welcome-name">Name</label>
          <input id="welcome-name" className="input" style={{ width: 180 }} value={name} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="setting-row">
          <span className="grow">Barbell <span className="faint small">lb</span></span>
          <NumField value={profile.barbell_weight_lbs} onCommit={(v) => updateProfile({ barbell_weight_lbs: v })} />
        </div>
        <div className="setting-row">
          <span className="grow">Smallest dumbbell jump <span className="faint small">lb</span></span>
          <div className="seg">
            {[2.5, 5].map((s) => (
              <button key={s} aria-pressed={profile.dumbbell_step_lbs === s} onClick={() => updateProfile({ dumbbell_step_lbs: s })}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="section-title"><h2>Main lifts · Day 0</h2><span className="tiny faint">~50% of your old working weight</span></div>
      <div className="card list">{PRIMARY_LIFT_IDS.map(row)}</div>

      <div className="section-title">
        <h2>Accessories</h2>
        <button className="btn sm ghost" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Hide' : `Show ${accessories.length}`}</button>
      </div>
      {showAll && <div className="card list">{accessories.map(row)}</div>}

      <button
        className="btn primary lg block"
        style={{ marginTop: 24 }}
        onClick={async () => {
          if (name.trim()) await updateProfile({ display_name: name.trim() })
          await setMeta('onboarded', true)
        }}
      >
        Start Phase 1
      </button>
      <p className="tiny faint" style={{ textAlign: 'center', marginTop: 8 }}>You can change any of this later in Settings.</p>
    </>
  )
}
