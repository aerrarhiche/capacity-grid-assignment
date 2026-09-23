import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const BODY = {
  from: '2025-12-29',
  to: '2026-01-16',
  weeks: ['2025-12-29', '2026-01-05', '2026-01-12'],
  people: [{ id: 1, name: 'Ana Ferreira', weeklyHours: 40, allocations: [40, 0, 30] }],
}

function stubFetch() {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify(BODY), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('renders the page heading and subtitle', () => {
    stubFetch()
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Team capacity' })).toBeInTheDocument()
    expect(screen.getByText(/Allocated hours against capacity, week by week/i)).toBeInTheDocument()
  })

  it('mounts the capacity grid under the header', async () => {
    stubFetch()
    render(<App />)

    // The grid is the only table on the page, and it arrives after the first
    // capacity response lands.
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('requests the default range', async () => {
    const fetchMock = stubFetch()
    render(<App />)

    await screen.findByRole('table')

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toBe('/api/capacity?from=2025-12-29&to=2026-01-16')
  })

  it('shows a row for the person the API returned', async () => {
    stubFetch()
    render(<App />)

    expect(await screen.findByRole('rowheader', { name: /Ana Ferreira/ })).toBeInTheDocument()
  })
})
