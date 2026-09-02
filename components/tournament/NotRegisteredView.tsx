'use client'

import React from 'react'
import Image from 'next/image'
import { AlertCircle, BookOpen, Building2, MapPin, Navigation, Phone, Trophy, UserPlus } from 'lucide-react'
import Link from 'next/link'

import PublicRegistrationLauncher from '@/components/tournament/public-registration-launcher'
import { getTenantBranding } from '@/config/tenant'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TournamentPublicInfo } from '@/lib/tournaments/public-tournament-details'
import { canShowPublicRegistration, getPublicRegistrationClosedLabel } from '@/lib/tournaments/registration-availability'
import { shouldTreatTournamentRegistrationAsPublic } from '@/lib/tournaments/tenant-registration-policy'
import { Gender } from '@/types'
import { getStorageUrl } from '@/utils/storage-url'

interface NotRegisteredViewProps {
  tournamentId: string
  tournament: {
    id: string
    name: string
    category?: string
    type?: string | null
    status?: string
    gender?: Gender
    price?: number | string | null
    enable_transfer_proof?: boolean
    enable_public_inscriptions?: boolean | null
    registration_locked?: boolean | null
    bracket_status?: string | null
    transfer_alias?: string | null
    transfer_amount?: number | null
    is_full?: boolean
    has_few_slots?: boolean
    publicInfo?: TournamentPublicInfo
  }
}

export default function NotRegisteredView({
  tournamentId,
  tournament,
}: NotRegisteredViewProps) {
  const branding = getTenantBranding()
  const isFull = Boolean(tournament.is_full)
  const enablePublicRegistration = shouldTreatTournamentRegistrationAsPublic({
    tenantKey: branding.key,
    tournamentType: tournament.type,
    enablePublicInscriptions: tournament.enable_public_inscriptions,
  })
  const canRegister = canShowPublicRegistration({
    status: tournament.status,
    enablePublicInscriptions: enablePublicRegistration,
    registrationLocked: tournament.registration_locked,
    bracketStatus: tournament.bracket_status,
    isFull,
    allowActivePhaseRegistration: branding.key === 'padel-fv',
  })
  const closedLabel = getPublicRegistrationClosedLabel({
    isFull,
  })
  const publicInfo = tournament.publicInfo
  const clubImageUrl = getStorageUrl(publicInfo?.clubImageUrl)

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-surface bg-blue-100 p-2.5">
            <Trophy className="h-6 w-6 text-blue-700" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-2xl font-bold leading-tight text-foreground">
                {tournament.name}
              </h1>
              <Badge
                variant="outline"
                className="border-blue-200 bg-blue-50 text-blue-800"
              >
                Liga
              </Badge>
            </div>
            {tournament.category ? (
              <p className="text-sm font-medium text-muted-foreground">
                Categoria {tournament.category}
              </p>
            ) : null}
          </div>
        </div>

        {publicInfo ? (
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            {clubImageUrl ? (
              <div className="relative h-32 w-full bg-slate-100 sm:h-40">
                <Image
                  src={clubImageUrl}
                  alt={publicInfo.clubName ? `Foto de ${publicInfo.clubName}` : 'Foto del club'}
                  fill
                  sizes="(max-width: 640px) 100vw, 640px"
                  className="object-cover"
                />
              </div>
            ) : null}
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-slate-100 p-2 text-slate-700">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Club
                  </p>
                  <p className="text-base font-semibold text-slate-950">
                    {publicInfo.clubName || publicInfo.organizerName || 'Club a confirmar'}
                  </p>
                </div>
              </div>

              {publicInfo.clubAddress ? (
                <div className="flex items-start gap-3 text-sm text-slate-700">
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                  <span className="leading-snug">{publicInfo.clubAddress}</span>
                </div>
              ) : null}

              {publicInfo.organizerPhone ? (
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <Phone className="h-4 w-4 flex-shrink-0 text-slate-500" />
                  <span>{publicInfo.organizerPhone}</span>
                </div>
              ) : null}

              {publicInfo.clubMapsUrl ? (
                <Button asChild variant="outline" className="w-full justify-center sm:w-auto">
                  <a href={publicInfo.clubMapsUrl} target="_blank" rel="noopener noreferrer">
                    <Navigation className="mr-2 h-4 w-4" />
                    Como llegar
                  </a>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Informacion del torneo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tournament.category ? (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Categoria:</span>
                    <span className="font-medium">{tournament.category}</span>
                  </div>
                ) : null}
                {tournament.status ? (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Estado:</span>
                    <span className="font-medium">{getStatusText(tournament.status)}</span>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}

        <Button asChild variant="outline" className="w-full justify-center sm:w-auto">
          <Link href={`/tournaments/${tournamentId}/formato`}>
            <BookOpen className="mr-2 h-4 w-4" />
            Ver formato del torneo
          </Link>
        </Button>
      </div>

      <Alert className="border-orange-200 bg-orange-50">
        <AlertCircle className="h-4 w-4 text-orange-600" />
        <AlertDescription className="text-orange-800">
          <strong>No estas inscripto</strong> en este torneo. Para participar, necesitas registrarte.
        </AlertDescription>
      </Alert>

      <Card className={canRegister ? 'border-blue-200 bg-blue-50' : 'border-red-300 bg-red-50'}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${canRegister ? 'text-blue-900' : 'text-red-900'}`}>
            <UserPlus className="h-5 w-5" />
            {canRegister ? 'Quieres participar?' : closedLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className={canRegister ? 'text-blue-800' : 'text-red-800'}>
            {canRegister
              ? 'Para unirte a este torneo, abre el formulario de inscripcion y completa tu registro.'
              : 'Este torneo no acepta nuevas inscripciones en este momento.'}
          </p>

          {canRegister ? (
            <PublicRegistrationLauncher
              tournamentId={tournamentId}
              tournamentName={tournament.name}
              tournamentGender={tournament.gender || Gender.MALE}
              tournamentPrice={tournament.price || null}
              enableTransferProof={tournament.enable_transfer_proof || false}
              transferAlias={tournament.transfer_alias || null}
              transferAmount={tournament.transfer_amount || null}
              buttonLabel="Inscribirme"
              buttonClassName="w-full"
            />
          ) : (
            <div className="w-full rounded-control border border-red-300 bg-red-100 px-4 py-3 text-center text-sm font-semibold text-red-800 shadow-[0_0_0_1px_rgba(220,38,38,0.08)]">
              {closedLabel}
            </div>
          )}

          <div className={`space-y-1 text-sm ${canRegister ? 'text-blue-700' : 'text-red-700'}`}>
            <p>
              <strong>Recuerda:</strong>
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>Puedes inscribirte individualmente o en pareja</li>
              <li>Necesitas tener tu perfil completo</li>
              <li>Las inscripciones pueden tener fecha limite</li>
            </ul>
          </div>
        </CardContent>
      </Card>

    </>
  )
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    NOT_STARTED: 'No iniciado',
    IN_PROGRESS: 'En progreso',
    ZONE_PHASE: 'Fase de zonas',
    BRACKET_PHASE: 'Fase de llaves',
    FINISHED: 'Finalizado',
    CANCELED: 'Cancelado',
  }

  return statusMap[status] || status
}
