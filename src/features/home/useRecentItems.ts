import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'next-departure:recent:v1'
const CHANGE_EVENT = 'next-departure:recent-changed'
const MAX_ITEMS = 8

type RecentItems = {
  routes: string[]
  stops: string[]
}

const EMPTY_RECENT: RecentItems = { routes: [], stops: [] }

function readRecent(): RecentItems {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_RECENT

    const parsed = JSON.parse(raw) as Partial<RecentItems>
    return {
      routes: Array.isArray(parsed.routes) ? parsed.routes : [],
      stops: Array.isArray(parsed.stops) ? parsed.stops : [],
    }
  } catch {
    return EMPTY_RECENT
  }
}

function saveRecent(recent: RecentItems) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recent))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function addToFront(values: string[], value: string) {
  return [value, ...values.filter((item) => item !== value)].slice(0, MAX_ITEMS)
}

export function useRecentItems() {
  const [recent, setRecent] = useState<RecentItems>(() => readRecent())

  useEffect(() => {
    const sync = () => setRecent(readRecent())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)

    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const rememberRoute = useCallback((routeNumber: string) => {
    const current = readRecent()
    saveRecent({ ...current, routes: addToFront(current.routes, routeNumber) })
  }, [])

  const rememberStop = useCallback((stopId: string) => {
    const current = readRecent()
    saveRecent({ ...current, stops: addToFront(current.stops, stopId) })
  }, [])

  return {
    recentRoutes: recent.routes,
    recentStops: recent.stops,
    rememberRoute,
    rememberStop,
  }
}
