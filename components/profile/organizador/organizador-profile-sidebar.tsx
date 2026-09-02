"use client"
import { Building2, Users, Shield, ImageIcon } from "lucide-react"

interface OrganizadorProfileSidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

const menuItems = [
  {
    id: "organization",
    title: "Datos de la Organización",
    icon: Building2,
  },
  {
    id: "clubs",
    title: "Clubes Asociados",
    icon: Building2,
  },
  {
    id: "gallery",
    title: "Galería de Imágenes",
    icon: ImageIcon,
  },
  {
    id: "members",
    title: "Miembros",
    icon: Users,
  },
]

export function OrganizadorProfileSidebar({ activeSection, onSectionChange }: OrganizadorProfileSidebarProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Configuración de la Organización</h3>
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