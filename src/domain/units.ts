import type { EquipmentPreset, UnitSystem } from './types'

/**
 * Everything unit-specific lives here. Weights are stored and computed in the user's
 * own unit; the engine asks these rules for bar weight, jumps and rounding.
 */
export interface UnitRules {
  unit: UnitSystem
  label: 'lb' | 'kg'
  bar: number
  plates: number[]
  /** Smallest total jump on a barbell (two of the smallest common plates). */
  round: number
  barbellIncrement: number
  deadliftIncrement: number
  /** Below this, deadlifts jump by deadliftIncrement; above it, by barbellIncrement. */
  deadliftTaperAt: number
  cableIncrement: number
  machineIncrement: number
  bigMachineIncrement: number
  dumbbellStep: number
  /** Working weights below which the ~55% / ~75% / ~88% warmup sets are skipped. */
  rampThresholds: [number, number, number]
  /** Minimum gap between consecutive warmup sets. */
  rampMinStep: number
}

export const LB: UnitRules = {
  unit: 'IMPERIAL',
  label: 'lb',
  bar: 45,
  plates: [45, 35, 25, 10, 5, 2.5],
  round: 5,
  barbellIncrement: 5,
  deadliftIncrement: 10,
  deadliftTaperAt: 185,
  cableIncrement: 5,
  machineIncrement: 5,
  bigMachineIncrement: 10,
  dumbbellStep: 5,
  rampThresholds: [60, 70, 135],
  rampMinStep: 10,
}

export const KG: UnitRules = {
  unit: 'METRIC',
  label: 'kg',
  bar: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  round: 2.5,
  barbellIncrement: 2.5,
  deadliftIncrement: 5,
  deadliftTaperAt: 85,
  cableIncrement: 2.5,
  machineIncrement: 2.5,
  bigMachineIncrement: 5,
  dumbbellStep: 2,
  rampThresholds: [27.5, 32.5, 60],
  rampMinStep: 5,
}

export const rulesFor = (unit: UnitSystem): UnitRules => (unit === 'METRIC' ? KG : LB)

export const LB_PER_KG = 2.20462

/** Converts a weight between units, rounded to that unit's usual step. */
export function convertWeight(w: number, from: UnitSystem, to: UnitSystem, step?: number): number {
  if (from === to) return w
  const raw = to === 'METRIC' ? w / LB_PER_KG : w * LB_PER_KG
  const s = step ?? rulesFor(to).round
  return Math.max(0, Math.round(raw / s) * s)
}

export const roundToStep = (w: number, step: number, floor = 0) => Math.max(floor, Math.round(w / step) * step)

/** Plate sets for each equipment preset (a home gym defaults to the common basics). */
export function platesFor(unit: UnitSystem, preset: EquipmentPreset): number[] {
  const r = rulesFor(unit)
  if (preset === 'HOME') return unit === 'METRIC' ? [20, 10, 5, 2.5, 1.25] : [45, 25, 10, 5, 2.5]
  return r.plates
}
