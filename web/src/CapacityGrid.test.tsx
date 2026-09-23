import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapacityGrid } from './CapacityGrid'

type Person = {
  id: number
  name: string
  weeklyHours: number
  allocations: number[]
}

const WEEKS = ['2025-12-29', '2026-01-05', '2026-01-12']

// A small team chosen to cover the cases the grid has to get right: a person at
// capacity, one over, one with zero capacity, and one with no work at all.
const PEOPLE: Person[] = [
  { id: 1, name: 'Ana Ferreira', weeklyHours: 40, allocations: [40, 0, 30] },
  { id: 2, name: 'Bo Lindqvist', weeklyHours: 40, allocations: [0, 32, 8] },
  { id: 4, name: 'Dee Okafor', weeklyHours: 40, allocations: [0, 45, 40] },
  { id: 5, name: 'Eli Nakamura', weeklyHours: 0, allocations: [0, 20, 0] },
]

const CAPACITY_BODY = { from: '2025-12-29', to: '2026-01-16', weeks: WEEKS, people: PEOPLE }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

// Installs a fetch stub. The default answers the capacity request with the fixed
// team above and succeeds every PATCH.
function stubFetch(overrides: { capacity?: Handler; patch?: Handler } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('/api/capacity')) {
      if (overrides.capacity) return overrides.capacity(url, init)
      return jsonResponse(CAPACITY_BODY)
    }
    if (url.startsWith('/api/people/')) {
      if (overrides.patch) return overrides.patch(url, init)
      const id = Number(url.split('/').pop())
      const body = JSON.parse(String(init?.body ?? '{}')) as { weeklyHours: number }
      const person = PEOPLE.find((p) => p.id === id)
      return jsonResponse({ id, name: person?.name ?? '', weeklyHours: body.weeklyHours })
    }
    throw new Error(`unexpected request: ${url}`)
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// The person column is a row header containing the name and the capacity button.
function personRow(name: string): HTMLTableRowElement {
  return screen.getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr') as HTMLTableRowElement
}

function capacityButton(name: string): HTMLElement {
  return within(personRow(name)).getByRole('button', { name: /h\/wk$/ })
}

