/** Epley estimated 1RM, only for 1–12 rep sets. */
export function epley(weight: number, reps: number): number | null {
  if (reps < 1 || reps > 12 || weight <= 0) return null
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}
