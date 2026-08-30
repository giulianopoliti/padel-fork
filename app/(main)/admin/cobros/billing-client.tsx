"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  Settings2,
  XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { useToast } from "@/components/ui/use-toast"
import {
  markTpeWeekPaid,
  setTournamentBillingStatus,
  setTournamentsBillingStatus,
  updateBillingSettings,
} from "@/app/api/admin/billing/actions"
import { addDaysToDateOnly } from "@/lib/billing/rules"
import type { BillingDashboardData, BillingItem, BillingStatus } from "@/lib/billing/types"

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount)

const formatDate = (date: string | null) => {
  if (!date) return "Sin fecha"
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date.includes("T") ? date : `${date}T12:00:00Z`))
}

const escapeCsvValue = (value: string | number) => {
  const serializedValue = String(value)
  return /[",\n\r]/.test(serializedValue)
    ? `"${serializedValue.replace(/"/g, '""')}"`
    : serializedValue
}

const statusLabels: Record<BillingStatus, string> = {
  PENDING: "Pendiente",
  PAID: "Cobrado",
  DISMISSED: "Descartado",
}

const getStatusBadge = (status: BillingStatus) => {
  if (status === "PAID") return <Badge className="bg-emerald-100 text-emerald-800">Cobrado</Badge>
  if (status === "DISMISSED") return <Badge variant="outline" className="text-slate-500">Descartado</Badge>
  return <Badge className="bg-amber-100 text-amber-800">Pendiente</Badge>
}

type Confirmation =
  | { kind: "settings" }
  | { kind: "week" }
  | { kind: "item"; item: BillingItem; status: BillingStatus }
  | { kind: "bulk"; items: BillingItem[]; status: "PAID" | "DISMISSED" }
  | null

export const BillingClient = ({ data }: { data: BillingDashboardData }) => {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [statusFilter, setStatusFilter] = useState<"ALL" | BillingStatus>("ALL")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTournamentIds, setSelectedTournamentIds] = useState<string[]>([])
  const [fvAmountUpTo16, setFvAmountUpTo16] = useState(String(data.settings.fvAmountUpTo16))
  const [fvAmountOver16, setFvAmountOver16] = useState(String(data.settings.fvAmountOver16))
  const [tpeAmountPerPlayer, setTpeAmountPerPlayer] = useState(
    String(data.settings.tpeAmountPerPlayer),
  )

  useEffect(() => {
    setFvAmountUpTo16(String(data.settings.fvAmountUpTo16))
    setFvAmountOver16(String(data.settings.fvAmountOver16))
    setTpeAmountPerPlayer(String(data.settings.tpeAmountPerPlayer))
  }, [data.settings])

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase("es")
    return data.items.filter((item) => {
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter
      const matchesSearch =
        !normalizedSearch || item.tournamentName.toLocaleLowerCase("es").includes(normalizedSearch)
      return matchesStatus && matchesSearch
    })
  }, [data.items, searchQuery, statusFilter])

  const summaries = useMemo(
    () =>
      (["PENDING", "PAID", "DISMISSED"] as const).map((status) => {
        const items = data.items.filter((item) => item.status === status)
        return {
          status,
          count: items.length,
          amount: items.reduce((total, item) => total + item.amountArs, 0),
        }
      }),
    [data.items],
  )

  const pendingWeekItems = data.items.filter((item) => item.status === "PENDING")

  const getWeekReportRows = () => [
    ["Torneo", "Club", "Fecha", "Jugadores", "Parejas", "Tarifa por jugador", "Importe", "Estado"],
    ...data.items.map((item) => [
      item.tournamentName,
      item.clubName,
      formatDate(item.startDate),
      item.billableUnits,
      item.billableUnits / 2,
      formatCurrency(item.unitAmountArs),
      formatCurrency(item.amountArs),
      statusLabels[item.status],
    ]),
  ]

  const handleDownloadCsv = () => {
    if (!data.weekStart || !data.weekEnd) return

    const rows = getWeekReportRows()
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsvValue).join(";")).join("\r\n")}`
    const downloadUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = downloadUrl
    link.download = `cobros-${data.weekStart}-${data.weekEnd}.csv`
    link.click()
    URL.revokeObjectURL(downloadUrl)
  }

  const handleDownloadPdf = async () => {
    if (!data.weekStart || !data.weekEnd) return

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ])
    const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
    const totalAmount = data.items.reduce((sum, item) => sum + item.amountArs, 0)
    const totalPlayers = data.items.reduce((sum, item) => sum + item.billableUnits, 0)

    document.setFontSize(18)
    document.text("Cobros semanales", 14, 16)
    document.setFontSize(10)
    document.setTextColor(75, 85, 99)
    document.text(`${data.tenantName} - ${formatDate(data.weekStart)} al ${formatDate(data.weekEnd)}`, 14, 23)
    document.text(
      `${data.items.length} torneos | ${totalPlayers} jugadores | ${totalPlayers / 2} parejas | Total: ${formatCurrency(totalAmount)}`,
      14,
      29,
    )

    const [head, ...body] = getWeekReportRows()
    autoTable(document, {
      head: [head.map(String)],
      body: body.map((row) => row.map(String)),
      startY: 35,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [15, 118, 110] },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 45 } },
      didDrawPage: () => {
        document.setFontSize(8)
        document.setTextColor(107, 114, 128)
        document.text(`Generado el ${formatDate(new Date().toISOString())}`, 14, 203)
      },
    })
    document.save(`cobros-${data.weekStart}-${data.weekEnd}.pdf`)
  }

  const selectedItems = useMemo(() => {
    const selectedSet = new Set(selectedTournamentIds)
    return data.items.filter((item) => selectedSet.has(item.tournamentId))
  }, [data.items, selectedTournamentIds])

  const selectedPendingItems = useMemo(
    () => selectedItems.filter((item) => item.status === "PENDING"),
    [selectedItems],
  )

  const pendingVisibleItems = useMemo(
    () => filteredItems.filter((item) => item.status === "PENDING"),
    [filteredItems],
  )

  const selectedVisibleCount = useMemo(() => {
    const selectedSet = new Set(selectedTournamentIds)
    return pendingVisibleItems.filter((item) => selectedSet.has(item.tournamentId)).length
  }, [pendingVisibleItems, selectedTournamentIds])

  const allVisibleSelected =
    pendingVisibleItems.length > 0 && selectedVisibleCount === pendingVisibleItems.length

  const hasSelection = selectedPendingItems.length > 0

  const selectedTotalAmount = selectedPendingItems.reduce((sum, item) => sum + item.amountArs, 0)

  useEffect(() => {
    const availableIds = new Set(data.items.map((item) => item.tournamentId))
    setSelectedTournamentIds((current) => current.filter((id) => availableIds.has(id)))
  }, [data.items])

  const handleNavigateWeek = (days: number) => {
    if (!data.weekStart) return
    router.push(`/admin/cobros?week=${addDaysToDateOnly(data.weekStart, days)}`)
  }

  const handleSaveSettings = () => {
    const values = [fvAmountUpTo16, fvAmountOver16, tpeAmountPerPlayer].map(Number)
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      toast({
        title: "Importes inválidos",
        description: "Ingresá valores enteros mayores o iguales a cero.",
        variant: "destructive",
      })
      return
    }
    setConfirmation({ kind: "settings" })
  }

  const handleToggleItemSelection = (tournamentId: string) => {
    setSelectedTournamentIds((current) => {
      if (current.includes(tournamentId)) {
        return current.filter((id) => id !== tournamentId)
      }
      return [...current, tournamentId]
    })
  }

  const handleToggleSelectAllVisible = (checked: boolean) => {
    if (!checked) {
      const visibleIds = new Set(pendingVisibleItems.map((item) => item.tournamentId))
      setSelectedTournamentIds((current) => current.filter((id) => !visibleIds.has(id)))
      return
    }

    setSelectedTournamentIds((current) => {
      const merged = new Set(current)
      for (const item of pendingVisibleItems) {
        merged.add(item.tournamentId)
      }
      return Array.from(merged)
    })
  }

  const handleSelectPendingVisible = () => {
    setSelectedTournamentIds((current) => {
      const merged = new Set(current)
      for (const item of pendingVisibleItems) {
        merged.add(item.tournamentId)
      }
      return Array.from(merged)
    })
  }

  const handleOpenBulkConfirmation = (status: "PAID" | "DISMISSED") => {
    if (selectedPendingItems.length === 0) return
    setConfirmation({ kind: "bulk", status, items: selectedPendingItems })
  }

  const executeConfirmation = () => {
    if (!confirmation) return
    const current = confirmation
    setConfirmation(null)

    startTransition(async () => {
      if (current.kind === "settings") {
        const result = await updateBillingSettings({
          fvAmountUpTo16: Number(fvAmountUpTo16),
          fvAmountOver16: Number(fvAmountOver16),
          tpeAmountPerPlayer: Number(tpeAmountPerPlayer),
        })
        if (!result.success) {
          toast({ title: "No se guardó la configuración", description: result.error, variant: "destructive" })
          return
        }
        toast({ title: "Tarifas actualizadas", description: "Los pendientes ya usan los nuevos importes." })
        router.refresh()
        return
      }

      if (current.kind === "week") {
        if (!data.weekStart) return
        const result = await markTpeWeekPaid(data.weekStart)
        if (!result.success) {
          toast({ title: "No se pudo cobrar la semana", description: result.error, variant: "destructive" })
          return
        }
        toast({ title: "Semana marcada como cobrada", description: `${result.updated} torneos actualizados.` })
        router.refresh()
        return
      }

      if (current.kind === "item") {
        const result = await setTournamentBillingStatus(current.item.tournamentId, current.status)
        if (!result.success) {
          toast({ title: "No se pudo actualizar", description: result.error, variant: "destructive" })
          return
        }
        toast({
          title: `Cobro ${statusLabels[current.status].toLocaleLowerCase("es")}`,
          description: current.item.tournamentName,
        })
        router.refresh()
        return
      }

      const result = await setTournamentsBillingStatus({
        tournamentIds: current.items.map((item) => item.tournamentId),
        requestedStatus: current.status,
      })
      if (!result.success) {
        toast({ title: "No se pudo actualizar en lote", description: result.error, variant: "destructive" })
        return
      }

      toast({
        title: `Cobros ${statusLabels[current.status].toLocaleLowerCase("es")}`,
        description: `${result.updated} torneos actualizados.`,
      })
      setSelectedTournamentIds([])
      router.refresh()
      return
    })
  }

  const confirmationCopy = (() => {
    if (!confirmation) return { title: "", description: "", confirmText: "Confirmar", destructive: false }
    if (confirmation.kind === "settings") {
      return {
        title: "Actualizar tarifas",
        description: "Los nuevos importes se aplicarán inmediatamente a cobros pendientes y futuros. Los cerrados conservarán su valor.",
        confirmText: "Guardar tarifas",
        destructive: false,
      }
    }
    if (confirmation.kind === "week") {
      const total = pendingWeekItems.reduce((sum, item) => sum + item.amountArs, 0)
      return {
        title: "Marcar semana como cobrada",
        description: `Se marcarán ${pendingWeekItems.length} torneos pendientes por un total de ${formatCurrency(total)}.`,
        confirmText: "Marcar semana",
        destructive: false,
      }
    }
    if (confirmation.kind === "bulk") {
      const total = confirmation.items.reduce((sum, item) => sum + item.amountArs, 0)
      return {
        title:
          confirmation.status === "PAID"
            ? "Marcar seleccionados como cobrados"
            : confirmation.status === "DISMISSED"
              ? "Descartar seleccionados"
              : "Reabrir seleccionados",
        description: `Se actualizarán ${confirmation.items.length} torneos por ${formatCurrency(total)} en total.`,
        confirmText: statusLabels[confirmation.status],
        destructive: confirmation.status === "DISMISSED",
      }
    }
    return {
      title:
        confirmation.status === "PAID"
          ? "Marcar como cobrado"
          : confirmation.status === "DISMISSED"
            ? "Descartar cobro"
            : "Volver a pendiente",
      description: `${confirmation.item.tournamentName}: ${formatCurrency(confirmation.item.amountArs)}.`,
      confirmText: statusLabels[confirmation.status],
      destructive: confirmation.status === "DISMISSED",
    }
  })()

  const renderActions = (item: BillingItem) => {
    if (item.status !== "PENDING") {
      return (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => setConfirmation({ kind: "item", item, status: "PENDING" })}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reabrir
        </Button>
      )
    }

    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={isPending}
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setConfirmation({ kind: "item", item, status: "PAID" })}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Cobrado
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => setConfirmation({ kind: "item", item, status: "DISMISSED" })}
        >
          <XCircle className="mr-2 h-4 w-4" />
          Descartar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900">
          <ReceiptText className="h-8 w-8" />
          Cobros
        </h1>
        <p className="mt-2 text-slate-600">
          Seguimiento de cobros de {data.tenantName}. Los importes están expresados en pesos argentinos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Configuración de cobros
          </CardTitle>
          <CardDescription>
            Los cambios afectan pendientes y futuros; los cobros cerrados conservan su importe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {data.billingModel === "FV_LEAGUE" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fv-up-to-16">Hasta 16 parejas</Label>
                  <Input
                    id="fv-up-to-16"
                    type="number"
                    min={0}
                    step={1}
                    value={fvAmountUpTo16}
                    onChange={(event) => setFvAmountUpTo16(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fv-over-16">Más de 16 parejas</Label>
                  <Input
                    id="fv-over-16"
                    type="number"
                    min={0}
                    step={1}
                    value={fvAmountOver16}
                    onChange={(event) => setFvAmountOver16(event.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="tpe-per-player">Precio por jugador</Label>
                <Input
                  id="tpe-per-player"
                  type="number"
                  min={0}
                  step={1}
                  value={tpeAmountPerPlayer}
                  onChange={(event) => setTpeAmountPerPlayer(event.target.value)}
                />
              </div>
            )}
            <div className="flex items-end">
              <Button onClick={handleSaveSettings} disabled={isPending} className="w-full md:w-auto">
                <Save className="mr-2 h-4 w-4" />
                Guardar tarifas
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {data.billingModel === "TPE_PLAYER" && data.weekStart && data.weekEnd && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => handleNavigateWeek(-7)} aria-label="Semana anterior">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 text-center">
                <p className="flex items-center justify-center gap-2 font-semibold text-slate-900">
                  <CalendarDays className="h-4 w-4" />
                  {formatDate(data.weekStart)} — {formatDate(data.weekEnd)}
                </p>
                <p className="text-xs text-slate-500">Lunes a domingo · horario de Argentina</p>
              </div>
              <Button variant="outline" size="icon" onClick={() => handleNavigateWeek(7)} aria-label="Semana siguiente">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <Button
              disabled={isPending || pendingWeekItems.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setConfirmation({ kind: "week" })}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Marcar semana como cobrada
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button disabled={data.items.length === 0} onClick={handleDownloadPdf}>
                <Download className="mr-2 h-4 w-4" />
                Descargar PDF
              </Button>
              <Button variant="outline" disabled={data.items.length === 0} onClick={handleDownloadCsv}>
                <Download className="mr-2 h-4 w-4" />
                Descargar CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {summaries.map((summary) => {
          const Icon = summary.status === "PENDING" ? Clock3 : summary.status === "PAID" ? CheckCircle2 : XCircle
          return (
            <Card key={summary.status}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="text-sm text-slate-500">{statusLabels[summary.status]}</p>
                  <p className="text-2xl font-bold text-slate-900">{formatCurrency(summary.amount)}</p>
                  <p className="text-xs text-slate-500">{summary.count} torneos</p>
                </div>
                <Icon className="h-8 w-8 text-slate-400" />
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-10"
              placeholder="Buscar torneo..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "ALL" | BillingStatus)}>
            <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              <SelectItem value="PENDING">Pendientes</SelectItem>
              <SelectItem value="PAID">Cobrados</SelectItem>
              <SelectItem value="DISMISSED">Descartados</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium text-slate-900">{selectedPendingItems.length} pendientes seleccionados</p>
            <p className="text-sm text-slate-500">Total pendiente seleccionado: {formatCurrency(selectedTotalAmount)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || pendingVisibleItems.length === 0}
              onClick={handleSelectPendingVisible}
            >
              Seleccionar pendientes visibles
            </Button>
            <Button
              size="sm"
              disabled={isPending || !hasSelection}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleOpenBulkConfirmation("PAID")}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Marcar cobrados
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || !hasSelection}
              onClick={() => handleOpenBulkConfirmation("DISMISSED")}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Marcar descartados
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending || !hasSelection}
              onClick={() => setSelectedTournamentIds([])}
            >
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>{data.billingModel === "FV_LEAGUE" ? "Ligas facturables" : "Torneos de la semana"}</CardTitle>
          <CardDescription>{filteredItems.length} resultados</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-600">
                <th className="px-3 py-3 font-medium">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) => handleToggleSelectAllVisible(checked === true)}
                    aria-label="Seleccionar todos los pendientes visibles"
                  />
                </th>
                <th className="px-3 py-3 font-medium">Torneo</th>
                <th className="px-3 py-3 font-medium">Fecha</th>
                {data.billingModel === "FV_LEAGUE" ? (
                  <th className="px-3 py-3 font-medium">Parejas</th>
                ) : (
                  <>
                    <th className="px-3 py-3 font-medium">Jugadores</th>
                    <th className="px-3 py-3 font-medium">Parejas</th>
                  </>
                )}
                <th className="px-3 py-3 font-medium">Tarifa</th>
                <th className="px-3 py-3 font-medium">Importe</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-3 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.tournamentId} className="border-b align-top hover:bg-slate-50">
                  <td className="px-3 py-4">
                    {item.status === "PENDING" ? (
                      <Checkbox
                        checked={selectedTournamentIds.includes(item.tournamentId)}
                        onCheckedChange={() => handleToggleItemSelection(item.tournamentId)}
                        aria-label={`Seleccionar ${item.tournamentName}`}
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-4">
                    <p className="font-medium text-slate-900">{item.tournamentName}</p>
                    <p className="text-xs text-slate-500">{item.clubName}</p>
                    <p className="text-xs text-slate-500">{item.tournamentStatus}</p>
                    {!item.isEligible && <p className="text-xs text-amber-700">Registro histórico</p>}
                  </td>
                  <td className="px-3 py-4">{formatDate(item.startDate)}</td>
                  <td className="px-3 py-4 font-medium">{item.billableUnits}</td>
                  {data.billingModel === "TPE_PLAYER" && (
                    <td className="px-3 py-4 font-medium">{item.billableUnits / 2}</td>
                  )}
                  <td className="px-3 py-4">
                    {data.billingModel === "FV_LEAGUE"
                      ? item.pricingRule === "FV_UP_TO_16" ? "Hasta 16" : "Más de 16"
                      : `${formatCurrency(item.unitAmountArs)} c/u`}
                  </td>
                  <td className="px-3 py-4 font-semibold">{formatCurrency(item.amountArs)}</td>
                  <td className="px-3 py-4">{getStatusBadge(item.status)}</td>
                  <td className="px-3 py-4">{renderActions(item)}</td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr><td colSpan={data.billingModel === "TPE_PLAYER" ? 9 : 8} className="py-10 text-center text-slate-500">No hay cobros para estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="space-y-4 md:hidden">
        {filteredItems.map((item) => (
          <Card key={item.tournamentId}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{item.tournamentName}</CardTitle>
                  <CardDescription>{item.clubName} · {formatDate(item.startDate)}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(item.status)}
                  {item.status === "PENDING" ? (
                    <Checkbox
                      checked={selectedTournamentIds.includes(item.tournamentId)}
                      onCheckedChange={() => handleToggleItemSelection(item.tournamentId)}
                      aria-label={`Seleccionar ${item.tournamentName}`}
                    />
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{data.billingModel === "TPE_PLAYER" ? "Jugadores" : "Parejas"}</span>
                <span>{item.billableUnits}</span>
              </div>
              {data.billingModel === "TPE_PLAYER" && (
                <div className="flex justify-between"><span className="text-slate-500">Parejas</span><span>{item.billableUnits / 2}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">Tarifa</span><span>{formatCurrency(item.unitAmountArs)}</span></div>
              <div className="flex justify-between border-t pt-3 text-base font-semibold"><span>Total</span><span>{formatCurrency(item.amountArs)}</span></div>
              {!item.isEligible && <p className="text-xs text-amber-700">Este es un registro histórico.</p>}
              <div className="pt-2">{renderActions(item)}</div>
            </CardContent>
          </Card>
        ))}
        {filteredItems.length === 0 && (
          <Card><CardContent className="py-10 text-center text-slate-500">No hay cobros para estos filtros.</CardContent></Card>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmation !== null}
        onClose={() => setConfirmation(null)}
        onConfirm={executeConfirmation}
        title={confirmationCopy.title}
        description={confirmationCopy.description}
        confirmText={confirmationCopy.confirmText}
        isDestructive={confirmationCopy.destructive}
      />
    </div>
  )
}
