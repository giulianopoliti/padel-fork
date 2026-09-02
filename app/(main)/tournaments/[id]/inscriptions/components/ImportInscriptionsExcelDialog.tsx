"use client"

import { useMemo, useState } from "react"
import { FileSpreadsheet, Loader2, Upload, CheckCircle2, AlertCircle, Download } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"

interface IdentityCandidate {
  id: string
  first_name: string | null
  last_name: string | null
  dni: string | null
  matchedBy: "dni" | "name"
  confidence: number
  score?: number | null
  category_name?: string | null
  alreadyInscribed?: boolean
  inscriptionLabel?: string | null
}

interface PreviewPlayer {
  fullName: string
  firstName: string
  lastName: string
  dni: string | null
  gender: "MALE" | "FEMALE"
  warnings: string[]
  candidates: IdentityCandidate[]
  primaryCandidate: IdentityCandidate | null
  hasStrongMatch: boolean
}

interface PreviewRow {
  id: string
  rowNumber: number
  player1: PreviewPlayer | null
  player2: PreviewPlayer | null
  rowType: "couple" | "individual" | "empty" | "invalid"
  warnings: string[]
}

interface PlayerDecision {
  action: "use" | "create" | "skip"
  playerId?: string
}

interface ImportResult {
  summary: {
    total: number
    couples: number
    individuals: number
    errors: number
    skipped: number
    createdPlayers: number
  }
  results: Array<{
    rowId: string
    rowNumber: number
    status: "success" | "error" | "skipped"
    type: "couple" | "individual"
    message: string
  }>
}

interface ImportInscriptionsExcelDialogProps {
  tournamentId: string
  disabled?: boolean
  onImported: () => Promise<void> | void
}

const getDecisionKey = (rowId: string, slot: "player1" | "player2") => `${rowId}:${slot}`

