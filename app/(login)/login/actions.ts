"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { getMcpOAuthReturnPath } from "@/lib/auth/mcp-return-path"

function sanitizeRedirectTo(redirectTo: string | null): string | null {
  if (!redirectTo || !redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return null
  }

  return redirectTo
}

function buildLoginRedirectUrl(formData: FormData, fallback = "/panel"): string {
  const redirectTo = sanitizeRedirectTo(formData.get("redirectTo") as string | null)
  const intent = formData.get("intent") as string | null

  if (!redirectTo) return fallback

  const url = new URL(redirectTo, "http://localhost")
  if (intent === "individual" || intent === "couple") {
    url.searchParams.set("intent", intent)
  }

  return `${url.pathname}${url.search}${url.hash}`
}

export async function login(formData: FormData) {
  try {
    const email = formData.get("email") as string
    const password = formData.get("password") as string
    const contextualRedirect = buildLoginRedirectUrl(formData)

    if (!email || !password) {
      return { error: "Todos los campos son requeridos" }
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (data === undefined || data === null) {
      return { error: "Error de comunicación con el servidor de autenticación. Intenta nuevamente." }
    }

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        return { error: "Credenciales incorrectas. Verifica tu email y contraseña." }
      }
      if (error.message.includes("Email not confirmed")) {
        return { error: "Por favor confirma tu email antes de iniciar sesión." }
      }
      if (error.message.includes("Too many requests")) {
        return { error: "Demasiados intentos. Espera unos minutos antes de intentar de nuevo." }
      }

      return { error: "Error de autenticación. Intenta de nuevo más tarde." }
    }

    const user = data.user
    if (!user) {
      return { error: "Error de autenticación - usuario no encontrado" }
    }

    try {
      const { data: userData, error: userRoleError } = await supabase.from("users").select("role").eq("id", user.id).single()

      if (userRoleError) {
        return {
          success: true,
          redirectUrl: "/edit-profile",
          message: "Por favor completa tu perfil",
        }
      }

      if (!userData || !userData.role) {
        return {
          success: true,
          redirectUrl: "/edit-profile",
          message: "Por favor completa tu perfil",
        }
      }

      const defaultRedirect = userData.role === "ADMIN" ? "/admin" : "/panel"
      const finalRedirectUrl = getMcpOAuthReturnPath(contextualRedirect) ??
        (userData.role === "PLAYER" ? contextualRedirect : defaultRedirect)

      return {
        success: true,
        redirectUrl: finalRedirectUrl,
        message: "Inicio de sesión exitoso",
      }
    } catch {
      return {
        success: true,
        redirectUrl: contextualRedirect,
        message: "Inicio de sesión exitoso",
      }
    }
  } catch {
    return { error: "Error crítico al procesar la solicitud. Intenta de nuevo más tarde." }
  }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
