import { Alert, AlertDescription } from '@/components/ui/alert'
import { GitBranch, Globe2, LayoutTemplate, Lock, XCircle } from 'lucide-react'
import BackFromBracketButton from '../components/BackFromBracketButton'
import BackToNotStartedButton from '../components/BackToNotStartedButton'
import DraftMatchesToggle from '../components/DraftMatchesToggle'
import DraftModeToggle from '../components/DraftModeToggle'
import LongBracketMatchRequirementToggle from '../components/LongBracketMatchRequirementToggle'
import TournamentStatusVisibilityToggle from '../components/TournamentStatusVisibilityToggle'
import { getTournamentSettingsData } from '../components/settings-data'
import { SettingsSectionHeader, SettingsShellCard } from '../components/settings-shell'
import CancelTournamentButton from '@/components/tournament/club/cancel-tournament'
import { ReopenTournamentButton } from '@/components/tournament/reopen-tournament-button'
import { normalizeTournamentOperationalSettings } from '@/lib/services/tournament-operational-settings'
import { getTenantBranding } from '@/config/tenant'

interface SettingsOperacionPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function SettingsOperacionPage({
  params,
}: SettingsOperacionPageProps) {
  const resolvedParams = await params
  const settingsData = await getTournamentSettingsData(resolvedParams.id)

  if (!settingsData) {
    return null
  }

  const {
    tournament,
    isAmericanTournament,
    cancelTournamentData,
    couplesCount,
    playersCount,
    rankingConfig,
  } = settingsData
  const showRecoveryActions =
    tournament.status === 'BRACKET_PHASE' || tournament.status === 'ZONE_PHASE'
  const canReopen = tournament.status === 'FINISHED_POINTS_PENDING' || tournament.status === 'FINISHED_POINTS_CALCULATED'
  const operationalSettings = normalizeTournamentOperationalSettings(
    rankingConfig?.operational_settings
  )
  const branding = getTenantBranding()

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        eyebrow="Operacion"
        title="Flujo y recuperacion"
        description="Herramientas administrativas para publicar, dejar en borrador y volver sobre fases cuando hace falta."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SettingsShellCard
          icon={<Globe2 className="h-5 w-5 text-slate-700" />}
          title="Visibilidad del torneo"
          description="Controla si el torneo aparece publicado o queda en modo borrador."
        >
          <DraftModeToggle
            tournamentId={tournament.id}
            initialIsDraft={tournament.is_draft ?? false}
          />
        </SettingsShellCard>

        {branding.key === 'padel-fv' ? (
          <SettingsShellCard
            icon={<Globe2 className="h-5 w-5 text-slate-700" />}
            title="Estado publico"
            description="Decide si la ficha publica muestra el estado operativo del torneo."
          >
            <TournamentStatusVisibilityToggle
              tournamentId={tournament.id}
              initialEnabled={operationalSettings.showTournamentStatus}
            />
          </SettingsShellCard>
        ) : null}

        {!isAmericanTournament ? (
          <>
            <SettingsShellCard
              icon={<LayoutTemplate className="h-5 w-5 text-slate-700" />}
              title="Partidos en borrador"
              description="Decide cuando los partidos pasan a ser visibles para los jugadores."
            >
              <DraftMatchesToggle
                tournamentId={tournament.id}
                initialEnabled={tournament.enable_draft_matches || false}
              />
            </SettingsShellCard>

            <SettingsShellCard
              icon={<GitBranch className="h-5 w-5 text-slate-700" />}
              title="Generacion de llave"
              description="Define si la llave requiere completar los partidos configurados por pareja."
            >
              <LongBracketMatchRequirementToggle
                tournamentId={tournament.id}
                initialEnabled={operationalSettings.enforceLongBracketMatchRequirement}
              />
            </SettingsShellCard>
          </>
        ) : null}
      </div>

      <SettingsShellCard
        icon={<Lock className="h-5 w-5 text-slate-700" />}
        title="Acciones de recuperacion"
        description="Botones administrativos para volver a fases anteriores cuando hace falta."
        badge={isAmericanTournament ? 'Americano' : 'Long'}
      >
        {canReopen ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Volvé a la fase previa al cierre. Antes de confirmar vas a ver los puntos, títulos y cambios de categoría que se desharán.</p>
            <ReopenTournamentButton tournamentId={tournament.id} />
          </div>
        ) : showRecoveryActions ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {tournament.status === 'BRACKET_PHASE' ? (
              <BackFromBracketButton tournamentId={tournament.id} />
            ) : null}
            {tournament.status === 'ZONE_PHASE' ? (
              <BackToNotStartedButton tournamentId={tournament.id} />
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No hay acciones de recuperacion disponibles para la fase actual.
          </p>
        )}
      </SettingsShellCard>

      {tournament.status !== 'CANCELED' ? (
        <SettingsShellCard
          icon={<XCircle className="h-5 w-5 text-red-700" />}
          title="Cancelar torneo"
          description="Accion irreversible. Revisa bien el impacto antes de confirmar."
          className="border-red-200 bg-red-50/70"
        >
          <div className="space-y-4">
            <Alert className="border-red-200 bg-white">
              <AlertDescription className="text-red-800">
                Si continuas, se cancelara el torneo para jugadores, parejas e historial
                operativo asociado.
              </AlertDescription>
            </Alert>

            <CancelTournamentButton
              tournamentId={tournament.id}
              tournament={cancelTournamentData}
              couplesCount={couplesCount || 0}
              playersCount={playersCount || 0}
            />
          </div>
        </SettingsShellCard>
      ) : null}
    </div>
  )
}
