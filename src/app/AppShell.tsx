import {
  BusFront,
  House,
  Map,
  MapPin,
  Route as RouteIcon,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { FeedStatus } from '../components/ui/FeedStatus'
import { useDepartureFeed } from '../features/feed/feedContext'
import { formatDateTime } from '../features/feed/feed.utils'

const navItems = [
  { to: '/', label: 'For you', icon: House, end: true },
  { to: '/routes', label: 'Routes', icon: RouteIcon },
  { to: '/stops', label: 'Stops', icon: MapPin },
  { to: '/map', label: 'Live map', icon: Map },
]

export default function AppShell() {
  const { feed, error, isStale } = useDepartureFeed()

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <NavLink to="/" className="brand" aria-label="Next Departure home">
            <span className="brand__mark">
              <BusFront aria-hidden="true" />
            </span>
            <span className="brand__copy">
              <small>Victoria bus</small>
              <strong>Next Departure</strong>
            </span>
          </NavLink>

          <nav className="desktop-nav" aria-label="Primary navigation">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  isActive ? 'desktop-nav__item is-active' : 'desktop-nav__item'
                }
              >
                <Icon aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <FeedStatus />
        </div>
      </header>

      {(error || isStale) && feed && (
        <div className={isStale ? 'global-notice global-notice--warning' : 'global-notice'}>
          <div className="global-notice__inner">
            <strong>
              {isStale
                ? 'Historical live snapshot'
                : 'Refresh failed — showing the last received feed'}
            </strong>
            <span>
              {isStale
                ? `Captured ${formatDateTime(feed.generatedAt)}. Relative times are anchored to the capture.`
                : error}
            </span>
          </div>
        </div>
      )}

      <div className="app-content">
        <Outlet />
      </div>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              isActive ? 'mobile-nav__item is-active' : 'mobile-nav__item'
            }
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
