import {
  CalendarDays,
  Clock,
  MapPin,
  Navigation,
  Phone,
  Trophy,
  UserRound,
} from 'lucide-react'

import type { TournamentPublicInfo } from '@/lib/tournaments/public-tournament-details'
import { cn } from '@/lib/utils'

interface TournamentHeroDetailsProps {
  publicInfo: TournamentPublicInfo
  variant?: 'dark' | 'light'
  className?: string
}

interface DetailItem {
  label: string
  value: string
  icon: typeof Trophy
}

export default function TournamentHeroDetails({
  publicInfo,
  variant = 'dark',
  className,
}: TournamentHeroDetailsProps) {
  const items: DetailItem[] = [
    {
      label: 'Formato',
      value: publicInfo.typeLabel,
      icon: Trophy,
    },
    ...(publicInfo.category
      ? [
          {
            label: 'Categoría',
            value: publicInfo.category,
            icon: UserRound,
          },
        ]
      : []),
    ...(publicInfo.clubAddress
      ? [
          {
            label: 'Dirección',
            value: publicInfo.clubAddress,
            icon: MapPin,
          },
        ]
      : []),
    ...(publicInfo.startDateLabel
      ? [
          {
            label: 'Fecha',
            value: publicInfo.startDateLabel,
            icon: CalendarDays,
          },
        ]
      : []),
    ...(publicInfo.startTimeLabel
      ? [
          {
            label: 'Horario',
            value: publicInfo.startTimeLabel,
            icon: Clock,
          },
        ]
      : []),
    ...(publicInfo.organizerPhone
      ? [
          {
            label: 'Contacto',
            value: publicInfo.organizerPhone,
            icon: Phone,
          },
        ]
      : []),
  ]

  if (items.length === 0) return null

  const tone =
    variant === 'dark'
      ? {
          card: 'bg-white/10 border-white/15 text-white backdrop-blur-sm',
          icon: 'bg-white/15 text-white',
          label: 'text-blue-100/90',
          value: 'text-white',
        }
      : {
          card: 'bg-white border-slate-200 text-slate-900 shadow-sm',
          icon: 'bg-slate-100 text-slate-700',
          label: 'text-slate-500',
          value: 'text-slate-900',
        }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ label, value, icon: Icon }) => (
          <div
            key={`${label}-${value}`}
            className={cn('rounded-elevated border p-4 text-left', tone.card)}
          >
            <div className="flex items-start gap-3">
              <div className={cn('rounded-full p-2', tone.icon)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className={cn('mb-1 text-xs font-medium uppercase tracking-wide', tone.label)}>
                  {label}
                </p>
                <p className={cn('text-sm font-semibold leading-snug', tone.value)}>
                  {value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {publicInfo.clubMapsUrl ? (
        <a
          href={publicInfo.clubMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-elevated border px-4 py-2 text-sm font-semibold transition',
            variant === 'dark'
              ? 'border-white/20 bg-white/15 text-white hover:bg-white/25'
              : 'border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50',
          )}
        >
          <Navigation className="h-4 w-4" />
          Como llegar
        </a>
      ) : null}
    </div>
  )
}
