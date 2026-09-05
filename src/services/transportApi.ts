import { apiRequest } from './apiClient'

export type ApiVehicle = {
  tripId: string
  routeId: string | null
  routeNumber: string | null
  routeName: string | null
  destination: string | null
  mode: string | null
  latitude: number | null
  longitude: number | null
  bearing: number | null
  currentStopId: string | null
  currentStopSequence: number | null
  currentStatus: number | null
  nextStopName: string | null
  reportedAt: string | null
  ageSeconds: number
  stale: boolean
}

export type ApiFeedStatus = {
  staleAfterSeconds: number
  backendMode: string
  tripUpdates: ApiFeedState | null
  vehiclePositions: ApiFeedState | null
}

export type ApiFeedState = {
  feedTimestamp: number
  receivedAt: string
  entityCount: number
  ageSeconds: number
  stale: boolean
  mode: 'live' | 'snapshot'
}

export type ApiStopDeparture = {
  tripId: string
  stopId?: string
  routeId: string | null
  routeNumber: string | null
  routeName: string | null
  destination: string | null
  stopSequence: number
  scheduledAt?: string | null
  expectedAt?: string | null
  arrivalAt: string | null
  departureAt: string | null
  delaySeconds?: number | null
  arrivalDelaySeconds: number | null
  departureDelaySeconds: number | null
  scheduleRelationship: number | null
  realtime?: boolean | { tripUpdate: boolean; vehiclePosition: boolean }
  status?: 'live' | 'timetable' | 'stale' | 'cancelled'
  vehicle?: {
    latitude: number | null
    longitude: number | null
    bearing: number | null
    reportedAt: string | null
  } | null
  wheelchairAccessible: boolean | null
  mode: string | null
  feedTimestamp: number | null
}

export type ApiStopDepartures = {
  stop: {
    stopId: string
    stopName: string | null
    latitude: number | null
    longitude: number | null
    mode: string
  }
  departures: ApiStopDeparture[]
}

export type ApiNearbyStop = ApiStopDepartures['stop'] & {
  distanceMeters: number
  departures: ApiStopDeparture[]
}

export type ApiTrip = {
  tripId: string
  route: {
    routeId: string
    routeNumber: string | null
    routeName: string | null
    mode: string | null
    routeColor: string | null
  }
  headsign: string | null
  serviceId: string | null
  directionId: number | null
  wheelchairAccessible: boolean | null
  vehicle: {
    latitude: number | null
    longitude: number | null
    bearing: number | null
    currentStopId: string | null
    currentStopSequence: number | null
    currentStatus: number | null
    reportedAt: string | null
    feedTimestamp: number | null
  } | null
  predictions: Array<{
    stopId: string
    stopName: string | null
    stopSequence: number
    arrivalAt: string | null
    departureAt: string | null
    arrivalDelaySeconds: number | null
    departureDelaySeconds: number | null
    scheduleRelationship: number | null
    feedTimestamp: number
  }>
}

export type ApiRoute = {
  routeId: string
  sourceBranch: string
  mode: string
  routeNumber: string | null
  routeName: string | null
  routeType: number | null
  routeColor: string | null
  routeTextColor: string | null
  patterns?: Array<{ headsign: string | null; directionId: number | null }>
  stops?: Array<{
    stopId: string
    stopName: string | null
    stopSequence: number
    latitude: number | null
    longitude: number | null
  }>
  nextServices?: Array<{
    tripId: string
    stopId: string
    stopSequence: number
    scheduledAt: string | null
    destination: string | null
    directionId: number | null
  }>
}

export type ApiRouteShape = {
  routeId: string
  available: boolean
  shapes: Array<{
    routeId?: string
    sourceBranch: string
    shapeId: string
    pointCount: number
    coordinates: Array<[number, number]>
  }>
}

export function getFeedStatus(signal?: AbortSignal) {
  return apiRequest<ApiFeedStatus>('/api/feed/status', signal)
}

export function getLiveVehicles(
  filters: { routeId?: string; mode?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (filters.routeId) params.set('route_id', filters.routeId)
  if (filters.mode) params.set('mode', filters.mode)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return apiRequest<{ vehicles: ApiVehicle[] }>(`/api/live/vehicles${suffix}`, signal)
}

export function getRouteVehicles(routeId: string, signal?: AbortSignal) {
  return apiRequest<{ routeId: string; vehicles: ApiVehicle[] }>(
    `/api/routes/${encodeURIComponent(routeId)}/vehicles`,
    signal,
  )
}

export function getStopDepartures(stopId: string, signal?: AbortSignal) {
  return apiRequest<ApiStopDepartures>(
    `/api/stops/${encodeURIComponent(stopId)}/departures`,
    signal,
  )
}

export function getNearbyStops(
  filters: { latitude: number; longitude: number; radiusMeters?: number; limit?: number },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    lat: String(filters.latitude),
    lon: String(filters.longitude),
  })
  if (filters.radiusMeters) params.set('radius_m', String(filters.radiusMeters))
  if (filters.limit) params.set('limit', String(filters.limit))
  return apiRequest<{ stops: ApiNearbyStop[] }>(`/api/stops/nearby?${params}`, signal)
}

export function getTrip(tripId: string, signal?: AbortSignal) {
  return apiRequest<ApiTrip>(`/api/trips/${encodeURIComponent(tripId)}`, signal)
}

export function getRoutes(
  filters: { mode?: string; search?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (filters.mode) params.set('mode', filters.mode)
  if (filters.search) params.set('search', filters.search)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return apiRequest<{ routes: ApiRoute[] }>(`/api/routes${suffix}`, signal)
}

export function getRouteDetail(routeId: string, signal?: AbortSignal) {
  return apiRequest<{ route: ApiRoute; routes: ApiRoute[] }>(
    `/api/routes/${encodeURIComponent(routeId)}`,
    signal,
  )
}

export function getRouteShape(routeId: string, signal?: AbortSignal) {
  return apiRequest<ApiRouteShape>(
    `/api/routes/${encodeURIComponent(routeId)}/shape`,
    signal,
  )
}

export function getRouteDepartures(
  routeId: string,
  filters: { stopId?: string; directionId?: number; limit?: number } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (filters.stopId) params.set('stop_id', filters.stopId)
  if (filters.directionId !== undefined) params.set('direction_id', String(filters.directionId))
  if (filters.limit) params.set('limit', String(filters.limit))
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return apiRequest<{ routeId: string; departures: ApiStopDeparture[] }>(
    `/api/routes/${encodeURIComponent(routeId)}/departures${suffix}`,
    signal,
  )
}
