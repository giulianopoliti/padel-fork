import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"

export const dynamic = 'force-dynamic'

export default async function EditProfilePage() {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.log("[EditProfile] No authenticated user, redirecting to login")
      redirect("/login")
    }

    // Get user role from database
    const { data: userData, error: dbError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single()

    if (dbError || !userData || !userData.role) {
      console.log("[EditProfile] User role not found, showing default form")
      // Show a default profile completion form
      return (
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-surface shadow-sm border p-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                Completa tu perfil
              </h1>
              <p className="text-gray-600 mb-6">
                Para continuar, necesitas completar tu registro seleccionando tu tipo de usuario.
              </p>
              <div className="space-y-4">
                <a 
                  href="/register" 
                  className="block w-full bg-blue-600 text-white text-center py-2 px-4 rounded-control hover:bg-blue-700"
                >
                  Completar Registro
                </a>
                <a 
                  href="/dashboard" 
                  className="block w-full bg-gray-100 text-gray-700 text-center py-2 px-4 rounded-control hover:bg-gray-200"
                >
                  Volver al Dashboard
                </a>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // If we have a role, this should never render because the layout handles it
    // But just in case, provide a fallback
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-surface shadow-sm border p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Editar Perfil
            </h1>
            <p className="text-gray-600">
              Cargando tu perfil como {userData.role}...
            </p>
          </div>
        </div>
      </div>
    )

  } catch (error) {
    console.error("[EditProfile] Unexpected error:", error)
    redirect("/login")
  }
} 