"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import Link from "next/link"
import { ArrowLeft, Lock, Eye, EyeOff, CheckCircle } from "lucide-react"
import CPALogo from "@/components/ui/cpa-logo"
import { createClient } from "@/utils/supabase/client"
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-password-errors"

export default function ResetPasswordPage() {
  const { toast } = useToast()
  const router = useRouter()
  
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordReset, setIsPasswordReset] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null)

  useEffect(() => {
    let isMounted = true
    const supabase = createClient()
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return

      if (event === "PASSWORD_RECOVERY" || session) {
        setIsValidSession(true)
      }
    })

    const checkSession = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get("code")

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

          window.history.replaceState(null, "", window.location.pathname)

          if (exchangeError) {
            console.error("Error exchanging recovery code:", exchangeError)
            if (isMounted) {
              setIsValidSession(false)
              setError("El link de recuperacion es invalido o ya expiro.")
            }
            return
          }
        }

        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error || !session) {
          console.log("No valid session found")
          if (isMounted) {
            setIsValidSession(false)
          }
          return
        }
        
        if (isMounted) {
          setIsValidSession(true)
        }
      } catch (err) {
        console.error("Error checking session:", err)
        if (isMounted) {
          setIsValidSession(false)
        }
      }
    }

    checkSession()

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    // Validations
    if (!password || !confirmPassword) {
      setError("Por favor, completa todos los campos.")
      setIsSubmitting(false)
      return
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
      setIsSubmitting(false)
      return
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.")
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch("/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password,
        }),
      })
      const contentType = response.headers.get("content-type") || ""
      const result = contentType.includes("application/json")
        ? ((await response.json()) as { success?: boolean; error?: string })
        : { error: "No se pudo completar el recupero. Pedi un nuevo link e intentalo otra vez." }

      if (!response.ok || result.error) {
        console.error("Error updating password:", result.error)
        setError(result.error || "Error al actualizar la contraseña. El link puede haber expirado.")
        toast({
          title: "Error",
          description: result.error || "No se pudo actualizar la contraseña.",
          variant: "destructive",
        })
      } else {
        setIsPasswordReset(true)
        toast({
          title: "Contraseña actualizada",
          description: "Tu contraseña ha sido actualizada correctamente.",
        })
      }
    } catch (err) {
      console.error("Unexpected error:", err)
      setError("Error inesperado. Inténtalo de nuevo.")
      toast({
        title: "Error",
        description: "Error inesperado. Inténtalo de nuevo.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Loading state while checking session
  if (isValidSession === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#0a1224_0%,#0f1a34_50%,#162857_100%)] p-4 text-white">
        <Card className="w-full max-w-md border border-white/10 bg-brand-900/70 shadow-lg backdrop-blur-sm">
          <CardContent className="flex justify-center items-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand-600"></div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Invalid session - show error
  if (!isValidSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#0a1224_0%,#0f1a34_50%,#162857_100%)] p-4 text-white">
        <Card className="w-full max-w-md border border-white/10 bg-brand-900/70 shadow-lg backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-6">
            <div className="mb-4 flex justify-center">
              <CPALogo />
            </div>
            <div className="flex justify-center mb-4">
              <div className="bg-red-100 p-3 rounded-full">
                <Lock className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-center text-white">
              Link Inválido
            </CardTitle>
            <CardDescription className="text-center text-slate-300">
              El link para restablecer contraseña es inválido o ha expirado
            </CardDescription>
          </CardHeader>

          <CardFooter className="flex flex-col space-y-3">
            <Link href="/forgot-password" className="w-full">
              <Button className="w-full bg-court-500 text-brand-900 hover:bg-court-400">
                Solicitar nuevo link
              </Button>
            </Link>
            
            <Link 
              href="/login" 
              className="flex items-center justify-center gap-2 text-sm font-medium text-slate-300 hover:text-court-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio de sesión
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // Success state
  if (isPasswordReset) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#0a1224_0%,#0f1a34_50%,#162857_100%)] p-4 text-white">
        <Card className="w-full max-w-md border border-white/10 bg-brand-900/70 shadow-lg backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-6">
            <div className="mb-4 flex justify-center">
              <CPALogo />
            </div>
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-court-100 p-3">
                <CheckCircle className="h-8 w-8 text-brand-700" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-center text-white">
              ¡Contraseña Actualizada!
            </CardTitle>
            <CardDescription className="text-center text-slate-300">
              Tu contraseña ha sido restablecida correctamente
            </CardDescription>
          </CardHeader>

          <CardFooter className="flex flex-col space-y-3">
            <Button 
              onClick={() => router.push("/login")}
              className="w-full bg-court-500 text-brand-900 hover:bg-court-400"
            >
              Iniciar sesión
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // Reset password form
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#0a1224_0%,#0f1a34_50%,#162857_100%)] p-4 text-white">
      <Card className="w-full max-w-md border border-white/10 bg-brand-900/70 shadow-lg backdrop-blur-sm">
        <CardHeader className="space-y-1 pb-6">
          <div className="mb-4 flex justify-center">
            <CPALogo />
          </div>
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-brand-50 p-3">
              <Lock className="h-8 w-8 text-brand-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center text-white">
            Nueva Contraseña
          </CardTitle>
          <CardDescription className="text-center text-slate-300">
            Ingresa tu nueva contraseña
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nueva Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="h-11 border-white/10 bg-white/5 pr-10 text-white placeholder:text-slate-400"
                  autoComplete="new-password"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-slate-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-slate-500" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirma tu nueva contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="h-11 border-white/10 bg-white/5 pr-10 text-white placeholder:text-slate-400"
                  autoComplete="new-password"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-slate-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-slate-500" />
                  )}
                </Button>
              </div>
            </div>
            
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-surface p-3">
                {error}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button 
              type="submit" 
              className="w-full h-11 bg-court-500 text-brand-900 hover:bg-court-400"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Actualizando..." : "Actualizar contraseña"}
            </Button>
            
            <Link 
              href="/login" 
              className="flex items-center justify-center gap-2 text-sm font-medium text-slate-300 hover:text-court-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio de sesión
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
} 
