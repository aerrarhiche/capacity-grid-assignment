import { useEffect, useRef, useState } from 'react'

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

type PendingEdit = {
  id: number
  value: string
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
  const [editing, setEditing] = useState<PendingEdit | null>(null)
  const [query, setQuery] = useState('')

  const cancelledRef = useRef(false)
  const savingRef = useRef(false)

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

  const startEdit = (p: Person) => {
    cancelledRef.current = false
    setEditing({ id: p.id, value: String(p.weeklyHours) })
  }

  const saveEdit = (id: number, value: string) => {
    if (savingRef.current) return
    const val = Number(value)
    if (value.trim() === '' || !Number.isFinite(val) || val < 0) {
      setError('Weekly hours must be a non-negative number.')
      setEditing(null)
      return
    }

    savingRef.current = true
    setEditing(null)

    fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyHours: val }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to save (${res.status})`)
        }
        return res.json() as Promise<{ id: number; weeklyHours: number }>
      })
      .then((updated) => {
        setData((d) =>
          d
            ? {
                ...d,
                people: d.people.map((p) =>
                  p.id === updated.id ? { ...p, weeklyHours: updated.weeklyHours } : p,
                ),
              }
            : d,
        )
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        savingRef.current = false
      })
  }

  const trimmedQuery = query.trim().toLowerCase()
  const visiblePeople = data
    ? data.people.filter((p) => p.name.toLowerCase().includes(trimmedQuery))
    : []

  const overCount = visiblePeople.filter((p) => p.allocations.some((a) => a > p.weeklyHours)).length

  return (
    <div className="card">
      <div className="toolbar">
        <div className="week-nav">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous week">
            ‹
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Next week">
            ›
          </button>
        </div>
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <input
          type="search"
          className="search"
          placeholder="Search by name"
          aria-label="Search by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {data && (
          <span className="summary">
            <strong>{overCount}</strong> {overCount === 1 ? 'person' : 'people'} over-allocated
          </span>
        )}
      </div>

      {invalidRange && <p className="error">From must be on or before To.</p>}
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {data && !loading && trimmedQuery !== '' && visiblePeople.length === 0 && (
        <p className="muted">No people match "{query}".</p>
      )}

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
              {visiblePeople.map((p) => {
                const editValue = editing && editing.id === p.id ? editing.value : null
                return (
                  <tr key={p.id}>
                    <th scope="row" className="person-col">
                      {p.name}
                      {editValue !== null ? (
                        <input
                          type="number"
                          min="0"
                          step="any"
                          autoFocus
                          className="capacity-input"
                          value={editValue}
                          onChange={(e) => setEditing({ id: p.id, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEdit(p.id, editValue)
                            } else if (e.key === 'Escape') {
                              cancelledRef.current = true
                              setEditing(null)
                            }
                          }}
                          onBlur={() => {
                            if (cancelledRef.current) {
                              cancelledRef.current = false
                              return
                            }
                            saveEdit(p.id, editValue)
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="capacity"
                          title="Edit weekly hours"
                          onClick={() => startEdit(p)}
                        >
                          {fmtHours(p.weeklyHours)}h/wk
                          <span className="edit-hint" aria-hidden="true">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" focusable="false">
                              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                            </svg>
                          </span>
                        </button>
                      )}
                    </th>
                    {p.allocations.map((alloc, i) => {
                      const over = alloc > p.weeklyHours
                      return (
                        <td key={i} className={over ? 'over' : undefined}>
                          <span className="alloc">{fmtHours(alloc)}</span>
                          <span className="cap"> / {fmtHours(p.weeklyHours)}</span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
