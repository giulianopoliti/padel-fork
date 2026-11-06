import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { localTimeToSeconds, validateScheduleSlots } from '@/lib/services/schedule-sharing/validation'
import type { SchedulePeriod } from '@/lib/services/schedule-sharing/types'
import { 
  TimeSlot, 
  TimeSlotValidation, 
  TournamentFecha,
  UserAccess,
  MAX_NOTE_LENGTH
} from './types'

// Utility function for className merging
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Date and time formatting utilities
export const formatDate = (dateString: string): string => {
  // Fix timezone issue: parse date components directly to avoid UTC interpretation
  const [year, month, day] = dateString.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))

  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

export const formatDateShort = (dateString: string): string => {
  // Fix timezone issue: parse date components directly to avoid UTC interpretation
  const [year, month, day] = dateString.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))

  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export const formatDateWithWeekday = (dateString: string): string => {
  // Fix timezone issue: parse date components directly to avoid UTC interpretation
  const [year, month, day] = dateString.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))

  return date.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  })
}

export const formatTime = (timeString: string): string => {
  const [hours, minutes] = timeString.split(':')
  const date = new Date()
  date.setHours(parseInt(hours), parseInt(minutes), 0, 0)
  
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export const formatTimeRange = (startTime: string, endTime: string): string => {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`
}

export const formatDateTime = (date: string, startTime: string, endTime: string): string => {
  return `${formatDate(date)} | ${formatTimeRange(startTime, endTime)}`
}

export const getBracketLabel = (bracketKey?: string | null): string => {
  if (bracketKey === 'GOLD') return 'Copa de Oro'
  if (bracketKey === 'SILVER') return 'Copa de Plata'
  return 'Principal'
}

export const getBracketBadgeClass = (bracketKey?: string | null): string => {
  if (bracketKey === 'GOLD') return 'bg-amber-100 text-amber-800 border-amber-300'
  if (bracketKey === 'SILVER') return 'bg-slate-100 text-slate-800 border-slate-300'
  return 'bg-blue-100 text-blue-800 border-blue-300'
}

// Time calculation utilities
export const calculateDuration = (startTime: string, endTime: string): number => {
  return (localTimeToSeconds(endTime) - localTimeToSeconds(startTime)) / 60
}

export const addMinutes = (timeString: string, minutes: number): string => {
  const [hours, mins] = timeString.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, mins + minutes, 0, 0)
  
  return date.toTimeString().slice(0, 5) // Return HH:MM format
}

// Validation utilities
export const validateTimeSlot = (
  timeSlot: Partial<TimeSlot>, existingSlots: TimeSlot[] = [], period?: SchedulePeriod,
): TimeSlotValidation => {
  const result = validateScheduleSlots([{
    ...timeSlot, key: timeSlot.id ?? 'new', date: timeSlot.date ?? '',
    start_time: timeSlot.start_time ?? '', end_time: timeSlot.end_time ?? '',
  }], { existingSlots, period, editingSlotIds: timeSlot.id ? [timeSlot.id] : [] })
  const errors = result.ok ? [] : result.issues.map(issue => issue.message)
  const warnings: string[] = []
  if (timeSlot.start_time && timeSlot.end_time) {
    const duration = calculateDuration(timeSlot.start_time, timeSlot.end_time)
    if (duration > 0 && duration < 60) {
      warnings.push('La duración es menor a 1 hora, puede ser muy corta')
    }
    if (duration > 300) {
      warnings.push('La duración es mayor a 5 horas, puede ser muy larga')
    }
  }
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

// User access utilities
export const canCreateTimeSlots = (userAccess: UserAccess): boolean => {
  return userAccess.isOrganizer
}

export const canEditAvailability = (userAccess: UserAccess): boolean => {
  return userAccess.isInscribed && userAccess.coupleId !== undefined
}

export const canViewFullMatrix = (userAccess: UserAccess): boolean => {
  return userAccess.isOrganizer
}

export const canViewOwnAvailability = (userAccess: UserAccess): boolean => {
  return userAccess.isInscribed
}

// Data transformation utilities
export const groupTimeSlotsByDate = (timeSlots: TimeSlot[]) => {
  return timeSlots.reduce((groups, slot) => {
    const date = slot.date
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(slot)
    return groups
  }, {} as Record<string, TimeSlot[]>)
}

export const sortTimeSlots = (timeSlots: TimeSlot[], sortBy: 'date' | 'time' | 'court' = 'date'): TimeSlot[] => {
  return [...timeSlots].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        if (a.date !== b.date) {
          // Fix timezone issue: parse date components directly for comparison
          const [yearA, monthA, dayA] = a.date.split('-').map(Number)
          const [yearB, monthB, dayB] = b.date.split('-').map(Number)
          const dateA = new Date(yearA, monthA - 1, dayA)
          const dateB = new Date(yearB, monthB - 1, dayB)
          return dateA.getTime() - dateB.getTime()
        }
        return a.start_time.localeCompare(b.start_time)
      
      case 'time':
        return a.start_time.localeCompare(b.start_time)
      
      case 'court':
        if (a.court_name && b.court_name && a.court_name !== b.court_name) {
          return a.court_name.localeCompare(b.court_name)
        }
        return a.start_time.localeCompare(b.start_time)
      
      default:
        return 0
    }
  })
}

// Note validation utilities  
export const validateNote = (note: string): { isValid: boolean; error?: string } => {
  if (note.length > MAX_NOTE_LENGTH) {
    return {
      isValid: false,
      error: `La nota no puede superar ${MAX_NOTE_LENGTH} caracteres`
    }
  }
  
  return { isValid: true }
}

export const getAvailabilityStats = (totalCouples: number, availableCouples: number) => {
  if (totalCouples === 0) return { percentage: 0, label: 'Sin parejas' }
  
  const percentage = Math.round((availableCouples / totalCouples) * 100)
  
  let label = ''
  if (percentage === 0) label = 'Ninguna pareja'
  else if (percentage < 25) label = 'Pocas parejas'
  else if (percentage < 50) label = 'Algunas parejas'
  else if (percentage < 75) label = 'Mayoría disponible'
  else label = 'Casi todas disponibles'
  
  return { percentage, label }
}

// URL utilities
export const buildScheduleUrl = (tournamentId: string, fechaId?: string): string => {
  const base = `/tournaments/${tournamentId}/schedules`
  return fechaId ? `${base}?fecha_id=${fechaId}` : base
}

// Error handling utilities
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Ha ocurrido un error inesperado'
}

// Debounce utility for form inputs
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    
    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}
