"use client"

import useSWR from "swr"
import { useUser } from "@/contexts/user-context"
import { isSoloPlayersEnabled } from "@/config/solo-players"
import type { SoloDirectoryData } from "@/types/solo-player-ui"

const fetchDirectory = async ([url]: readonly [string, string]): Promise<SoloDirectoryData> => {
  const response = await fetch(url, { cache: "no-store" })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || "No pudimos cargar las búsquedas.")
  return body as SoloDirectoryData
}

export const useSoloDirectory = () => {
  const { user } = useUser()
  const { data, error, isLoading, isValidating, mutate } = useSWR<SoloDirectoryData, Error>(user && isSoloPlayersEnabled() ? ["/api/solo-players", user.id] as const : null, fetchDirectory, {
    refreshInterval: 60_000, revalidateOnFocus: true, shouldRetryOnError: false,
  })
  return { data, error: error?.message || "", loading: isLoading || isValidating, reload: () => mutate().catch(() => undefined) }
}
