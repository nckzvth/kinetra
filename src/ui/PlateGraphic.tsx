import { calculatePlatesPerSide } from '../engine/plates'
import { fmtWeight } from './hooks'

/** Colours follow common competition plate colours, by weight in either unit. */
const PLATE_STYLE: Record<string, { h: number; color: string }> = {
  '45': { h: 110, color: '#0a84ff' },
  '25kg': { h: 110, color: '#ff3b30' },
  '35': { h: 98, color: '#ffcc00' },
  '20kg': { h: 106, color: '#0a84ff' },
  '15kg': { h: 98, color: '#ffcc00' },
  '25': { h: 86, color: '#30d158' },
  '10': { h: 66, color: '#8e8e93' },
  '5': { h: 52, color: '#ff453a' },
  '2.5': { h: 42, color: '#5e5ce6' },
  '1.25': { h: 34, color: '#98989d' },
}

export function PlateGraphic({ weight, bar, plates, unit = 'lb' }: { weight: number; bar: number; plates: number[]; unit?: string }) {
  const b = calculatePlatesPerSide(weight, bar, plates)
  const flat = b.platesPerSide.flatMap((p) => Array.from({ length: p.count }, () => p.weight))
  const style = (p: number) => (unit === 'kg' && PLATE_STYLE[`${p}kg`]) || PLATE_STYLE[String(p)] || { h: 50, color: '#8e8e93' }
  const text = b.platesPerSide.length === 0 ? 'Empty bar' : b.platesPerSide.map((p) => (p.count > 1 ? `${p.count} × ${fmtWeight(p.weight)}` : fmtWeight(p.weight))).join(' + ')
  return (
    <div>
      <div className="bar-graphic" aria-hidden="true">
        <div className="bar-shaft" />
        <div className="bar-sleeve" />
        {flat.map((p, i) => (
          <div key={i} className="plate" style={{ height: style(p).h, background: style(p).color }}>
            <span>{fmtWeight(p)}</span>
          </div>
        ))}
        <div className="bar-end" />
      </div>
      <p style={{ textAlign: 'center', fontWeight: 600 }}>{text}{b.platesPerSide.length > 0 && <span className="muted" style={{ fontWeight: 400 }}> on each side</span>}</p>
      {b.remainderUnloadable > 0 && (
        <p className="small" style={{ textAlign: 'center', color: 'var(--warn-text)', marginTop: 4 }}>
          {fmtWeight(b.remainderUnloadable)} {unit} per side can't be made with your plates
        </p>
      )}
    </div>
  )
}
