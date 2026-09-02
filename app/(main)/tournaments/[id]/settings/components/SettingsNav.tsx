'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  FileText,
  Menu,
  Settings2,
  SlidersHorizontal,
  Trophy,
  Users,
} from 'lucide-react'

const navItems = [
  {
    segment: 'datos',
    label: 'Datos',
    description: 'Nombre, fechas, portada y clubes',
    icon: FileText,
  },
  {
    segment: 'inscripciones',
    label: 'Inscripciones',
    description: 'Acceso, pagos y visibilidad publica',
    icon: Users,
  },
  {
    segment: 'formato',
    label: 'Formato',
    description: 'Preset, clasificacion y modo de llave',
    icon: Trophy,
  },
  {
    segment: 'operacion',
    label: 'Operacion',
    description: 'Borradores, recuperacion y acciones sensibles',
    icon: SlidersHorizontal,
  },
] as const

interface SettingsNavProps {
  tournamentId: string
  formatName: string
  tournamentStatus: string
}

function NavContent({
  tournamentId,
  pathname,
  formatName,
  tournamentStatus,
  onNavigate,
}: SettingsNavProps & { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-display border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-slate-900">
          <Settings2 className="h-4 w-4 text-blue-600" />
          <p className="text-sm font-semibold">Configuracion</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="max-w-full truncate">
            {formatName}
          </Badge>
          <Badge variant="secondary">{tournamentStatus}</Badge>
        </div>
      </div>

      <nav className="space-y-1 rounded-display border border-slate-200 bg-white p-2 shadow-sm">
        {navItems.map((item) => {
          const href = `/tournaments/${tournamentId}/settings/${item.segment}`
          const isActive = pathname === href || pathname.startsWith(`${href}/`)
          const Icon = item.icon

          return (
            <Link
              key={item.segment}
              href={href}
              onClick={onNavigate}
              className={cn(
                'block rounded-elevated border px-3 py-3 transition-colors',
                isActive
                  ? 'border-blue-200 bg-blue-50 text-blue-900'
                  : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'rounded-surface p-2',
                    isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.description}</p>
                </div>
              </div>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export default function SettingsNav(props: SettingsNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="bg-white">
              <Menu className="mr-2 h-4 w-4" />
              Secciones
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[86vw] max-w-sm overflow-y-auto bg-slate-50 p-4">
            <SheetTitle className="sr-only">Secciones de configuracion</SheetTitle>
            <NavContent
              {...props}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <NavContent {...props} pathname={pathname} />
        </div>
      </aside>
    </>
  )
}
