import { useEffect, useRef, useState } from 'react'
import { addDays, fmtHours, isOverAllocated, matchesQuery, parseWeeklyHours, weekLabel } from './capacity'

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

// A save that is waiting to be sent, or one already in flight.
type SaveJob = {
  id: number
  hours: number
}

// A window that shows the hand-crafted edge cases (partial weeks, weekend
// straddling, a zero-capacity person) and some over-allocation.
const DEFAULT_FROM = '2025-12-29'
const DEFAULT_TO = '2026-01-16'

export function CapacityGrid() {
  const [from, setFrom] = useState(DEFAULT_FROM)
  const [to, setTo] = useState(DEFAULT_TO)
  const [data, setData] = useState<Capacity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<PendingEdit | null>(null)
  const [query, setQuery] = useState('')

  // Counts saves that have been queued but not finished. Drives the saving
  // indicator, so a slow save is visible instead of silent.
  const [pendingSaves, setPendingSaves] = useState(0)

  const cancelledRef = useRef(false)

  // Saves run one at a time. A second edit made while a save is still in flight
  // is queued here instead of being dropped, so a fast manager never loses a
  // change silently.
  const queueRef = useRef<SaveJob[]>([])
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
        // Drop the previous grid so the new dates are never shown above stale
        // numbers. An error for the new range, and no old data beside it.
        setData(null)
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

  // saveEdit validates the typed value and hands it to the queue. It returns
  // whether the edit was accepted, so the caller can decide what to do with the
  // editor.
  const saveEdit = (id: number, value: string): boolean => {
    const hours = parseWeeklyHours(value)
    if (hours === null) {
      setError('Weekly hours must be a non-negative number.')
      return false
    }

    setError(null)
    queueRef.current.push({ id, hours })
    setPendingSaves((n) => n + 1)
    drainQueue()
    return true
  }

  // drainQueue sends queued saves one at a time. Each save clears any previous
  // error when it succeeds, so a stale banner never outlives the problem.
  const drainQueue = () => {
    if (savingRef.current) return
    const job = queueRef.current.shift()
    if (!job) return

    savingRef.current = true

    fetch(`/api/people/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyHours: job.hours }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to save (${res.status})`)
        }
        return res.json() as Promise<{ id: number; weeklyHours: number }>
      })
      .then((updated) => {
        setError(null)
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
        setPendingSaves((n) => Math.max(0, n - 1))
        // A queued edit may have arrived while this one was in flight.
        drainQueue()
      })
  }

  const trimmedQuery = query.trim().toLowerCase()
  const visiblePeople = data ? data.people.filter((p) => matchesQuery(p.name, query)) : []

  const overCount = visiblePeople.filter((p) => isOverAllocated(p.allocations, p.weeklyHours)).length

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
        {pendingSaves > 0 && (
          <span className="saving" role="status" aria-live="polite">
            Saving…
          </span>
        )}
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
            <caption className="visually-hidden">
              Allocated hours and capacity per person, for each week in the selected range.
            </caption>
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
                          aria-label={`Weekly hours for ${p.name}`}
                          value={editValue}
                          onChange={(e) => setEditing({ id: p.id, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              if (saveEdit(p.id, editValue)) setEditing(null)
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
                            if (saveEdit(p.id, editValue)) setEditing(null)
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
