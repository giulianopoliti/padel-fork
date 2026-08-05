import { createClient } from '@/utils/supabase/server'
import { SupabaseProvider } from '@/components/supabase-provider'
import { ThemeProvider } from '@/components/theme-provider'
import '../globals.css'
import { UserProvider } from '@/contexts/user-context'
import { Toaster } from '@/components/ui/toaster'
import Navbar from '@/components/navbar'
import { SpeedInsights } from "@vercel/speed-insights/next"
import { getUserDetails } from '@/utils/db/getUserDetails'
import { ensureSerializable } from '@/utils/serialization'
import { InstallPwaPrompt } from '@/components/pwa/install-pwa-prompt'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // 🚀 OPTIMIZACIÓN FASE 2: Obtener usuario y detalles del servidor
  // 
  // ANTES: Solo obteníamos el usuario básico, los detalles se obtenían en el cliente
  // DESPUÉS: Obtenemos tanto el usuario como sus detalles completos en el servidor
  // 
  // IMPACTO ESPERADO: Eliminación completa de los timeouts y queries adicionales del cliente
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  // 🔧 OPTIMIZACIÓN FASE 2: Obtener detalles del usuario si está autenticado
  let initialUserDetails = null
  if (user && !authError) {
    try {
      initialUserDetails = await getUserDetails()
      console.log("[Layout] Server-side user details fetched:", {
        hasUser: !!user,
        userId: user.id?.substring(0, 8) || 'none',
        hasDetails: !!initialUserDetails,
        role: initialUserDetails?.role || 'none',
        hasRoleId: !!(initialUserDetails?.player_id || initialUserDetails?.club_id || initialUserDetails?.coach_id)
      })
    } catch (error) {
      console.error("[Layout] Error fetching user details:", error)
      // No bloquear la carga, solo loggear el error
    }
  }

  // 🔧 OPTIMIZACIÓN FASE 2: Manejo de errores simplificado
  const initialUser = (user && !authError) ? ensureSerializable(user) : null
  const serializedUserDetails = initialUserDetails ? ensureSerializable(initialUserDetails) : null

  // 📝 LOGGING MEJORADO: Más información de diagnóstico
  if (authError) {
    if (authError.message !== 'Auth session missing!') {
      console.log("[Layout] Auth error detected:", authError.message)
    }
  }

  // 🎯 DEBUGGING: Información útil para diagnóstico
  console.log("[Layout] Auth Status:", {
    hasUser: !!user,
    userId: user?.id?.substring(0, 8) || 'none',
    hasError: !!authError,
    errorType: authError?.message || 'none',
    passedToProvider: !!initialUser,
    hasInitialDetails: !!initialUserDetails
  })

  return (
    <SupabaseProvider initialUser={initialUser}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        <UserProvider initialUserDetails={serializedUserDetails}> 
          <Navbar />
          {children}
          <InstallPwaPrompt />
          <Toaster />
          <SpeedInsights />
        </UserProvider> 
      </ThemeProvider>
    </SupabaseProvider>
  )
}
