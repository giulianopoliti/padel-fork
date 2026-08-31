const genderLabels: Record<string, string> = {
  MALE: "Caballeros",
  FEMALE: "Damas",
  MIXED: "Mixto",
  SHEMALE: "Mixto",
}

export const getTournamentGenderLabel = (gender: string | null | undefined) => {
  if (!gender) return "Abierto"

  return genderLabels[gender] || gender
}
