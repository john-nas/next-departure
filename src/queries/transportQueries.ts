import {
  keepPreviousData,
  useQuery,
} from '@tanstack/react-query'
import {
  getFeedStatus,
  getLiveVehicles,
  getNearbyStops,
  getRouteVehicles,
  getRoutes,
  getRouteDetail,
  getRouteShape,
  getRouteDepartures,
  getStopDepartures,
  getTrip,
  type ApiFeedStatus,
  type ApiStopDepartures,
  type ApiTrip,
  type ApiVehicle,
  type ApiRouteShape,
} from '../services/transportApi'

export const transportQueryKeys = {
  routes: ['transport', 'routes'] as const,
  routeDetail: (routeId: string) => ['transport', 'route-detail', routeId] as const,
  routeShape: (routeId: string) => ['transport', 'route-shape', routeId] as const,
  routeDepartures: (routeId: string) => ['transport', 'route-departures', routeId] as const,
  feedStatus: ['transport', 'feed-status'] as const,
  liveVehicles: (routeId?: string) => ['transport', 'live-vehicles', routeId ?? 'all'] as const,
  routeVehicles: (routeId: string) => ['transport', 'route-vehicles', routeId] as const,
  stopDepartures: (stopId: string) => ['transport', 'stop-departures', stopId] as const,
  nearbyStops: (latitude: number, longitude: number) =>
    ['transport', 'nearby-stops', latitude, longitude] as const,
  trip: (tripId: string) => ['transport', 'trip', tripId] as const,
}

const ACTIVE_REFRESH_MS = 25_000

export function useFeedStatusQuery() {
  return useQuery<ApiFeedStatus>({
    queryKey: transportQueryKeys.feedStatus,
    queryFn: ({ signal }) => getFeedStatus(signal),
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnReconnect: true,
  })
}

export function useRoutesQuery(search?: string) {
  return useQuery({
    queryKey: [...transportQueryKeys.routes, search ?? ''] as const,
    queryFn: ({ signal }) => getRoutes({ search }, signal),
    staleTime: 15 * 60_000,
    refetchOnReconnect: true,
  })
}

export function useRouteDetailQuery(routeId: string) {
  return useQuery({
    queryKey: transportQueryKeys.routeDetail(routeId),
    queryFn: ({ signal }) => getRouteDetail(routeId, signal),
    enabled: Boolean(routeId),
    staleTime: 15 * 60_000,
  })
}

export function useRouteShapeQuery(routeId: string) {
  return useQuery<ApiRouteShape>({
    queryKey: transportQueryKeys.routeShape(routeId),
    queryFn: ({ signal }) => getRouteShape(routeId, signal),
    enabled: Boolean(routeId),
    staleTime: 60 * 60_000,
  })
}

export function useRouteDeparturesQuery(routeId: string, stopId?: string) {
  return useQuery({
    queryKey: [...transportQueryKeys.routeDepartures(routeId), stopId ?? 'first-stop'] as const,
    queryFn: ({ signal }) => getRouteDepartures(routeId, { stopId, limit: 12 }, signal),
    enabled: Boolean(routeId),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchInterval: ACTIVE_REFRESH_MS,
    refetchOnReconnect: true,
  })
}

export function useLiveVehiclesQuery(routeId?: string) {
  return useQuery<{ vehicles: ApiVehicle[] }>({
    queryKey: transportQueryKeys.liveVehicles(routeId),
    queryFn: ({ signal }) => getLiveVehicles({ routeId }, signal),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchInterval: ACTIVE_REFRESH_MS,
    refetchOnReconnect: true,
  })
}

export function useRouteVehiclesQuery(routeId: string) {
  return useQuery<{ routeId: string; vehicles: ApiVehicle[] }>({
    queryKey: transportQueryKeys.routeVehicles(routeId),
    queryFn: ({ signal }) => getRouteVehicles(routeId, signal),
    enabled: Boolean(routeId),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchInterval: ACTIVE_REFRESH_MS,
    refetchOnReconnect: true,
  })
}

export function useStopDeparturesQuery(stopId: string) {
  return useQuery<ApiStopDepartures>({
    queryKey: transportQueryKeys.stopDepartures(stopId),
    queryFn: ({ signal }) => getStopDepartures(stopId, signal),
    enabled: Boolean(stopId),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchInterval: ACTIVE_REFRESH_MS,
    refetchOnReconnect: true,
  })
}

export function useNearbyStopsQuery(
  location: { latitude: number; longitude: number } | null,
) {
  return useQuery({
    queryKey: transportQueryKeys.nearbyStops(
      location?.latitude ?? 0,
      location?.longitude ?? 0,
    ),
    queryFn: ({ signal }) =>
      getNearbyStops(
        {
          latitude: location!.latitude,
          longitude: location!.longitude,
          radiusMeters: 10_000,
          limit: 6,
        },
        signal,
      ),
    enabled: location !== null,
    staleTime: 20_000,
    refetchInterval: ACTIVE_REFRESH_MS,
    refetchOnReconnect: true,
  })
}

export function useTripQuery(tripId: string) {
  return useQuery<ApiTrip>({
    queryKey: transportQueryKeys.trip(tripId),
    queryFn: ({ signal }) => getTrip(tripId, signal),
    enabled: Boolean(tripId),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    refetchInterval: ACTIVE_REFRESH_MS,
    refetchOnReconnect: true,
  })
}
