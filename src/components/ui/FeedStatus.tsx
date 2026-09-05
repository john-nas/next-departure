import clsx from 'clsx'
import { useDepartureFeed } from '../../features/feed/feedContext'
import { relativeTime } from '../../features/feed/feed.utils'
import { useFeedStatusQuery } from '../../queries/transportQueries'

export function FeedStatus() {
  const { feed, feedTimestamp, isStale, isRefreshing, now } = useDepartureFeed()
  const { data: apiStatus } = useFeedStatusQuery()

  if (!feed) return null

  const apiState = apiStatus?.vehiclePositions ?? apiStatus?.tripUpdates
  const statusTimestamp = apiState ? apiState.feedTimestamp * 1000 : feedTimestamp
  const statusIsStale =
    apiState ? apiState.stale || apiStatus?.backendMode === 'snapshot' : isStale
  const isLive = feed.mode === 'live' && !statusIsStale
  const label = isLive
    ? statusTimestamp === null
      ? 'Live'
      : `Live · ${relativeTime(statusTimestamp, now)}`
    : statusIsStale
      ? 'Snapshot'
      : 'Scheduled'

  return (
    <span
      className={clsx(
        'feed-status',
        isLive && 'feed-status--live',
        statusIsStale && 'feed-status--stale',
      )}
      title={isRefreshing ? 'Refreshing feed' : undefined}
    >
      <span className={clsx('feed-status__dot', isRefreshing && 'is-refreshing')} />
      {label}
    </span>
  )
}
