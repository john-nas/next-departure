import type { DepartureFeed } from './feed.types'

export async function fetchDepartureFeed(signal?: AbortSignal) {
  const feedUrl = `${import.meta.env.BASE_URL}data/departures.json`
  const response = await fetch(feedUrl, {
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`The departures feed returned ${response.status}.`)
  }

  const feed = (await response.json()) as DepartureFeed

  if (
    feed.schemaVersion !== 1 ||
    !Array.isArray(feed.stops) ||
    !feed.generatedAt
  ) {
    throw new Error('The departures feed is not in the expected format.')
  }

  return feed
}
