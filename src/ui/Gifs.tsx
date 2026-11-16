import { useEffect, useRef, useState } from 'react'
import { searchGifs, type GifResult, type NoteGif } from '../data/social'
import { Sheet } from './Sheet'

const SUGGESTED = ['Let’s go', 'Flex', 'Beast mode', 'Proud', 'Applause', 'Gym']

/** GIPHY search sheet: trending by default, two-column masonry, attribution as GIPHY requires. */
export function GifPicker({ onPick, onClose }: { onPick: (g: NoteGif) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [gifs, setGifs] = useState<GifResult[]>([])
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const load = async (query: string, offset: number) => {
    const n = ++seq.current
    setBusy(true)
    setError(null)
    try {
      const r = await searchGifs(query, offset)
      if (n !== seq.current) return
      setGifs((prev) => (offset ? [...prev, ...r.gifs.filter((g) => !prev.some((p) => p.id === g.id))] : r.gifs))
      setMore(r.more)
    } catch (e) {
      if (n === seq.current) setError((e as Error).message)
    } finally {
      if (n === seq.current) setBusy(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void load(q, 0), q ? 350 : 0)
    return () => clearTimeout(t)
  }, [q])

  // Split into two columns by running height so the grid stays balanced.
  const cols: [GifResult[], GifResult[]] = [[], []]
  const h = [0, 0]
  for (const g of gifs) {
    const i = h[0] <= h[1] ? 0 : 1
    cols[i].push(g)
    h[i] += g.h / (g.w || 1)
  }

  return (
    <Sheet title="GIFs" onClose={onClose} right={<button className="btn ghost" onClick={onClose}>Cancel</button>}>
      <input className="input" type="search" enterKeyHint="search" placeholder="Search GIPHY" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search GIFs" autoFocus />
      {!q && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {SUGGESTED.map((s) => (
            <button key={s} className="chip" style={{ height: 30, padding: '0 12px', fontSize: 14 }} onClick={() => setQ(s)}>{s}</button>
          ))}
        </div>
      )}
      {error ? (
        <p className="small muted" style={{ textAlign: 'center', margin: '28px 0' }}>{error}</p>
      ) : !busy && !gifs.length ? (
        <p className="small muted" style={{ textAlign: 'center', margin: '28px 0' }}>No GIFs for “{q}”</p>
      ) : (
        <div className="gif-grid">
          {cols.map((col, ci) => (
            <div key={ci} className="gif-col">
              {col.map((g) => (
                <button key={g.id} className="gif-cell" style={{ aspectRatio: `${g.w} / ${g.h}` }} onClick={() => onPick(g)} aria-label={g.title || 'GIF'}>
                  <img src={g.url} alt={g.title || ''} loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {busy && <p className="tiny muted" style={{ textAlign: 'center', margin: '12px 0' }}>Loading…</p>}
      {more && !busy && !error && (
        <button className="btn secondary" style={{ width: '100%', marginTop: 12 }} onClick={() => void load(q, gifs.length)}>More GIFs</button>
      )}
      <div className="giphy-attr">Powered by <b>GIPHY</b></div>
    </Sheet>
  )
}

/** A GIF shown inside a note. */
export function GifView({ gif, onRemove }: { gif: NoteGif; onRemove?: () => void }) {
  return (
    <span className="gif-view" style={{ aspectRatio: `${gif.w || 1} / ${gif.h || 1}` }}>
      <img src={gif.url} alt={gif.title || 'GIF'} loading="lazy" decoding="async" />
      {onRemove && (
        <button className="gif-remove" onClick={onRemove} aria-label="Remove GIF">×</button>
      )}
    </span>
  )
}
