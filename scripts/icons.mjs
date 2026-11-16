// Generates every app icon from the Slipstream mark. Run: node scripts/icons.mjs
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'

const LINES = [
  'M222 204 C289 141 355 217 422 154',
  'M90 284 C203 221 315 297 428 234',
  'M162 362 C231 299 299 375 368 312',
]

/** @param {{ rounded?: boolean, pad?: number }} o */
export function markSvg({ rounded = true, pad = 0 } = {}) {
  const s = 1 - pad * 2
  const t = 256 * (1 - s)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="flow" gradientUnits="userSpaceOnUse" x1="92" y1="330" x2="420" y2="170">
      <stop offset="0" stop-color="#2F5BFF"/>
      <stop offset="0.55" stop-color="#3B8BFF"/>
      <stop offset="1" stop-color="#22D3EE"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.22" r="0.85">
      <stop offset="0" stop-color="#16224A"/>
      <stop offset="1" stop-color="#090C16"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512"${rounded ? ' rx="112"' : ''} fill="url(#glow)"/>
  <g transform="translate(${t} ${t}) scale(${s})" fill="none" stroke="url(#flow)" stroke-linecap="round">
    ${LINES.map((d, i) => `<path d="${d}" stroke-width="${[30, 42, 30][i]}"${i === 2 ? ' opacity="0.78"' : ''}/>`).join('\n    ')}
  </g>
</svg>
`
}

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

const rounded = markSvg()
const square = markSvg({ rounded: false })
const maskable = markSvg({ rounded: false, pad: 0.1 }) // keeps the mark inside the 80% safe zone

writeFileSync('public/icon.svg', rounded)
writeFileSync('public/favicon.svg', rounded)
writeFileSync('public/pwa-64x64.png', png(rounded, 64))
writeFileSync('public/pwa-192x192.png', png(rounded, 192))
writeFileSync('public/pwa-512x512.png', png(rounded, 512))
writeFileSync('public/maskable-icon-512x512.png', png(maskable, 512))
// iOS rounds home-screen icons itself and needs an opaque square.
writeFileSync('public/apple-touch-icon-180x180.png', png(square, 180))

// favicon.ico: a single 48px PNG wrapped in an ICO header.
const ico48 = png(rounded, 48)
const head = Buffer.alloc(22)
head.writeUInt16LE(0, 0)
head.writeUInt16LE(1, 2)
head.writeUInt16LE(1, 4)
head.writeUInt8(48, 6)
head.writeUInt8(48, 7)
head.writeUInt16LE(1, 10)
head.writeUInt16LE(32, 12)
head.writeUInt32LE(ico48.length, 14)
head.writeUInt32LE(22, 18)
writeFileSync('public/favicon.ico', Buffer.concat([head, ico48]))
console.log('icons written')
