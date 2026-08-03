import type { AccessLevel } from '@/utils/tournament-permissions'

interface TournamentParticipantVisibilityOptions {
  enablePublicInscriptions?: boolean | null
  accessLevel: AccessLevel
}

interface TournamentParticipantVisibilityFlags {
  enablePublicInscriptions?: boolean | null
  hasManagementPermission?: boolean
  hasActivePlayerInscription?: boolean
}

export const canAccessPrivateParticipantPages = (accessLevel: AccessLevel): boolean => {
  return accessLevel === 'FULL_MANAGEMENT' || accessLevel === 'PLAYER_ACTIVE'
}

export const canViewTournamentParticipantPages = ({
  enablePublicInscriptions,
  accessLevel,
}: TournamentParticipantVisibilityOptions): boolean => {
  return Boolean(enablePublicInscriptions) || canAccessPrivateParticipantPages(accessLevel)
}

export const canViewTournamentInscriptionsPage = ({
  enablePublicInscriptions,
  accessLevel,
}: TournamentParticipantVisibilityOptions): boolean => {
  return Boolean(enablePublicInscriptions) || accessLevel === 'FULL_MANAGEMENT'
}

export const canViewTournamentParticipantPagesFromFlags = ({
  enablePublicInscriptions,
  hasManagementPermission = false,
  hasActivePlayerInscription = false,
}: TournamentParticipantVisibilityFlags): boolean => {
  return (
    Boolean(enablePublicInscriptions) ||
    hasManagementPermission ||
    hasActivePlayerInscription
  )
}

export const canViewTournamentInscriptionsPageFromFlags = ({
  enablePublicInscriptions,
  hasManagementPermission = false,
}: TournamentParticipantVisibilityFlags): boolean => {
  return Boolean(enablePublicInscriptions) || hasManagementPermission
}
