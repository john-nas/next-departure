import type {
  Departure,
  DepartureFeed,
  DepartureOccurrence,
  Stop,
} from '../feed/feed.types'
import {
  compareDepartures,
  departureTimestamp,
  prototypeStopSequence,
} from '../feed/feed.utils'

export type RouteSummary = {
  routeNumber: string
  routeIds: string[]
  name: string
  destinations: string[]
  stopIds: string[]
  liveVehicleCount: number
  regionalLive: boolean
  departureCount: number
  nextDeparture: Departure | null
}

export type RoutePattern = {
  destination: string
  departureCount: number
  liveVehicleCount: number
}

export type RouteStopRow = {
  stop: Stop
  sequence: number
  nextDeparture: Departure
}

export type LiveVehicleSummary = {
  tripId: string
  routeNumber: string
  routeName: string
  destination: string
  departure: Departure
  stop: Stop
}

export function getRouteSummaries(feed: DepartureFeed): RouteSummary[] {
  const routes = new Map<
    string,
    {
      routeNumber: string
      routeIds: Set<string>
      nameCounts: Map<string, number>
      destinations: Set<string>
      stopIds: Set<string>
      liveTripIds: Set<string>
      regionalLive: boolean
      departureCount: number
      nextDeparture: Departure | null
    }
  >()

  for (const stop of feed.stops) {
    for (const departure of stop.departures) {
      let route = routes.get(departure.routeNumber)

      if (!route) {
        route = {
          routeNumber: departure.routeNumber,
          routeIds: new Set(),
          nameCounts: new Map(),
          destinations: new Set(),
          stopIds: new Set(),
          liveTripIds: new Set(),
          regionalLive: false,
          departureCount: 0,
          nextDeparture: null,
        }
        routes.set(departure.routeNumber, route)
      }

      route.routeIds.add(departure.routeId)
      route.destinations.add(departure.destination)
      route.stopIds.add(stop.id)
      route.departureCount += 1
      if (!route.nextDeparture || compareDepartures(departure, route.nextDeparture) < 0) {
        route.nextDeparture = departure
      }
      route.nameCounts.set(
        departure.routeName,
        (route.nameCounts.get(departure.routeName) ?? 0) + 1,
      )

      if (departure.vehicle) route.liveTripIds.add(departure.tripId)
      if (departure.serviceTier === 'live-regional') route.regionalLive = true
    }
  }

  return [...routes.values()]
    .map((route) => ({
      routeNumber: route.routeNumber,
      routeIds: [...route.routeIds],
      name: mostCommonValue(route.nameCounts) ?? `Route ${route.routeNumber}`,
      destinations: [...route.destinations],
      stopIds: [...route.stopIds],
      liveVehicleCount: route.liveTripIds.size,
      regionalLive: route.regionalLive,
      departureCount: route.departureCount,
      nextDeparture: route.nextDeparture,
    }))
    .sort((a, b) =>
      a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true }),
    )
}

export function getRouteSummary(feed: DepartureFeed, routeNumber: string) {
  return getRouteSummaries(feed).find(
    (route) => route.routeNumber === routeNumber,
  )
}

export function getRouteOccurrences(
  feed: DepartureFeed,
  routeNumber: string,
): DepartureOccurrence[] {
  const occurrences: DepartureOccurrence[] = []

  for (const stop of feed.stops) {
    for (const departure of stop.departures) {
      if (departure.routeNumber === routeNumber) {
        occurrences.push({ stop, departure })
      }
    }
  }

  return occurrences.sort((a, b) =>
    compareDepartures(a.departure, b.departure),
  )
}

export function getRoutePatterns(
  feed: DepartureFeed,
  routeNumber: string,
): RoutePattern[] {
  const patterns = new Map<
    string,
    { departureCount: number; liveTripIds: Set<string> }
  >()

  for (const occurrence of getRouteOccurrences(feed, routeNumber)) {
    const destination = occurrence.departure.destination
    let pattern = patterns.get(destination)

    if (!pattern) {
      pattern = { departureCount: 0, liveTripIds: new Set() }
      patterns.set(destination, pattern)
    }

    pattern.departureCount += 1
    if (occurrence.departure.vehicle) {
      pattern.liveTripIds.add(occurrence.departure.tripId)
    }
  }

  return [...patterns.entries()]
    .map(([destination, pattern]) => ({
      destination,
      departureCount: pattern.departureCount,
      liveVehicleCount: pattern.liveTripIds.size,
    }))
    .sort((a, b) => b.departureCount - a.departureCount)
}

export function getRouteStopsForDestination(
  feed: DepartureFeed,
  routeNumber: string,
  destination: string,
): RouteStopRow[] {
  const rows = new Map<
    string,
    { stop: Stop; sequence: number; departures: Departure[] }
  >()

  for (const occurrence of getRouteOccurrences(feed, routeNumber)) {
    if (occurrence.departure.destination !== destination) continue

    const key = occurrence.stop.name.trim().toLocaleLowerCase()
    const sequence = prototypeStopSequence(occurrence.departure)
    const existing = rows.get(key)

    if (!existing) {
      rows.set(key, {
        stop: occurrence.stop,
        sequence,
        departures: [occurrence.departure],
      })
      continue
    }

    existing.sequence = Math.min(existing.sequence, sequence)
    existing.departures.push(occurrence.departure)
  }

  return [...rows.values()]
    .map((row) => ({
      stop: row.stop,
      sequence: row.sequence,
      nextDeparture: [...row.departures].sort(compareDepartures)[0],
    }))
    .sort((a, b) => a.sequence - b.sequence)
}

export function getLiveVehicles(
  feed: DepartureFeed,
  routeNumber?: string,
): LiveVehicleSummary[] {
  const vehicles = new Map<string, LiveVehicleSummary>()

  for (const stop of feed.stops) {
    for (const departure of stop.departures) {
      if (!departure.vehicle) continue
      if (routeNumber && departure.routeNumber !== routeNumber) continue

      const existing = vehicles.get(departure.tripId)
      const currentRecordedAt = Date.parse(departure.vehicle.recordedAt)
      const existingRecordedAt = existing?.departure.vehicle
        ? Date.parse(existing.departure.vehicle.recordedAt)
        : -Infinity

      if (!existing || currentRecordedAt > existingRecordedAt) {
        vehicles.set(departure.tripId, {
          tripId: departure.tripId,
          routeNumber: departure.routeNumber,
          routeName: departure.routeName,
          destination: departure.destination,
          departure,
          stop,
        })
      }
    }
  }

  return [...vehicles.values()].sort((a, b) =>
    a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true }),
  )
}

export function getTripOccurrences(feed: DepartureFeed, tripId: string) {
  const occurrences: DepartureOccurrence[] = []

  for (const stop of feed.stops) {
    for (const departure of stop.departures) {
      if (departure.tripId === tripId) occurrences.push({ stop, departure })
    }
  }

  return occurrences.sort(
    (a, b) =>
      prototypeStopSequence(a.departure) -
        prototypeStopSequence(b.departure) ||
      (departureTimestamp(a.departure) ?? Number.MAX_SAFE_INTEGER) -
        (departureTimestamp(b.departure) ?? Number.MAX_SAFE_INTEGER),
  )
}

function mostCommonValue(counts: Map<string, number>) {
  let result: string | undefined
  let highestCount = -1

  for (const [value, count] of counts) {
    if (count > highestCount) {
      result = value
      highestCount = count
    }
  }

  return result
}
