"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Loader2, 
  Users, 
  Plus, 
  Trophy, 
  RefreshCw, 
  Eye,
  EyeOff,
  Layout,
  LayoutGrid
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Switch } from "@/components/ui/switch"

// Import existing components - NO TOCAMOS NADA DE SU FUNCIONALIDAD
import MatchCreationSection from "./match-creation-section"
import ExistingMatchesSection from "./existing-matches-section"
import EnhancedMatchCreation from "./enhanced-match-creation"

interface UnifiedMatchesInterfaceProps {
  tournamentId: string
  clubCourts: number
  isOwner?: boolean
  isPublicView?: boolean
  onDataRefresh?: () => void
}

export default function UnifiedMatchesInterface({
  tournamentId,
  clubCourts,
  isOwner = false,
  isPublicView = false,
  onDataRefresh
}: UnifiedMatchesInterfaceProps) {
  // Estado para controlar qué vista usar
  const [useUnifiedView, setUseUnifiedView] = useState(true)
  const [useEnhancedCreation, setUseEnhancedCreation] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [collapsedSections, setCollapsedSections] = useState({
    creation: false,
    management: false
  })
  const [stagingMatches, setStagingMatches] = useState<any[]>([])
  
  // Estado persistente entre secciones
  const [persistentState, setPersistentState] = useState({
    lastCreatedMatches: [] as string[],
    activeZone: null as string | null,
    recentActivity: [] as Array<{
      type: 'created' | 'updated'
      matchId: string
      timestamp: number
      description: string
    }>
  })

  const { toast } = useToast()

  // Handler mejorado para cuando se crean partidos
  const handleMatchesCreated = useCallback(() => {
    const timestamp = Date.now()
    
    setRefreshTrigger(prev => prev + 1)
    setPersistentState(prev => ({
      ...prev,
      recentActivity: [{
        type: 'created',
        matchId: `batch-${timestamp}`,
        timestamp,
        description: 'Partidos creados exitosamente'
      }, ...prev.recentActivity.slice(0, 4)] // Mantener solo 5 actividades recientes
    }))
    
    if (onDataRefresh) {
      onDataRefresh()
    }
    
    // Toast mejorado con contexto
    toast({
      title: "✅ Partidos creados",
      description: "Los partidos aparecen automáticamente en la tabla de gestión",
      variant: "default"
    })
  }, [onDataRefresh, toast])

  // Handler para actualizaciones de partidos
  const handleMatchUpdated = useCallback(() => {
    const timestamp = Date.now()
    
    setRefreshTrigger(prev => prev + 1)
    setPersistentState(prev => ({
      ...prev,
      recentActivity: [{
        type: 'updated',
        matchId: `update-${timestamp}`,
        timestamp,
        description: 'Resultado de partido actualizado'
      }, ...prev.recentActivity.slice(0, 4)]
    }))
    
    if (onDataRefresh) {
      onDataRefresh()
    }
  }, [onDataRefresh])

  // Toggle para colapsar secciones
  const toggleSection = (section: 'creation' | 'management') => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  // Vista pública simplificada
  if (isPublicView) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Partidos del Torneo</h2>
          <Badge variant="secondary" className="text-sm">
            Vista Pública
          </Badge>
        </div>
        <ExistingMatchesSection
          tournamentId={tournamentId}
          isOwner={false}
          isPublicView={true}
          refreshTrigger={refreshTrigger}
          onMatchUpdated={handleMatchUpdated}
        />
      </div>
    )
  }

  // Control de acceso
  if (!isOwner) {
    return (
      <div className="text-center py-16">
        <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Trophy className="h-10 w-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">Acceso Restringido</h3>
        <p className="text-slate-500">Solo el dueño del torneo puede gestionar partidos.</p>
      </div>
    )
  }

  // Vista legacy (tabs) vs Vista unificada
  if (!useUnifiedView) {
    return (
      <div className="space-y-6">
        {/* Header con toggle para cambiar vista */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Gestión de Partidos</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Layout className="h-4 w-4 text-slate-600" />
              <span className="text-sm text-slate-600">Vista Clásica</span>
              <Switch
                checked={useUnifiedView}
                onCheckedChange={setUseUnifiedView}
              />
              <span className="text-sm text-slate-600">Vista Unificada</span>
              <LayoutGrid className="h-4 w-4 text-slate-600" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshTrigger(prev => prev + 1)}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          </div>
        </div>

        {/* Vista con tabs original */}
        <Tabs defaultValue="manage">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="manage" className="gap-2">
              <Trophy className="h-4 w-4" />
              Gestionar Partidos
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-2">
              <Plus className="h-4 w-4" />
              Crear Partidos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manage" className="mt-6">
            <ExistingMatchesSection
              tournamentId={tournamentId}
              isOwner={isOwner}
              isPublicView={false}
              refreshTrigger={refreshTrigger}
              onMatchUpdated={handleMatchUpdated}
            />
          </TabsContent>

          <TabsContent value="create" className="mt-6">
            <MatchCreationSection
              tournamentId={tournamentId}
              clubCourts={clubCourts}
              isOwner={isOwner}
              onMatchesCreated={handleMatchesCreated}
              refreshTrigger={refreshTrigger}
            />
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  // ✨ NUEVA VISTA UNIFICADA ✨
  return (
    <div className="space-y-6">
      {/* Header mejorado con actividad reciente */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Gestión Integral de Partidos</h2>
          {persistentState.recentActivity.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                ✨ {persistentState.recentActivity[0].description}
              </Badge>
              <span className="text-xs text-slate-500">
                hace {Math.round((Date.now() - persistentState.recentActivity[0].timestamp) / 1000 / 60)} min
              </span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Layout className="h-4 w-4 text-slate-600" />
            <span className="text-sm text-slate-600">Clásica</span>
            <Switch
              checked={useUnifiedView}
              onCheckedChange={setUseUnifiedView}
            />
            <span className="text-sm text-slate-600">Unificada</span>
            <LayoutGrid className="h-4 w-4 text-slate-600" />
          </div>
          {useUnifiedView && (
            <div className="flex items-center gap-2 border-l pl-3">
              <span className="text-sm text-slate-600">Creación:</span>
              <Switch
                checked={useEnhancedCreation}
                onCheckedChange={setUseEnhancedCreation}
                size="sm"
              />
              <span className="text-xs text-slate-500">
                {useEnhancedCreation ? 'Cola' : 'Básica'}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshTrigger(prev => prev + 1)}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Layout Grid Unificado */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Sección Izquierda: Creación de Partidos */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-emerald-600" />
                  Crear Nuevos Partidos
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('creation')}
                  className="gap-1"
                >
                  {collapsedSections.creation ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {collapsedSections.creation ? 'Mostrar' : 'Ocultar'}
                </Button>
              </div>
              <p className="text-sm text-slate-600">
                Arrastra parejas de las zonas para crear partidos. Los nuevos partidos aparecerán automáticamente en la tabla de gestión.
              </p>
            </CardHeader>
            {!collapsedSections.creation && (
              <CardContent className="pt-0">
                <div className="bg-slate-50 rounded-surface p-4">
                  {useEnhancedCreation ? (
                    <EnhancedMatchCreation
                      tournamentId={tournamentId}
                      clubCourts={clubCourts}
                      isOwner={isOwner}
                      onMatchesCreated={handleMatchesCreated}
                      onStagingChange={setStagingMatches}
                      refreshTrigger={refreshTrigger}
                    />
                  ) : (
                    <MatchCreationSection
                      tournamentId={tournamentId}
                      clubCourts={clubCourts}
                      isOwner={isOwner}
                      onMatchesCreated={handleMatchesCreated}
                      refreshTrigger={refreshTrigger}
                    />
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Sección Derecha: Gestión de Partidos */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-blue-600" />
                  Gestión y Resultados
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('management')}
                  className="gap-1"
                >
                  {collapsedSections.management ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {collapsedSections.management ? 'Mostrar' : 'Ocultar'}
                </Button>
              </div>
              <p className="text-sm text-slate-600">
                Todos los partidos del torneo. Click en los resultados para editarlos, incluso partidos ya finalizados.
              </p>
            </CardHeader>
            {!collapsedSections.management && (
              <CardContent className="pt-0">
                <div className="bg-slate-50 rounded-surface p-4 max-h-[800px] overflow-y-auto">
                  <ExistingMatchesSection
                    tournamentId={tournamentId}
                    isOwner={isOwner}
                    isPublicView={false}
                    refreshTrigger={refreshTrigger}
                    onMatchUpdated={handleMatchUpdated}
                  />
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      {/* Panel de Actividad y Estado */}
      {(persistentState.recentActivity.length > 0 || stagingMatches.length > 0) && (
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-slate-900">Estado del Sistema</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPersistentState(prev => ({ ...prev, recentActivity: [] }))}
                className="text-xs"
              >
                Limpiar Actividad
              </Button>
            </div>
            
            {/* Staging Status */}
            {useEnhancedCreation && stagingMatches.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 rounded-surface border border-amber-200">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-sm font-medium text-amber-800">
                    {stagingMatches.length} partido{stagingMatches.length !== 1 ? 's' : ''} en preparación
                  </span>
                </div>
                <div className="text-xs text-amber-600 mt-1">
                  {stagingMatches.filter(m => m.status === 'ready').length} listo{stagingMatches.filter(m => m.status === 'ready').length !== 1 ? 's' : ''} para crear
                </div>
              </div>
            )}

            {/* Recent Activity */}
            {persistentState.recentActivity.length > 0 && (
              <div className="mt-2 space-y-1">
                {persistentState.recentActivity.slice(0, 3).map((activity, index) => (
                  <div key={activity.matchId} className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full ${
                      activity.type === 'created' ? 'bg-green-500' : 'bg-blue-500'
                    }`} />
                    <span className="text-slate-600">{activity.description}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(activity.timestamp).toLocaleTimeString('es-ES', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}