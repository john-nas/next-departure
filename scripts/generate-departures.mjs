#!/usr/bin/env node

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import GtfsRealtimeBindings from 'gtfs-realtime-bindings'

import {
  ALL_BUS_STATIC_BRANCHES,
  CURATED_DYSONS_ROUTE_NUMBERS,
  DEFAULT_MAX_DEPARTURES,
  DEFAULT_MAX_DEPARTURES_PER_STOP,
  DEFAULT_OUTPUT,
  DEFAULT_STATIC_BRANCHES,
  DEFAULT_STATIC_CACHE,
  DEFAULT_WINDOW_HOURS,
  REGIONAL_MYKI_ROUTE_PREFIXES,
  TRANSPORT_VICTORIA,
} from '../config/feed.mjs'
import { ensureStaticLookup } from './lib/static-lookup.mjs'
import { validateSnapshot } from './lib/snapshot-schema.mjs'

const FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage
const ON_TIME_TOLERANCE_SECONDS = 60
const PAST_GRACE_SECONDS = 90
const WATCH_INTERVAL_MS = 60_000
const KEY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function usage() {
  return [
    'Usage: node scripts/generate-departures.mjs [options]',
    '',
    'By default the script fetches the two official bus GTFS-Realtime feeds and',
    'filters to the best-effort Dysons route allowlist. VIC_TRANSPORT_API_KEY is',
    'required for network realtime requests.',
    '',
    'Options:',
    '  --trip-file <path>       Read Trip Updates protobuf from disk',
    '  --vehicle-file <path>    Read Vehicle Positions protobuf from disk',
    '  --all                    Include all bus routes (operator-agnostic)',
    '  --regional               Include only folder 4 regional Myki bus routes',
    '  --output <path>          Snapshot destination',
    '  --static-cache <path>    Static stop/route lookup cache',
    '  --hours <number>         Future window in hours (default: 2)',
    '  --limit <number>         Overall departure cap (default: 500)',
    '  --per-stop <number>      Per-stop departure cap (default: 12)',
    '  --refresh-static         Rebuild the required static branch cache',
    '  --watch                  Refresh continuously every 60 seconds',
    '  --help                   Show this help',
  ].join('\n')
}

