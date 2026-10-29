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
  Trash2,
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
  cancelBillingCollection,
  createBillingCollection,
  issueBillingInstallment,
  registerBillingInstallmentPayment,
  setTournamentBillingStatus,
  setTournamentsBillingStatus,
  updateBillingSettings,
} from "@/app/api/admin/billing/actions"
import { addDaysToDateOnly, buildBillingInstallments } from "@/lib/billing/rules"
import { addBillingMonths, allocateCollection, canSelectBillingItem, formatBillingMonth, isBillingMonth, matchesBillingStatus, summarizeBilling, type BillingStatusFilter } from "@/lib/billing/financials"
import { InstallmentMonthEditor } from "./installment-month-editor"
import { PaymentSummary } from "@/components/billing/payment-summary"
import { BILLING_WEEK_STATUS_LABELS, TPE_BILLING_PAYMENT_ALIAS } from "@/lib/billing/payment-details"
import type { BillingCollection, BillingDashboardData, BillingInstallment, BillingItem, BillingStatus } from "@/lib/billing/types"

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

const getItemStatusBadge = (item: BillingItem) => {
  if (item.financialStatus === "PARTIALLY_PAID") return (
    <div className="space-y-1">
      <Badge className="whitespace-nowrap bg-sky-100 text-sky-800">Cobro parcial · {Math.round(item.amountPaidArs / item.amountArs * 100)}%</Badge>
      <p className="text-xs text-slate-500">{item.paidInstallments} de {item.totalInstallments} cuotas cobradas</p>
    </div>
  )
  if (item.financialStatus === "PENDING" && item.billingModel === "FV_LEAGUE") return (
    <div className="space-y-1"><Badge className="bg-amber-100 text-amber-800">Sin cobrar</Badge>
      {item.collectionId && <p className="text-xs text-slate-500">En {item.totalInstallments} cuotas</p>}
    </div>
  )
  return getStatusBadge(item.financialStatus)
}

const formatTournamentStatus = (status: string) => {
  if (status === "BRACKET_PHASE") return "Fase de llaves"
  if (status === "ZONE_PHASE") return "Fase de zonas"
  return status.replaceAll("_", " ")
}

type Confirmation =
  | { kind: "settings" }
  | { kind: "week" }
  | { kind: "item"; item: BillingItem; status: BillingStatus }
  | { kind: "bulk"; items: BillingItem[]; status: "PAID" | "DISMISSED" }
  | { kind: "collection"; collection: BillingCollection }
  | null

