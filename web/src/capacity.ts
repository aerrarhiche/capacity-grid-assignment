// Pure helpers for the capacity grid. Kept out of the component so they can be
// tested on their own, without rendering anything.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

// fmtHours drops the floating point noise that eighths and sixteenths leave
// behind, so 7.999999999 shows as 8.
export function fmtHours(n: number): string {
  return String(Number(n.toFixed(4)))
}

// parseWeeklyHours reads the editor input. It returns the number when the value
// is a usable capacity, or null when it is not. Zero is valid.
export function parseWeeklyHours(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

// isOverAllocated reports whether any week has more hours allocated than the
// person has capacity. Comparing directly avoids dividing by zero, which matters
// because one person has a weekly capacity of 0.
export function isOverAllocated(allocations: number[], weeklyHours: number): boolean {
  return allocations.some((a) => a > weeklyHours)
}

export function matchesQuery(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.trim().toLowerCase())
}
