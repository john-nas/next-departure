export const TRANSPORT_VICTORIA = Object.freeze({
  provider: 'Transport Victoria',
  dataset: 'GTFS Schedule and GTFS Realtime - Metro & Regional Bus',
  scheduleUrl:
    'https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip',
  tripUpdatesUrl:
    'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/trip-updates',
  vehiclePositionsUrl:
    'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/vehicle-positions',
})

// Transport Victoria GTFS does not expose the contracted bus operator. This is
// therefore an intentionally small, best-effort route allowlist, not an
// authoritative operator mapping.
export const CURATED_DYSONS_ROUTE_NUMBERS = Object.freeze([
  '343',
  '578',
  '579',
  '580',
  '582',
])

// Folder 4 contains both metropolitan bus routes and the regional Myki town
// bus services migrated onto the bus GTFS-Realtime identifiers.
export const REGIONAL_MYKI_ROUTE_PREFIXES = Object.freeze([
  '45', '46', '57', '58', '59', '64', '65', '66',
  '67', '68', '69', '70', '78', '79', '80', '81',
])

export const DEFAULT_STATIC_BRANCHES = Object.freeze(['4'])
export const ALL_BUS_STATIC_BRANCHES = Object.freeze(['4', '6'])
export const REGIONAL_SCHEDULE_BRANCHES = Object.freeze(['5', '6'])
export const SUPPORTED_STATIC_BRANCHES = Object.freeze(['4', '5', '6'])

export const DEFAULT_STATIC_CACHE = '.cache/gtfs-static-v1.json'
export const DEFAULT_OUTPUT = 'public/data/departures.json'
export const DEFAULT_WINDOW_HOURS = 2
export const DEFAULT_MAX_DEPARTURES = 500
export const DEFAULT_MAX_DEPARTURES_PER_STOP = 12
