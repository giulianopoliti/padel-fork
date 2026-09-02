"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react"
import { useSearchParams } from "next/navigation"

import { login } from "@/app/(login)/login/actions"
import { TENANT_CONFIG } from "@/config/tenant"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import BrandLogo from "@/components/ui/brand-logo"
import { useToast } from "@/components/ui/use-toast"
import { createClient } from "@/utils/supabase/client"

export default function LoginPage() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  const redirectTo = searchParams.get("redirectTo")
  const intent = searchParams.get("intent")
  const hasValidRedirect = !!redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
  const registerHref = hasValidRedirect
    ? `/register?redirectTo=${encodeURIComponent(redirectTo)}${intent === "individual" || intent === "couple" ? `&intent=${intent}` : ""}`
    : "/register"

  const storeGoogleOAuthNext = (nextPath: string) => {
    const secureCookie = window.location.protocol === "https:" ? "; secure" : ""
    document.cookie = `google_oauth_next=${encodeURIComponent(nextPath)}; path=/; max-age=300; samesite=lax${secureCookie}`
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSubmitting) return

    try {
      setIsSubmitting(true)

      const data = new FormData()
      data.append("email", formData.email)
      data.append("password", formData.password)

      if (hasValidRedirect && redirectTo) {
        data.append("redirectTo", redirectTo)
      }

      if (intent === "individual" || intent === "couple") {
        data.append("intent", intent)
      }

      const result = await login(data)

      if (!result || typeof result !== "object") {
        toast({
          title: "Error de comunicacion",
          description: "No se recibio una respuesta valida. Intenta nuevamente.",
          variant: "destructive",
        })
        return
      }

      if (result.error) {
        toast({
          title: "Error de acceso",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      if (result.success) {
        toast({
          title: "Acceso exitoso",
          description: result.message || "Redirigiendo...",
        })
        window.location.href = result.redirectUrl || "/panel"
        return
      }

      toast({
        title: "Error inesperado",
        description: "La respuesta del servidor no tuvo el formato esperado.",
        variant: "destructive",
      })
    } catch (error) {
      console.error("[LOGIN_PAGE] Login failed:", error)
      toast({
        title: "Error de red",
        description: "No pudimos iniciar sesion. Proba de nuevo en unos minutos.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleLogin = async () => {
    if (isSubmitting) return

    try {
      setIsSubmitting(true)
      const supabase = createClient()
      const nextUrl = new URL(hasValidRedirect && redirectTo ? redirectTo : "/panel", window.location.origin)

      if (intent === "individual" || intent === "couple") {
        nextUrl.searchParams.set("intent", intent)
      }

      const callbackUrl = new URL("/auth/callback", window.location.origin)
      storeGoogleOAuthNext(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)

      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl.toString() },
      })
    } catch (error) {
      console.error("[LOGIN_PAGE] Google login failed:", error)
      toast({
        title: "Error",
        description: "No se pudo iniciar sesion con Google.",
        variant: "destructive",
      })
      setIsSubmitting(false)
    }
  }

  if (!mounted) {
    return null
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#0a1224_0%,#0f1a34_50%,#162857_100%)] text-white">
      <div className="container mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-200 transition-colors hover:text-court-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
          <BrandLogo variant="navbar" surface="dark" />
        </div>

        <div className="grid flex-1 items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-6 rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-sm backdrop-blur-sm lg:p-12">
            <div className="inline-flex items-center rounded-full bg-court-500 px-4 py-1 text-sm font-medium text-brand-900">
              Inicio de sesion
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-black tracking-tight text-white lg:text-5xl">
                Entra a tu cuenta en {TENANT_CONFIG.siteName}.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-200 lg:text-lg">
                Ingresa para ver tu perfil, inscribirte en torneos y seguir tu actividad como jugador.
              </p>
            </div>

            <div className="rounded-display border border-white/10 bg-white/5 p-5">
              <p className="text-sm leading-6 text-slate-200">
                Puedes entrar con tu correo y contraseña o continuar con Google si ya vinculaste tu cuenta.
              </p>
            </div>
          </section>

          <Card className="overflow-hidden rounded-[2rem] border border-white/10 bg-brand-900/70 shadow-2xl backdrop-blur-sm">
            <div className="h-2 bg-gradient-to-r from-court-400 via-court-500 to-court-300" />
            <CardHeader className="space-y-3 px-8 pt-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-display bg-white/5">
                <BrandLogo variant="navbar" surface="dark" className="h-10 w-auto" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold text-white">Iniciar sesion</CardTitle>
                <CardDescription className="mt-2 text-sm leading-6 text-slate-300">
                  Usa tu email y contraseña para entrar a tu cuenta de jugador.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="px-8">
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo electronico</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="tu@email.com"
                    autoComplete="email"
                    required
                    disabled={isSubmitting}
                    className="h-12 rounded-elevated border-white/10 bg-white/5 text-white placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={handleInputChange}
                      autoComplete="current-password"
                      required
                      disabled={isSubmitting}
                      className="h-12 rounded-elevated border-white/10 bg-white/5 pr-12 text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-white"
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Link href="/forgot-password" className="text-sm font-medium text-slate-300 hover:text-court-300">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-elevated bg-court-500 text-base font-semibold text-brand-900 hover:bg-court-400"
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Ingresando...
                    </span>
                  ) : (
                    "Ingresar"
                  )}
                </Button>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-sm text-slate-400">o</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleLogin}
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-elevated border-white/10 bg-white/5 text-base font-medium text-white hover:bg-white/10"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="mr-2 h-5 w-5 shrink-0"
                  >
                    <path
                      fill="#4285F4"
                      d="M21.6 12.23c0-.68-.06-1.33-.17-1.96H12v3.7h5.39a4.62 4.62 0 0 1-2 3.03v2.51h3.24c1.9-1.75 2.97-4.34 2.97-7.28Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 22c2.7 0 4.96-.9 6.61-2.44l-3.24-2.51c-.9.6-2.05.96-3.37.96-2.59 0-4.79-1.75-5.57-4.1H3.08v2.59A9.98 9.98 0 0 0 12 22Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M6.43 13.91A5.98 5.98 0 0 1 6.12 12c0-.66.11-1.29.31-1.91V7.5H3.08A9.98 9.98 0 0 0 2 12c0 1.61.39 3.13 1.08 4.5l3.35-2.59Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.99c1.47 0 2.8.51 3.84 1.5l2.88-2.88C16.95 2.97 14.7 2 12 2A9.98 9.98 0 0 0 3.08 7.5l3.35 2.59c.78-2.35 2.98-4.1 5.57-4.1Z"
                    />
                  </svg>
                  Continuar con Google
                </Button>
              </form>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 px-8 pb-8">
              <p className="text-center text-sm text-slate-300">
                ¿Todavia no tenes cuenta?{" "}
                <Link href={registerHref} className="font-semibold text-court-300 hover:text-court-200">
                  Crear cuenta
                </Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
