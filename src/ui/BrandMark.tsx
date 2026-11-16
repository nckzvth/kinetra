import { useId } from 'react'

// Same geometry as scripts/icons.mjs (the app icon): three rising streamlines.
const LINES: [string, number, number][] = [
  ['M222 204 C289 141 355 217 422 154', 30, 1],
  ['M90 284 C203 221 315 297 428 234', 42, 1],
  ['M162 362 C231 299 299 375 368 312', 30, 0.78],
]

/** Kinetra's mark on its navy tile, as an inline SVG so it stays crisp at any size. */
export function BrandMark({ size = 30, radius = 0.22 }: { size?: number; radius?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={`f${id}`} gradientUnits="userSpaceOnUse" x1="92" y1="330" x2="420" y2="170">
          <stop offset="0" stopColor="#2F5BFF" />
          <stop offset="0.55" stopColor="#3B8BFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <radialGradient id={`g${id}`} cx="0.3" cy="0.22" r="0.85">
          <stop offset="0" stopColor="#16224A" />
          <stop offset="1" stopColor="#090C16" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx={512 * radius} fill={`url(#g${id})`} />
      <g fill="none" stroke={`url(#f${id})`} strokeLinecap="round">
        {LINES.map(([d, w, o]) => (
          <path key={d} d={d} strokeWidth={w} opacity={o} />
        ))}
      </g>
    </svg>
  )
}
