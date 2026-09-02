"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle, Eye, EyeOff, Loader2 } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

import { checkDNIConflictBeforeRegistration, register, registerAndLinkToExistingPlayer } from "./actions"
import { TENANT_CONFIG } from "@/config/tenant"
import BrandLogo from "@/components/ui/brand-logo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { createClient } from "@/utils/supabase/client"

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    dni: "",
    phone: "",
    gender: "",
    dateOfBirth: "",
  })

  const redirectTo = searchParams.get("redirectTo")
  const intent = searchParams.get("intent")
  const hasValidRedirect = !!redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
  const loginHref = hasValidRedirect
    ? `/login?redirectTo=${encodeURIComponent(redirectTo)}${intent === "individual" || intent === "couple" ? `&intent=${intent}` : ""}`
    : "/login"

  const storeGoogleOAuthNext = (nextPath: string) => {
    const secureCookie = window.location.protocol === "https:" ? "; secure" : ""
    document.cookie = `google_oauth_next=${encodeURIComponent(nextPath)}; path=/; max-age=300; samesite=lax${secureCookie}`
  }

  useEffect(() => {
    const requestedRole = searchParams.get("role")
    if (requestedRole && requestedRole.toUpperCase() !== "PLAYER") {
      router.replace("/register")
    }
  }, [router, searchParams])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const buildPlayerFormData = () => {
    const data = new FormData()
    data.append("email", formData.email)
    data.append("password", formData.password)
    data.append("role", "PLAYER")
    data.append("firstName", formData.firstName)
    data.append("lastName", formData.lastName)
    data.append("dni", formData.dni)
    data.append("phone", formData.phone)
    data.append("gender", formData.gender)
    data.append("dateOfBirth", formData.dateOfBirth)

    if (hasValidRedirect && redirectTo) {
      data.append("redirectTo", redirectTo)
    }

    if (intent === "individual" || intent === "couple") {
      data.append("intent", intent)
    }

    return data
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
      console.error("[REGISTER_PAGE] Google login failed:", error)
      toast({
        title: "Error",
        description: "No se pudo continuar con Google.",
        variant: "destructive",
      })
      setIsSubmitting(false)
    }
  }

  const autoLinkExistingPlayer = async (dataToSubmit: FormData, existingPlayerId: string) => {
    const result = await registerAndLinkToExistingPlayer(dataToSubmit, existingPlayerId)

    if (result?.error) {
      toast({
        title: "Error al vincular cuenta",
        description: result.error,
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Cuenta vinculada",
      description: result.message || "Tu cuenta quedo asociada al jugador existente.",
    })

    setTimeout(() => {
      window.location.assign(result.redirectUrl || "/panel")
    }, 1200)
  }


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSubmitting) return

    const requiredFields: Array<{ key: keyof typeof formData; label: string }> = [
      { key: "firstName", label: "nombre" },
      { key: "lastName", label: "apellido" },
      { key: "gender", label: "genero" },
      { key: "email", label: "correo electronico" },
      { key: "password", label: "contrasena" },
    ]

    const missingFields = requiredFields
      .filter(({ key }) => !formData[key].trim())
      .map(({ label }) => label)

    if (missingFields.length > 0) {
      toast({
        title: "Faltan campos obligatorios",
        description: `Completa: ${missingFields.join(", ")}.`,
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    const dataToSubmit = buildPlayerFormData()

    try {
      const conflictCheckResult = await checkDNIConflictBeforeRegistration(dataToSubmit)

      if (!conflictCheckResult.success) {
        if (conflictCheckResult.requiresConfirmation && conflictCheckResult.existingPlayer) {
          await autoLinkExistingPlayer(dataToSubmit, conflictCheckResult.existingPlayer.id)
          return
        }

        toast({
          title: "No pudimos completar el registro",
          description: conflictCheckResult.error || "Revisa los datos e intenta nuevamente.",
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }

      const result = await register(dataToSubmit)

      if (result?.error) {
        toast({
          title: "Error de registro",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      if (result?.requiresConfirmation && result.existingPlayer) {
        await autoLinkExistingPlayer(dataToSubmit, result.existingPlayer.id)
        return
      }

      toast({
        title: "Registro exitoso",
        description: result?.message || "Tu cuenta ya esta lista.",
      })

      setTimeout(() => {
        window.location.assign(result?.redirectUrl || "/panel")
      }, 1200)
    } catch (error) {
      console.error("[REGISTER_PAGE] Submit failed:", error)
      toast({
        title: "Error inesperado",
        description: "No pudimos crear la cuenta. Proba de nuevo.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
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

        <div className="grid flex-1 items-start gap-8 lg:grid-cols-[1fr_0.95fr]">
          <section className="space-y-6 rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-sm backdrop-blur-sm lg:p-12">
            <div className="inline-flex items-center rounded-full bg-court-500 px-4 py-1 text-sm font-medium text-brand-900">
              Registro de jugadores
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-black tracking-tight text-white lg:text-5xl">
                Crea tu cuenta en {TENANT_CONFIG.siteName}.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-200 lg:text-lg">
                Completa solo los datos necesarios para empezar a inscribirte en torneos y gestionar tu perfil.
              </p>
            </div>

            <div className="rounded-display border border-white/10 bg-white/5 p-5">
              <p className="text-sm leading-6 text-slate-200">
                Los campos marcados con <span className="font-semibold text-court-300">*</span> son obligatorios:
                nombre, apellido, genero, correo electronico y contrasena.
              </p>
            </div>

            <Alert className="rounded-display border-white/10 bg-white/5 text-white">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription className="text-sm leading-6 text-slate-200">
                Si ya jugaste antes y cargas tu DNI, vamos a intentar vincular tu nueva cuenta con ese perfil existente.
              </AlertDescription>
            </Alert>
          </section>

          <div className="relative">
            <Card className="overflow-hidden rounded-[2rem] border border-white/10 bg-brand-900/70 shadow-2xl backdrop-blur-sm">
              <div className="h-2 bg-gradient-to-r from-court-400 via-court-500 to-court-300" />
              <CardHeader className="space-y-3 px-8 pt-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-display bg-white/5">
                  <BrandLogo variant="navbar" surface="dark" className="h-10 w-auto" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold text-white">Crear cuenta</CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6 text-slate-300">
                    Completa tus datos. Los campos con * son obligatorios.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="px-8">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">
                        Nombre <span className="text-court-300">*</span>
                      </Label>
                      <Input
                        id="firstName"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        required
                        className="h-12 rounded-elevated border-white/10 bg-white/5 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">
                        Apellido <span className="text-court-300">*</span>
                      </Label>
                      <Input
                        id="lastName"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        required
                        className="h-12 rounded-elevated border-white/10 bg-white/5 text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Correo electronico <span className="text-court-300">*</span>
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      autoComplete="email"
                      required
                      className="h-12 rounded-elevated border-white/10 bg-white/5 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">
                      Contraseña <span className="text-court-300">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={handleInputChange}
                        autoComplete="new-password"
                        required
                        minLength={6}
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="dni">DNI opcional</Label>
                      <Input
                        id="dni"
                        name="dni"
                        value={formData.dni}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, "").slice(0, 8)
                          setFormData((prev) => ({ ...prev, dni: value }))
                        }}
                        inputMode="numeric"
                        maxLength={8}
                        className="h-12 rounded-elevated border-white/10 bg-white/5 text-white"
                        placeholder="Solo numeros"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefono</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="h-12 rounded-elevated border-white/10 bg-white/5 text-white"
                        placeholder="+54 9 11 12345678"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="gender">
                        Genero <span className="text-court-300">*</span>
                      </Label>
                      <Select value={formData.gender} onValueChange={(value) => setFormData((prev) => ({ ...prev, gender: value }))}>
                        <SelectTrigger className="h-12 rounded-elevated border-white/10 bg-white/5 text-white">
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MALE">Caballeros</SelectItem>
                          <SelectItem value="FEMALE">Damas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth">Fecha de nacimiento</Label>
                      <Input
                        id="dateOfBirth"
                        name="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={handleInputChange}
                        className="h-12 rounded-elevated border-white/10 bg-white/5 text-white"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-12 w-full rounded-elevated bg-court-500 text-base font-semibold text-brand-900 hover:bg-court-400"
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creando cuenta...
                      </span>
                    ) : (
                      "Crear cuenta"
                    )}
                  </Button>

                  <p className="text-center text-sm text-slate-300">* Campos obligatorios</p>

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
                  ¿Ya tenes una cuenta?{" "}
                  <Link href={loginHref} className="font-semibold text-court-300 hover:text-court-200">
                    Iniciar sesion
                  </Link>
                </p>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
