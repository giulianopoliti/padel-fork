import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { applyLongMatchLineup, getLongMatchLineupChanges } from '@/lib/services/long-match-lineups'

export interface FixtureDateInput {
  tournamentId: string
  fechaId?: string
  fechaNumero?: number
}

interface Player {
  id: string
  first_name: string | null
  last_name: string | null
}

interface Couple {
  id: string
  player1: Player | Player[] | null
  player2: Player | Player[] | null
}

interface MatchRow {
  id: string
  status: string
  round: string | null
  couple1_id: string
  couple2_id: string
  winner_id: string | null
  result_couple1: string | null
  result_couple2: string | null
  couple1: Couple | Couple[] | null
  couple2: Couple | Couple[] | null
  fecha_matches: {
    fecha_id: string | null
    scheduled_date?: string | null
    scheduled_start_time?: string | null
    scheduled_end_time?: string | null
    court_assignment?: string | null
    tournament_fechas: { fecha_number: number; tournament_id: string } | null
  } | null
}

const rowsPerQuery = 500
const finishedStatuses = ['FINISHED', 'COMPLETED']
const reservedStatuses = ['DRAFT', 'PENDING', 'IN_PROGRESS']
const matchesStatuses = [...finishedStatuses, ...reservedStatuses]

const one = <T>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value

const readAll = async <T>(load: (from: number, to: number) => PromiseLike<{
  data: unknown
  error: unknown
}>): Promise<T[]> => {
  const rows: T[] = []
  for (let offset = 0; ; offset += rowsPerQuery) {
    const { data, error } = await load(offset, offset + rowsPerQuery - 1)
    if (error) throw error
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < rowsPerQuery) return rows
  }
}

const registeredCouples = async (supabase: SupabaseClient, tournamentId: string) => {
  const rows = await readAll<{ is_eliminated: boolean | null; couples: Couple | Couple[] | null }>((from, to) => supabase.from('inscriptions')
    .select('is_eliminated, couples:couple_id(id, player1:player1_id(id, first_name, last_name), player2:player2_id(id, first_name, last_name))')
    .eq('tournament_id', tournamentId)
    .eq('is_pending', false)
    .eq('es_prueba', false)
    .not('couple_id', 'is', null)
    .order('id')
    .range(from, to))
  const couples = rows.flatMap(row => {
    const couple = one(row.couples)
    return couple ? [{ ...couple, eliminada: row.is_eliminated === true }] : []
  })
  return [...new Map(couples.map(couple => [couple.id, couple])).values()]
}

const presentPlayer = (player: Player) => ({
  id: player.id,
  nombre: [player.first_name, player.last_name].filter(Boolean).join(' '),
})
const presentCouple = (couple: Couple | null, id: string) => ({
  id,
  jugadores: couple ? [one(couple.player1), one(couple.player2)].flatMap(player => player ? [presentPlayer(player)] : []) : [],
})

