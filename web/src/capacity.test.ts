import { describe, expect, it } from 'vitest'
import {
  addDays,
  fmtHours,
  isOverAllocated,
  matchesQuery,
  parseWeeklyHours,
  weekLabel,
} from './capacity'

describe('addDays', () => {
  it('moves forward by whole days', () => {
    expect(addDays('2025-12-29', 1)).toBe('2025-12-30')
    expect(addDays('2025-12-29', 7)).toBe('2026-01-05')
  })

  it('moves backward', () => {
    expect(addDays('2025-12-29', -7)).toBe('2025-12-22')
  })

  it('crosses a month boundary', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
  })

  it('crosses a year boundary in both directions', () => {
    expect(addDays('2025-12-29', 7)).toBe('2026-01-05')
    expect(addDays('2026-01-05', -7)).toBe('2025-12-29')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
  })

  it('is reversible', () => {
    const start = '2025-12-29'
    expect(addDays(addDays(start, 21), -21)).toBe(start)
  })
})

describe('weekLabel', () => {
  it('renders a month and day', () => {
    expect(weekLabel('2025-12-29')).toBe('Dec 29')
    expect(weekLabel('2026-01-05')).toBe('Jan 5')
  })

  it('does not pad the day', () => {
    expect(weekLabel('2026-01-05')).toBe('Jan 5')
    expect(weekLabel('2026-01-05')).not.toBe('Jan 05')
  })
})

describe('fmtHours', () => {
  it('prints whole numbers without a decimal', () => {
    expect(fmtHours(40)).toBe('40')
    expect(fmtHours(0)).toBe('0')
  })

  it('prints eighths as read from the data', () => {
    expect(fmtHours(7.125)).toBe('7.125')
    expect(fmtHours(0.125)).toBe('0.125')
  })

  it('absorbs floating point noise', () => {
    // 0.1 + 0.2 style sums can land a hair off; the grid should not show that.
    expect(fmtHours(7.999999999)).toBe('8')
    expect(fmtHours(30.000000001)).toBe('30')
  })

  it('keeps sixteenths exact', () => {
    expect(fmtHours(0.3125)).toBe('0.3125')
  })
})

describe('parseWeeklyHours', () => {
  it('accepts a normal number', () => {
    expect(parseWeeklyHours('40')).toBe(40)
    expect(parseWeeklyHours('7.5')).toBe(7.5)
  })

  it('accepts zero, because a capacity of zero is valid', () => {
    expect(parseWeeklyHours('0')).toBe(0)
  })

  it('accepts eighths from the data', () => {
    expect(parseWeeklyHours('0.125')).toBe(0.125)
  })

  it('trims surrounding whitespace', () => {
    expect(parseWeeklyHours('  24  ')).toBe(24)
  })

  it('rejects an empty value', () => {
    expect(parseWeeklyHours('')).toBeNull()
    expect(parseWeeklyHours('   ')).toBeNull()
  })

  it('rejects a negative value', () => {
    expect(parseWeeklyHours('-1')).toBeNull()
  })

  it('rejects something that is not a number', () => {
    expect(parseWeeklyHours('abc')).toBeNull()
    expect(parseWeeklyHours('12abc')).toBeNull()
  })

  it('rejects infinity', () => {
    expect(parseWeeklyHours('Infinity')).toBeNull()
  })
})

describe('isOverAllocated', () => {
  it('is false when every week is at or under capacity', () => {
    expect(isOverAllocated([40, 0, 30], 40)).toBe(false)
  })

  it('is true when any week is over capacity', () => {
    expect(isOverAllocated([0, 45, 40], 40)).toBe(true)
  })

  it('treats any allocation against zero capacity as over', () => {
    expect(isOverAllocated([0, 20, 0], 0)).toBe(true)
    expect(isOverAllocated([0, 0, 0], 0)).toBe(false)
  })

  it('is false for a person with no allocations', () => {
    expect(isOverAllocated([], 40)).toBe(false)
  })

  it('counts a value just over capacity', () => {
    expect(isOverAllocated([40.125], 40)).toBe(true)
  })
})

describe('matchesQuery', () => {
  it('matches a substring anywhere in the name', () => {
    expect(matchesQuery('Ana Ferreira', 'ana')).toBe(true)
    expect(matchesQuery('Ana Ferreira', 'ferreira')).toBe(true)
    expect(matchesQuery('Ana Ferreira', 'eir')).toBe(true)
  })

  it('ignores case on both sides', () => {
    expect(matchesQuery('Ana Ferreira', 'ANA')).toBe(true)
    expect(matchesQuery('ANA FERREIRA', 'ana')).toBe(true)
  })

  it('trims the query', () => {
    expect(matchesQuery('Ana Ferreira', '  ana  ')).toBe(true)
  })

  it('matches everything when the query is empty', () => {
    expect(matchesQuery('Ana Ferreira', '')).toBe(true)
    expect(matchesQuery('Ana Ferreira', '   ')).toBe(true)
  })

  it('does not match a name that is absent', () => {
    expect(matchesQuery('Ana Ferreira', 'Bo')).toBe(false)
  })

  it('handles the non latin names in the seed', () => {
    expect(matchesQuery('田中 陽子', '陽子')).toBe(true)
    expect(matchesQuery('Нина Петрова', 'петрова')).toBe(true)
    expect(matchesQuery('김민준', '민준')).toBe(true)
  })

  it('handles the accented names in the seed', () => {
    expect(matchesQuery('Sanne Kjærgaard', 'kjær')).toBe(true)
    expect(matchesQuery('Thérèse Lefèvre', 'lefèvre')).toBe(true)
    expect(matchesQuery('Siobhán O\'Brien', "o'brien")).toBe(true)
  })
})
