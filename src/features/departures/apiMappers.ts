import type { ApiStopDeparture } from '../../services/transportApi'
import type { Departure } from '../feed/feed.types'

export function apiDepartureToDeparture(stopId: string, departure: ApiStopDeparture): Departure {
  const predictedAt = departure.expectedAt ?? departure.departureAt ?? departure.arrivalAt
  const delaySeconds =
    departure.delaySeconds ?? departure.departureDelaySeconds ?? departure.arrivalDelaySeconds
  const scheduledAt =
    departure.scheduledAt ?? (predictedAt && delaySeconds !== null && delaySeconds !== undefined
      ? new Date(Date.parse(predictedAt) - delaySeconds * 1000).toISOString()
      : predictedAt)
  const realtime =
    typeof departure.realtime === 'object'
      ? departure.realtime.tripUpdate || departure.realtime.vehiclePosition
      : departure.realtime !== false
  const status =
    departure.status === 'cancelled' || departure.scheduleRelationship === 1
      ? 'cancelled'
      : departure.status === 'stale'
        ? 'scheduled'
      : !realtime
        ? 'scheduled'
        : delaySeconds === null || delaySeconds === undefined
          ? 'on-time'
          : Math.abs(delaySeconds) <= 60
            ? 'on-time'
            : delaySeconds < 0
              ? 'early'
              : 'delayed'
  return {
    id: `${departure.tripId}:${stopId}:${departure.stopSequence}`,
    tripId: departure.tripId,
    routeId: departure.routeId ?? departure.routeNumber ?? 'unknown',
    routeNumber: departure.routeNumber ?? 'Unknown',
    routeName: departure.routeName ?? `Route ${departure.routeNumber ?? 'Unknown'}`,
    destination: departure.destination ?? 'Service',
    scheduledAt,
    predictedAt,
    delaySeconds,
    status,
    realtime,
    wheelchairAccessible: departure.wheelchairAccessible,
    vehicle: departure.vehicle && departure.vehicle.latitude !== null && departure.vehicle.longitude !== null
      ? {
          latitude: departure.vehicle.latitude,
          longitude: departure.vehicle.longitude,
          bearing: departure.vehicle.bearing,
          recordedAt: departure.vehicle.reportedAt ?? new Date().toISOString(),
          currentStopSequence: null,
          currentStatus: 'in_transit_to',
        }
      : null,
  }
}