export const BillingClient = ({ data, readOnly = false }: { data: BillingDashboardData; readOnly?: boolean }) => {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [statusFilter, setStatusFilter] = useState<BillingStatusFilter>("ALL")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTournamentIds, setSelectedTournamentIds] = useState<string[]>([])
  const [installmentCount, setInstallmentCount] = useState("2")
  const [firstMonth, setFirstMonth] = useState("")
  const [maintenanceAmountPerInstallment, setMaintenanceAmountPerInstallment] = useState("0")
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
      const matchesStatus = matchesBillingStatus(item, statusFilter)
      const matchesSearch =
        !normalizedSearch || `${item.tournamentName} ${item.clubName}`.toLocaleLowerCase("es").includes(normalizedSearch)
      return matchesStatus && matchesSearch
    })
  }, [data.items, searchQuery, statusFilter])

  const financialSummary = useMemo(() => summarizeBilling(data.items, data.collections), [data.items, data.collections])
  const summaries = useMemo(
    () =>
      (["PENDING", "PAID", "DISMISSED"] as const).map((status) => {
        const items = data.items.filter((item) => matchesBillingStatus(item, status))
        return {
          status,
          count: items.length,
          amount: status === "PENDING" ? financialSummary.pendingArs : status === "PAID" ? financialSummary.paidArs : financialSummary.dismissedArs,
        }
      }),
    [data.items, financialSummary],
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
    document.text(`Alias para transferencias: ${TPE_BILLING_PAYMENT_ALIAS}`, 14, 35)
    autoTable(document, {
      head: [head.map(String)],
      body: body.map((row) => row.map(String)),
      startY: 41,
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
    () => selectedItems.filter(canSelectBillingItem),
    [selectedItems],
  )

  const pendingVisibleItems = useMemo(
    () => filteredItems.filter(canSelectBillingItem),
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
  const parsedInstallmentCount = Number(installmentCount)
  const parsedMaintenanceAmount = Number(maintenanceAmountPerInstallment)
  const isCollectionConfigurationValid =
    Number.isInteger(parsedInstallmentCount) &&
    parsedInstallmentCount >= 1 &&
    parsedInstallmentCount <= 24 &&
    Number.isSafeInteger(parsedMaintenanceAmount) &&
    parsedMaintenanceAmount >= 0
  const monthlyPreview = useMemo(() => {
    if (!isCollectionConfigurationValid || !isBillingMonth(`${firstMonth}-01`)) return []
    try {
      return buildBillingInstallments(selectedTotalAmount, parsedInstallmentCount, parsedMaintenanceAmount)
        .map((installment, index) => ({ ...installment, month: addBillingMonths(`${firstMonth}-01`, index) }))
    } catch { return [] }
  }, [isCollectionConfigurationValid, firstMonth, selectedTotalAmount, parsedInstallmentCount, parsedMaintenanceAmount])
  const selectedMaintenanceTotal = isCollectionConfigurationValid
    ? parsedMaintenanceAmount * parsedInstallmentCount
    : 0
  const selectedCollectionTotal = selectedTotalAmount + selectedMaintenanceTotal
  const canCreateCollection =
    data.billingModel === "FV_LEAGUE" &&
    data.monthlyMaintenanceAvailable &&
    monthlyPreview.length > 0 &&
    monthlyPreview.every((installment) => installment.amountArs > 0) &&
    selectedPendingItems.length > 0 &&
    isCollectionConfigurationValid &&
    Number.isSafeInteger(selectedCollectionTotal) &&
    selectedCollectionTotal <= 2_000_000_000

  useEffect(() => {
    const availableIds = new Set(data.items.filter(canSelectBillingItem).map((item) => item.tournamentId))
    setSelectedTournamentIds((current) => current.filter((id) => availableIds.has(id)))
  }, [data.items])

  const handleNavigateWeek = (days: number) => {
    if (!data.weekStart) return
    router.push(`${readOnly ? "/cobros" : "/admin/cobros"}?week=${addDaysToDateOnly(data.weekStart, days)}`)
  }

  const handleCreateCollection = () => {
    const count = Number(installmentCount)
    const maintenanceAmount = Number(maintenanceAmountPerInstallment)
    if (!Number.isInteger(count) || count < 1 || count > 24) {
      toast({ title: "Cuotas inválidas", description: "Elegí entre 1 y 24 cuotas.", variant: "destructive" })
      return
    }
    if (!Number.isSafeInteger(maintenanceAmount) || maintenanceAmount < 0) {
      toast({
        title: "Mantenimiento inválido",
        description: "Ingresá un importe entero en pesos, o 0 para no agregarlo.",
        variant: "destructive",
      })
      return
    }
    if (!canCreateCollection) {
      toast({
        title: "No se puede crear el cobro",
        description: "Seleccioná torneos pendientes y revisá que el total sea válido.",
        variant: "destructive",
      })
      return
    }

    startTransition(async () => {
      const result = await createBillingCollection({
        tournamentIds: selectedPendingItems.map((item) => item.tournamentId),
        maintenanceAmountPerInstallmentArs: maintenanceAmount,
        firstMonth: `${firstMonth}-01`,
        installments: buildBillingInstallments(selectedTotalAmount, count, maintenanceAmount),
      })
      if (!result.success) {
        toast({ title: "No se creó el cobro", description: result.error, variant: "destructive" })
        return
      }
      toast({
        title: "Cobro creado",
        description: `${count} cuotas persistidas por ${formatCurrency(selectedCollectionTotal)}.`,
      })
      setSelectedTournamentIds([])
      setMaintenanceAmountPerInstallment("0")
      router.refresh()
    })
  }

  const handleDownloadInstallmentPdf = async (collection: BillingCollection, installment: BillingInstallment) => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ])
    const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
    const allocations = new Map(allocateCollection(collection).map((a) => [a.tournamentId, a]))
    const remainingBalance = Math.max(0, collection.balanceArs - (installment.status === "PAID" ? 0 : installment.amountArs))
    document.setFontSize(18)
    document.text(installment.status === "PAID" ? "Recibo de cuota cobrada" : "Cuota mensual a pagar", 14, 18)
    document.setFontSize(10)
    document.setTextColor(75, 85, 99)
    document.text(`Padel FV · Organizador: ${collection.organizerLabel}`, 14, 26)
    document.text(`Cobro #${collection.id.slice(0, 8).toUpperCase()}`, 14, 32)
    document.setTextColor(15, 23, 42)
    document.setFontSize(12)
    document.text(`Total del cobro: ${formatCurrency(collection.totalAmountArs)}`, 14, 43)
    document.text(`Subtotal de torneos: ${formatCurrency(collection.tournamentSubtotalArs)}`, 14, 51)
    document.text(
      `Parte de torneos en esta cuota: ${formatCurrency(installment.amountArs - installment.maintenanceAmountArs)}`,
      14,
      59,
    )
    document.text(
      `Mantenimiento: ${formatCurrency(installment.maintenanceAmountArs)} · ${formatBillingMonth(installment.billingMonth)}`,
      14,
      67,
    )
    document.text(
      `Cuota ${installment.installmentNumber} de ${collection.installments.length}: ${formatCurrency(installment.amountArs)}`,
      14,
      75,
    )
    document.text(installment.status === "PAID"
      ? `Cobrada el ${formatDate(installment.paidAt)} · Saldo actual: ${formatCurrency(collection.balanceArs)}`
      : `Saldo actual: ${formatCurrency(collection.balanceArs)} · Saldo si se abona: ${formatCurrency(remainingBalance)}`, 14, 83)
    autoTable(document, {
      head: [["Torneo", "Club", "Parejas", "Total torneo", "Parte en esta cuota", "Cobrado", "Saldo actual"]],
      body: collection.tournaments.map((tournament) => [
        tournament.tournamentName,
        tournament.clubName,
        tournament.billableUnits,
        formatCurrency(tournament.amountArs),
        formatCurrency(allocations.get(tournament.tournamentId)!.installments[installment.id]),
        formatCurrency(allocations.get(tournament.tournamentId)!.amountPaidArs),
        formatCurrency(allocations.get(tournament.tournamentId)!.balanceArs),
      ]),
      startY: 92,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [32, 51, 93] },
    })
    document.setFontSize(8)
    document.setTextColor(107, 114, 128)
    document.text(`Emitido el ${formatDate(new Date().toISOString())}`, 14, document.internal.pageSize.getHeight() - 10)
    document.save(`cobro-${collection.id.slice(0, 8)}-cuota-${installment.installmentNumber}.pdf`)
  }

  const handleIssueAndDownloadInstallment = (collection: BillingCollection, installment: BillingInstallment) => {
    startTransition(async () => {
      const result = await issueBillingInstallment({ installmentId: installment.id })
      if (!result.success) {
        toast({ title: "No se emitió la cuota", description: result.error, variant: "destructive" })
        return
      }
      await handleDownloadInstallmentPdf(collection, installment)
      toast({ title: "PDF emitido", description: `Cuota ${installment.installmentNumber} lista para enviar.` })
      router.refresh()
    })
  }

  const handleDownloadCollectionPdf = async (collection: BillingCollection) => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ])
    const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
    const allocations = new Map(allocateCollection(collection).map((a) => [a.tournamentId, a]))
    document.setFontSize(18)
    document.text("Cobro consolidado", 14, 18)
    document.setFontSize(10)
    document.setTextColor(75, 85, 99)
    document.text(`Padel FV · Organizador: ${collection.organizerLabel}`, 14, 26)
    document.text(`Subtotal de torneos: ${formatCurrency(collection.tournamentSubtotalArs)}`, 14, 33)
    document.text(
      `Mantenimiento mensual total: ${formatCurrency(collection.installments.reduce((sum, i) => sum + i.maintenanceAmountArs, 0))}`,
      14,
      39,
    )
    document.text(
      `Total: ${formatCurrency(collection.totalAmountArs)} · Cobrado: ${formatCurrency(collection.amountPaidArs)} · Saldo: ${formatCurrency(collection.balanceArs)}`,
      14,
      45,
    )
    let tournamentTableY = 52
    autoTable(document, {
      head: [["Cuota", "Mes facturado", "Torneos", "Mantenimiento", "Total", "Estado", "Fecha de pago"]],
      body: collection.installments.map((i) => [i.installmentNumber, formatBillingMonth(i.billingMonth),
        formatCurrency(i.amountArs - i.maintenanceAmountArs), formatCurrency(i.maintenanceAmountArs),
        formatCurrency(i.amountArs), i.status === "PAID" ? "Cobrada" : "Pendiente", i.paidAt ? formatDate(i.paidAt) : "—"]),
      startY: 52, styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [32, 51, 93] },
      didDrawPage: ({ cursor }) => { tournamentTableY = (cursor?.y || 52) + 10 },
    })
    autoTable(document, {
      head: [["Torneo", "Club", "Estado", "Parejas", "Total torneo", "Cobrado", "Saldo"]],
      body: collection.tournaments.map((tournament) => [
        tournament.tournamentName,
        tournament.clubName,
        formatTournamentStatus(tournament.tournamentStatus),
        tournament.billableUnits,
        formatCurrency(tournament.amountArs),
        formatCurrency(allocations.get(tournament.tournamentId)!.amountPaidArs),
        formatCurrency(allocations.get(tournament.tournamentId)!.balanceArs),
      ]),
      startY: tournamentTableY,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [32, 51, 93] },
    })
    document.save(`cobro-${collection.id.slice(0, 8)}-consolidado.pdf`)
  }

  const handleRegisterInstallmentPayment = (installment: BillingInstallment) => {
    startTransition(async () => {
      const result = await registerBillingInstallmentPayment({
        installmentId: installment.id,
        amountArs: installment.amountArs,
      })
      if (!result.success) {
        toast({ title: "No se registró el pago", description: result.error, variant: "destructive" })
        return
      }
      toast({ title: "Cuota cobrada", description: `${formatCurrency(installment.amountArs)} registrado.` })
      router.refresh()
    })
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

      if (current.kind === "collection") {
        const result = await cancelBillingCollection({ collectionId: current.collection.id })
        if (!result.success) {
          toast({ title: "No se pudo cancelar el cobro", description: result.error, variant: "destructive" })
          return
        }
        toast({
          title: "Cobro cancelado",
          description: `${result.releasedTournaments} torneos volvieron a quedar disponibles.`,
        })
        setSelectedTournamentIds([])
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
    if (confirmation.kind === "collection") {
      return {
        title: "Cancelar cobro en cuotas",
        description: `Se eliminarán este cobro, sus ${confirmation.collection.installments.length} cuotas y la asociación con ${confirmation.collection.tournaments.length} torneos. Los torneos volverán a quedar disponibles. Esta acción no se puede deshacer y será bloqueada si existe algún pago registrado.`,
        confirmText: "Cancelar cobro",
        destructive: true,
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
    if (item.collectionId) return (
      <Button variant="outline" size="sm" asChild>
        <a href={`#collection-${item.collectionId}`}>Ver cuotas</a>
      </Button>
    )
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

      {data.billingModel === "TPE_PLAYER" && <PaymentSummary weeks={data.pendingWeeks ?? []} basePath={readOnly ? "/cobros" : "/admin/cobros"} />}
      {readOnly && <Card><CardContent className="pt-6"><p className="text-sm text-slate-500">Precio vigente por jugador</p><p className="mt-1 text-2xl font-semibold text-slate-900">{formatCurrency(data.settings.tpeAmountPerPlayer)}</p><p className="mt-2 text-sm text-slate-500">Los cobros pendientes usan la tarifa vigente. Los cerrados conservan su importe.</p></CardContent></Card>}
      {!readOnly && <Card>
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
      </Card>}
      {data.billingModel === "TPE_PLAYER" && data.weekStart && data.weekEnd && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="flex w-full min-w-0 items-center gap-3 md:w-auto">
              <Button className="shrink-0" variant="outline" size="icon" onClick={() => handleNavigateWeek(-7)} aria-label="Semana anterior">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1 text-center md:min-w-72">
                <p className="flex items-center justify-center gap-2 font-semibold text-slate-900">
                  <CalendarDays className="h-4 w-4" />
                  {formatDate(data.weekStart)} — {formatDate(data.weekEnd)}
                </p>
                <p className="text-xs text-slate-500">Lunes a domingo · horario de Argentina</p>
                <label className="mt-3 block text-left text-xs font-medium text-slate-600" htmlFor="billing-week">Todas las semanas · pagadas y pendientes</label>
                <select id="billing-week" aria-label="Semana de cobros" value={data.weekStart}
                  onChange={(event) => router.push(`${readOnly ? "/cobros" : "/admin/cobros"}?week=${event.target.value}`)}
                  className="mt-1 h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
                  {!data.weeks?.some((week) => week.weekStart === data.weekStart) && <option value={data.weekStart}>{formatDate(data.weekStart)} al {formatDate(data.weekEnd)} · Sin torneos</option>}
                  {data.weeks?.map((week) => <option key={week.weekStart} value={week.weekStart}>
                    {formatDate(week.weekStart)} al {formatDate(week.weekEnd)} · {BILLING_WEEK_STATUS_LABELS[week.status]}
                  </option>)}
                </select>
              </div>
              <Button className="shrink-0" variant="outline" size="icon" onClick={() => handleNavigateWeek(7)} aria-label="Semana siguiente">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            {!readOnly && <Button
              disabled={isPending || pendingWeekItems.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setConfirmation({ kind: "week" })}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Marcar semana como cobrada
            </Button>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={data.items.length === 0} onClick={handleDownloadPdf}>
                <Download className="mr-2 h-4 w-4" />
                Descargar PDF
              </Button>
              {!readOnly && <Button variant="outline" disabled={data.items.length === 0} onClick={handleDownloadCsv}>
                <Download className="mr-2 h-4 w-4" />
                Descargar CSV
              </Button>}
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
                  <p className="text-xs text-slate-500">{summary.count} torneos{data.billingModel === "FV_LEAGUE" && summary.status === "PAID" ? " completos" : ""}</p>
                  {data.billingModel === "FV_LEAGUE" && summary.status === "PENDING" && (
                    <p className="mt-2 text-xs text-slate-600">
                      Torneos: {formatCurrency(financialSummary.tournamentPendingArs)}<br />
                      Mantenimiento: {formatCurrency(financialSummary.maintenancePendingArs)}
                    </p>
                  )}
                  {data.billingModel === "FV_LEAGUE" && summary.status === "PAID" && (
                    <p className="mt-2 text-xs text-slate-600">Incluye cuotas parciales y mantenimiento recibidos</p>
                  )}
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
              placeholder="Buscar torneo o club..."
              aria-label="Buscar torneo o club"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as BillingStatusFilter)}>
            <SelectTrigger aria-label="Filtrar por estado de cobro"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              <SelectItem value="PENDING">Pendientes de cobro</SelectItem>
              {data.billingModel === "FV_LEAGUE" && <>
                <SelectItem value="UNPAID">Sin pagos</SelectItem>
                <SelectItem value="PARTIALLY_PAID">Cobro parcial</SelectItem>
              </>}
              <SelectItem value="PAID">Cobrados</SelectItem>
              <SelectItem value="DISMISSED">Descartados</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!readOnly && <Card>
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
      </Card>}
      {!readOnly && data.billingModel === "FV_LEAGUE" && (
        <Card>
          <CardHeader>
            <CardTitle>Crear cobro en cuotas</CardTitle>
            <CardDescription>
              Una cuota por mes, con torneos y mantenimiento separados. El total se congela al crear el cobro.
            </CardDescription>
            {!data.monthlyMaintenanceAvailable && (
              <p className="text-sm text-amber-700" role="status">Los nuevos cobros mensuales estarán disponibles cuando se publique la actualización de la base de datos. Los saldos actuales ya reflejan las cuotas cobradas.</p>
            )}
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem_14rem_auto] md:items-end">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-500">Subtotal de torneos</p>
              <p className="text-xl font-semibold text-slate-900">{formatCurrency(selectedTotalAmount)}</p>
              <p className="mt-1 text-sm text-slate-500">
                Mantenimiento total: {formatCurrency(selectedMaintenanceTotal)}
              </p>
              <p className="text-2xl font-bold text-slate-900">
                Total: {formatCurrency(selectedCollectionTotal)}
              </p>
            </div>
            <div className="w-full space-y-2 md:w-40">
              <Label htmlFor="installment-count">Cantidad de cuotas</Label>
              <Input
                id="installment-count"
                type="number"
                min={1}
                max={24}
                step={1}
                value={installmentCount}
                onChange={(event) => setInstallmentCount(event.target.value)}
              />
            </div>
            <div className="w-full space-y-2">
              <Label htmlFor="maintenance-per-installment">Mantenimiento mensual (ARS)</Label>
              <Input
                id="maintenance-per-installment"
                type="number"
                min={0}
                max={2_000_000_000}
                step={1}
                inputMode="numeric"
                value={maintenanceAmountPerInstallment}
                onChange={(event) => setMaintenanceAmountPerInstallment(event.target.value)}
                placeholder="Importe mensual en pesos"
              />
              <p className="text-xs text-slate-500">Opcional. Ingresalo ya convertido a pesos.</p>
            </div>
            <Button disabled={isPending || !canCreateCollection} onClick={handleCreateCollection}>
              <ReceiptText className="mr-2 h-4 w-4" />
              Crear cobro
            </Button>
            <div className="space-y-2 md:col-span-full">
              <Label htmlFor="billing-first-month">Primer mes facturado</Label>
              <Input id="billing-first-month" type="month" min="2000-01" max="9998-12" className="w-full sm:w-56"
                value={firstMonth} onChange={(event) => setFirstMonth(event.target.value)} />
              <p className="text-xs text-slate-500">Cada cuota corresponde a un mes consecutivo. El mantenimiento de cada mes se factura una sola vez por cuenta.</p>
              {monthlyPreview.length > 0 && <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {monthlyPreview.map((i) => <li key={i.installmentNumber} className="rounded-md bg-slate-50 p-3">
                  <p className="font-medium">Cuota {i.installmentNumber} · {formatBillingMonth(i.month)}</p>
                  <p className="text-slate-600">Torneos {formatCurrency(i.amountArs - parsedMaintenanceAmount)} + mantenimiento {formatCurrency(parsedMaintenanceAmount)}</p>
                  <p className="font-semibold">Total {formatCurrency(i.amountArs)}</p>
                </li>)}
              </ul>}
            </div>
          </CardContent>
        </Card>
      )}

      {data.billingModel === "FV_LEAGUE" && data.collections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cobros en cuotas</CardTitle>
            <CardDescription>Cuotas mensuales con el detalle de torneos, mantenimiento y pagos recibidos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.collections.map((collection) => (
              <div key={collection.id} id={`collection-${collection.id}`} tabIndex={-1}
                className="scroll-mt-6 rounded-lg border p-4 focus:outline-none focus:ring-2 focus:ring-sky-500">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{collection.organizerLabel}</p>
                    <p className="text-xs text-slate-500">Cobro #{collection.id.slice(0, 8).toUpperCase()} · creado el {formatDate(collection.createdAt)}</p>
                    <p className="text-sm text-slate-500">{collection.tournaments.length} torneos · Total {formatCurrency(collection.totalAmountArs)}</p>
                  </div>
                  <Badge className={collection.status === "PAID" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                    {collection.status === "PAID" ? "Cobro completo" : collection.status === "PARTIALLY_PAID" ? "Pago parcial" : "Pendiente"}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <p><span className="text-slate-500">Torneos:</span> {formatCurrency(collection.tournamentSubtotalArs)}</p>
                  <p><span className="text-slate-500">Mantenimiento total:</span> {formatCurrency(collection.installments.reduce((sum, i) => sum + i.maintenanceAmountArs, 0))}</p>
                  <p><span className="text-slate-500">Total:</span> {formatCurrency(collection.totalAmountArs)}</p>
                  <p><span className="text-slate-500">Cobrado:</span> {formatCurrency(collection.amountPaidArs)}</p>
                  <p><span className="text-slate-500">Saldo:</span> {formatCurrency(collection.balanceArs)}</p>
                </div>
                <details className="mt-3 rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Ver {collection.tournaments.length} torneos incluidos por club</summary>
                  <div className="mt-3 space-y-3">
                    {Array.from(new Set(collection.tournaments.map((t) => t.clubName))).sort().map((club) => (
                      <div key={club}><p className="text-sm font-semibold">{club}</p>
                        <ul className="mt-1 space-y-1 text-sm text-slate-600">
                          {collection.tournaments.filter((t) => t.clubName === club).map((t) => <li key={t.tournamentId}>
                            {t.tournamentName} · {formatCurrency(t.amountArs)}
                          </li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleDownloadCollectionPdf(collection)}>
                    <Download className="mr-2 h-4 w-4" />
                    PDF consolidado
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending || collection.amountPaidArs > 0}
                    onClick={() => setConfirmation({ kind: "collection", collection })}
                    title={collection.amountPaidArs > 0 ? "No se puede cancelar un cobro con pagos registrados" : undefined}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Cancelar cobro
                  </Button>
                </div>
                <div className="mt-4 space-y-2">
                  {collection.installments.map((installment) => (
                    <div key={installment.id} className="flex flex-col gap-2 rounded-md bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">Cuota {installment.installmentNumber} de {collection.installments.length} — {formatCurrency(installment.amountArs)}</p>
                        <p className="text-sm font-medium text-slate-700">{formatBillingMonth(installment.billingMonth)}</p>
                        <p className="text-xs text-slate-500">Torneos: {formatCurrency(installment.amountArs - installment.maintenanceAmountArs)} · Mantenimiento: {formatCurrency(installment.maintenanceAmountArs)}</p>
                        <p className={installment.status === "PAID" ? "text-xs font-medium text-emerald-700" : "text-xs text-slate-500"}>
                          {installment.status === "PAID" ? `Cobrada el ${formatDate(installment.paidAt)}` : installment.status === "ISSUED" ? "Emitida · pendiente de cobro" : "Pendiente de emisión"}
                        </p>
                        {!installment.billingMonth && data.monthlyMaintenanceAvailable && <InstallmentMonthEditor installmentId={installment.id} />}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {installment.status === "PAID" && <Button size="sm" variant="outline" onClick={() => handleDownloadInstallmentPdf(collection, installment)}>
                          <Download className="mr-2 h-4 w-4" />Recibo PDF
                        </Button>}
                        {installment.status !== "PAID" && (
                          <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleIssueAndDownloadInstallment(collection, installment)}>
                            <Download className="mr-2 h-4 w-4" />
                            {installment.status === "ISSUED" ? "Reemitir PDF" : "Emitir PDF"}
                          </Button>
                        )}
                        {installment.status !== "PAID" && (
                          <Button size="sm" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleRegisterInstallmentPayment(installment)}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Registrar pago
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.billingModel === "FV_LEAGUE" && data.collections.some((c) => c.installments.some((i) => i.maintenanceAmountArs > 0)) && (
        <Card>
          <CardHeader><CardTitle>Mantenimiento mensual</CardTitle>
            <CardDescription>Estos importes ya están incluidos en las cuotas y en el resumen de cobros.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.collections.flatMap((c) => c.installments.filter((i) => i.maintenanceAmountArs > 0).map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-3 text-sm">
                <div><p className="font-medium">{formatBillingMonth(i.billingMonth)}</p>
                  <a href={`#collection-${c.id}`} className="text-xs text-sky-700 underline underline-offset-2">{c.organizerLabel} · Cobro #{c.id.slice(0, 8).toUpperCase()} · Cuota {i.installmentNumber}</a>
                </div>
                <div className="flex items-center gap-3"><span className="font-semibold">{formatCurrency(i.maintenanceAmountArs)}</span>
                  <Badge className={i.status === "PAID" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{i.status === "PAID" ? "Cobrado" : "Pendiente"}</Badge>
                </div>
              </div>
            )))}
          </CardContent>
        </Card>
      )}

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>{data.billingModel === "FV_LEAGUE" ? "Ligas facturables" : "Torneos de la semana"}</CardTitle>
          <CardDescription>{filteredItems.length} resultados</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-600">
                {!readOnly && <th className="px-3 py-3 font-medium">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) => handleToggleSelectAllVisible(checked === true)}
                    aria-label="Seleccionar todos los pendientes visibles"
                  />
                </th>}
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
                <th className="px-3 py-3 font-medium">{data.billingModel === "FV_LEAGUE" ? "Total / Cobrado / Saldo" : "Importe"}</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                {!readOnly && <th className="px-3 py-3 font-medium">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.tournamentId} className="border-b align-top hover:bg-slate-50">
                  {!readOnly && <td className="px-3 py-4">
                    {canSelectBillingItem(item) ? (
                      <Checkbox
                        checked={selectedTournamentIds.includes(item.tournamentId)}
                        onCheckedChange={() => handleToggleItemSelection(item.tournamentId)}
                        aria-label={`Seleccionar ${item.tournamentName}`}
                      />
                    ) : null}
                  </td>}
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
                  <td className="px-3 py-4 whitespace-nowrap">
                    <p className="font-semibold">{formatCurrency(item.amountArs)}</p>
                    {data.billingModel === "FV_LEAGUE" && <>
                      <p className="text-xs text-emerald-700">Cobrado: {formatCurrency(item.amountPaidArs)}</p>
                      <p className="text-xs font-medium text-slate-700">Saldo: {formatCurrency(item.balanceArs)}</p>
                    </>}
                  </td>
                  <td className="px-3 py-4">{getItemStatusBadge(item)}</td>
                  {!readOnly && <td className="px-3 py-4">{renderActions(item)}</td>}
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr><td colSpan={(data.billingModel === "TPE_PLAYER" ? 9 : 8) - (readOnly ? 2 : 0)} className="py-10 text-center text-slate-500">No hay cobros para estos filtros.</td></tr>
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
                  {getItemStatusBadge(item)}
                  {!readOnly && canSelectBillingItem(item) ? (
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
              {data.billingModel === "FV_LEAGUE" && <>
                <div className="flex justify-between text-emerald-700"><span>Cobrado</span><span>{formatCurrency(item.amountPaidArs)}</span></div>
                <div className="flex justify-between font-semibold"><span>Saldo pendiente</span><span>{formatCurrency(item.balanceArs)}</span></div>
              </>}
              {!item.isEligible && <p className="text-xs text-amber-700">Este es un registro histórico.</p>}
              {!readOnly && <div className="pt-2">{renderActions(item)}</div>}
            </CardContent>
          </Card>
        ))}
        {filteredItems.length === 0 && (
          <Card><CardContent className="py-10 text-center text-slate-500">No hay cobros para estos filtros.</CardContent></Card>
        )}
      </div>

      {!readOnly && <ConfirmDialog
        isOpen={confirmation !== null}
        onClose={() => setConfirmation(null)}
        onConfirm={executeConfirmation}
        title={confirmationCopy.title}
        description={confirmationCopy.description}
        confirmText={confirmationCopy.confirmText}
        isDestructive={confirmationCopy.destructive}
      />}
    </div>
  )
}
