"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Archive, Calendar, Plus, Search, Settings, Trophy } from "lucide-react"
import { useUser } from "@/contexts/user-context"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import TournamentFilters from "./tournament-filters"
import { getTenantBranding } from "@/config/tenant"
import { toast } from "@/components/ui/use-toast"

interface TournamentsLayoutProps {
  children: React.ReactNode
  title: string
  description: string
  currentType: "LONG" | "AMERICAN"
  categories: Array<{ name: string }>
  clubs: Array<{ id: string; name: string }>
}

export default function TournamentsLayout({
  children,
  title,
  description,
  currentType,
  categories,
  clubs,
}: TournamentsLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userDetails } = useUser()
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "")
  const branding = getTenantBranding()
  const isElite = branding.key === "padel-elite"
  const defaultType = branding.tournaments.defaultPublicType

  const buildQueryString = (params: URLSearchParams) => {
    if (params.get("type") === defaultType) {
      params.delete("type")
    }

    return params.toString()
  }

  useEffect(() => {
    setSearchTerm(searchParams.get("search") || "")
  }, [searchParams])

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    const params = new URLSearchParams(searchParams.toString())

    if (value) {
      params.set("search", value)
    } else {
      params.delete("search")
    }

    params.delete("page")
    const queryString = buildQueryString(params)
    router.push(queryString ? `${pathname}?${queryString}` : pathname)
  }

  const buildTypeHref = (type: "LONG" | "AMERICAN") => {
    const params = new URLSearchParams(searchParams.toString())
    if (type === defaultType) {
      params.delete("type")
    } else {
      params.set("type", type)
    }
    params.delete("page")
    const queryString = params.toString()
    return queryString ? `${pathname}?${queryString}` : pathname
  }

  useEffect(() => {
    if (isElite) return
    if (pathname !== "/torneos") return

    const toastKey = "padel-fv-active-tournaments-toast"
    if (window.sessionStorage.getItem(toastKey)) return

    toast({
      title: "Torneos activos unificados",
      description: "Ahora aca ves juntos los torneos en curso y los proximos, con inscripciones abiertas o cerradas.",
    })
    window.sessionStorage.setItem(toastKey, "shown")
  }, [isElite, pathname])

  const buildStatusHref = (statusPath: "active" | "upcoming" | "in-progress" | "past") => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")
    const queryString = buildQueryString(params)
    const basePath = statusPath === "active" || (isElite && statusPath === "upcoming") ? "/torneos" : `/tournaments/${statusPath}`
    return `${basePath}${queryString ? `?${queryString}` : ""}`
  }

  const isActiveStatus = (statusPath: "active" | "upcoming" | "in-progress" | "past") => {
    if (statusPath === "active") {
      return (
        pathname === "/torneos" ||
        pathname.includes("/tournaments/upcoming") ||
        pathname.includes("/tournaments/in-progress")
      )
    }

    if (isElite && statusPath === "upcoming" && pathname === "/torneos") {
      return true
    }

    return pathname.includes(`/tournaments/${statusPath}`)
  }

  const statusTabs = [
    ...(isElite
      ? [
          {
            href: buildStatusHref("upcoming"),
            label: "Proximos",
            icon: Calendar,
            active: isActiveStatus("upcoming"),
          },
          {
            href: buildStatusHref("in-progress"),
            label: "Activos",
            icon: Trophy,
            active: isActiveStatus("in-progress"),
          },
          {
            href: buildStatusHref("past"),
            label: "Pasados",
            icon: Archive,
            active: isActiveStatus("past"),
          },
        ]
      : [
          {
            href: buildStatusHref("active"),
            label: "Activos",
            icon: Trophy,
            active: isActiveStatus("active"),
          },
          {
            href: buildStatusHref("past"),
            label: "Finalizados",
            icon: Archive,
            active: isActiveStatus("past"),
          },
        ]),
  ]

  const pageClassName = isElite
    ? "tpe-page min-h-screen text-[var(--tpe-night)]"
    : "min-h-screen bg-[linear-gradient(180deg,#223765_0%,#243b6c_45%,#1f335d_100%)] text-white"
  const managementBarClassName = isElite
    ? "border-b border-slate-200 bg-white/80"
    : "border-b border-white/10 bg-[#213761]/82"
  const primaryButtonClassName = isElite
    ? "rounded-full bg-[var(--tpe-night)] text-[var(--tpe-paper)] hover:bg-[var(--tpe-night-soft)]"
    : "bg-court-500 text-brand-900 hover:bg-court-400"
  const outlineButtonClassName = isElite
    ? "rounded-full border-[var(--tpe-night)] bg-transparent text-[var(--tpe-night)] hover:bg-[var(--tpe-night)] hover:text-[var(--tpe-paper)]"
    : "border-white/20 bg-white/5 text-white hover:bg-white/10"
  const headerClassName = isElite
    ? "mb-8 rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8"
    : "mb-10"
  const kickerClassName = isElite
    ? "tpe-kicker mb-3"
    : "mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-court-300"
  const titleClassName = isElite
    ? "mb-4 text-4xl font-black tracking-tight text-[var(--tpe-night)]"
    : "mb-4 text-4xl font-black tracking-tight text-white"
  const descriptionClassName = isElite
    ? "max-w-3xl text-lg font-medium leading-7 text-slate-700"
    : "max-w-3xl text-lg text-slate-200"
  const filterPanelClassName = isElite
    ? "mb-8 space-y-6 rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur"
    : "mb-10 space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm backdrop-blur-sm"
  const inputClassName = isElite
    ? "rounded-full border-slate-200 bg-white pl-10 text-[var(--tpe-night)] placeholder:text-slate-400 focus:border-[var(--tpe-night)] focus:ring-[var(--tpe-night)]/20"
    : "border-white/10 bg-white/5 pl-10 text-white placeholder:text-slate-400 focus:border-court-500/50 focus:ring-court-500/20"
  const typeSwitcherClassName = isElite
    ? "grid w-full max-w-md grid-cols-2 rounded-full border border-slate-200 bg-white p-1"
    : "grid w-full max-w-md grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1"
  const activeTypeClassName = isElite
    ? "bg-[var(--tpe-night)] text-[var(--tpe-paper)] shadow-sm"
    : "bg-court-500 text-brand-900 shadow-sm"
  const inactiveTypeClassName = isElite
    ? "text-slate-600 hover:text-[var(--tpe-night)]"
    : "text-slate-300 hover:text-white"
  const contentShellClassName = isElite
    ? "tpe-shell overflow-hidden rounded-[2rem]"
    : "overflow-hidden rounded-3xl border border-white/10 bg-[#1b2d52]/76 shadow-sm backdrop-blur-sm"
  const statusBarClassName = isElite
    ? "tpe-banner border-b-4 border-[var(--tpe-forest)] p-2"
    : "border-b border-white/10 bg-white/[0.04] p-2"
  const activeStatusClassName = isElite
    ? "bg-[var(--tpe-night)] text-[var(--tpe-paper)] shadow-sm"
    : "bg-court-500 text-brand-900 shadow-sm"
  const inactiveStatusClassName = isElite
    ? "text-[var(--tpe-night)] hover:bg-white/50"
    : "text-slate-300 hover:bg-white/10 hover:text-white"

  return (
    <div className={pageClassName}>
      {(userDetails?.role === "CLUB" || userDetails?.role === "ORGANIZADOR") ? (
        <div className={managementBarClassName}>
          <div className="container mx-auto px-6 py-4">
            <div className="flex justify-end">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild className={primaryButtonClassName}>
                  <Link href="/my-tournaments">
                    <Settings className="mr-2 h-4 w-4" />
                    Gestionar Mis Torneos
                  </Link>
                </Button>
                <Button asChild variant="outline" className={outlineButtonClassName}>
                  <Link href="/tournaments/create">
                    <Plus className="mr-2 h-4 w-4" />
                    Crear Nuevo Torneo
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="container mx-auto max-w-6xl px-6 py-12">
        <div className={headerClassName}>
          <p className={kickerClassName}>{branding.siteName}</p>
          <h1 className={titleClassName}>{title}</h1>
          <p className={descriptionClassName}>{description}</p>
        </div>

        <div className={filterPanelClassName}>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 transform text-gray-400" size={18} />
              <Input
                placeholder="Buscar torneos..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className={inputClassName}
              />
            </div>

            <div className={typeSwitcherClassName}>
              <Link
                href={buildTypeHref("LONG")}
                className={`rounded-full px-4 py-3 text-center text-sm font-semibold transition-colors ${
                  currentType === "LONG" ? activeTypeClassName : inactiveTypeClassName
                }`}
              >
                Ligas
              </Link>
              <Link
                href={buildTypeHref("AMERICAN")}
                className={`rounded-full px-4 py-3 text-center text-sm font-semibold transition-colors ${
                  currentType === "AMERICAN" ? activeTypeClassName : inactiveTypeClassName
                }`}
              >
                Americanos
              </Link>
            </div>
          </div>

          <TournamentFilters categories={categories} clubs={clubs} />
        </div>

        <div className={contentShellClassName}>
          <div className={statusBarClassName}>
            <div className={`grid gap-2 ${isElite ? "grid-cols-3" : "grid-cols-2"}`}>
              {statusTabs.map((tab) => {
                const Icon = tab.icon

                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition-colors ${
                      tab.active ? activeStatusClassName : inactiveStatusClassName
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
