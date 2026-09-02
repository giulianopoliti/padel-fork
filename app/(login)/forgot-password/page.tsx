"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import Link from "next/link"
import { ArrowLeft, Mail, CheckCircle } from "lucide-react"
import CPALogo from "@/components/ui/cpa-logo"
import { createClient } from "@/utils/supabase/client"
import { getURL } from "@/utils/supabase/helpers"

export default function ForgotPasswordPage() {
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEmailSent, setIsEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    if (!email) {
      setError("Por favor, ingresa tu email.")
      setIsSubmitting(false)
      return
    }

    try {
      const supabase = createClient()
      const redirectTo = getURL("/auth/callback/recovery")
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      if (error) {
        console.error("Error sending reset email:", error)
        setError("Error al enviar el email. Verifica que la dirección sea correcta.")
        toast({
          title: "Error",
          description: "No se pudo enviar el email de recuperación.",
          variant: "destructive",
        })
      } else {
        setIsEmailSent(true)
        toast({
          title: "Email enviado",
          description: "Revisa tu bandeja de entrada para restablecer tu contraseña.",
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

  if (isEmailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#0a1224_0%,#0f1a34_50%,#162857_100%)] p-4 text-white">
        <Card className="w-full max-w-md border border-white/10 bg-brand-900/70 shadow-lg backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-6">
            <div className="flex justify-center mb-4">
              <CPALogo />
            </div>
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-court-100 p-3">
                <CheckCircle className="h-8 w-8 text-brand-700" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-center text-white">
              Email Enviado
            </CardTitle>
            <CardDescription className="text-center text-slate-300">
              Te hemos enviado un link para restablecer tu contraseña
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4 text-center">
            <div className="space-y-2">
              <p className="text-sm text-slate-300">
                Revisa tu bandeja de entrada en:
              </p>
              <p className="rounded-surface bg-brand-50 px-3 py-2 font-semibold text-brand-900">
                {email}
              </p>
            </div>
            
            <div className="space-y-2 text-sm text-slate-500">
              <p>• El link expira en 60 minutos</p>
              <p>• Revisa también tu carpeta de spam</p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button
              variant="outline"
              onClick={() => {
                setIsEmailSent(false)
                setEmail("")
              }}
              className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              Enviar a otro email
            </Button>
            
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

  return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#0a1224_0%,#0f1a34_50%,#162857_100%)] p-4 text-white">
        <Card className="w-full max-w-md border border-white/10 bg-brand-900/70 shadow-lg backdrop-blur-sm">
        <CardHeader className="space-y-1 pb-6">
          <div className="flex justify-center mb-4">
            <CPALogo />
          </div>
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-brand-50 p-3">
                <Mail className="h-8 w-8 text-brand-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center text-white">
            ¿Olvidaste tu contraseña?
          </CardTitle>
          <CardDescription className="text-center text-slate-300">
            Ingresa tu email y te enviaremos un link para restablecer tu contraseña
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                className="h-11 border-white/10 bg-white/5 text-white placeholder:text-slate-400"
                autoComplete="email"
                required
              />
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
              className="h-11 w-full bg-brand-600 hover:bg-brand-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Enviando..." : "Enviar link de recuperación"}
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
