import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Trophy, LayoutTemplate } from 'lucide-react'
import TournamentFormatConfigForm from '../components/TournamentFormatConfigForm'
import QualifyingAdvancementForm from '../components/QualifyingAdvancementForm'
import { getTournamentSettingsData } from '../components/settings-data'
import { SettingsSectionHeader, SettingsShellCard } from '../components/settings-shell'

interface SettingsFormatoPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function SettingsFormatoPage({ params }: SettingsFormatoPageProps) {
  const resolvedParams = await params
  const settingsData = await getTournamentSettingsData(resolvedParams.id)

  if (!settingsData) {
    return null
  }

  const {
    tournament,
    couplesCount,
    inscriptionsCount,
    rankingConfig,
    resolvedFormat,
    showLegacyQualifying,
  } = settingsData

  const baseTypeLabel = resolvedFormat.baseType === 'AMERICAN' ? 'Americano' : 'Long'
  const zoneModeLabel =
    resolvedFormat.zoneMode === 'MULTI_ZONE' ? 'Multiples zonas' : 'Zona unica'
  const bracketModeLabel =
    resolvedFormat.effectiveBracketMode === 'NONE'
      ? 'Sin llave'
      : resolvedFormat.effectiveBracketMode === 'GOLD_SILVER'
        ? 'Oro y Plata'
        : 'Llave unica'

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        eyebrow="Formato"
        title="Formato del torneo"
        description="Aca definis el tipo real de competencia, como se ordenan las zonas y que camino sigue la clasificacion."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-display border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Base</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{baseTypeLabel}</p>
          <p className="mt-1 text-sm text-slate-600">{zoneModeLabel}</p>
        </div>
        <div className="rounded-display border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Preset</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{resolvedFormat.display.name}</p>
          <p className="mt-1 text-sm text-slate-600">{resolvedFormat.display.description}</p>
        </div>
        <div className="rounded-display border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Llave</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{bracketModeLabel}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">{tournament.status || 'NOT_STARTED'}</Badge>
            {resolvedFormat.qualificationSource === 'GLOBAL_STANDINGS' ? (
              <Badge variant="secondary">Tabla general</Badge>
            ) : resolvedFormat.qualificationSource === 'HYBRID_FIRSTS_GLOBAL_REST_ZONES' ? (
              <Badge variant="secondary">Hibrido</Badge>
            ) : (
              <Badge variant="secondary">Ranking por zona</Badge>
            )}
          </div>
        </div>
      </div>

      {resolvedFormat.appliedNotes.length > 0 && (
        <Alert className="border-blue-200 bg-blue-50">
          <AlertDescription className="text-blue-900">
            {resolvedFormat.appliedNotes.join(' ')}
          </AlertDescription>
        </Alert>
      )}

      <SettingsShellCard
        icon={<Trophy className="h-5 w-5 text-amber-600" />}
        title="Preset y reglas de avance"
        description="Define si juega por zonas, zona unica, campeon directo o copas Oro y Plata."
      >
        <TournamentFormatConfigForm
          tournamentId={tournament.id}
          tournamentType={tournament.type === 'LONG' ? 'LONG' : 'AMERICAN'}
          tournamentStatus={tournament.status}
          formatConfig={(tournament as any).format_config ?? null}
          registeredCouplesCount={couplesCount || inscriptionsCount || 0}
        />
      </SettingsShellCard>

      {showLegacyQualifying ? (
        <SettingsShellCard
          icon={<LayoutTemplate className="h-5 w-5 text-blue-600" />}
          title="Compatibilidad legacy"
          description="El limite viejo de clasificacion se mantiene mientras migramos todos los flujos."
        >
          <QualifyingAdvancementForm
            tournamentId={tournament.id}
            rankingConfig={rankingConfig}
          />
        </SettingsShellCard>
      ) : null}
    </div>
  )
}
