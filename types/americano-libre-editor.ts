import type { FreeBracketSnapshot } from './americano-libre'

export type FreeSlot = { matchId: string; slot: 1 | 2 }
export type FreeSource = ({ kind: 'SLOT' } & FreeSlot) | { kind: 'ZONE'; zoneId: string; coupleId: string }
export type FreeZoneCouple = {
  zoneId: string; zoneName: string; coupleId: string; name: string
  position: number; wins: number; losses: number; gamesDifference: number
  eligible: boolean; reason?: string
  player1?: { id: string; first_name: string; last_name: string }
  player2?: { id: string; first_name: string; last_name: string }
}
export type FreeMatchGuard = { sports: boolean; agenda: boolean }
export type FreeEditorData = { couples: FreeZoneCouple[]; guards: Record<string, FreeMatchGuard>; zoneMatchTarget?: number | null }
export type FreeBracketView = {
  success: boolean; message?: string; snapshot: FreeBracketSnapshot | null
  canManage: boolean; suggestedCount?: number; blockedReason?: string | null; status: string
  editor?: FreeEditorData
  showZoneReferences?: boolean
}
