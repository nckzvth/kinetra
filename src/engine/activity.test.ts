import { describe, expect, it } from 'vitest'
import { climbStats, cueBetween, formatHMS, formatPace, paceSecPerUnit, parseDuration, roundStateAt, totalRoundSeconds, type RoundConfig } from './activity'

describe('distance & pace', () => {
  it('computes pace from distance and time', () => {
    expect(paceSecPerUnit(3.1, 27 * 60 + 54)).toBe(540)
    expect(formatPace(540, 'mi')).toBe('9:00 /mi')
    expect(paceSecPerUnit(0, 100)).toBeNull()
  })
  it('formats and parses durations', () => {
    expect(formatHMS(3725)).toBe('1:02:05')
    expect(formatHMS(65)).toBe('1:05')
    expect(parseDuration('27:54')).toBe(1674)
    expect(parseDuration('1:02:05')).toBe(3725)
    expect(parseDuration('30')).toBe(1800)
    expect(parseDuration('5:75')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
  })
})

describe('round & bell timer', () => {
  const c: RoundConfig = { rounds: 3, work_sec: 180, rest_sec: 60, prep_sec: 10, warn_sec: 10 }

  it('walks PREP → WORK → REST → … → DONE with no rest after the last round', () => {
    expect(totalRoundSeconds(c)).toBe(10 + 3 * 180 + 2 * 60)
    expect(roundStateAt(c, 0)).toMatchObject({ phase: 'PREP', round: 1, remaining: 10 })
    expect(roundStateAt(c, 10)).toMatchObject({ phase: 'WORK', round: 1, remaining: 180, completed: 0 })
    expect(roundStateAt(c, 185)).toMatchObject({ phase: 'WORK', round: 1, remaining: 5, warning: true })
    expect(roundStateAt(c, 190)).toMatchObject({ phase: 'REST', round: 2, remaining: 60, completed: 1 })
    expect(roundStateAt(c, 250)).toMatchObject({ phase: 'WORK', round: 2 })
    expect(roundStateAt(c, 10 + 240 * 2 + 179)).toMatchObject({ phase: 'WORK', round: 3, remaining: 1 })
    expect(roundStateAt(c, totalRoundSeconds(c))).toMatchObject({ phase: 'DONE', completed: 3 })
  })

  it('emits each cue once at the right transition', () => {
    const cues: string[] = []
    let prev = roundStateAt(c, 0)
    for (let t = 0.25; t <= totalRoundSeconds(c) + 1; t += 0.25) {
      const next = roundStateAt(c, t)
      const cue = cueBetween(prev, next)
      if (cue) cues.push(cue)
      prev = next
    }
    expect(cues).toEqual(['ROUND_START', 'WARNING', 'ROUND_END', 'ROUND_START', 'WARNING', 'ROUND_END', 'ROUND_START', 'WARNING', 'FINISHED'])
  })
})

describe('climbing stats', () => {
  it('tallies sends, rate, points and hardest send', () => {
    const s = climbStats([
      { grade: 'V3', outcome: 'FLASH', attempts: 1 },
      { grade: 'V4', outcome: 'SEND', attempts: 3 },
      { grade: 'V5', outcome: 'ATTEMPT', attempts: 4 },
    ])
    expect(s).toMatchObject({ problems: 3, sends: 2, flashes: 1, sendRate: 67, points: 4 + 5, hardest: 'V4', attempts: 8 })
  })
})
