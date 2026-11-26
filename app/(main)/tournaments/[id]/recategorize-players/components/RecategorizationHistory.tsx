'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/components/ui/use-toast'
import { 
  History, 
  ArrowRight, 
  Calendar, 
  User, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText
} from 'lucide-react'
import { getCategoryColor } from '@/lib/utils/category-colors'

interface RecategorizationRecord {
  id: string
  created_at: string
  player_id: string
  player_name: string
  old_category_name: string
  new_category_name: string
  old_score: number
  new_score: number
  recategorized_by: string
  recategorizer_name: string
  reason: string | null
  tournament_context: boolean
}

interface RecategorizationHistoryProps {
  tournamentId: string
  isVisible: boolean
  categories: Array<{ name: string; level: number | null; initial_score: number }>
}

export const RecategorizationHistory: React.FC<RecategorizationHistoryProps> = ({
  tournamentId,
  isVisible,
  categories
}) => {
  const { toast } = useToast()
  const [records, setRecords] = useState<RecategorizationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  
  const recordsPerPage = 10
  const totalPages = Math.ceil(total / recordsPerPage)

  useEffect(() => {
    if (isVisible) {
      fetchHistory()
    }
  }, [isVisible, currentPage, tournamentId])

  const fetchHistory = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const offset = (currentPage - 1) * recordsPerPage
      const response = await fetch(
        `/api/tournaments/${tournamentId}/recategorization-history?limit=${recordsPerPage}&offset=${offset}`
      )
      
      const data = await response.json()
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al cargar el historial')
      }
      
      setRecords(data.records || [])
      setTotal(data.total || 0)
      
    } catch (error) {
      console.error('Error fetching recategorization history:', error)
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
      setError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }


  const getScoreChangeIcon = (oldScore: number, newScore: number) => {
    if (newScore > oldScore) {
      return <TrendingUp className="h-3 w-3 text-green-600" />
    } else if (newScore < oldScore) {
      return <TrendingDown className="h-3 w-3 text-red-600" />
    }
    return null
  }

  if (!isVisible) return null

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600" />
            Historial de Recategorizaciones
            {total > 0 && (
              <Badge variant="secondary" className="ml-2">
                {total} registros
              </Badge>
            )}
          </CardTitle>
          
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHistory}
            disabled={loading}
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {error ? (
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={fetchHistory} variant="outline">
              Reintentar
            </Button>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium mb-2">Sin recategorizaciones</p>
            <p className="text-sm">No se han registrado recategorizaciones en este torneo aún.</p>
          </div>
        ) : (
          <>
            <ScrollArea className="h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Jugador</TableHead>
                    <TableHead>Cambio de Categoría</TableHead>
                    <TableHead>Cambio de Puntaje</TableHead>
                    <TableHead>Recategorizado por</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          {formatDate(record.created_at)}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="font-medium text-gray-900">
                          {record.player_name}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={getCategoryColor(record.old_category_name)}>
                            {record.old_category_name}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-gray-400" />
                          <Badge className={getCategoryColor(record.new_category_name)}>
                            {record.new_category_name}
                          </Badge>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            {record.old_score}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-gray-400" />
                          <Badge 
                            variant="outline" 
                            className={`font-mono ${
                              record.new_score > record.old_score 
                                ? 'bg-green-50 border-green-200 text-green-800' 
                                : record.new_score < record.old_score
                                ? 'bg-red-50 border-red-200 text-red-800'
                                : 'bg-gray-50 border-gray-200 text-gray-800'
                            }`}
                          >
                            {record.new_score}
                          </Badge>
                          {getScoreChangeIcon(record.old_score, record.new_score)}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <User className="h-3 w-3 text-gray-400" />
                          {record.recategorizer_name}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="text-sm text-gray-600 max-w-xs">
                          {record.reason || 'Sin motivo especificado'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            
            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-500">
                  Mostrando {((currentPage - 1) * recordsPerPage) + 1} - {Math.min(currentPage * recordsPerPage, total)} de {total} registros
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    <span className="text-sm">Página {currentPage} de {totalPages}</span>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || loading}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
