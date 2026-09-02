import React from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import SettingsNav from './components/SettingsNav'
import { getTournamentSettingsData } from './components/settings-data'
import { SettingsMetricCard } from './components/settings-shell'

interface SettingsLayoutProps {
  children: React.ReactNode
  params: Promise<{
    id: string
  }>
}

export default async function SettingsLayout({
  children,
  params,
}: SettingsLayoutProps) {
  const resolvedParams = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const permissions = await checkTournamentPermissions(user.id, resolvedParams.id)

  if (!permissions.hasPermission) {
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('name')
      .eq('id', resolvedParams.id)
      .single()

    return (
      <div className="min-h-screen bg-slate-50">
        <div className="border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 py-4 lg:px-8 lg:py-6">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:mb-6">
              <Button asChild variant="outline" className="w-fit border-gray-300">
                <Link href={`/tournaments/${resolvedParams.id}`} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Volver al torneo</span>
                </Link>
              </Button>

              <div className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                Acceso denegado
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="rounded-elevated bg-red-100 p-3">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-bold text-slate-900 lg:text-2xl">
                  Configuracion - {tournament?.name || 'Torneo'}
                </h1>
                <p className="text-sm text-slate-600">
                  Solo organizadores y clubes pueden acceder a esta seccion.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>Acceso restringido:</strong> solo los organizadores del torneo y clubes
              pueden modificar la configuracion.
              <br />
              <span className="text-sm">
                Razon: {permissions.reason || 'No tienes permisos suficientes'}
              </span>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  const settingsData = await getTournamentSettingsData(resolvedParams.id)

  if (!settingsData) {
    notFound()
  }

  const {
    tournament,
    tournamentCategoryDisplay,
    inscriptionsCount,
    tournamentTypeLabel,
    publicInscriptionsLabel,
    publicationLabel,
    resolvedFormat,
  } = settingsData

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Button asChild variant="outline" size="sm" className="bg-white">
            <Link href={`/tournaments/${tournament.id}`} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver al torneo
            </Link>
          </Button>
        </div>

        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.28),_transparent_34%),linear-gradient(135deg,_rgb(15,23,42),_rgb(30,41,59)_56%,_rgb(29,78,216))] px-6 py-8 text-white sm:px-8 sm:py-9">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-stretch lg:justify-between">
              <div className="flex-1 space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="bg-white/15 text-white hover:bg-white/15">
                    {tournamentTypeLabel}
                  </Badge>
                  <Badge variant="secondary" className="bg-white/15 text-white hover:bg-white/15">
                    {publicationLabel}
                  </Badge>
                  <Badge variant="secondary" className="bg-white/15 text-white hover:bg-white/15">
                    {publicInscriptionsLabel}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-100/90">
                    Panel de configuracion
                  </p>
                  <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    {tournament.name}
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                    Separamos la configuracion por areas para que editar datos, formato y
                    operaciones sea mucho mas claro.
                  </p>
                </div>
              </div>

              <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-slate-950/20 backdrop-blur-md sm:p-5 lg:max-w-md">
                <div className="mb-4 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-100/70">
                    Resumen rapido
                  </p>
                  <p className="text-sm text-slate-200/90">
                    El estado del torneo y el formato actual, sin salir de configuracion.
                  </p>
                </div>

                <div className="space-y-3">
                  <SettingsMetricCard
                    label="Tipo"
                    helper={tournamentCategoryDisplay || 'Sin categoria'}
                    value={tournamentTypeLabel}
                  />
                  <SettingsMetricCard
                    label="Formato"
                    helper={resolvedFormat.display.description}
                    value={resolvedFormat.display.name}
                  />
                  <SettingsMetricCard
                    label="Inscripciones"
                    helper="Registradas"
                    value={String(inscriptionsCount || 0)}
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <SettingsNav
            tournamentId={resolvedParams.id}
            formatName={resolvedFormat.display.name}
            tournamentStatus={tournament.status || 'NOT_STARTED'}
          />

          <div className="min-w-0 space-y-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
