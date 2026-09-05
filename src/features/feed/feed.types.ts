export type FeedMode = 'live' | 'schedule'

export type DepartureStatus =
  | 'on-time'
  | 'early'
  | 'delayed'
  | 'cancelled'
  | 'scheduled'

export type ServiceTier = 'live-metro' | 'live-regional'

export type Vehicle = {
  latitude: number
  longitude: number
  bearing: number | null
  recordedAt: string
  currentStopSequence: number | null
  currentStatus: string
  nextStopName?: string
}

export type Departure = {
  id: string
  tripId: string
  routeId: string
  routeNumber: string
  routeName: string
  serviceTier?: ServiceTier
  destination: string
  scheduledAt: string | null
  predictedAt: string | null
  delaySeconds: number | null
  status: DepartureStatus
  /** True when this row came from a realtime trip update, even if on-time. */
  realtime?: boolean
  wheelchairAccessible: boolean | null
  vehicle: Vehicle | null
}

export type Stop = {
  id: string
  name: string
  locality?: string
  latitude: number
  longitude: number
  departures: Departure[]
}

export type DepartureFeed = {
  schemaVersion: 1
  generatedAt: string
  mode: FeedMode
  source: {
    provider: string
    dataset: string
    scheduleUpdatedAt?: string
    realtimeUpdatedAt?: string | null
    operatorScope: string
    capabilities?: {
      liveRegionalMykiBus: boolean
      regionalCoach: 'schedule-only'
      otherRegionalBus: 'schedule-only'
    }
    notice?: string
  }
  stops: Stop[]
}

export type DepartureOccurrence = {
  stop: Stop
  departure: Departure
}
