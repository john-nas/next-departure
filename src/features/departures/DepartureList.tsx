import { BusFront } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import type { Departure } from '../feed/feed.types'
import { DepartureCard } from './DepartureCard'

type DepartureListProps = {
  departures: Departure[]
  showRoute?: boolean
  emptyCopy?: string
}

export function DepartureList({
  departures,
  showRoute = true,
  emptyCopy = 'There are no departures in the current feed window.',
}: DepartureListProps) {
  if (departures.length === 0) {
    return (
      <EmptyState icon={BusFront} title="No upcoming departures" compact>
        <p>{emptyCopy}</p>
      </EmptyState>
    )
  }

  return (
    <div className="departure-list">
      {departures.map((departure) => (
        <DepartureCard
          key={departure.id}
          departure={departure}
          showRoute={showRoute}
        />
      ))}
    </div>
  )
}
