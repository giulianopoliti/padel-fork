import { AlertCircle, RefreshCw, Lock, UserX, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface ErrorStateProps {
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
    loading?: boolean
  }
  variant?: 'error' | 'warning' | 'info'
}

export function ErrorState({ title, description, action, variant = 'error' }: ErrorStateProps) {
  const icons = {
    error: AlertCircle,
    warning: AlertCircle,
    info: AlertCircle
  }

  const colors = {
    error: 'destructive',
    warning: 'default',
    info: 'default'
  } as const

  const Icon = icons[variant]

  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="w-full max-w-md shadow-lg border-2">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-display bg-gradient-to-br from-red-100 to-red-200 shadow-md">
            <Icon className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-xl font-bold">{title}</CardTitle>
          <CardDescription className="text-base">{description}</CardDescription>
        </CardHeader>
        {action && (
          <CardContent className="text-center pt-2">
            <Button
              onClick={action.onClick}
              disabled={action.loading}
              className="w-full gap-2 shadow-md"
              size="lg"
            >
              {action.loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Cargando...
                </>
              ) : (
                action.label
              )}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

// Specific error components
export function AccessDeniedError({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorState
      title="Acceso Denegado"
      description="No tienes permisos para acceder a esta sección. Debes ser organizador del torneo o estar inscrito como jugador."
      action={{
        label: "Verificar Acceso",
        onClick: onRetry
      }}
      variant="warning"
    />
  )
}

export function NotInscribedError() {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="w-full max-w-md shadow-lg border-2">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-display bg-gradient-to-br from-orange-100 to-orange-200 shadow-md">
            <UserX className="h-8 w-8 text-orange-600" />
          </div>
          <CardTitle className="text-xl font-bold">No Inscrito</CardTitle>
          <CardDescription className="text-base">
            Debes estar inscrito en este torneo para ver y marcar tu disponibilidad horaria.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pt-2">
          <Button variant="outline" className="w-full gap-2 border-2" size="lg" asChild>
            <a href={`/tournaments`}>Ver Torneos Disponibles</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function EliminatedCoupleError() {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="w-full max-w-md shadow-lg border-2">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-display bg-gradient-to-br from-red-100 to-red-200 shadow-md">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <CardTitle className="text-xl font-bold">Pareja Eliminada</CardTitle>
          <CardDescription className="text-base">
            Tu pareja ha sido eliminada del torneo y ya no puede acceder a la selección de horarios.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pt-2">
          <Button variant="outline" className="w-full gap-2 border-2" size="lg" asChild>
            <a href={`/tournaments`}>Ver Otros Torneos</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function NotOrganizerError() {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="w-full max-w-md shadow-lg border-2">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-display bg-gradient-to-br from-blue-100 to-blue-200 shadow-md">
            <Lock className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-xl font-bold">Solo Organizadores</CardTitle>
          <CardDescription className="text-base">
            Esta vista está reservada para organizadores del torneo. Los jugadores pueden marcar su disponibilidad en la vista de jugador.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export function NetworkError({ onRetry, loading }: { onRetry: () => void; loading?: boolean }) {
  return (
    <ErrorState
      title="Error de Conexión"
      description="No se pudo cargar la información. Verifica tu conexión a internet e intenta nuevamente."
      action={{
        label: "Reintentar",
        onClick: onRetry,
        loading
      }}
    />
  )
}

// Inline error alert (for form errors, etc.)
export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" className="mb-4 border-2 shadow-sm">
      <AlertCircle className="h-5 w-5" />
      <AlertTitle className="font-bold text-base">Error</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-2">
        <span className="text-sm">{message}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-2 shrink-0 border-2">
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}