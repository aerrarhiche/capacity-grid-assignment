import { CapacityGrid } from './CapacityGrid'

export function App() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Team capacity</h1>
        <p className="subtitle">Allocated hours against capacity, week by week.</p>
      </header>
      <CapacityGrid />
    </div>
  )
}
