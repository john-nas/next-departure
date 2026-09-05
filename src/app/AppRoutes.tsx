import { Navigate, Route, Routes } from 'react-router-dom'
import TripPage from '../features/departures/TripPage'
import HomePage from '../features/home/HomePage'
import MapPage from '../features/map/MapPage'
import RoutePage from '../features/routes/RoutePage'
import RoutesPage from '../features/routes/RoutesPage'
import StopPage from '../features/stops/StopPage'
import StopsPage from '../features/stops/StopsPage'
import AppShell from './AppShell'

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="routes" element={<RoutesPage />} />
        <Route path="routes/:routeNumber" element={<RoutePage />} />
        <Route path="stops" element={<StopsPage />} />
        <Route path="stops/:stopId" element={<StopPage />} />
        <Route path="trips/:tripId" element={<TripPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