async function renderGrid(overrides: Parameters<typeof stubFetch>[0] = {}) {
  const fetchMock = stubFetch(overrides)
  const user = userEvent.setup()
  render(<CapacityGrid />)
  // The grid renders once the first capacity response lands.
  await screen.findByRole('rowheader', { name: /^Ana Ferreira/ })
  return { user, fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('rendering', () => {
  it('shows a row per person and a column per week', async () => {
    await renderGrid()

    expect(screen.getByRole('rowheader', { name: /^Ana Ferreira/ })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /^Eli Nakamura/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Dec 29' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Jan 12' })).toBeInTheDocument()
  })

  it('labels the table for screen readers', async () => {
    await renderGrid()
    expect(screen.getByRole('table', { name: /allocated hours and capacity per person/i })).toBeInTheDocument()
  })

  it('shows allocated hours against capacity for each week', async () => {
    await renderGrid()
    const row = personRow('Ana Ferreira')
    const cells = within(row).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('40')
    expect(cells[1]).toHaveTextContent('0')
    expect(cells[2]).toHaveTextContent('30')
  })

  it('marks only the over-allocated weeks', async () => {
    await renderGrid()
    const cells = within(personRow('Dee Okafor')).getAllByRole('cell')
    expect(cells[0]).not.toHaveClass('over')
    expect(cells[1]).toHaveClass('over') // 45 against a capacity of 40
    expect(cells[2]).not.toHaveClass('over')
  })

  it('treats any work against zero capacity as over-allocated', async () => {
    await renderGrid()
    const cells = within(personRow('Eli Nakamura')).getAllByRole('cell')
    expect(cells[0]).not.toHaveClass('over') // 0 against 0
    expect(cells[1]).toHaveClass('over') // 20 against 0
  })

  it('counts the people who are over-allocated somewhere', async () => {
    await renderGrid()
    // Dee and Eli, not Ana or Bo.
    expect(screen.getByText(/people over-allocated/i)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows the capacity for each person', async () => {
    await renderGrid()
    expect(capacityButton('Ana Ferreira')).toHaveTextContent('40h/wk')
    expect(capacityButton('Eli Nakamura')).toHaveTextContent('0h/wk')
  })
})

describe('week navigation and range', () => {
  it('asks for the default range on first load', async () => {
    const { fetchMock } = await renderGrid()

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('from=2025-12-29')
    expect(url).toContain('to=2026-01-16')
  })

  it('shifts the window forward by one week', async () => {
    const { user, fetchMock } = await renderGrid()
    fetchMock.mockClear()

    await user.click(screen.getByRole('button', { name: 'Next week' }))

    await waitFor(() => {
      const url = String(fetchMock.mock.calls.at(-1)?.[0])
      expect(url).toContain('from=2026-01-05')
      expect(url).toContain('to=2026-01-23')
    })
  })

  it('shifts the window back by one week', async () => {
    const { user, fetchMock } = await renderGrid()
    fetchMock.mockClear()

    await user.click(screen.getByRole('button', { name: 'Previous week' }))

    await waitFor(() => {
      const url = String(fetchMock.mock.calls.at(-1)?.[0])
      expect(url).toContain('from=2025-12-22')
    })
  })

  it('rejects an inverted range without rendering a grid for it', async () => {
    const { user } = await renderGrid()

    const from = screen.getByLabelText('From')
    await user.clear(from)
    await user.type(from, '2026-02-01')

    expect(await screen.findByText(/From must be on or before To/i)).toBeInTheDocument()
    // An inverted range must not leave a table on screen.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('recovers once an inverted range is corrected', async () => {
    const { user } = await renderGrid()

    const from = screen.getByLabelText('From')
    await user.clear(from)
    await user.type(from, '2026-02-01')
    expect(await screen.findByText(/From must be on or before To/i)).toBeInTheDocument()

    await user.clear(from)
    await user.type(from, '2025-12-29')

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
    expect(screen.queryByText(/From must be on or before To/i)).not.toBeInTheDocument()
  })

  it('accepts a range that starts and ends on the same day', async () => {
    const { user } = await renderGrid()

    const to = screen.getByLabelText('To')
    await user.clear(to)
    await user.type(to, '2025-12-29')

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
    expect(screen.queryByText(/From must be on or before To/i)).not.toBeInTheDocument()
  })

  it('does not leave a loading message up after the grid arrives', async () => {
    await renderGrid()
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument()
  })
})

describe('search', () => {
  it('filters the rows by name', async () => {
    const { user } = await renderGrid()

    await user.type(screen.getByLabelText('Search by name'), 'ana')

    expect(screen.getByRole('rowheader', { name: /^Ana Ferreira/ })).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: /^Bo Lindqvist/ })).not.toBeInTheDocument()
  })

  it('matches without regard to case', async () => {
    const { user } = await renderGrid()

    await user.type(screen.getByLabelText('Search by name'), 'FERREIRA')

    expect(screen.getByRole('rowheader', { name: /^Ana Ferreira/ })).toBeInTheDocument()
  })

  it('scopes the over-allocated count to the results', async () => {
    const { user } = await renderGrid()
    expect(screen.getByText('2')).toBeInTheDocument()

    // Dee is over-allocated, so the count stays at one once Ana and Bo are gone.
    await user.type(screen.getByLabelText('Search by name'), 'dee')
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    const { user } = await renderGrid()

    await user.type(screen.getByLabelText('Search by name'), 'zzzz')

    expect(screen.getByText(/No people match/i)).toBeInTheDocument()
  })
})

