import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { DEFAULT_STATIC_CACHE, TRANSPORT_VICTORIA } from '../../config/feed.mjs'
import { parseCsv } from './csv.mjs'
import {
  extractRemoteZipEntry,
  extractStandaloneLocalMember,
  extractZipEntry,
  readRemoteZipIndex,
  readZipIndex,
} from './zip.mjs'

const CACHE_SCHEMA_VERSION = 1

function extractLocality(stopName, row) {
  const explicit = row.stop_suburb || row.stop_locality || row.locality
  if (explicit) return explicit.trim()
  const match = stopName.match(/\(([^()]*)\)\s*$/)
  return match?.[1]?.trim() || undefined
}

function parseBranchLookup(innerArchive, branch) {
  const entries = readZipIndex(innerArchive)
  const stopsEntry = entries.get('stops.txt')
  const routesEntry = entries.get('routes.txt')
  if (!stopsEntry || !routesEntry) {
    throw new Error(`GTFS branch ${branch} does not contain stops.txt and routes.txt`)
  }

  const stops = {}
  const stopRows = parseCsv(extractZipEntry(innerArchive, stopsEntry).toString('utf8'))
  for (const row of stopRows) {
    const id = row.stop_id?.trim()
    const name = row.stop_name?.trim()
    const latitude = Number(row.stop_lat)
    const longitude = Number(row.stop_lon)
    if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
    const stop = { name, latitude, longitude, branch }
    const locality = extractLocality(name, row)
    if (locality) stop.locality = locality
    stops[id] = stop
  }

  const routes = {}
  const routeRows = parseCsv(extractZipEntry(innerArchive, routesEntry).toString('utf8'))
  for (const row of routeRows) {
    const id = row.route_id?.trim()
    const shortName = row.route_short_name?.trim()
    if (!id || !shortName) continue
    routes[id] = {
      shortName,
      longName: row.route_long_name?.trim() || `Route ${shortName}`,
      branch,
    }
  }

  return { stops, routes }
}

function rebuildRoutesByShortName(routes) {
  const result = {}
  for (const [routeId, route] of Object.entries(routes)) {
    ;(result[route.shortName] ??= []).push(routeId)
  }
  return result
}

function emptyCache(scheduleUrl) {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    source: {
      url: scheduleUrl,
      fetchedAt: null,
      lastModified: null,
      etag: null,
      branches: [],
    },
    stops: {},
    routes: {},
    routesByShortName: {},
  }
}

function assertStaticCache(cache) {
  if (
    cache?.schemaVersion !== CACHE_SCHEMA_VERSION ||
    !cache.source ||
    !Array.isArray(cache.source.branches) ||
    !cache.stops ||
    !cache.routes ||
    !cache.routesByShortName
  ) {
    throw new Error('Static lookup cache has an unsupported or invalid schema')
  }
  return cache
}

export async function readStaticLookup(cachePath = DEFAULT_STATIC_CACHE) {
  const contents = await readFile(resolve(cachePath), 'utf8')
  return assertStaticCache(JSON.parse(contents))
}

async function readCacheIfPresent(cachePath, scheduleUrl) {
  try {
    return await readStaticLookup(cachePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyCache(scheduleUrl)
    throw error
  }
}

async function writeCache(cachePath, cache) {
  const target = resolve(cachePath)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(cache)}\n`, 'utf8')
  await rename(temporary, target)
}

export async function ensureStaticLookup({
  branches = ['4'],
  cachePath = DEFAULT_STATIC_CACHE,
  scheduleUrl = TRANSPORT_VICTORIA.scheduleUrl,
  force = false,
  localMemberFiles = new Map(),
} = {}) {
  const requestedBranches = [...new Set(branches.map(String))]
  let cache = force
    ? emptyCache(scheduleUrl)
    : await readCacheIfPresent(cachePath, scheduleUrl)
  const cachedBranches = new Set(cache.source.branches.map(String))
  const missingBranches = requestedBranches.filter((branch) => !cachedBranches.has(branch))
  if (missingBranches.length === 0) return cache

  let remoteIndex
  for (const branch of missingBranches) {
    const memberName = `${branch}/google_transit.zip`
    let innerArchive
    const localMemberPath = localMemberFiles.get(branch)

    if (localMemberPath) {
      const localBytes = await readFile(resolve(localMemberPath))
      innerArchive = extractStandaloneLocalMember(localBytes, memberName)
      const details = await stat(resolve(localMemberPath))
      cache.source.lastModified ||= details.mtime.toUTCString()
    } else {
      remoteIndex ??= await readRemoteZipIndex(scheduleUrl)
      const entry = remoteIndex.entries.get(memberName)
      if (!entry) throw new Error(`Schedule archive does not contain ${memberName}`)
      innerArchive = await extractRemoteZipEntry(scheduleUrl, entry)
      cache.source.etag = remoteIndex.metadata.etag
      cache.source.lastModified = remoteIndex.metadata.lastModified
    }

    const branchLookup = parseBranchLookup(innerArchive, branch)
    Object.assign(cache.stops, branchLookup.stops)
    Object.assign(cache.routes, branchLookup.routes)
    cachedBranches.add(branch)
  }

  cache.source.url = scheduleUrl
  cache.source.fetchedAt = new Date().toISOString()
  cache.source.branches = [...cachedBranches].sort((left, right) => Number(left) - Number(right))
  cache.routesByShortName = rebuildRoutesByShortName(cache.routes)
  assertStaticCache(cache)
  await writeCache(cachePath, cache)
  return cache
}
