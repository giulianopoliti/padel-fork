import type { SupabaseClient } from '@supabase/supabase-js'

export interface LineupPlayer {
  id: string
  first_name: string | null
  last_name: string | null
  profile_image_url: string | null
}

interface LineupChange {
  match_id: string
  couple_id: string
  slot: 1 | 2
  player: LineupPlayer
}

export const getLongMatchLineupChanges = async (supabase: Pick<SupabaseClient, 'rpc'>, matchIds: string[]) => {
  const changes = new Map<string, LineupChange[]>()
  for (let offset = 0; offset < matchIds.length; offset += 400) {
    const { data, error } = await supabase.rpc('get_long_match_lineups', { p_match_ids: matchIds.slice(offset, offset + 400) })
    if (error?.code === 'PGRST202') return changes
    if (error) throw error
    for (const change of (data ?? []) as LineupChange[]) {
      const matchChanges = changes.get(change.match_id) ?? []
      matchChanges.push(change)
      changes.set(change.match_id, matchChanges)
    }
  }
  return changes
}

export const applyLongMatchLineup = <T extends object>(couple: T | null, coupleId: string | null,
  changes: LineupChange[] | undefined) => {
  const change = changes?.find(row => row.couple_id === coupleId)
  if (!couple || !change) return couple
  return {
    ...couple,
    ...(change.slot === 1
      ? { player1_id: change.player.id, player1: change.player }
      : { player2_id: change.player.id, player2: change.player }),
    substitute_slot: change.slot,
  }
}
