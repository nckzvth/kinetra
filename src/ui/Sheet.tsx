import { useEffect, type ReactNode } from 'react'

/**
 * Bottom sheet (centered dialog on wide screens). Pass `title` for a simple header, or
 * `left` / `right` actions for an iOS-style "Cancel · Title · Done" bar.
 */
export function Sheet({
  title,
  onClose,
  left,
  right,
  children,
}: {
  title?: ReactNode
  onClose: () => void
  left?: ReactNode
  right?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {(title || left || right) && (
          <div className="sheet-head">
            <div style={{ minWidth: 64 }}>{left}</div>
            {title && <h3>{title}</h3>}
            <div style={{ minWidth: 64, textAlign: 'right' }}>{right}</div>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/** Large − value + control used for weights, sets and reps. */
export function Stepper({
  label,
  sub,
  value,
  step,
  min = 0,
  max = 9999,
  unit,
  format,
  onChange,
}: {
  label: ReactNode
  sub?: ReactNode
  value: number
  step: number
  min?: number
  max?: number
  unit?: string
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  const round = (v: number) => Math.round(v * 100) / 100
  return (
    <div className="stepper-row">
      <div className="grow">
        <div>{label}</div>
        {sub && <div className="tiny muted">{sub}</div>}
      </div>
      <button className="round-btn" aria-label="Decrease" disabled={value <= min} onClick={() => onChange(Math.max(min, round(value - step)))}>
        <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
      </button>
      <span className="stepper-value">
        {format ? format(value) : value}
        {unit && <small>{unit}</small>}
      </span>
      <button className="round-btn" aria-label="Increase" disabled={value >= max} onClick={() => onChange(Math.min(max, round(value + step)))}>
        <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  )
}
