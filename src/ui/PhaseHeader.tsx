import { PHASES } from '../domain/program'
import type { Profile } from '../domain/types'

export function PhaseHeader({ profile, compact }: { profile: Profile; compact?: boolean }) {
  const def = PHASES[profile.current_phase]
  const req = def.gate_required
  const pct = req ? Math.round((profile.phase_gate_progress / req) * 1000) / 10 : null
  return (
    <header className="hero">
      <div className="hero-inner">
        <span className="phase-badge">
          Phase {profile.current_phase}
          {!compact && <span style={{ opacity: 0.7, fontWeight: 500 }}>· {def.short_name}</span>}
        </span>
        <div className="gate">
          {req ? (
            <>
              <div className="spread small">
                <span className="muted">{compact ? 'Gate' : `Gate to Phase ${profile.current_phase + 1}`}</span>
                <span className="num">
                  <b>{profile.phase_gate_progress}</b>
                  <span className="faint"> / {req} · {pct}%</span>
                </span>
              </div>
              <div className="gate-bar" aria-hidden="true">
                {Array.from({ length: req }, (_, i) => (
                  <span key={i} className={i < profile.phase_gate_progress ? 'on' : ''} />
                ))}
              </div>
            </>
          ) : (
            <div className="small muted">Full program · linear progression with automatic deloads</div>
          )}
        </div>
      </div>
    </header>
  )
}
