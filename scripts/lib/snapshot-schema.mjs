const ROOT_KEYS = ['schemaVersion', 'generatedAt', 'mode', 'source', 'stops']
const SOURCE_KEYS = [
  'provider',
  'dataset',
  'scheduleUpdatedAt',
  'realtimeUpdatedAt',
  'operatorScope',
  'capabilities',
  'notice',
]
const STOP_KEYS = ['id', 'name', 'locality', 'latitude', 'longitude', 'departures']
const DEPARTURE_KEYS = [
  'id',
  'tripId',
  'routeId',
  'routeNumber',
  'routeName',
  'serviceTier',
  'destination',
  'scheduledAt',
  'predictedAt',
  'delaySeconds',
  'status',
  'wheelchairAccessible',
  'vehicle',
]
const VEHICLE_KEYS = [
  'latitude',
  'longitude',
  'bearing',
  'recordedAt',
  'currentStopSequence',
  'currentStatus',
  'nextStopName',
]
const STATUSES = new Set(['on-time', 'early', 'delayed', 'cancelled', 'scheduled'])
const SERVICE_TIERS = new Set(['live-metro', 'live-regional'])

function assert(condition, message) {
  if (!condition) throw new Error(`Snapshot validation failed: ${message}`)
}

function assertExactKeys(value, allowedKeys, path) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${path} must be an object`)
  const allowed = new Set(allowedKeys)
  for (const key of Object.keys(value)) {
    assert(allowed.has(key), `${path}.${key} is not part of schemaVersion 1`)
  }
}

function assertString(value, path) {
  assert(typeof value === 'string' && value.length > 0, `${path} must be a non-empty string`)
}

function assertNullableIsoDate(value, path) {
  assert(
    value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value))),
    `${path} must be null or an ISO date`,
  )
}

function assertFiniteNumber(value, path) {
  assert(typeof value === 'number' && Number.isFinite(value), `${path} must be a finite number`)
}

export function validateSnapshot(snapshot) {
  assertExactKeys(snapshot, ROOT_KEYS, 'snapshot')
  assert(snapshot.schemaVersion === 1, 'schemaVersion must equal 1')
  assertNullableIsoDate(snapshot.generatedAt, 'generatedAt')
  assert(snapshot.generatedAt !== null, 'generatedAt is required')
  assert(snapshot.mode === 'live' || snapshot.mode === 'schedule', 'mode is invalid')

  assertExactKeys(snapshot.source, SOURCE_KEYS, 'source')
  assertString(snapshot.source.provider, 'source.provider')
  assertString(snapshot.source.dataset, 'source.dataset')
  assertString(snapshot.source.operatorScope, 'source.operatorScope')
  if ('scheduleUpdatedAt' in snapshot.source) {
    assertNullableIsoDate(snapshot.source.scheduleUpdatedAt, 'source.scheduleUpdatedAt')
  }
  if ('realtimeUpdatedAt' in snapshot.source) {
    assertNullableIsoDate(snapshot.source.realtimeUpdatedAt, 'source.realtimeUpdatedAt')
  }
  if ('notice' in snapshot.source) assertString(snapshot.source.notice, 'source.notice')
  if ('capabilities' in snapshot.source) {
    assertExactKeys(
      snapshot.source.capabilities,
      ['liveRegionalMykiBus', 'regionalCoach', 'otherRegionalBus'],
      'source.capabilities',
    )
    assert(
      typeof snapshot.source.capabilities.liveRegionalMykiBus === 'boolean',
      'source.capabilities.liveRegionalMykiBus must be boolean',
    )
    for (const key of ['regionalCoach', 'otherRegionalBus']) {
      assert(
        snapshot.source.capabilities[key] === 'schedule-only',
        `source.capabilities.${key} must be schedule-only`,
      )
    }
  }

  assert(Array.isArray(snapshot.stops), 'stops must be an array')
  const stopIds = new Set()
  for (const [stopIndex, stop] of snapshot.stops.entries()) {
    const stopPath = `stops[${stopIndex}]`
    assertExactKeys(stop, STOP_KEYS, stopPath)
    assertString(stop.id, `${stopPath}.id`)
    assert(!stopIds.has(stop.id), `${stopPath}.id is duplicated`)
    stopIds.add(stop.id)
    assertString(stop.name, `${stopPath}.name`)
    if ('locality' in stop) assertString(stop.locality, `${stopPath}.locality`)
    assertFiniteNumber(stop.latitude, `${stopPath}.latitude`)
    assertFiniteNumber(stop.longitude, `${stopPath}.longitude`)
    assert(Array.isArray(stop.departures) && stop.departures.length > 0, `${stopPath}.departures is empty`)

    for (const [departureIndex, departure] of stop.departures.entries()) {
      const departurePath = `${stopPath}.departures[${departureIndex}]`
      assertExactKeys(departure, DEPARTURE_KEYS, departurePath)
      for (const key of ['id', 'tripId', 'routeId', 'routeNumber', 'routeName', 'destination']) {
        assertString(departure[key], `${departurePath}.${key}`)
      }
      if ('serviceTier' in departure) {
        assert(SERVICE_TIERS.has(departure.serviceTier), `${departurePath}.serviceTier is invalid`)
      }
      assertNullableIsoDate(departure.scheduledAt, `${departurePath}.scheduledAt`)
      assertNullableIsoDate(departure.predictedAt, `${departurePath}.predictedAt`)
      assert(
        departure.delaySeconds === null || Number.isInteger(departure.delaySeconds),
        `${departurePath}.delaySeconds must be null or an integer`,
      )
      assert(STATUSES.has(departure.status), `${departurePath}.status is invalid`)
      assert(
        departure.wheelchairAccessible === null ||
          typeof departure.wheelchairAccessible === 'boolean',
        `${departurePath}.wheelchairAccessible must be null or boolean`,
      )

      if (departure.vehicle !== null) {
        const vehiclePath = `${departurePath}.vehicle`
        const vehicle = departure.vehicle
        assertExactKeys(vehicle, VEHICLE_KEYS, vehiclePath)
        assertFiniteNumber(vehicle.latitude, `${vehiclePath}.latitude`)
        assertFiniteNumber(vehicle.longitude, `${vehiclePath}.longitude`)
        assert(
          vehicle.bearing === null ||
            (typeof vehicle.bearing === 'number' &&
              Number.isFinite(vehicle.bearing) &&
              vehicle.bearing >= 0 &&
              vehicle.bearing <= 360),
          `${vehiclePath}.bearing is invalid`,
        )
        assertNullableIsoDate(vehicle.recordedAt, `${vehiclePath}.recordedAt`)
        assert(vehicle.recordedAt !== null, `${vehiclePath}.recordedAt is required`)
        assert(
          vehicle.currentStopSequence === null || Number.isInteger(vehicle.currentStopSequence),
          `${vehiclePath}.currentStopSequence is invalid`,
        )
        assertString(vehicle.currentStatus, `${vehiclePath}.currentStatus`)
        if ('nextStopName' in vehicle) assertString(vehicle.nextStopName, `${vehiclePath}.nextStopName`)
      }
    }
  }

  return snapshot
}
