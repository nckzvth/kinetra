import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * Rest timer built on wall-clock timestamps (not setInterval counting), persisted to
 * localStorage so it survives tab throttling, lock screens and reloads.
 */
export interface RestTimer {
  startedAt: number
  endsAt: number
  label: string
  /** Which set started it, so a correction on that set can retime the rest. */
  ref: string | null
  missed: boolean
  fired: boolean
}

const KEY = 'rest-timer'
const listeners = new Set<() => void>()
let state: RestTimer | null = read()

function read(): RestTimer | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as RestTimer) : null
  } catch {
    return null
  }
}
function write(next: RestTimer | null) {
  state = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export const timer = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  start(seconds: number, label: string, ref: string | null = null, missed = false) {
    unlockAudio()
    if (seconds <= 0) return
    const now = Date.now()
    write({ startedAt: now, endsAt: now + seconds * 1000, label, ref, missed, fired: false })
  },
  /** Re-time the running rest if it belongs to `ref` (e.g. a set was corrected to a miss). */
  retime(ref: string, seconds: number, label: string, missed: boolean) {
    if (state?.ref === ref && !state.fired) write({ ...state, endsAt: state.startedAt + seconds * 1000, label, missed })
    else timer.start(seconds, label, ref, missed)
  },
  adjust(deltaSec: number) {
    if (!state) return
    write({ ...state, endsAt: Math.max(Date.now(), state.endsAt + deltaSec * 1000), fired: false })
  },
  clear() {
    write(null)
  },
  markFired() {
    if (state) write({ ...state, fired: true })
  },
}

export function useTimer() {
  return useSyncExternalStore(timer.subscribe, timer.get, timer.get)
}

export function useNow(intervalMs = 250, active = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    const onVis = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [intervalMs, active])
  return now
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// ─── Audio (Web Audio API, synthesized — no assets) ─────────────────────────

let ctx: AudioContext | null = null
function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* audio unavailable */
  }
}

/** Bell-like chime: a few partials with exponential decay. */
export function chime(strikes = 2) {
  try {
    ctx ??= new AudioContext()
    const c = ctx
    for (let i = 0; i < strikes; i++) {
      const t0 = c.currentTime + i * 0.28
      for (const [mult, gain] of [[1, 0.35], [2.76, 0.12], [5.4, 0.05]] as const) {
        const o = c.createOscillator()
        const g = c.createGain()
        o.type = 'sine'
        o.frequency.value = 880 * mult
        g.gain.setValueAtTime(gain, t0)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2)
        o.connect(g).connect(c.destination)
        o.start(t0)
        o.stop(t0 + 1.25)
      }
    }
  } catch {
    /* audio unavailable */
  }
  try {
    navigator.vibrate?.([180, 80, 180])
  } catch {
    /* ignore */
  }
}

// ─── Screen Wake Lock ───────────────────────────────────────────────────────

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen')
        if (cancelled) void lock?.release()
      } catch {
        /* denied or unsupported */
      }
    }
    void acquire()
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release()
    }
  }, [enabled])
}

/** Round-timer cues: single bell, double woodblock clack, triple bell. */
export function playCue(kind: 'ROUND_START' | 'WARNING' | 'ROUND_END' | 'FINISHED') {
  if (kind === 'ROUND_START') return bell(1)
  if (kind === 'ROUND_END') return bell(3)
  if (kind === 'FINISHED') return bell(4)
  clack(2)
}

function bell(strikes: number) {
  chime(strikes)
}

function clack(times: number) {
  try {
    ctx ??= new AudioContext()
    const c = ctx
    for (let i = 0; i < times; i++) {
      const t0 = c.currentTime + i * 0.16
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'square'
      o.frequency.setValueAtTime(1800, t0)
      o.frequency.exponentialRampToValueAtTime(900, t0 + 0.05)
      g.gain.setValueAtTime(0.25, t0)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08)
      o.connect(g).connect(c.destination)
      o.start(t0)
      o.stop(t0 + 0.1)
    }
  } catch {
    /* audio unavailable */
  }
  try {
    navigator.vibrate?.(60)
  } catch {
    /* ignore */
  }
}

export function primeAudio() {
  unlockAudio()
}
