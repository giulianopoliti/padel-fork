"use client"
import useSWR from "swr"
import { useUser } from "@/contexts/user-context"

export const useSoloResource = <T,>(url: string | null) => {
  const { user } = useUser()
  return useSWR<T, Error>(url && user ? [url, user.id] : null, async ([path]: readonly [string, string]) => {
    const response = await fetch(path, { cache: "no-store" })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "No pudimos cargar la bandeja.")
    return body as T
  }, { refreshInterval: 30_000, revalidateOnFocus: true, shouldRetryOnError: false })
}
export const isSoloCacheKey = (key: unknown): boolean => Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith("/api/solo-players")
export const isSoloNotificationCacheKey = (key: unknown): boolean => Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith("/api/solo-players/notifications")
