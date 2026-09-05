import type { Departure } from './feed.types'

const MELBOURNE_TIME = new Intl.DateTimeFormat('en-AU', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Australia/Melbourne',
})

const MELBOURNE_DATE_TIME = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Australia/Melbourne',
})

export function parseTime(value: string | null | undefined) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

export function formatClock(value: string | null | undefined) {
  const timestamp = parseTime(value)
  return timestamp === null ? '—' : MELBOURNE_TIME.format(timestamp)
}

export function formatDateTime(value: string | null | undefined) {
  const timestamp = parseTime(value)
  return timestamp === null ? 'Unknown' : MELBOURNE_DATE_TIME.format(timestamp)
}

export function relativeTime(timestamp: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 15) return 'just now'
  if (seconds < 60) return `${seconds} sec ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  return `${hours} hr${hours === 1 ? '' : 's'} ago`
}

export function departureTimestamp(departure: Departure) {
  return parseTime(departure.predictedAt ?? departure.scheduledAt)
}

export function dueLabel(
  departure: Departure,
  anchor: number,
  isCaptured: boolean,
) {
  if (departure.status === 'cancelled') return 'Cancelled'

  const timestamp = departureTimestamp(departure)
  if (timestamp === null) return '—'

  const minutes = Math.ceil((timestamp - anchor) / 60_000)
  const relativeLabel =
    minutes <= 0 ? 'Due' : minutes === 1 ? '1 min' : `${minutes} min`

  // The historical banner already explains that the clock is anchored to a
  // capture. Keep the card itself focused on the passenger's departure time.
  void isCaptured
  return relativeLabel
}

export function timingLabel(departure: Departure) {
  if (departure.status === 'cancelled') return 'Cancelled'
  if (departure.status === 'scheduled') return 'Scheduled'
  if (departure.status === 'on-time') return 'On time'

  const seconds = Math.abs(departure.delaySeconds ?? 0)
  const minutes = Math.max(1, Math.round(seconds / 60))

  return departure.status === 'early'
    ? `${minutes} min early`
    : `${minutes} min late`
}

export function isRealtimeDeparture(departure: Departure) {
  return Boolean(
    departure.realtime ||
      departure.vehicle ||
      (departure.predictedAt && departure.predictedAt !== departure.scheduledAt),
  )
}

export function cleanVehicleStatus(status: string) {
  return status.replaceAll('_', ' ').toLowerCase()
}

export function distanceKm(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusKm = 6371
  const latitudeDelta = toRadians(toLatitude - fromLatitude)
  const longitudeDelta = toRadians(toLongitude - fromLongitude)
  const startLatitude = toRadians(fromLatitude)
  const endLatitude = toRadians(toLatitude)

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2

  return (
    earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}

export function formatDistance(distance: number) {
  if (distance < 1) {
    return `${Math.max(50, Math.round((distance * 1000) / 50) * 50)} m away`
  }

  return `${distance.toFixed(1)} km away`
}

export function compareDepartures(a: Departure, b: Departure) {
  const aTime = departureTimestamp(a) ?? Number.MAX_SAFE_INTEGER
  const bTime = departureTimestamp(b) ?? Number.MAX_SAFE_INTEGER
  return aTime - bTime
}

/**
 * Prototype-only fallback.
 *
 * The current generated departure id ends with the GTFS stop sequence, e.g.
 * "trip-id:10574:9". The UI uses that final number only to reconstruct an
 * ordered route/trip preview from the current snapshot.
 *
 * Once generate-departures.mjs exposes stopSequence explicitly, replace this
 * helper with departure.stopSequence and remove this parser.
 */
export function prototypeStopSequence(departure: Departure) {
  const match = departure.id.match(/:(\d+)$/)
  if (!match) return Number.MAX_SAFE_INTEGER

  const value = Number(match[1])
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

export function normaliseSearchText(value: string) {
  return value.trim().toLocaleLowerCase()
}
