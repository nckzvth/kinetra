import { useEffect, useState } from 'react'

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}

export function fmtWeight(w: number): string {
  return String(Math.round(w * 100) / 100)
}

export function fmtDuration(sec: number | null): string {
  if (!sec) return '—'
  if (sec < 60) return '<1 min'
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`
}
