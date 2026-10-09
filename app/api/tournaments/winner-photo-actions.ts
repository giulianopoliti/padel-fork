'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { checkTournamentPermissions } from '@/utils/tournament-permissions'
import { isBracketKey } from '@/lib/services/bracket-key-policy'
import { isWinnerPhotoStatus, MAX_WINNER_PHOTO_SIZE, WINNER_PHOTO_BUCKET, type WinnerPhotoAccess } from '@/lib/tournaments/winner-photo'

export const getTournamentWinnerPhotoAccess = async (tournamentId: string): Promise<WinnerPhotoAccess | null> => {
  const supabase = await createClient()
  const { data: tournament, error } = await supabase.from('tournaments')
    .select('id, name, status, winner_id, winner_image_url').eq('id', tournamentId).maybeSingle()
  if (error || !tournament) return null

  const [{ data: { user } }, { data: finals, error: finalsError }, { data: photos, error: photosError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('matches').select('id, bracket_key, winner_id').eq('tournament_id', tournamentId).eq('round', 'FINAL').eq('status', 'FINISHED').not('winner_id', 'is', null),
    supabase.from('tournament_winner_photos').select('match_id, bracket_key, winner_id, image_url').eq('tournament_id', tournamentId),
  ])
  if (finalsError || photosError) return null
  const winners = (finals || []).flatMap((final) => {
    if (!isBracketKey(final.bracket_key) || !final.winner_id) return []
    const photo = photos?.find((item) => item.match_id === final.id && item.winner_id === final.winner_id && item.bracket_key === final.bracket_key)
    return [{ matchId: final.id, bracketKey: final.bracket_key, winnerId: final.winner_id,
      imageUrl: photo?.image_url || (final.winner_id === tournament.winner_id && final.bracket_key !== 'SILVER' ? tournament.winner_image_url : null) }]
  })
  const permissions = user && isWinnerPhotoStatus(tournament.status) && winners.length
    ? await checkTournamentPermissions(user.id, tournamentId)
    : null

  return {
    tournamentId: tournament.id,
    tournamentName: tournament.name || 'Torneo',
    status: tournament.status,
    winnerId: tournament.winner_id,
    imageUrl: tournament.winner_image_url,
    canUpload: permissions?.hasPermission === true && permissions.userRole === 'ORGANIZADOR',
    winners,
  }
}

export const uploadWinnerPhoto = async (
  tournamentId: string,
  file: File,
  expected?: { matchId: string; winnerId: string },
): Promise<{ success: boolean; url?: string; error?: string }> => {
  try {
    const access = await getTournamentWinnerPhotoAccess(tournamentId)
    if (!access?.canUpload) {
      return { success: false, error: 'Solo los organizadores del torneo pueden cargar la foto de los ganadores cuando el torneo está finalizado.' }
    }
    const champion = expected
      ? access.winners.find((winner) => winner.matchId === expected.matchId && winner.winnerId === expected.winnerId)
      : access.winners.find((winner) => winner.bracketKey !== 'SILVER' && winner.winnerId === access.winnerId)
    if (!champion) {
      return { success: false, error: 'La pareja ganadora cambió. Actualizá el torneo antes de cargar la foto.' }
    }

    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    if (!(file instanceof File) || !extensions[file.type] || file.size === 0 || file.size > MAX_WINNER_PHOTO_SIZE) {
      return { success: false, error: 'Seleccioná una imagen JPG, PNG o WEBP de hasta 5 MB.' }
    }
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const isValidImage = file.type === 'image/jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : file.type === 'image/png'
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
        : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    if (!isValidImage) return { success: false, error: 'El archivo no contiene una imagen válida.' }

    const supabase = await createClient()
    const finalQuery = supabase.from('matches').select('id, winner_id')
      .eq('tournament_id', tournamentId).eq('round', 'FINAL').eq('status', 'FINISHED')
      .eq('id', champion.matchId).eq('bracket_key', champion.bracketKey).eq('winner_id', champion.winnerId)
    const { data: finals, error: finalError } = await finalQuery.limit(1)
    if (finalError || !finals?.length) return { success: false, error: 'La foto solo puede cargarse para la pareja campeona de la final.' }

    // Each replacement has a fresh URL so the home and image CDN never reuse an old photo.
    const path = `${tournamentId}/winner-${champion.bracketKey.toLowerCase()}-${randomUUID()}.${extensions[file.type]}`
    const bucket = supabase.storage.from(WINNER_PHOTO_BUCKET)
    const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) return { success: false, error: 'No se pudo subir la foto de los ganadores.' }
    const { data: { publicUrl } } = bucket.getPublicUrl(path)
    const { data: updated, error: updateError } = await supabase.from('tournament_winner_photos')
      .upsert({ tournament_id: tournamentId, bracket_key: champion.bracketKey, match_id: champion.matchId, winner_id: champion.winnerId, image_url: publicUrl }, { onConflict: 'tournament_id,bracket_key' })
      .select('tournament_id').maybeSingle()
    if (updateError || !updated) {
      await bucket.remove([path])
      return { success: false, error: 'No se pudo guardar la foto. Actualizá el torneo e intentá nuevamente.' }
    }

    revalidatePath('/')
    revalidatePath(`/tournaments/${tournamentId}`, 'layout')
    revalidatePath('/torneos', 'layout')
    return { success: true, url: publicUrl }
  } catch (error) {
    console.error('Error uploading winner photo:', error)
    return { success: false, error: 'Error inesperado al subir la foto de los ganadores.' }
  }
}