export const organizerCanReadLeague = async (supabase: SupabaseClient, userId: string, tournamentId: string) => {
  const permissions = await checkTournamentPermissions(userId, tournamentId, supabase)
  if (!permissions.hasPermission) return false
  const { data, error } = await supabase.from('tournaments')
    .select('id').eq('id', tournamentId).eq('type', 'LONG').maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export const readOrganizerFixtureDate = async (
  supabase: SupabaseClient, input: FixtureDateInput, includeAvailability: boolean, actorId: string,
) => {
  const fechaQuery = supabase.from('tournament_fechas').select(
    'id, fecha_number, name, start_date, end_date, status, round_type, max_matches_per_couple, estimated_match_duration_minutes',
  ).eq('tournament_id', input.tournamentId)
  const { data: fecha, error: fechaError } = await (input.fechaId
    ? fechaQuery.eq('id', input.fechaId)
    : fechaQuery.eq('fecha_number', input.fechaNumero!)).maybeSingle()
  if (fechaError) throw fechaError
  if (!fecha) return { error: 'Esa fecha no pertenece a la liga indicada.' }

  const [couples, slots, availability, fixedMatches, substitutions, memberships] = await Promise.all([
    includeAvailability ? registeredCouples(supabase, input.tournamentId) : [],
    readAll<Record<string, unknown>>((from, to) => supabase.from('tournament_time_slots')
      .select('id, slot_type, date, start_time, end_time, court_name, max_matches, is_available')
      .eq('fecha_id', fecha.id).order('date').order('start_time').order('id').range(from, to)),
    includeAvailability ? readAll<{ couple_id: string; time_slot_id: string; is_available: boolean; notes: string | null } & Record<string, unknown>>((from, to) =>
      supabase.from('couple_time_availability')
        .select('couple_id, time_slot_id, is_available, notes, preferred_start_time, preferred_end_time, note_interpretation_status, interpretation_summary, can_start_earlier, can_finish_later, minimum_duration_minutes, priority_level, flexibility_level, tournament_time_slots!inner()')
        .eq('tournament_time_slots.fecha_id', fecha.id).order('id').range(from, to)) : [],
    readAll<Record<string, unknown>>((from, to) => supabase.from('fecha_matches')
      .select('match_id, scheduled_date, scheduled_start_time, scheduled_end_time, court_assignment, matches!inner(couple1_id, couple2_id, status, round, clubes(name))')
      .eq('fecha_id', fecha.id).eq('matches.tournament_id', input.tournamentId)
      .eq('matches.es_prueba', false).eq('matches.bracket_is_active', true)
      .in('matches.status', matchesStatuses).order('id').range(from, to)),
    includeAvailability ? supabase.rpc('get_long_fecha_substitution_lineups', {
      p_fecha_id: fecha.id, p_actor_id: actorId,
    }) : null,
    includeAvailability ? readAll<{ couple_id: string; zone_id: string }>((from, to) => supabase.from('zone_positions')
      .select('couple_id, zone_id').eq('tournament_id', input.tournamentId).order('id').range(from, to)) : [],
  ])
  const schedule = {
    tournamentId: input.tournamentId,
    consultadoEn: new Date().toISOString(),
    fecha,
    zonaHoraria: 'America/Argentina/Buenos_Aires',
    franjas: slots,
    partidosYaCargados: fixedMatches,
  }
  if (!includeAvailability) return schedule
  if (substitutions?.error && substitutions.error.code !== 'PGRST202') throw substitutions.error
  const substitutes = new Map(((substitutions?.data ?? []) as {
    couple_id: string; player_name: string; slot: 1 | 2
  }[]).map(({ couple_id, player_name, slot }) => [couple_id, { nombre: player_name, posicion: slot }]))

  const slotIds = new Set(slots.map(slot => slot.id))
  const coupleIds = new Set(couples.map(couple => couple.id))
  const marks = availability.filter(row => coupleIds.has(row.couple_id) && slotIds.has(row.time_slot_id))
  const markedCouples = new Set(marks.map(row => row.couple_id))
  const freeSlots = new Set(slots.filter(slot => slot.slot_type === 'FREE_DATE').map(slot => slot.id))
  const freeCouples = new Set(marks.filter(row => row.is_available && freeSlots.has(row.time_slot_id)).map(row => row.couple_id))

  return {
    ...schedule,
    parejas: couples.map(couple => ({
      ...presentCouple(couple, couple.id),
      eliminada: couple.eliminada,
      zonaIds: memberships.filter(membership => membership.couple_id === couple.id).map(membership => membership.zone_id),
      cargoDisponibilidad: markedCouples.has(couple.id),
      pidioFechaLibre: freeCouples.has(couple.id),
      suplente: substitutes.get(couple.id) ?? null,
    })),
    disponibilidad: marks.map(row => ({
      couple_id: row.couple_id,
      time_slot_id: row.time_slot_id,
      is_available: row.is_available,
      notes: row.notes,
      preferred_start_time: row.preferred_start_time,
      preferred_end_time: row.preferred_end_time,
      note_interpretation_status: row.note_interpretation_status,
      interpretation_summary: row.interpretation_summary,
      can_start_earlier: row.can_start_earlier,
      can_finish_later: row.can_finish_later,
      minimum_duration_minutes: row.minimum_duration_minutes,
      priority_level: row.priority_level,
      flexibility_level: row.flexibility_level,
    })),
  }
}

export const readOrganizerHistory = async (
  supabase: SupabaseClient,
  { tournamentId, jugadorId, parejaId, pagina }: { tournamentId: string; jugadorId?: string; parejaId?: string; pagina: number },
) => {
  const [registered, matches] = await Promise.all([
    registeredCouples(supabase, tournamentId),
    readAll<MatchRow>((from, to) => supabase.from('matches')
      .select(`id, status, round, couple1_id, couple2_id, winner_id, result_couple1, result_couple2,
        couple1:couple1_id(id, player1:player1_id(id, first_name, last_name), player2:player2_id(id, first_name, last_name)),
        couple2:couple2_id(id, player1:player1_id(id, first_name, last_name), player2:player2_id(id, first_name, last_name)),
        fecha_matches(fecha_id, scheduled_date, scheduled_start_time, scheduled_end_time, court_assignment, tournament_fechas(fecha_number, tournament_id))`)
      .eq('tournament_id', tournamentId).eq('bracket_is_active', true).eq('es_prueba', false)
      .in('status', matchesStatuses).not('couple1_id', 'is', null).not('couple2_id', 'is', null)
      .order('id').range(from, to)),
  ])
  const validMatches = matches.filter(match => match.couple1_id !== match.couple2_id)
  const played = validMatches.filter(match => finishedStatuses.includes(match.status))
  const lineups = await getLongMatchLineupChanges(supabase, played.map(match => match.id))
  const byPlayer = new Map<string, ReturnType<typeof presentPlayer> & { jugados: number }>()
  const byCouple = new Map<string, ReturnType<typeof presentCouple> & {
    jugados: number; jugadosEnZona: number; rivales: Set<string>; rivalesEnZona: Set<string>
  }>()
  for (const couple of registered) {
    const roster = presentCouple(couple, couple.id)
    byCouple.set(couple.id, { ...roster, jugados: 0, jugadosEnZona: 0, rivales: new Set(), rivalesEnZona: new Set() })
    for (const player of roster.jugadores) byPlayer.set(player.id, { ...player, jugados: 0 })
  }

  const details = played.map(match => {
    const changes = lineups.get(match.id)
    const home = presentCouple(applyLongMatchLineup(one(match.couple1), match.couple1_id, changes), match.couple1_id)
    const away = presentCouple(applyLongMatchLineup(one(match.couple2), match.couple2_id, changes), match.couple2_id)
    for (const [couple, opponent] of [[home, away], [away, home]]) {
      const summary = byCouple.get(couple.id) ?? { ...couple, jugados: 0, jugadosEnZona: 0, rivales: new Set<string>(), rivalesEnZona: new Set<string>() }
      summary.jugados += 1
      if (match.round === 'ZONE') {
        summary.jugadosEnZona += 1
        summary.rivalesEnZona.add(opponent.id)
      }
      summary.rivales.add(opponent.id)
      byCouple.set(couple.id, summary)
      for (const player of couple.jugadores) {
        const current = byPlayer.get(player.id) ?? { ...player, jugados: 0 }
        current.jugados += 1
        byPlayer.set(player.id, current)
      }
    }
    const link = one(match.fecha_matches)
    const fecha = one(link?.tournament_fechas ?? null)
    return {
      id: match.id,
      ronda: match.round,
      fechaNumero: fecha?.tournament_id === tournamentId ? fecha.fecha_number : null,
      fechaId: fecha?.tournament_id === tournamentId ? link?.fecha_id ?? null : null,
      programacion: link ? {
        dia: link.scheduled_date ?? null,
        inicio: link.scheduled_start_time ?? null,
        fin: link.scheduled_end_time ?? null,
        cancha: link.court_assignment ?? null,
      } : null,
      pareja1: home,
      pareja2: away,
      ganadoraId: match.winner_id,
      marcador: [match.result_couple1, match.result_couple2],
    }
  }).filter(match => {
    if (parejaId) return [match.pareja1.id, match.pareja2.id].includes(parejaId)
    if (jugadorId) return [...match.pareja1.jugadores, ...match.pareja2.jugadores].some(player => player.id === jugadorId)
    return true
  }).sort((left, right) => (left.fechaNumero ?? Infinity) - (right.fechaNumero ?? Infinity) || left.id.localeCompare(right.id))

  const pageSize = 30
  const offset = (pagina - 1) * pageSize
  return {
    tournamentId,
    consultadoEn: new Date().toISOString(),
    zonaHoraria: 'America/Argentina/Buenos_Aires',
    pagina,
    totalPartidos: details.length,
    hayMas: details.length > offset + pageSize,
    resumenParejas: [...byCouple.values()]
      .filter(couple => parejaId ? couple.id === parejaId : !jugadorId)
      .map(({ rivales, rivalesEnZona, ...couple }) => ({ ...couple, rivales: [...rivales], rivalesEnZona: [...rivalesEnZona] })),
    resumenJugadores: [...byPlayer.values()]
      .filter(player => jugadorId ? player.id === jugadorId : !parejaId),
    crucesDeZonaReservados: validMatches
      .filter(match => match.round === 'ZONE' && reservedStatuses.includes(match.status) &&
        (!parejaId || [match.couple1_id, match.couple2_id].includes(parejaId)) && !jugadorId)
      .map(match => ({ pareja1Id: match.couple1_id, pareja2Id: match.couple2_id, estado: match.status })),
    partidos: details.slice(offset, offset + pageSize),
  }
}
