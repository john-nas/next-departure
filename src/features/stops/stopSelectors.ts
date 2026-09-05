import type { Departure, DepartureFeed, Stop } from '../feed/feed.types'
import { compareDepartures, distanceKm } from '../feed/feed.utils'

export type StopPlace = {
  id: string
  stopIds: string[]
  name: string
  locality?: string
  latitude: number
  longitude: number
  departures: Departure[]
  routes: string[]
}

export function getStopPlaces(feed: DepartureFeed): StopPlace[] {
  const places = new Map<
    string,
    {
      stops: Stop[]
      departures: Departure[]
      routes: Set<string>
    }
  >()

  for (const stop of feed.stops) {
    const key = stopPlaceKey(stop)
    let place = places.get(key)

    if (!place) {
      place = { stops: [], departures: [], routes: new Set() }
      places.set(key, place)
    }

    place.stops.push(stop)
    place.departures.push(...stop.departures)
    stop.departures.forEach((departure) => place?.routes.add(departure.routeNumber))
  }

  return [...places.values()]
    .map(({ stops, departures, routes }) => ({
      id: stops[0].id,
      stopIds: stops.map((stop) => stop.id),
      name: stops[0].name,
      locality: stops[0].locality,
      latitude:
        stops.reduce((sum, stop) => sum + stop.latitude, 0) / stops.length,
      longitude:
        stops.reduce((sum, stop) => sum + stop.longitude, 0) / stops.length,
      departures: departures.sort(compareDepartures),
      routes: [...routes].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getStopPlaceById(feed: DepartureFeed, stopId: string) {
  const rawStop = feed.stops.find((stop) => stop.id === stopId)
  if (!rawStop) return undefined

  const key = stopPlaceKey(rawStop)
  return getStopPlaces(feed).find((place) => {
    const representative = feed.stops.find((stop) => stop.id === place.id)
    return representative ? stopPlaceKey(representative) === key : false
  })
}

export function getNearbyStopPlaces(
  feed: DepartureFeed,
  latitude: number,
  longitude: number,
  limit = 6,
) {
  return getStopPlaces(feed)
    .map((place) => ({
      place,
      distanceKm: distanceKm(
        latitude,
        longitude,
        place.latitude,
        place.longitude,
      ),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
}

export function getStopPlaceForRawStop(feed: DepartureFeed, stop: Stop) {
  return getStopPlaceById(feed, stop.id)
}

function stopPlaceKey(stop: Stop) {
  return `${stop.name.trim().toLocaleLowerCase()}|${(stop.locality ?? '')
    .trim()
    .toLocaleLowerCase()}`
}
