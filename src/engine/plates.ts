export interface PlateBreakdown {
  barWeight: number
  totalWeight: number
  perSideWeight: number
  platesPerSide: { weight: number; count: number }[]
  /** Per-side weight that the available plates cannot make up. */
  remainderUnloadable: number
}

/** Greedy per-side plate calculator. */
export function calculatePlatesPerSide(
  targetWeight: number,
  barWeight = 45,
  availablePlates: number[] = [45, 35, 25, 10, 5, 2.5],
): PlateBreakdown {
  const perSide = Math.max(0, (targetWeight - barWeight) / 2)
  let remaining = perSide
  const platesPerSide: { weight: number; count: number }[] = []
  for (const plate of [...availablePlates].sort((a, b) => b - a)) {
    if (remaining >= plate) {
      const count = Math.floor(remaining / plate)
      platesPerSide.push({ weight: plate, count })
      remaining = Number((remaining - count * plate).toFixed(2))
    }
  }
  return { barWeight, totalWeight: targetWeight, perSideWeight: perSide, platesPerSide, remainderUnloadable: remaining }
}

export function describePlates(b: PlateBreakdown): string {
  if (b.platesPerSide.length === 0) return 'Empty bar'
  return b.platesPerSide.map((p) => (p.count > 1 ? `${p.count}×${p.weight}` : `${p.weight}`)).join(' + ') + ' per side'
}
