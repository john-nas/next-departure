import { AlertTriangle, BusFront } from 'lucide-react'
import { EmptyState } from '../components/ui/EmptyState'
import { useDepartureFeed } from '../features/feed/feedContext'
import AppRoutes from './AppRoutes'

export default function App() {
  const { feed, error, isLoading, refresh } = useDepartureFeed()

  if (isLoading && !feed) {
    return (
      <main className="full-screen-state" role="status" aria-live="polite">
        <span className="loading-spinner" aria-hidden="true" />
        <BusFront aria-hidden="true" />
        <h1>Finding departures</h1>
        <p>Loading the latest Victorian bus feed…</p>
      </main>
    )
  }

  if (!feed) {
    return (
      <main className="full-screen-state full-screen-state--error">
        <EmptyState
          icon={AlertTriangle}
          title="Departures unavailable"
          action={
            <button type="button" className="primary-button" onClick={() => void refresh()}>
              Try again
            </button>
          }
        >
          <p>{error ?? 'The feed could not be loaded.'}</p>
        </EmptyState>
      </main>
    )
  }

  return <AppRoutes />
}