describe('editing capacity', () => {
  it('opens an editor with an accessible name', async () => {
    const { user } = await renderGrid()

    await user.click(capacityButton('Ana Ferreira'))

    const input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    expect(input).toHaveValue(40)
  })

  it('saves on Enter and updates the row in place', async () => {
    const { user } = await renderGrid()

    await user.click(capacityButton('Ana Ferreira'))
    const input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(input)
    await user.type(input, '50{Enter}')

    await waitFor(() => {
      expect(capacityButton('Ana Ferreira')).toHaveTextContent('50h/wk')
    })
  })

  it('sends the new value to the API', async () => {
    const { user, fetchMock } = await renderGrid()

    await user.click(capacityButton('Ana Ferreira'))
    const input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(input)
    await user.type(input, '50{Enter}')

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/people/1')
      expect(patch).toBeDefined()
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ weeklyHours: 50 })
    })
  })

  it('does not refetch the range after a save', async () => {
    const { user, fetchMock } = await renderGrid()

    await user.click(capacityButton('Ana Ferreira'))
    const input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(input)
    await user.type(input, '50{Enter}')

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]) === '/api/people/1')).toBe(true)
    })
    const capacityCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/api/capacity'))
    expect(capacityCalls).toHaveLength(1)
  })

  it('cancels on Escape without saving', async () => {
    const { user, fetchMock } = await renderGrid()

    await user.click(capacityButton('Ana Ferreira'))
    const input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(input)
    await user.type(input, '50{Escape}')

    expect(capacityButton('Ana Ferreira')).toHaveTextContent('40h/wk')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/people/'))).toBe(false)
  })

  it('rejects a negative value without calling the API', async () => {
    const { user, fetchMock } = await renderGrid()

    await user.click(capacityButton('Ana Ferreira'))
    const input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(input)
    await user.type(input, '-5{Enter}')

    expect(await screen.findByText(/non-negative number/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/people/'))).toBe(false)
  })

  it('rejects an empty value without calling the API', async () => {
    const { user, fetchMock } = await renderGrid()

    await user.click(capacityButton('Ana Ferreira'))
    const input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(input)
    await user.type(input, '{Enter}')

    expect(await screen.findByText(/non-negative number/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/people/'))).toBe(false)
  })

  it('keeps the number visible on one line, like the read-only state', async () => {
    const { user } = await renderGrid()

    await user.click(capacityButton('Ana Ferreira'))
    const input = screen.getByLabelText('Weekly hours for Ana Ferreira')

    // The name and the editor live in the same cell, so the editor carries the
    // same block layout as the read-only button.
    expect(input).toHaveClass('capacity-input')
  })
})

describe('failure handling', () => {
  it('keeps a failed save visible and leaves the old value in place', async () => {
    const { user } = await renderGrid({ patch: () => jsonResponse({ error: 'boom' }, 500) })

    await user.click(capacityButton('Ana Ferreira'))
    const input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(input)
    await user.type(input, '50{Enter}')

    expect(await screen.findByText(/Failed to save/i)).toBeInTheDocument()
    expect(capacityButton('Ana Ferreira')).toHaveTextContent('40h/wk')
  })

  it('clears the error after a later successful save', async () => {
    let failNext = true
    const { user } = await renderGrid({
      patch: (url, init) => {
        if (failNext) {
          failNext = false
          return jsonResponse({ error: 'boom' }, 500)
        }
        const id = Number(url.split('/').pop())
        const body = JSON.parse(String(init?.body ?? '{}')) as { weeklyHours: number }
        return jsonResponse({ id, name: 'Ana Ferreira', weeklyHours: body.weeklyHours })
      },
    })

    await user.click(capacityButton('Ana Ferreira'))
    let input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(input)
    await user.type(input, '50{Enter}')
    expect(await screen.findByText(/Failed to save/i)).toBeInTheDocument()

    await user.click(capacityButton('Ana Ferreira'))
    input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(input)
    await user.type(input, '44{Enter}')

    await waitFor(() => {
      expect(screen.queryByText(/Failed to save/i)).not.toBeInTheDocument()
    })
    expect(capacityButton('Ana Ferreira')).toHaveTextContent('44h/wk')
  })

  it('sends a second edit made while the first save is still in flight', async () => {
    // This is the case the reviewer caught: the second edit used to be dropped
    // with no request and no message.
    let releaseFirst: (() => void) | undefined
    const patched: number[] = []

    const { user } = await renderGrid({
      patch: (url, init) => {
        const id = Number(url.split('/').pop())
        const body = JSON.parse(String(init?.body ?? '{}')) as { weeklyHours: number }
        patched.push(body.weeklyHours)
        if (patched.length === 1) {
          // Hold the first save open until the test lets it finish.
          return new Promise<Response>((resolve) => {
            releaseFirst = () => resolve(jsonResponse({ id, name: 'Ana Ferreira', weeklyHours: body.weeklyHours }))
          })
        }
        return jsonResponse({ id, name: 'Bo Lindqvist', weeklyHours: body.weeklyHours })
      },
    })

    await user.click(capacityButton('Ana Ferreira'))
    const anaInput = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(anaInput)
    await user.type(anaInput, '50{Enter}')

    // While Ana's save is stuck, edit Bo.
    await user.click(capacityButton('Bo Lindqvist'))
    const boInput = screen.getByLabelText('Weekly hours for Bo Lindqvist')
    await user.clear(boInput)
    await user.type(boInput, '35{Enter}')

    // Let the first save finish, which should release the queued one.
    await waitFor(() => expect(releaseFirst).toBeDefined())
    releaseFirst?.()

    await waitFor(() => {
      expect(patched).toEqual([50, 35])
    })
  })

  it('shows a saving indicator while a save is in flight', async () => {
    let releaseSave: (() => void) | undefined
    const { user } = await renderGrid({
      patch: (url, init) => {
        const id = Number(url.split('/').pop())
        const body = JSON.parse(String(init?.body ?? '{}')) as { weeklyHours: number }
        return new Promise<Response>((resolve) => {
          releaseSave = () => resolve(jsonResponse({ id, name: 'Ana Ferreira', weeklyHours: body.weeklyHours }))
        })
      },
    })

    await user.click(capacityButton('Ana Ferreira'))
    const input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(input)
    await user.type(input, '50{Enter}')

    // While the request is open, the grid says so.
    expect(await screen.findByRole('status')).toHaveTextContent(/Saving/i)

    await waitFor(() => expect(releaseSave).toBeDefined())
    releaseSave?.()

    // And it goes away once the save lands.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  it('keeps the saving indicator up while a queued save is still waiting', async () => {
    let releaseFirst: (() => void) | undefined
    let calls = 0
    const { user } = await renderGrid({
      patch: (url, init) => {
        calls += 1
        const id = Number(url.split('/').pop())
        const body = JSON.parse(String(init?.body ?? '{}')) as { weeklyHours: number }
        if (calls === 1) {
          return new Promise<Response>((resolve) => {
            releaseFirst = () => resolve(jsonResponse({ id, name: 'Ana Ferreira', weeklyHours: body.weeklyHours }))
          })
        }
        return jsonResponse({ id, name: 'Bo Lindqvist', weeklyHours: body.weeklyHours })
      },
    })

    await user.click(capacityButton('Ana Ferreira'))
    let input = screen.getByLabelText('Weekly hours for Ana Ferreira')
    await user.clear(input)
    await user.type(input, '50{Enter}')

    await user.click(capacityButton('Bo Lindqvist'))
    input = screen.getByLabelText('Weekly hours for Bo Lindqvist')
    await user.clear(input)
    await user.type(input, '35{Enter}')

    // Two saves are outstanding, so the indicator is still showing.
    expect(screen.getByRole('status')).toBeInTheDocument()

    await waitFor(() => expect(releaseFirst).toBeDefined())
    releaseFirst?.()

    // Both finish, so it clears.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  it('shows an error and no grid when the range request fails', async () => {
    stubFetch({ capacity: () => jsonResponse({ error: 'boom' }, 500) })
    render(<CapacityGrid />)

    expect(await screen.findByText(/Request failed with status 500/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows an error and no stale grid when a later range is rejected', async () => {
    // The backend refuses ranges wider than 730 days with a 400. The grid must
    // not keep the previous range on screen under the new dates.
    let firstCall = true
    const { user } = await renderGrid({
      capacity: () => {
        if (firstCall) {
          firstCall = false
          return jsonResponse(CAPACITY_BODY)
        }
        return new Response('range must not be wider than 730 days', { status: 400 })
      },
    })
    expect(screen.getByRole('table')).toBeInTheDocument()

    const from = screen.getByLabelText('From')
    await user.clear(from)
    await user.type(from, '2020-01-01')

    expect(await screen.findByText(/Request failed with status 400/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('replaces the grid when a later range loads', async () => {
    // The stub answers with a different set of weeks once the range changes, so
    // a stale grid would be visible if the new response did not replace it.
    const { user } = await renderGrid({
      capacity: (url) => {
        const from = new URL(url, 'http://x').searchParams.get('from')
        if (from === '2025-12-29') return jsonResponse(CAPACITY_BODY)
        return jsonResponse({ ...CAPACITY_BODY, from, weeks: ['2026-01-05'], people: PEOPLE })
      },
    })
    expect(screen.getByRole('columnheader', { name: 'Dec 29' })).toBeInTheDocument()

    const from = screen.getByLabelText('From')
    await user.clear(from)
    await user.type(from, '2026-01-05')

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Jan 5' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('columnheader', { name: 'Dec 29' })).not.toBeInTheDocument()
  })
})
