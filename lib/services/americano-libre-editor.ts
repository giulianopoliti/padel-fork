import type { FreeBracketSnapshot, FreeMatchLayout, FreeSlotOrigin } from '@/types/americano-libre'
import type { FreeEditorData, FreeSlot, FreeSource } from '@/types/americano-libre-editor'

type Match = FreeBracketSnapshot['matches'][number]
export const freeSlotKey = (slot: FreeSlot): string => `${slot.matchId}:${slot.slot}`
export const getFreeSlot = (match: Match, slot: 1 | 2): { origin: FreeSlotOrigin; coupleId: string | null } => ({
  origin: slot === 1 ? match.slot1_origin : match.slot2_origin,
  coupleId: slot === 1 ? match.couple1_id : match.couple2_id,
})
const setSlot = (match: Match, slot: 1 | 2, origin: FreeSlotOrigin, coupleId: string | null): void => {
  if (slot === 1) { match.slot1_origin = origin; match.couple1_id = coupleId; match.seed1_id = null }
  else { match.slot2_origin = origin; match.couple2_id = coupleId; match.seed2_id = null }
}
const sportsLocked = (match: Match, editor: FreeEditorData): boolean => Boolean(
  ['IN_PROGRESS', 'FINISHED'].includes(match.status) || match.winner_id || match.bye_processed || editor.guards[match.id]?.sports,
)
const find = (snapshot: FreeBracketSnapshot, id: string): Match => {
  const match = snapshot.matches.find((item) => item.id === id)
  if (!match) throw new Error('El partido no pertenece a esta llave.')
  return match
}
const descendants = (snapshot: FreeBracketSnapshot, slot: FreeSlot): Set<string> => {
  const ids = new Set<string>()
  const visit = (id: string): void => {
    if (ids.has(id)) return
    ids.add(id)
    snapshot.hierarchy.filter((edge) => edge.parent_match_id === id).forEach((edge) => visit(edge.child_match_id))
  }
  snapshot.hierarchy.filter((edge) => edge.parent_match_id === slot.matchId && edge.parent_slot === slot.slot).forEach((edge) => visit(edge.child_match_id))
  return ids
}
const compatible = (snapshot: FreeBracketSnapshot, from: FreeSlot, to: FreeSlot): boolean => (
  find(snapshot, from.matchId).round === find(snapshot, to.matchId).round ||
  descendants(snapshot, from).has(to.matchId) || descendants(snapshot, to).has(from.matchId)
)
const entrySource = (snapshot: FreeBracketSnapshot, source: FreeSlot, editor: FreeEditorData): string => {
  const match = find(snapshot, source.matchId)
  const slot = getFreeSlot(match, source.slot)
  if (!match.bracket_is_active || slot.origin !== 'ENTRY' || !slot.coupleId) throw new Error('Seleccioná una entrada manual activa con pareja.')
  if (sportsLocked(match, editor)) throw new Error('El partido tiene actividad deportiva; sus participantes no se pueden reorganizar.')
  return slot.coupleId
}
const clearEntry = (snapshot: FreeBracketSnapshot, slot: FreeSlot): void => {
  const original = snapshot.original_slots[slot.matchId]?.[slot.slot - 1]
  if (!original) throw new Error('Origen de entrada inválido.')
  setSlot(find(snapshot, slot.matchId), slot.slot, original === 'WINNER' ? 'WINNER' : 'ENTRY', null)
}

// Project from the FINAL along persisted WINNER edges, never from sorted cards.
export const projectFreeDraft = (baseline: FreeBracketSnapshot, draft: FreeBracketSnapshot, editor: FreeEditorData): FreeBracketSnapshot => {
  const active = new Set<string>()
  const visit = (id: string): void => {
    if (active.has(id)) throw new Error('La llave contiene una conexión repetida o cíclica.')
    active.add(id)
    const match = find(draft, id)
    for (const edge of draft.hierarchy.filter((item) => item.parent_match_id === id)) {
      if (getFreeSlot(match, edge.parent_slot).origin === 'WINNER') visit(edge.child_match_id)
    }
  }
  const final = draft.matches.find((match) => match.round === 'FINAL')
  if (!final) throw new Error('No se encontró la final de la llave.')
  visit(final.id)
  const assigned = new Set<string>()
  let capacity = 0
  draft.matches.forEach((match) => {
    match.bracket_is_active = active.has(match.id)
    const original = find(baseline, match.id)
    if (match.slot1_origin === 'BYE' && match.slot2_origin === 'BYE') throw new Error('Un partido no puede tener dos pases libres.')
    const changed = ([1, 2] as const).some((slot) => {
      const before = getFreeSlot(original, slot), after = getFreeSlot(match, slot)
      return before.origin !== after.origin || before.coupleId !== after.coupleId
    })
    if (changed && sportsLocked(original, editor)) throw new Error('No se pueden reorganizar partidos con actividad deportiva.')
    if (!match.bracket_is_active && (match.couple1_id || match.couple2_id || sportsLocked(match, editor) || editor.guards[match.id]?.agenda)) {
      throw new Error('La rama anterior tiene participantes, agenda o actividad deportiva. Revisá todos sus partidos.')
    }
    for (const slot of [1, 2] as const) {
      const { origin, coupleId } = getFreeSlot(match, slot)
      const old = getFreeSlot(original, slot)
      const initialOrigin = baseline.original_slots[match.id]?.[slot - 1]
      if (initialOrigin === 'WINNER' ? origin === 'BYE' : origin === 'WINNER') throw new Error('El pase libre solo se puede asignar en un lugar de entrada inicial.')
      if (old.origin === 'WINNER' && old.coupleId && (origin !== 'WINNER' || coupleId !== old.coupleId)) throw new Error('Un ganador deportivo no es una entrada manual.')
      if (origin === 'BYE' && coupleId) throw new Error('Un pase previsto no admite pareja.')
      if (!match.bracket_is_active || origin !== 'ENTRY') continue
      capacity++
      if (!coupleId) continue
      if (assigned.has(coupleId)) throw new Error('La pareja ya tiene otra entrada en la llave.')
      assigned.add(coupleId)
    }
  })
  // Match the RPC's final-layout validation for entries already present at edit start.
  for (const match of baseline.matches) for (const slot of [1, 2] as const) {
    const before = getFreeSlot(match, slot)
    if (before.origin !== 'ENTRY' || !before.coupleId) continue
    for (const destination of draft.matches) for (const targetSlot of [1, 2] as const) {
      const after = getFreeSlot(destination, targetSlot)
      if (after.origin === 'ENTRY' && after.coupleId === before.coupleId && !compatible(baseline, { matchId: match.id, slot }, { matchId: destination.id, slot: targetSlot })) {
        throw new Error('El destino está fuera de la rama compatible con la entrada guardada.')
      }
    }
  }
  draft.effective_capacity = capacity
  draft.assigned_count = assigned.size
  return draft
}

