import { Award, Building2, CalendarDays, Clock, FileText, MapPin, Navigation, Phone, Trophy, UserRound } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TournamentPublicInfo } from '@/lib/tournaments/public-tournament-details'

interface TournamentPublicInfoCardProps {
  publicInfo: TournamentPublicInfo
  title?: string
  showSchedule?: boolean
}

const formatPriceLabel = (price: TournamentPublicInfo['price']) => {
  if (price === null || price === undefined) return null

  if (typeof price === 'number') {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(price)
  }

  const trimmed = price.trim()
  if (!trimmed) return null
  return trimmed
}

export default function TournamentPublicInfoCard({
  publicInfo,
  title = 'Información del torneo',
  showSchedule = publicInfo.type === 'AMERICAN',
}: TournamentPublicInfoCardProps) {
  const priceLabel = formatPriceLabel(publicInfo.price)

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-semibold text-slate-900">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InfoItem icon={Trophy} label="Tipo" value={publicInfo.typeLabel} />
          {publicInfo.showStatus ? (
            <InfoItem icon={CalendarDays} label="Estado" value={publicInfo.statusLabel} badge />
          ) : null}

          {publicInfo.category && (
            <InfoItem icon={Trophy} label="Categoría" value={publicInfo.category} />
          )}

          <InfoItem icon={UserRound} label="Género" value={publicInfo.genderLabel} />

          {publicInfo.startDateLabel && (
            <InfoItem icon={CalendarDays} label="Fecha" value={publicInfo.startDateLabel} />
          )}

          {showSchedule && publicInfo.startTimeLabel && (
            <InfoItem icon={Clock} label="Horario" value={publicInfo.startTimeLabel} />
          )}

          {priceLabel && <InfoItem icon={Trophy} label="Precio por jugador" value={priceLabel} />}
          {publicInfo.award && <InfoItem icon={Award} label="Premios" value={publicInfo.award} />}

          {publicInfo.clubName && <InfoItem icon={Building2} label="Club" value={publicInfo.clubName} />}

          {publicInfo.clubAddress && (
            <InfoItem icon={MapPin} label="Ubicación" value={publicInfo.clubAddress} />
          )}

          {publicInfo.organizerName && (
            <InfoItem icon={UserRound} label="Organiza" value={publicInfo.organizerName} />
          )}

          {publicInfo.organizerPhone && (
            <InfoItem icon={Phone} label="Teléfono" value={publicInfo.organizerPhone} />
          )}
        </div>

        {publicInfo.clubMapsUrl && (
          <Button asChild className="w-full sm:w-auto">
            <a href={publicInfo.clubMapsUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="mr-2 h-4 w-4" />
              Como llegar
            </a>
          </Button>
        )}

        {publicInfo.description && (
          <div className="border-t border-slate-200 pt-6">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
              <FileText className="h-4 w-4" />
              <span>Descripción</span>
            </div>
            <p className="whitespace-pre-wrap text-slate-700">{publicInfo.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface InfoItemProps {
  icon: typeof Trophy
  label: string
  value: string
  badge?: boolean
}

function InfoItem({ icon: Icon, label, value, badge = false }: InfoItemProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200/80 bg-slate-50/60 p-4">
      <div className="rounded-full bg-white p-2 text-slate-600 shadow-sm">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-sm font-medium text-slate-500">{label}</p>
        {badge ? (
          <Badge variant="outline" className="text-sm">
            {value}
          </Badge>
        ) : (
          <p className="text-base font-semibold text-slate-900">{value}</p>
        )}
      </div>
    </div>
  )
}
