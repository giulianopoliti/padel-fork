import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus, Settings, Users, Trophy } from "lucide-react"
import { getCurrentUserClubId } from "@/app/api/users"
import { createClient } from "@/utils/supabase/server"

export default async function ClubDashboard() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Verificar que el usuario sea CLUB antes de ejecutar queries
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if (userData?.role !== "CLUB") {
    return null
  }

  // Obtener el ID del club
  const clubId = await getCurrentUserClubId()

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold text-padel-green-700 mb-6">Dashboard de Club</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Mis Torneos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">Gestiona y organiza tus torneos de pádel.</p>
            <Button
              asChild
              className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-elevated shadow-sm w-full"
            >
              <Link href="/my-tournaments" className="flex items-center justify-center gap-2">
                <Trophy className="h-5 w-5" />
                Ir a Mis Torneos
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Datos del Club</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">Actualiza la información y configuración de tu club.</p>
            <Button
              asChild
              className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-elevated shadow-sm w-full"
            >
              <Link href="/edit-profile" className="flex items-center justify-center gap-2">
                <Settings className="h-5 w-5" />
                Editar datos del Club
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mis Jugadores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">Consulta los jugadores registrados en tu club.</p>
            <Button
              asChild
              className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-elevated shadow-sm w-full"
            >
              <Link 
                href={clubId ? `/clubes/${clubId}/players` : "/club/players"} 
                className="flex items-center justify-center gap-2"
              >
                <Users className="h-5 w-5" />
                Ver mis Jugadores
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
