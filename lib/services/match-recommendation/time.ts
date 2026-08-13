export const timeToMinutes = (time: string) => {
  const [hours, minutes = '0'] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

export const minutesToTime = (minutes: number) => {
  const normalized = ((minutes % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60).toString().padStart(2, '0')
  const mins = (normalized % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

export const intervalsOverlap = (
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) => startA < endB && startB < endA

export const ceilToHalfHour = (minutes: number) => Math.ceil(minutes / 30) * 30
