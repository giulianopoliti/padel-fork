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
        title="Acceso y cobro"
        description="Define como entra la gente al torneo y como vas a organizar los pagos."
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SettingsShellCard
          icon={<Users className="h-5 w-5 text-blue-600" />}
          title="Control de inscripciones"
          description="Abre o cierra nuevas inscripciones segun la etapa del torneo."
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
          title="Vista publica y herramientas de pago"
          description="Configura privacidad, seguimiento manual y transferencia con comprobante."
        >
          <InscriptionAutomationForm
            tournamentId={tournament.id}
            initialValidateInscriptions={tournament.validate_inscriptions ?? false}
            initialEnablePublicInscriptions={tournament.enable_public_inscriptions ?? true}
            initialShowFewSlotsAlert={tournament.show_few_slots_alert ?? true}
            initialEnablePaymentCheckboxes={tournament.enable_payment_checkboxes ?? false}
            initialEnableTransferProof={tournament.enable_transfer_proof ?? false}
            initialEnableTrustBasedPaymentPolicy={tournament.enable_trust_based_payment_policy ?? false}
            initialTrustPolicyMinPlayedTournaments={tournament.trust_policy_min_played_tournaments ?? 2}
            initialMessagesEnabled={tournament.messages_enabled ?? true}
            initialTransferAlias={tournament.transfer_alias ?? null}
            initialTransferAmount={tournament.transfer_amount ?? null}
            initialTransferAmountPerPlayer={tournament.transfer_amount_per_player ?? null}
          />
        </SettingsShellCard>
      </div>
    </div>
  )
}
