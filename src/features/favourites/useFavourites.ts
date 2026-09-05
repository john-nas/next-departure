import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'next-departure:favourites:v1'
const CHANGE_EVENT = 'next-departure:favourites-changed'

type Favourites = {
  routes: string[]
  stops: string[]
}

const EMPTY_FAVOURITES: Favourites = {
  routes: [],
  stops: [],
}

function readFavourites(): Favourites {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_FAVOURITES

    const parsed = JSON.parse(raw) as Partial<Favourites>
    return {
      routes: Array.isArray(parsed.routes) ? parsed.routes : [],
      stops: Array.isArray(parsed.stops) ? parsed.stops : [],
    }
  } catch {
    return EMPTY_FAVOURITES
  }
}

function writeFavourites(next: Favourites) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useFavourites() {
  const [favourites, setFavourites] = useState<Favourites>(() => readFavourites())

  useEffect(() => {
    const sync = () => setFavourites(readFavourites())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)

    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const toggleRoute = useCallback((routeNumber: string) => {
    const current = readFavourites()
    const exists = current.routes.includes(routeNumber)
    writeFavourites({
      ...current,
      routes: exists
        ? current.routes.filter((route) => route !== routeNumber)
        : [...current.routes, routeNumber],
    })
  }, [])

  const toggleStop = useCallback((stopId: string) => {
    const current = readFavourites()
    const exists = current.stops.includes(stopId)
    writeFavourites({
      ...current,
      stops: exists
        ? current.stops.filter((stop) => stop !== stopId)
        : [...current.stops, stopId],
    })
  }, [])

  return {
    favouriteRoutes: favourites.routes,
    favouriteStops: favourites.stops,
    isRouteFavourite: (routeNumber: string) =>
      favourites.routes.includes(routeNumber),
    isStopFavourite: (stopId: string) => favourites.stops.includes(stopId),
    toggleRoute,
    toggleStop,
  }
}