export const moveFreeEntry = (baseline: FreeBracketSnapshot, current: FreeBracketSnapshot, editor: FreeEditorData, source: FreeSource, target: FreeSlot): FreeBracketSnapshot => {
  const draft = structuredClone(current)
  const destination = find(draft, target.matchId)
  if (sportsLocked(destination, editor)) throw new Error('El destino tiene actividad deportiva.')
  const targetValue = getFreeSlot(destination, target.slot)
  if (targetValue.origin === 'WINNER' && targetValue.coupleId) throw new Error('Este lugar contiene un ganador deportivo.')
  if (source.kind === 'SLOT' && freeSlotKey(source) === freeSlotKey(target)) throw new Error('Elegí otro casillero de destino.')
  const coupleId = source.kind === 'ZONE'
    ? editor.couples.find((couple) => couple.coupleId === source.coupleId && couple.zoneId === source.zoneId && couple.eligible)?.coupleId
    : entrySource(draft, source, editor)
  if (!coupleId) throw new Error('La pareja no está habilitada en una zona de este torneo.')
  if (source.kind === 'ZONE' && targetValue.coupleId) throw new Error('El destino está ocupado. Seleccioná la entrada para moverla o intercambiarla.')
  if (source.kind === 'SLOT') {
    if (!compatible(draft, source, target)) throw new Error('El destino está fuera de la rama compatible.')
    if (targetValue.coupleId) {
      entrySource(draft, target, editor)
      if (!compatible(draft, target, source)) throw new Error('El intercambio no es compatible en ambas direcciones.')
      setSlot(find(draft, source.matchId), source.slot, 'ENTRY', targetValue.coupleId)
    } else if (targetValue.origin === 'BYE') {
      if (baseline.original_slots[source.matchId]?.[source.slot - 1] === 'WINNER') throw new Error('Para trasladar el BYE elegí una pareja de la ronda inicial.')
      setSlot(find(draft, source.matchId), source.slot, 'BYE', null)
    } else clearEntry(draft, source)
  }
  // A retreat first restores the original WINNER, so the chosen descendant
  // becomes active. No automatic choice of side and no fabricated BYE chain.
  setSlot(destination, target.slot, 'ENTRY', coupleId)
  const projected = projectFreeDraft(baseline, draft, editor)
  if (!destination.bracket_is_active) throw new Error('El destino pertenece a una rama inactiva. Seleccioná su entrada directa para retroceder.')
  return projected
}

export const removeFreeEntry = (baseline: FreeBracketSnapshot, current: FreeBracketSnapshot, editor: FreeEditorData, source: FreeSlot): FreeBracketSnapshot => {
  const draft = structuredClone(current)
  entrySource(draft, source, editor)
  clearEntry(draft, source)
  return projectFreeDraft(baseline, draft, editor)
}
export const toggleFreeBye = (baseline: FreeBracketSnapshot, current: FreeBracketSnapshot, editor: FreeEditorData, target: FreeSlot): FreeBracketSnapshot => {
  const draft = structuredClone(current)
  const match = find(draft, target.matchId)
  const value = getFreeSlot(match, target.slot)
  if (!match.bracket_is_active) throw new Error('El lugar pertenece a una rama inactiva.')
  if (sportsLocked(match, editor)) throw new Error('Deshacé el BYE procesado antes de reorganizar. No se pueden modificar partidos con actividad deportiva.')
  if (baseline.original_slots[match.id]?.[target.slot - 1] === 'WINNER') throw new Error('El pase libre solo se puede asignar en un lugar de entrada inicial.')
  if (value.coupleId) throw new Error('Mové o quitá la pareja antes de asignar el BYE en su lugar.')
  setSlot(match, target.slot, value.origin === 'BYE' ? 'ENTRY' : 'BYE', null)
  return projectFreeDraft(baseline, draft, editor)
}
export const freeLayout = (snapshot: FreeBracketSnapshot): FreeMatchLayout[] => snapshot.matches.map((match) => ({
  id: match.id, slot1_origin: match.slot1_origin, slot2_origin: match.slot2_origin,
  couple1_id: match.couple1_id, couple2_id: match.couple2_id,
}))
