import { Eye, Users } from 'lucide-react'
import RegistrationControlForm from '../components/RegistrationControlForm'
import InscriptionAutomationForm from '../components/InscriptionAutomationForm'
import { getTournamentSettingsData } from '../components/settings-data'
import { SettingsSectionHeader, SettingsShellCard } from '../components/settings-shell'

interface SettingsInscripcionesPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function SettingsInscripcionesPage({
  params,
}: SettingsInscripcionesPageProps) {
  const resolvedParams = await params
  const settingsData = await getTournamentSettingsData(resolvedParams.id)

  if (!settingsData) {
    return null
  }

  const { tournament } = settingsData

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        eyebrow="Inscripciones"
        title="Inscripciones, privacidad y pagos"
        description="Controla por separado quién puede registrar una pareja, qué información se muestra y cómo gestionás los cobros."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-display border border-blue-200 bg-blue-50/70 p-4">
          <p className="text-sm font-semibold text-slate-950">1. ¿Se pueden registrar nuevas parejas?</p>
          <p className="mt-1 text-sm text-slate-600">
            Se define con el estado de las inscripciones y el cupo disponible.
          </p>
        </div>
        <div className="rounded-display border border-amber-200 bg-amber-50/70 p-4">
          <p className="text-sm font-semibold text-slate-950">2. ¿Se ve el listado de inscriptos?</p>
          <p className="mt-1 text-sm text-slate-600">
            Podés ocultar nombres y cantidad de parejas sin cerrar las inscripciones.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <SettingsShellCard
          icon={<Users className="h-5 w-5 text-blue-600" />}
          title="Disponibilidad para registrarse"
          description="Definí si se pueden registrar nuevas parejas. Este control no modifica la visibilidad del listado."
        >
          <RegistrationControlForm
            tournamentId={tournament.id}
            initialRegistrationLocked={tournament.registration_locked || false}
            initialBracketStatus={tournament.bracket_status || 'NOT_STARTED'}
            currentStatus={tournament.status || 'NOT_STARTED'}
          />
        </SettingsShellCard>

        <SettingsShellCard
          icon={<Eye className="h-5 w-5 text-amber-600" />}
          title="Visibilidad, gestión y pagos"
          description="Configurá qué ven los jugadores, cómo se validan las inscripciones y las opciones de cobro."
        >
          <InscriptionAutomationForm
            tournamentId={tournament.id}
            initialValidateInscriptions={tournament.validate_inscriptions ?? false}
            initialShowPublicInscriptions={tournament.show_public_inscriptions ?? true}
            initialShowFewSlotsAlert={tournament.show_few_slots_alert ?? true}
            initialEnablePaymentCheckboxes={tournament.enable_payment_checkboxes ?? false}
            initialEnableTransferProof={tournament.enable_transfer_proof ?? false}
            initialMessagesEnabled={tournament.messages_enabled ?? true}
            initialTransferAlias={tournament.transfer_alias ?? null}
            initialTransferAmount={tournament.transfer_amount ?? null}
          />
        </SettingsShellCard>
      </div>
    </div>
  )
}
