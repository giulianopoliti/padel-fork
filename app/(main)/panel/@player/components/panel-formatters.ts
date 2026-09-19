export const capitalizeWords = (value: string) => value.replace(/\b\w/g, (char) => char.toUpperCase())

export const hasExplicitTime = (value: string | null | undefined) => Boolean(value && value.includes("T"))

const parseDateValue = (value: string) => {
  if (!hasExplicitTime(value)) {
    const [year, month, day] = value.split("T")[0].split("-").map(Number)
    return new Date(year, month - 1, day)
  }

  return new Date(value)
}

export const formatDateLabel = (value: string | null | undefined) => {
  if (!value) return "Fecha a confirmar"

  return capitalizeWords(
    new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(parseDateValue(value)),
  )
}

// FV date labels capitalize only the first letter, preserving accented weekdays.
export const formatFvDateLabel = (value: string | null | undefined): string => {
  const label = formatDateLabel(value).toLocaleLowerCase("es-AR")
  return label.charAt(0).toLocaleUpperCase("es-AR") + label.slice(1)
}

export const formatTimeLabel = (value: string | null | undefined) => {
  if (!value || !hasExplicitTime(value)) return "Horario a confirmar"

  return `${new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(parseDateValue(value))} hs`
}

export const formatPrice = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null

  if (typeof value === "number") {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(value)
  }

  return value
}

export const formatRoundLabel = (round?: string) => {
  if (!round) return null

  const roundNames: Record<string, string> = {
    ZONE: "Zona",
    "32VOS": "32vos",
    "16VOS": "16vos",
    "8VOS": "Octavos",
    "4TOS": "Cuartos",
    SEMIFINAL: "Semifinal",
    FINAL: "Final",
  }

  return roundNames[round] || round
}

export const formatMatchDateTime = (dateString?: string, timeString?: string) => {
  if (!dateString) return "Programacion a confirmar"

  const [year, month, day] = dateString.split("T")[0].split("-").map(Number)
  const date = new Date(year, month - 1, day)
  const dayName = date.toLocaleDateString("es-AR", { weekday: "long" })
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1)
  const dateLabel = `${day.toString().padStart(2, "0")}/${month.toString().padStart(2, "0")}`

  if (!timeString) {
    return `${capitalizedDay} ${dateLabel}`
  }

  const [hour, minute] = timeString.split(":")
  return `${capitalizedDay} ${dateLabel} ${hour}:${minute} hs`
}
