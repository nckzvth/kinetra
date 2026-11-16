import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Fields that bring up the on-screen keyboard. */
const TYPING_FIELD = 'textarea, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=button]):not([hidden])'

/**
 * Bottom sheet (centered dialog on wide screens). Pass `title` for a simple header, or
 * `left` / `right` actions for an iOS-style "Cancel · Title · Done" bar.
 *
 * On phones, a sheet you type into opens from the top of the screen instead (like iOS Mail or
 * Messages compose), so the keyboard can never cover its field or its Send/Post button,
 * whatever the browser reports about the keyboard. Override with `placement`.
 */
export function Sheet({
  title,
  onClose,
  left,
  right,
  children,
  placement,
}: {
  title?: ReactNode
  onClose: () => void
  left?: ReactNode
  right?: ReactNode
  children: ReactNode
  placement?: 'top' | 'bottom'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hasField, setHasField] = useState(false)
  // Before first paint, so the sheet never flashes at the bottom first.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setHasField(!!el.querySelector(TYPING_FIELD))
    check()
    const mo = new MutationObserver(check)
    mo.observe(el, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])
  const top = (placement ?? (hasField ? 'top' : 'bottom')) === 'top'
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // Portal to <body> so a sheet opened from inside a sticky or scrolling area is never clipped or layered under it.
  return createPortal(
    <div className={`scrim${top ? ' top' : ''}`} onClick={onClose}>
      <div ref={ref} className={`sheet${top ? ' top' : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
    </div>,
    document.body,
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
