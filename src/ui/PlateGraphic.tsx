import { calculatePlatesPerSide, describePlates } from '../engine/plates'
import { fmtWeight } from './hooks'

const PLATE_STYLE: Record<string, { h: number; color: string }> = {
  '45': { h: 110, color: '#2f6bff' },
  '35': { h: 96, color: '#e0a100' },
  '25': { h: 84, color: '#1f9d55' },
  '10': { h: 62, color: '#555a66' },
  '5': { h: 50, color: '#c7362f' },
  '2.5': { h: 40, color: '#7a4fd6' },
  '1.25': { h: 32, color: '#8a8a91' },
}

export function PlateGraphic({ weight, bar, plates }: { weight: number; bar: number; plates: number[] }) {
  const b = calculatePlatesPerSide(weight, bar, plates)
  const flat = b.platesPerSide.flatMap((p) => Array.from({ length: p.count }, () => p.weight))
  return (
    <div>
      <div className="bar-graphic" aria-label={`${describePlates(b)}`}>
        <div className="bar-shaft" />
        <div className="bar-sleeve" />
        {flat.map((p, i) => {
          const s = PLATE_STYLE[String(p)] ?? { h: 50, color: '#666' }
          return (
            <div key={i} className="plate" style={{ height: s.h, background: s.color }}>
              <span>{fmtWeight(p)}</span>
            </div>
          )
        })}
        <div className="bar-end" />
      </div>
      <p className="num" style={{ textAlign: 'center', fontWeight: 600 }}>{describePlates(b)}</p>
      <p className="small faint" style={{ textAlign: 'center', marginTop: 2 }}>
        {fmtWeight(bar)} lb bar + {fmtWeight(b.perSideWeight)} lb each side
      </p>
      {b.remainderUnloadable > 0 && (
        <p className="small" style={{ textAlign: 'center', color: 'var(--warn-text)', marginTop: 6 }}>
          {fmtWeight(b.remainderUnloadable)} lb per side can't be loaded with your plates
        </p>
      )}
    </div>
  )
}
