import { createContext, useContext } from 'react'
import type { DepartureFeed } from './feed.types'

export type DepartureFeedContextValue = {
  feed: DepartureFeed | null
  error: string | null
  isLoading: boolean
  isRefreshing: boolean
  isStale: boolean
  now: number
  feedTimestamp: number | null
  departureAnchor: number
  lastReceivedAt: number | null
  refresh: () => Promise<void>
}

export const DepartureFeedContext = createContext<DepartureFeedContextValue | null>(null)

export function useDepartureFeed() {
  const context = useContext(DepartureFeedContext)
  if (!context) {
    throw new Error('useDepartureFeed must be used inside DepartureFeedProvider.')
  }

  return context
}