const formatCandidateName = (candidate: IdentityCandidate) =>
  `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || "Jugador"

const getInitialDecision = (player: PreviewPlayer | null): PlayerDecision | undefined => {
  if (!player) return undefined

  if (player.primaryCandidate && player.hasStrongMatch) {
    return { action: "use", playerId: player.primaryCandidate.id }
  }

  return { action: "create" }
}

export default function ImportInscriptionsExcelDialog({
  tournamentId,
  disabled = false,
  onImported,
}: ImportInscriptionsExcelDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheetName, setSelectedSheetName] = useState<string>("")
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [decisions, setDecisions] = useState<Record<string, PlayerDecision>>({})
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const stats = useMemo(() => {
    const couples = rows.filter((row) => row.player1 && row.player2).length
    const individuals = rows.filter((row) => (row.player1 || row.player2) && !(row.player1 && row.player2)).length
    const candidates = rows.reduce((total, row) => {
      return total + (row.player1?.candidates.length ? 1 : 0) + (row.player2?.candidates.length ? 1 : 0)
    }, 0)
    const alreadyInscribedRows = rows.filter((row) => {
      return row.player1?.candidates.some((candidate) => candidate.alreadyInscribed) ||
        row.player2?.candidates.some((candidate) => candidate.alreadyInscribed)
    }).length

    return { couples, individuals, candidates, alreadyInscribedRows }
  }, [rows])

  const resetState = () => {
    setFile(null)
    setSheetNames([])
    setSelectedSheetName("")
    setRows([])
    setDecisions({})
    setImportResult(null)
  }

  const buildDecisions = (previewRows: PreviewRow[]) => {
    const nextDecisions: Record<string, PlayerDecision> = {}

    for (const row of previewRows) {
      const player1Decision = getInitialDecision(row.player1)
      const player2Decision = getInitialDecision(row.player2)

      if (player1Decision) nextDecisions[getDecisionKey(row.id, "player1")] = player1Decision
      if (player2Decision) nextDecisions[getDecisionKey(row.id, "player2")] = player2Decision
    }

    setDecisions(nextDecisions)
  }

  const handlePreview = async (nextFile: File, sheetName?: string) => {
    setIsPreviewing(true)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append("file", nextFile)
      if (sheetName) formData.append("sheetName", sheetName)

      const response = await fetch(`/api/tournaments/${tournamentId}/inscriptions/import/preview`, {
        method: "POST",
        body: formData,
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo leer el Excel")
      }

      setSheetNames(payload.sheetNames || [])
      setSelectedSheetName(payload.selectedSheetName || "")
      setRows(payload.rows || [])
      buildDecisions(payload.rows || [])
    } catch (error) {
      toast({
        title: "Error al leer el Excel",
        description: error instanceof Error ? error.message : "No se pudo procesar el archivo.",
        variant: "destructive",
      })
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null
    setFile(nextFile)
    setRows([])
    setImportResult(null)

    if (nextFile) {
      await handlePreview(nextFile)
    }
  }

  const handleSheetChange = async (sheetName: string) => {
    setSelectedSheetName(sheetName)
    if (file) {
      await handlePreview(file, sheetName)
    }
  }

  const updateDecision = (rowId: string, slot: "player1" | "player2", decision: PlayerDecision) => {
    setDecisions((current) => ({
      ...current,
      [getDecisionKey(rowId, slot)]: decision,
    }))
  }

  const getSelectedCandidate = (row: PreviewRow, slot: "player1" | "player2") => {
    const player = row[slot]
    const decision = decisions[getDecisionKey(row.id, slot)]

    if (!player || decision?.action !== "use" || !decision.playerId) {
      return null
    }

    return player.candidates.find((candidate) => candidate.id === decision.playerId) || null
  }

  const rowWillBeSkipped = (row: PreviewRow) => {
    return !!(
      getSelectedCandidate(row, "player1")?.alreadyInscribed ||
      getSelectedCandidate(row, "player2")?.alreadyInscribed
    )
  }

  const handleCommit = async () => {
    setIsCommitting(true)

    try {
      const rowsWithDecisions = rows.map((row) => ({
        ...row,
        decisions: {
          player1: decisions[getDecisionKey(row.id, "player1")],
          player2: decisions[getDecisionKey(row.id, "player2")],
        },
      }))

      const response = await fetch(`/api/tournaments/${tournamentId}/inscriptions/import/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsWithDecisions }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo importar el Excel")
      }

      setImportResult(payload)
      await onImported()

      toast({
        title: "Importacion finalizada",
        description: `${payload.summary.couples} parejas y ${payload.summary.individuals} jugadores sueltos importados.`,
      })
      setOpen(false)
    } catch (error) {
      toast({
        title: "Error al importar",
        description: error instanceof Error ? error.message : "No se pudo completar la importacion.",
        variant: "destructive",
      })
    } finally {
      setIsCommitting(false)
    }
  }

  const renderPlayerDecision = (row: PreviewRow, player: PreviewPlayer | null, slot: "player1" | "player2") => {
    if (!player) {
      return <span className="text-xs text-slate-400">Sin jugador</span>
    }

    const decision = decisions[getDecisionKey(row.id, slot)] || { action: "create" }
    const candidate = player.primaryCandidate
    const selectedDecisionValue = decision.action === "use" && decision.playerId
      ? `use:${decision.playerId}`
      : decision.action

    const handleDecisionChange = (value: string) => {
      if (value.startsWith("use:")) {
        updateDecision(row.id, slot, { action: "use", playerId: value.replace("use:", "") })
        return
      }

      updateDecision(row.id, slot, { action: "create" })
    }

    return (
      <div className="space-y-2">
        <div>
          <p className="font-medium text-slate-900">{player.fullName}</p>
          <p className="text-xs text-slate-500">
            {player.firstName} / {player.lastName || "Sin apellido"} - DNI {player.dni || "sin DNI"}
          </p>
        </div>

        {player.warnings.length > 0 && (
          <p className="text-xs text-amber-700">{player.warnings.join(" ")}</p>
        )}

        {candidate ? (
          <div className="rounded-control border border-slate-200 bg-slate-50 p-2">
            <p className="text-xs font-medium text-slate-700">
              Posibles coincidencias:
            </p>
            <Select value={selectedDecisionValue} onValueChange={handleDecisionChange} disabled={isCommitting}>
              <SelectTrigger className="mt-2 bg-white">
                <SelectValue placeholder="Elegir accion" />
              </SelectTrigger>
              <SelectContent>
                {player.candidates.map((candidateOption) => (
                  <SelectItem key={candidateOption.id} value={`use:${candidateOption.id}`}>
                    Si, usar {formatCandidateName(candidateOption)} - DNI {candidateOption.dni || "-"}
                    {candidateOption.alreadyInscribed ? " - ya inscripto, se omitira" : ""}
                  </SelectItem>
                ))}
                <SelectItem value="create">No, crear jugador nuevo</SelectItem>
              </SelectContent>
            </Select>
            {decision.action === "use" && decision.playerId && getSelectedCandidate(row, slot)?.alreadyInscribed && (
              <div className="mt-2 rounded-control border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                {getSelectedCandidate(row, slot)?.inscriptionLabel || "Ya inscripto"}.
                Esta fila no se volvera a inscribir si confirmas usando este jugador.
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Match principal por {candidate.matchedBy === "dni" ? "DNI" : "nombre"}.
            </p>
          </div>
        ) : (
          <Badge variant="secondary">Crear jugador nuevo</Badge>
        )}
      </div>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) resetState()
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Importar Excel
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-6xl">
        <DialogHeader>
          <DialogTitle>Importar inscripciones desde Excel</DialogTitle>
          <DialogDescription>
            Subi el archivo, elegi la hoja/categoria y confirma si los jugadores encontrados son los mismos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-control border border-blue-200 bg-blue-50 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1 text-sm text-blue-950">
                <p className="font-medium">Formato esperado</p>
                <p>Cada hoja equivale a un torneo/categoria. Usar columnas A-D:</p>
                <p className="text-xs text-blue-800">
                  Nombre y Apellido | DNI | Nombre y Apellido | DNI. Si falta el jugador 2, dejar las ultimas dos columnas vacias.
                </p>
              </div>
              <Button asChild type="button" variant="outline" className="shrink-0 gap-2 border-blue-300 bg-white text-blue-900 hover:bg-blue-100">
                <a href="/templates/modelo-inscripciones-torneo.xlsx" download>
                  <Download className="h-4 w-4" />
                  Descargar modelo
                </a>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <Input type="file" accept=".xlsx,.xls" onChange={handleFileChange} disabled={isPreviewing || isCommitting} />

            <Select value={selectedSheetName} onValueChange={handleSheetChange} disabled={!file || isPreviewing || isCommitting}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar hoja" />
              </SelectTrigger>
              <SelectContent>
                {sheetNames.map((sheetName) => (
                  <SelectItem key={sheetName} value={sheetName}>
                    {sheetName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isPreviewing && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Leyendo Excel</AlertTitle>
              <AlertDescription>Estamos detectando parejas y buscando jugadores existentes.</AlertDescription>
            </Alert>
          )}

          {rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{rows.length} filas</Badge>
              <Badge variant="outline">{stats.couples} parejas</Badge>
              <Badge variant="outline">{stats.individuals} jugadores sueltos</Badge>
              <Badge variant="outline">{stats.candidates} posibles matches</Badge>
              {stats.alreadyInscribedRows > 0 && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                  {stats.alreadyInscribedRows} ya inscriptos
                </Badge>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <ScrollArea className="h-[48vh] rounded-control border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Fila</TableHead>
                    <TableHead>Jugador 1</TableHead>
                    <TableHead>Jugador 2</TableHead>
                    <TableHead className="w-48">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.rowNumber}</TableCell>
                      <TableCell>{renderPlayerDecision(row, row.player1, "player1")}</TableCell>
                      <TableCell>{renderPlayerDecision(row, row.player2, "player2")}</TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <Badge variant={row.player1 && row.player2 ? "default" : "secondary"}>
                            {row.player1 && row.player2 ? "Pareja" : "Jugador suelto"}
                          </Badge>
                          {rowWillBeSkipped(row) && (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                              Ya inscripto: se omitira
                            </Badge>
                          )}
                          {row.warnings.length > 0 && (
                            <p className="text-xs text-amber-700">{row.warnings.join(" ")}</p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          {importResult && (
            <Alert variant={importResult.summary.errors ? "destructive" : "default"}>
              {importResult.summary.errors ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              <AlertTitle>Resultado de importacion</AlertTitle>
              <AlertDescription>
                {importResult.summary.couples} parejas, {importResult.summary.individuals} jugadores sueltos,
                {" "}{importResult.summary.createdPlayers} jugadores creados y {importResult.summary.errors} errores.
              </AlertDescription>
            </Alert>
          )}

          {importResult?.summary.errors ? (
            <ScrollArea className="max-h-32 rounded-control border p-3">
              <div className="space-y-2">
                {importResult.results.filter((result) => result.status === "error").map((result) => (
                  <p key={result.rowId} className="text-sm text-red-700">
                    Fila {result.rowNumber}: {result.message}
                  </p>
                ))}
              </div>
            </ScrollArea>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isCommitting}>
            Cerrar
          </Button>
          <Button type="button" onClick={handleCommit} disabled={rows.length === 0 || isPreviewing || isCommitting}>
            {isCommitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Confirmar importacion
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
