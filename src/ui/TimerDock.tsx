import { useEffect } from 'react'
import { chime, formatClock, timer, useNow, useTimer } from './timer'

export function TimerDock() {
  const t = useTimer()
  const now = useNow(250, !!t)
  const remaining = t ? (t.endsAt - now) / 1000 : 0

  useEffect(() => {
    if (t && !t.fired && remaining <= 0) {
      timer.markFired()
      chime(t.missed ? 3 : 2)
    }
  }, [t, remaining])

  if (!t) return null
  const total = (t.endsAt - t.startedAt) / 1000
  const over = remaining <= 0
  const pct = over ? 100 : Math.min(100, ((total - remaining) / total) * 100)

  return (
    <div className={`dock${t.missed ? ' missed' : ''}`} role="timer" aria-live="off">
      <div className="dock-progress"><div style={{ width: `${pct}%` }} /></div>
      <div className="dock-inner">
        <div className="grow">
          <div className={`dock-time num${over ? ' over' : ''}`}>{over ? `+${formatClock(-remaining)}` : formatClock(remaining)}</div>
          <div className="dock-label">{over ? (t.ref?.startsWith('ready#') ? 'Warm-up done — next one' : 'Rest done — go') : t.label}</div>
        </div>
        {!over && (
          <>
            <button className="btn sm" onClick={() => timer.adjust(-15)} aria-label="Subtract 15 seconds">−15</button>
            <button className="btn sm" onClick={() => timer.adjust(30)} aria-label="Add 30 seconds">+30</button>
          </>
        )}
        <button className="btn sm" onClick={() => timer.clear()}>{over ? 'Dismiss' : 'Skip'}</button>
      </div>
    </div>
  )
}
