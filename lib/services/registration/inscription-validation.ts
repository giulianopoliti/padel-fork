interface InscriptionValidationInput {
  validateInscriptions?: boolean | null
  actorRole?: string | null
  isOrganizerRegistration?: boolean
}

// Retain the legacy call signature while retiring manual registration approval.
export const shouldRequireInscriptionValidation = (_input: InscriptionValidationInput): boolean => false

export const getTournamentInscriptionPendingState = async ({
  supabase,
  tournamentId,
  actorRole,
  isOrganizerRegistration = false,
}: {
  supabase: any
  tournamentId: string
  actorRole?: string | null
  isOrganizerRegistration?: boolean
}): Promise<boolean> => {
  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('validate_inscriptions')
    .eq('id', tournamentId)
    .single()

  if (error || !tournament) {
    throw new Error(error?.message || 'No se pudo obtener la configuracion de inscripciones')
  }

  return shouldRequireInscriptionValidation({
    validateInscriptions: tournament.validate_inscriptions,
    actorRole,
    isOrganizerRegistration,
  })
}