function takeValue(args, index, flag) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function positiveNumber(rawValue, flag) {
  const value = Number(rawValue)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag} must be positive`)
  return value
}

function positiveInteger(rawValue, flag) {
  const value = positiveNumber(rawValue, flag)
  if (!Number.isInteger(value)) throw new Error(`${flag} must be an integer`)
  return value
}

function parseArguments(args) {
  const options = {
    allRoutes: false,
    regionalOnly: false,
    outputPath: DEFAULT_OUTPUT,
    staticCachePath: DEFAULT_STATIC_CACHE,
    windowHours: DEFAULT_WINDOW_HOURS,
    maxDepartures: DEFAULT_MAX_DEPARTURES,
    maxDeparturesPerStop: DEFAULT_MAX_DEPARTURES_PER_STOP,
    refreshStatic: false,
    watch: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--help') options.help = true
    else if (argument === '--all') options.allRoutes = true
    else if (argument === '--regional') options.regionalOnly = true
    else if (argument === '--refresh-static') options.refreshStatic = true
    else if (argument === '--watch') options.watch = true
    else if (argument === '--trip-file') {
      options.tripFile = takeValue(args, index, argument)
      index += 1
    } else if (argument === '--vehicle-file') {
      options.vehicleFile = takeValue(args, index, argument)
      index += 1
    } else if (argument === '--output') {
      options.outputPath = takeValue(args, index, argument)
      index += 1
    } else if (argument === '--static-cache') {
      options.staticCachePath = takeValue(args, index, argument)
      index += 1
    } else if (argument === '--hours') {
      options.windowHours = positiveNumber(takeValue(args, index, argument), argument)
      index += 1
    } else if (argument === '--limit') {
      options.maxDepartures = positiveInteger(takeValue(args, index, argument), argument)
      index += 1
    } else if (argument === '--per-stop') {
      options.maxDeparturesPerStop = positiveInteger(
        takeValue(args, index, argument),
        argument,
      )
      index += 1
    } else {
      throw new Error(`Unknown option: ${argument}`)
    }
  }
  return options
}

function asNumber(value) {
  if (value == null) return null
  const number = typeof value?.toNumber === 'function' ? value.toNumber() : Number(value)
  return Number.isFinite(number) ? number : null
}

function positiveTimestamp(value) {
  const number = asNumber(value)
  return number !== null && number > 0 ? number : null
}

function isoFromSeconds(value) {
  return value === null ? null : new Date(value * 1000).toISOString()
}

function isoFromDateValue(value) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isFinite(date.valueOf()) ? date.toISOString() : undefined
}

async function readOrFetchFeed(filePath, url) {
  if (filePath) return readFile(resolve(filePath))

  const apiKey = process.env.VIC_TRANSPORT_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'VIC_TRANSPORT_API_KEY is required unless both --trip-file and --vehicle-file are supplied',
    )
  }
  if (!KEY_ID_PATTERN.test(apiKey)) {
    throw new Error(
      'VIC_TRANSPORT_API_KEY must be the UUID KeyID shown under My Account > Profile > API tokens',
    )
  }

  const response = await fetch(url, {
    headers: { KeyID: apiKey },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Transport Victoria realtime request failed with HTTP ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

function decodeFeed(bytes, label) {
  try {
    return FeedMessage.decode(bytes)
  } catch (error) {
    throw new Error(`${label} is not a valid GTFS-Realtime FeedMessage: ${error.message}`)
  }
}

function routeNumberForTrip(trip, matchingVehicle) {
  const vehicleRouteId = matchingVehicle?.trip?.routeId?.trim()
  if (vehicleRouteId) return vehicleRouteId
  const tokens = trip.tripId?.split('-') ?? []
  return tokens[1]?.trim() || trip.routeId?.trim() || 'Unknown'
}

function routeForNumber(lookup, routeNumber, realtimeRouteId) {
  if (realtimeRouteId && lookup.routes[realtimeRouteId]) {
    return { id: realtimeRouteId, ...lookup.routes[realtimeRouteId] }
  }
  const routeId = lookup.routesByShortName[routeNumber]?.[0]
  return routeId ? { id: routeId, ...lookup.routes[routeId] } : null
}

function tripRouteIdCandidate(trip) {
  const tripId = trip.tripId?.trim()
  if (!tripId) return null
  const match = tripId.match(/^([^-]+)-([^-]+)-/)
  return match ? `${match[1]}-${match[2]}` : null
}

function routeForTrip(lookup, trip, routeNumber) {
  const candidate = tripRouteIdCandidate(trip)
  if (candidate) {
    const routeId = Object.keys(lookup.routes).find(
      (id) => id === candidate || id.startsWith(`${candidate}-`),
    )
    if (routeId) return { id: routeId, ...lookup.routes[routeId] }
    // A structured trip id that is absent from the selected static branch is
    // not safe to resolve by short name alone (regional and metro routes reuse
    // numbers such as 1, 20 and 30).
    return null
  }
  return routeForNumber(lookup, routeNumber, trip.routeId)
}

function routePrefix(routeId) {
  return routeId?.split('-')[0] || null
}

function stopEvent(update) {
  const departureTime = positiveTimestamp(update.departure?.time)
  const arrivalTime = positiveTimestamp(update.arrival?.time)
  const event = departureTime !== null ? update.departure : update.arrival
  const predictedSeconds = departureTime ?? arrivalTime
  if (predictedSeconds === null) return null

  const rawDelay = asNumber(event?.delay)
  const delaySeconds = rawDelay === null ? null : Math.round(rawDelay)
  return {
    predictedSeconds,
    delaySeconds,
    scheduledSeconds:
      delaySeconds === null ? null : Math.round(predictedSeconds - delaySeconds),
  }
}

function departureStatus(tripRelationship, stopRelationship, delaySeconds) {
  if (tripRelationship === 3 || stopRelationship === 1) return 'cancelled'
  if (delaySeconds === null) return 'scheduled'
  if (delaySeconds > ON_TIME_TOLERANCE_SECONDS) return 'delayed'
  if (delaySeconds < -ON_TIME_TOLERANCE_SECONDS) return 'early'
  return 'on-time'
}

function currentStatusName(status) {
  if (status === 0) return 'incoming_at'
  if (status === 1) return 'stopped_at'
  if (status === 2) return 'in_transit_to'
  return 'unknown'
}

function hasOwn(value, property) {
  return Object.prototype.hasOwnProperty.call(value, property)
}

function publicVehicle(vehicle, vehicleFeedTimestamp, nextStopName) {
  const latitude = asNumber(vehicle?.position?.latitude)
  const longitude = asNumber(vehicle?.position?.longitude)
  const recordedSeconds = positiveTimestamp(vehicle?.timestamp) ?? vehicleFeedTimestamp
  if (latitude === null || longitude === null || recordedSeconds === null) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null

  const bearingValue = hasOwn(vehicle.position, 'bearing')
    ? asNumber(vehicle.position.bearing)
    : null
  const sequenceValue = hasOwn(vehicle, 'currentStopSequence')
    ? asNumber(vehicle.currentStopSequence)
    : null
  const result = {
    latitude,
    longitude,
    bearing:
      bearingValue !== null && bearingValue >= 0 && bearingValue <= 360
        ? bearingValue
        : null,
    recordedAt: isoFromSeconds(recordedSeconds),
    currentStopSequence:
      sequenceValue !== null && Number.isInteger(sequenceValue) && sequenceValue > 0
        ? sequenceValue
        : null,
    currentStatus: currentStatusName(asNumber(vehicle.currentStatus)),
  }
  if (nextStopName) result.nextStopName = nextStopName
  return result
}

function newestVehiclesByTrip(vehicleFeed) {
  const result = new Map()
  for (const entity of vehicleFeed.entity) {
    const vehicle = entity.vehicle
    const tripId = vehicle?.trip?.tripId
    if (!tripId) continue
    const existing = result.get(tripId)
    const timestamp = positiveTimestamp(vehicle.timestamp) ?? 0
    const existingTimestamp = positiveTimestamp(existing?.timestamp) ?? 0
    if (!existing || timestamp >= existingTimestamp) result.set(tripId, vehicle)
  }
  return result
}

function firstFutureStopName(updates, lookup, referenceSeconds) {
  for (const update of updates) {
    const event = stopEvent(update)
    if (!event || event.predictedSeconds < referenceSeconds - PAST_GRACE_SECONDS) continue
    const name = lookup.stops[update.stopId]?.name
    if (name) return name
  }
  return undefined
}

function destinationName(updates, lookup, fallback) {
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const name = lookup.stops[updates[index].stopId]?.name
    if (name) return name
  }
  return fallback
}

function buildSnapshot({
  tripFeed,
  vehicleFeed,
  lookup,
  allRoutes,
  regionalOnly,
  windowHours,
  maxDepartures,
  maxDeparturesPerStop,
}) {
  const tripFeedTimestamp = positiveTimestamp(tripFeed.header?.timestamp)
  const vehicleFeedTimestamp = positiveTimestamp(vehicleFeed.header?.timestamp)
  const referenceSeconds = tripFeedTimestamp ?? Math.floor(Date.now() / 1000)
  const endSeconds = referenceSeconds + windowHours * 60 * 60
  const routeAllowlist = new Set(CURATED_DYSONS_ROUTE_NUMBERS)
  const vehiclesByTrip = newestVehiclesByTrip(vehicleFeed)
  const candidates = []

  for (const entity of tripFeed.entity) {
    const tripUpdate = entity.tripUpdate
    const trip = tripUpdate?.trip
    if (!trip?.tripId) continue

    const matchingVehicle = vehiclesByTrip.get(trip.tripId)
    const routeNumber = routeNumberForTrip(trip, matchingVehicle)
    const route = routeForTrip(lookup, trip, routeNumber)
    const isRegionalMyki =
      route?.branch === '4' && REGIONAL_MYKI_ROUTE_PREFIXES.includes(routePrefix(route.id))
    if (regionalOnly && !isRegionalMyki) continue
    if (!allRoutes && !regionalOnly && !routeAllowlist.has(routeNumber)) continue
    const routeId = route?.id || trip.routeId?.trim() || routeNumber
    const routeName = route?.longName || `Route ${routeNumber}`
    const updates = [...tripUpdate.stopTimeUpdate].sort(
      (left, right) => asNumber(left.stopSequence) - asNumber(right.stopSequence),
    )
    const explicitNextStopName = lookup.stops[matchingVehicle?.stopId]?.name
    const nextStopName =
      explicitNextStopName || firstFutureStopName(updates, lookup, referenceSeconds)
    const destination = destinationName(updates, lookup, routeName)
    const vehicle = matchingVehicle
      ? publicVehicle(matchingVehicle, vehicleFeedTimestamp, nextStopName)
      : null

    for (const update of updates) {
      const event = stopEvent(update)
      if (
        !event ||
        event.predictedSeconds < referenceSeconds - PAST_GRACE_SECONDS ||
        event.predictedSeconds > endSeconds
      ) {
        continue
      }
      const stopId = update.stopId?.trim()
      const staticStop = lookup.stops[stopId]
      if (!stopId || !staticStop) continue

      const sequence = asNumber(update.stopSequence)
      candidates.push({
        sortTime: event.predictedSeconds,
        stopId,
        staticStop,
        departure: {
          id: `${trip.tripId}:${stopId}:${sequence ?? 'unknown'}`,
          tripId: trip.tripId,
          routeId,
          routeNumber,
          routeName,
          serviceTier: isRegionalMyki ? 'live-regional' : 'live-metro',
          destination,
          scheduledAt: isoFromSeconds(event.scheduledSeconds),
          predictedAt: isoFromSeconds(event.predictedSeconds),
          delaySeconds: event.delaySeconds,
          status: departureStatus(
            asNumber(trip.scheduleRelationship),
            asNumber(update.scheduleRelationship),
            event.delaySeconds,
          ),
          wheelchairAccessible: null,
          vehicle,
        },
      })
    }
  }

  candidates.sort((left, right) => left.sortTime - right.sortTime)
  const stopsById = new Map()
  let acceptedDepartures = 0
  for (const candidate of candidates) {
    if (acceptedDepartures >= maxDepartures) break
    let stop = stopsById.get(candidate.stopId)
    if (!stop) {
      stop = {
        id: candidate.stopId,
        name: candidate.staticStop.name,
        latitude: candidate.staticStop.latitude,
        longitude: candidate.staticStop.longitude,
        departures: [],
      }
      if (candidate.staticStop.locality) stop.locality = candidate.staticStop.locality
      stopsById.set(candidate.stopId, stop)
    }
    if (stop.departures.length >= maxDeparturesPerStop) continue
    stop.departures.push(candidate.departure)
    acceptedDepartures += 1
  }

  const realtimeSeconds = Math.max(tripFeedTimestamp ?? 0, vehicleFeedTimestamp ?? 0) || null
  const source = {
    provider: TRANSPORT_VICTORIA.provider,
    dataset: TRANSPORT_VICTORIA.dataset,
    realtimeUpdatedAt: isoFromSeconds(realtimeSeconds),
    operatorScope: allRoutes
      ? 'All Metro & Regional Bus routes (operator-agnostic)'
      : regionalOnly
        ? 'Folder 4 Regional Myki town buses; GTFS does not identify contracted operators.'
        : `Best-effort Dysons route allowlist (${CURATED_DYSONS_ROUTE_NUMBERS.join(', ')}); GTFS does not identify contracted operators.`,
    capabilities: {
      liveRegionalMykiBus: true,
      regionalCoach: 'schedule-only',
      otherRegionalBus: 'schedule-only',
    },
  }
  const scheduleUpdatedAt =
    isoFromDateValue(lookup.source.lastModified) || isoFromDateValue(lookup.source.fetchedAt)
  if (scheduleUpdatedAt) source.scheduleUpdatedAt = scheduleUpdatedAt
  if (!allRoutes) {
    source.notice =
      'Route scope is curated from public operator information and may not reflect current contracts.'
  }

  return validateSnapshot({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: 'live',
    source,
    stops: [...stopsById.values()],
  })
}

async function writeSnapshot(outputPath, snapshot) {
  const target = resolve(outputPath)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  try {
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

async function generateSnapshot(options) {
  const staticBranches = options.allRoutes
    ? ALL_BUS_STATIC_BRANCHES
    : DEFAULT_STATIC_BRANCHES
  const [lookup, tripBytes, vehicleBytes] = await Promise.all([
    ensureStaticLookup({
      branches: staticBranches,
      cachePath: options.staticCachePath,
      force: options.refreshStatic,
    }),
    readOrFetchFeed(options.tripFile, TRANSPORT_VICTORIA.tripUpdatesUrl),
    readOrFetchFeed(options.vehicleFile, TRANSPORT_VICTORIA.vehiclePositionsUrl),
  ])
  const tripFeed = decodeFeed(tripBytes, 'Trip Updates input')
  const vehicleFeed = decodeFeed(vehicleBytes, 'Vehicle Positions input')
  const snapshot = buildSnapshot({
    tripFeed,
    vehicleFeed,
    lookup,
    allRoutes: options.allRoutes,
    regionalOnly: options.regionalOnly,
    windowHours: options.windowHours,
    maxDepartures: options.maxDepartures,
    maxDeparturesPerStop: options.maxDeparturesPerStop,
  })
  await writeSnapshot(options.outputPath, snapshot)
  const departureCount = snapshot.stops.reduce(
    (total, stop) => total + stop.departures.length,
    0,
  )
  console.log(
    `Wrote ${departureCount} departures at ${snapshot.stops.length} stops to ${options.outputPath}.`,
  )
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  if (!options.watch) {
    await generateSnapshot(options)
    return
  }

  console.log('Watching Transport Victoria feeds every 60 seconds. Press Ctrl+C to stop.')
  while (true) {
    try {
      await generateSnapshot(options)
    } catch (error) {
      console.error(`Feed refresh failed; preserving the last snapshot: ${error.message}`)
    }
    options.refreshStatic = false
    await delay(WATCH_INTERVAL_MS)
  }
}

main().catch((error) => {
  console.error(`Departure snapshot generation failed: ${error.message}`)
  process.exitCode = 1
})
