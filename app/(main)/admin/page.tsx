import { createClient } from "@/utils/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Building2, Trophy, Swords, Shield, UserCircle } from "lucide-react"

async function getDashboardStats() {
  const supabase = await createClient()

  // Get counts for each entity
  const [
    { count: usersCount },
    { count: playersCount },
    { count: clubsCount },
    { count: organizationsCount },
    { count: tournamentsCount },
    { count: matchesCount }
  ] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("players").select("*", { count: "exact", head: true }),
    supabase.from("clubes").select("*", { count: "exact", head: true }),
    supabase.from("organizaciones").select("*", { count: "exact", head: true }),
    supabase.from("tournaments").select("*", { count: "exact", head: true }),
    supabase.from("matches").select("*", { count: "exact", head: true })
  ])

  return {
    usersCount: usersCount || 0,
    playersCount: playersCount || 0,
    clubsCount: clubsCount || 0,
    organizationsCount: organizationsCount || 0,
    tournamentsCount: tournamentsCount || 0,
    matchesCount: matchesCount || 0
  }
}

export default async function AdminDashboard() {
  const stats = await getDashboardStats()

  const cards = [
    {
      title: "Usuarios",
      description: "Total de usuarios registrados",
      count: stats.usersCount,
      icon: Users,
      iconColor: "text-blue-600",
      bgColor: "bg-blue-50",
      href: "/admin/users"
    },
    {
      title: "Jugadores",
      description: "Jugadores en la plataforma",
      count: stats.playersCount,
      icon: UserCircle,
      iconColor: "text-green-600",
      bgColor: "bg-green-50",
      href: "/admin/players"
    },
    {
      title: "Clubes",
      description: "Clubes registrados",
      count: stats.clubsCount,
      icon: Building2,
      iconColor: "text-purple-600",
      bgColor: "bg-purple-50",
      href: "/admin/clubs"
    },
    {
      title: "Organizadores",
      description: "Organizaciones activas",
      count: stats.organizationsCount,
      icon: Shield,
      iconColor: "text-orange-600",
      bgColor: "bg-orange-50",
      href: "/admin/organizations"
    },
    {
      title: "Torneos",
      description: "Torneos creados",
      count: stats.tournamentsCount,
      icon: Trophy,
      iconColor: "text-yellow-600",
      bgColor: "bg-yellow-50",
      href: "/admin/tournaments"
    },
    {
      title: "Partidos",
      description: "Partidos programados",
      count: stats.matchesCount,
      icon: Swords,
      iconColor: "text-red-600",
      bgColor: "bg-red-50",
      href: "/admin/matches"
    }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Panel de Administración</h1>
        <p className="text-slate-600 mt-2">
          Bienvenido al panel de gestión del sistema. Aquí puedes administrar todos los aspectos de la plataforma.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <a key={card.title} href={card.href}>
              <Card className="transition-all hover:shadow-lg hover:scale-[1.02] cursor-pointer border-slate-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-700">
                    {card.title}
                  </CardTitle>
                  <div className={`${card.bgColor} p-2 rounded-surface`}>
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-slate-900">{card.count}</div>
                  <p className="text-xs text-slate-500 mt-1">
                    {card.description}
                  </p>
                </CardContent>
              </Card>
            </a>
          )
        })}
      </div>

      {/* Quick Actions */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Acciones Rápidas</CardTitle>
          <CardDescription>
            Accesos directos a las funciones más utilizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <a
              href="/admin/users"
              className="flex items-center space-x-3 rounded-surface border border-slate-200 p-4 transition-colors hover:bg-slate-50"
            >
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-slate-900">Ver Usuarios</p>
                <p className="text-xs text-slate-500">Gestionar usuarios del sistema</p>
              </div>
            </a>

            <a
              href="/admin/players"
              className="flex items-center space-x-3 rounded-surface border border-slate-200 p-4 transition-colors hover:bg-slate-50"
            >
              <UserCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-slate-900">Gestionar Jugadores</p>
                <p className="text-xs text-slate-500">Editar y vincular jugadores</p>
              </div>
            </a>

            <a
              href="/admin/tournaments"
              className="flex items-center space-x-3 rounded-surface border border-slate-200 p-4 transition-colors hover:bg-slate-50"
            >
              <Trophy className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="font-medium text-slate-900">Ver Torneos</p>
                <p className="text-xs text-slate-500">Administrar torneos activos</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card className="border-slate-200 bg-gradient-to-r from-red-50 to-red-100">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="mr-2 h-5 w-5 text-red-700" />
            Información del Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-700">
            <p>Panel de administración v1.0</p>
            <p className="text-xs text-slate-500 mt-1">
              Este panel permite la gestión completa de la plataforma sin necesidad de acceso directo a la base de datos.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
