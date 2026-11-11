export const PLAYER_GENDERS = ['MALE', 'FEMALE'] as const

export type PlayerGender = (typeof PLAYER_GENDERS)[number]

export const PLAYER_GENDER_LABELS: Record<PlayerGender, string> = {
  MALE: 'Masculino',
  FEMALE: 'Femenino',
}

export const isPlayerGender = (value: unknown): value is PlayerGender =>
  value === 'MALE' || value === 'FEMALE'
