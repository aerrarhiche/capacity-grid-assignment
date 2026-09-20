import { useEffect, useState } from 'react'

type Person = {
  id: number
  name: string
  weeklyHours: number
  allocations: number[]
}

type Capacity = {
  from: string
  to: string
  weeks: string[]
  people: Person[]
}

// A window that shows the hand-crafted edge cases (partial weeks, weekend
// straddling, a zero-capacity person) and some over-allocation.
const DEFAULT_FROM = '2025-12-29'
const DEFAULT_TO = '2026-01-16'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function fmtHours(n: number): string {
  return String(Number(n.toFixed(4)))
}

export function CapacityGrid() {
  const [from, setFrom] = useState(DEFAULT_FROM)
  const [to, setTo] = useState(DEFAULT_TO)
  const [data, setData] = useState<Capacity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const invalidRange = from > to

  useEffect(() => {
    if (invalidRange) {
      setData(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(`/api/capacity?from=${from}&to=${to}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`)
        }
        return res.json() as Promise<Capacity>
      })
      .then((json) => {
        setData(json)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    return () => controller.abort()
  }, [from, to, invalidRange])

  const shift = (weeks: number) => {
    setFrom((f) => addDays(f, weeks * 7))
    setTo((t) => addDays(t, weeks * 7))
  }

  return (
    <div>
      <div className="toolbar">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous week">
          ‹
        </button>
        <button type="button" onClick={() => shift(1)} aria-label="Next week">
          ›
        </button>
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {invalidRange && <p className="error">From must be on or before To.</p>}
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {data && !loading && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="person-col">Person</th>
                {data.weeks.map((w) => (
                  <th key={w} title={w}>
                    {weekLabel(w)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="person-col">
                    {p.name}
                    <span className="capacity">{fmtHours(p.weeklyHours)}h/wk</span>
                  </th>
                  {p.allocations.map((alloc, i) => {
                    const over = alloc > p.weeklyHours
                    return (
                      <td key={i} className={over ? 'over' : undefined}>
                        {fmtHours(alloc)} / {fmtHours(p.weeklyHours)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
