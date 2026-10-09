import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { PanelAccessError } from "./components/panel-access-error"

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
    return null
  }

  const { data: userData, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if (error || !userData) {
    console.error("[PanelPage] Could not load user role", { code: error?.code, message: error?.message, missingUser: !userData })
    return <PanelAccessError />
  }

  if (!["CLUB", "PLAYER", "COACH", "ORGANIZADOR"].includes(userData.role || "")) {
    redirect("/login")
  }

  return (
    <div className="container mx-auto px-4 py-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Panel de Control</h1>
      <p className="text-gray-600 mb-2">Bienvenido a tu panel de control.</p>
      <p className="text-gray-600">Tu rol es: {userData.role}</p>
    </div>
  )
}
