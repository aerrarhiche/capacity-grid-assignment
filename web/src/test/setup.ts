import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library does not unmount between tests on its own, so a leftover grid
// would answer the next test's queries.
afterEach(() => {
  cleanup()
})
