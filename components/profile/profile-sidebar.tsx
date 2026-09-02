"use client"
import { User, Shield, Trophy } from "lucide-react"

interface ProfileSidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

const menuItems = [
  {
    id: "personal",
    title: "Datos Personales",
    icon: User,
  },
  {
    id: "game",
    title: "Datos de Juego",
    icon: Trophy,
  },
  {
    id: "security",
    title: "Seguridad",
    icon: Shield,
  },
]

export function ProfileSidebar({ activeSection, onSectionChange }: ProfileSidebarProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Configuración</h3>
      <nav className="space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-surface text-sm font-medium transition-colors
              ${
                activeSection === item.id
                  ? "text-blue-700 bg-blue-100 border border-blue-200"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
