import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchDepartureFeed } from './feedClient'
import type { DepartureFeed } from './feed.types'
import {
  DepartureFeedContext,
  type DepartureFeedContextValue,
} from './feedContext'
import { parseTime } from './feed.utils'

const REFRESH_INTERVAL_MS = 60_000
const LIVE_STALE_AFTER_MS = 5 * REFRESH_INTERVAL_MS

export function DepartureFeedProvider({ children }: { children: ReactNode }) {
  const [feed, setFeed] = useState<DepartureFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [lastReceivedAt, setLastReceivedAt] = useState<number | null>(null)

  const loadFeed = useCallback(async (signal?: AbortSignal) => {
    setIsRefreshing(true)

    try {
      const nextFeed = await fetchDepartureFeed(signal)
      setFeed(nextFeed)
      setLastReceivedAt(Date.now())
      setError(null)
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        return
      }

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'The departures feed could not be loaded.',
      )
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [])

  const refresh = useCallback(async () => {
    await loadFeed()
  }, [loadFeed])

  useEffect(() => {
    const controller = new AbortController()
    const initialLoad = window.setTimeout(() => {
      void loadFeed(controller.signal)
    }, 0)

    const refreshTimer = window.setInterval(() => {
      void loadFeed()
    }, REFRESH_INTERVAL_MS)

    const clockTimer = window.setInterval(() => {
      setNow(Date.now())
    }, 15_000)

    return () => {
      controller.abort()
      window.clearTimeout(initialLoad)
      window.clearInterval(refreshTimer)
      window.clearInterval(clockTimer)
    }
  }, [loadFeed])

  const generatedAt = parseTime(feed?.generatedAt)
  const realtimeUpdatedAt = parseTime(feed?.source.realtimeUpdatedAt)
  const feedTimestamp = realtimeUpdatedAt ?? generatedAt
  const isStale =
    feed?.mode === 'live' &&
    (feedTimestamp === null || now - feedTimestamp > LIVE_STALE_AFTER_MS)

  const departureAnchor =
    (feed?.mode === 'schedule' || isStale) && generatedAt !== null
      ? generatedAt
      : now

  const value = useMemo<DepartureFeedContextValue>(
    () => ({
      feed,
      error,
      isLoading,
      isRefreshing,
      isStale,
      now,
      feedTimestamp,
      departureAnchor,
      lastReceivedAt,
      refresh,
    }),
    [
      departureAnchor,
      error,
      feed,
      feedTimestamp,
      isLoading,
      isRefreshing,
      isStale,
      lastReceivedAt,
      now,
      refresh,
    ],
  )

  return (
    <DepartureFeedContext.Provider value={value}>
      {children}
    </DepartureFeedContext.Provider>
  )
}
