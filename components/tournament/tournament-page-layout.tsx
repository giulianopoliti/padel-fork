"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useTournament } from "@/app/(main)/tournaments/[id]/providers/TournamentProvider"
import TournamentSidebar from "./tournament-sidebar"
import TournamentPlayersTab from "./tournament-players-tab"
import TournamentCouplesTab from "./tournament-couples-tab"
import TournamentZonesTab from "./tournament-zones-tab"
import dynamic from "next/dynamic"

const TournamentZonesMatrix = dynamic(() => import("./zones/TournamentZonesMatrix"), { ssr: false })
import UnifiedMatchesTab from "./unified-matches-tab"
import ReadOnlyMatchesTabNew from "./read-only-matches-tab-new"
import TournamentBracketTab from "./tournament-bracket-tab"
import ReadOnlyBracketTab from "./read-only-bracket-tab"
import TournamentZonesWrapper from "./tournament-zones-wrapper"
// Simplificado: Solo 2 brackets - ImprovedBracketRenderer (owner) y ReadOnlyBracketVisualization (public)

interface PlayerInfo {
  id: string
  first_name: string | null
  last_name: string | null
  score: number | null
  dni?: string | null
  phone?: string | null
}

interface PendingInscription {
  id: string
  couple_id: string
  created_at: string
  couple: {
    id: string
    player1_id: string
    player2_id: string
    player_1_info: PlayerInfo | null
    player_2_info: PlayerInfo | null
  }
}

interface TournamentPageLayoutProps {
  tournamentId: string
  tournamentStatus: string
  individualInscriptions: PlayerInfo[]
  coupleInscriptions: any[]
  maxPlayers?: number
  allPlayers?: PlayerInfo[]
  pendingInscriptions?: PendingInscription[]
  isPublicView?: boolean
  /** Indica si el usuario tiene permisos de propietario del torneo */
  isOwner?: boolean
  onDataRefresh?: () => void;
}

export default function TournamentPageLayout({
  tournamentId,
  tournamentStatus,
  individualInscriptions,
  coupleInscriptions,
  maxPlayers = 32,
  allPlayers = [],
  pendingInscriptions = [],
  isPublicView = false,
  isOwner = false,
  onDataRefresh
}: TournamentPageLayoutProps) {
  // Extraer tournamentGender del contexto
  const { tournamentGender, tournament } = useTournament()
  
  const isTournamentActive = tournamentStatus !== "NOT_STARTED"

  // Persist active tab selection across page reloads to ensure the user
  // returns to the previously viewed section (e.g. "brackets" after saving
  // match results). Use `sessionStorage` instead of `localStorage` so the
  // preference only lasts for the duration of the current tab session.
  const [activeTab, setActiveTab] = useState<string>(() => {
    // Si el torneo está en NOT_STARTED, siempre mostrar couples para club owners
    if (tournamentStatus === "NOT_STARTED" && isOwner) {
      return "couples"
    }
    
    // Guard for NextJS SSR – access `window` only on the client
    if (typeof window !== "undefined") {
      const storedTab = sessionStorage.getItem("tournament_active_tab")
      if (storedTab) {
        return storedTab
      }
    }
    return isTournamentActive ? "matches" : "couples"
  })

  // Store every tab change so that a future reload can restore it
  useEffect(() => {
    try {
      sessionStorage.setItem("tournament_active_tab", activeTab)
    } catch (_) {
      /* Ignore write errors (e.g. in private mode) */
    }
  }, [activeTab])
  // Eliminamos lógica local de partidos; TournamentMatchesTab maneja todo

  const commonTabProps = {
    tournamentId,
    isOwner,
    onDataRefresh
  };

  const renderContent = () => {
    switch (activeTab) {
      case "players":
        return (
          <TournamentPlayersTab
            individualInscriptions={individualInscriptions}
            tournamentId={tournamentId}
            tournamentStatus={tournamentStatus}
            maxPlayers={maxPlayers}
            allPlayers={allPlayers}
            isPublicView={isPublicView}
            tournamentGender={tournamentGender}
            tournamentType={tournament?.type}
            tournamentStartDate={tournament?.start_date}
            registrationLocked={tournament?.registration_locked || false}
            bracketStatus={tournament?.bracket_status || "NOT_STARTED"}
            enableTransferProof={tournament?.enable_transfer_proof || false}
            transferAlias={tournament?.transfer_alias || null}
            transferAmount={tournament?.transfer_amount || null}
          />
        )
      case "couples":
        return (
          <TournamentCouplesTab
            coupleInscriptions={coupleInscriptions}
            tournamentId={tournamentId}
            tournamentStatus={tournamentStatus}
            allPlayers={allPlayers}
            isOwner={isOwner}
            tournamentGender={tournamentGender}
            tournamentType={tournament?.type}
            tournamentStartDate={tournament?.start_date}
            registrationLocked={tournament?.registration_locked || false}
            bracketStatus={tournament?.bracket_status || "NOT_STARTED"}
            enablePaymentCheckboxes={tournament?.enable_payment_checkboxes || false}
            enableTransferProof={tournament?.enable_transfer_proof || false}
            transferAlias={tournament?.transfer_alias || null}
            transferAmount={tournament?.transfer_amount || null}
          />
        )
      case "zones":
        return (
          <div className="p-4 lg:p-8">
            <TournamentZonesWrapper 
              tournamentId={tournamentId} 
              isOwner={isOwner} 
            />
          </div>
        )
      case "matches":
        return (
          <div className="p-4 lg:p-8">
            <UnifiedMatchesTab
              tournamentId={tournamentId}
              clubCourts={10}
              isOwner={isOwner}
              isPublicView={isPublicView}
              onDataRefresh={onDataRefresh}
              tournamentStatus={tournamentStatus}
            />
          </div>
        )
      case "brackets":
        return (
          <div className="h-full overflow-x-auto overflow-y-hidden">
            {isPublicView || tournamentStatus === 'FINISHED_POINTS_CALCULATED' ? (
              // Vista pública unificada (incluye torneos finalizados)
              <ReadOnlyBracketTab
                tournamentId={tournamentId}
                tournamentStatus={tournamentStatus}
              />
            ) : (
              // Vista club owner con drag & drop (ImprovedBracketRenderer)
              <TournamentBracketTab {...commonTabProps} />
            )}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex relative bg-gray-50 min-h-full">
      {/* Sidebar - ✅ Actualizado para usar Links */}
      <TournamentSidebar
        tournamentId={tournamentId}
        tournamentStatus={tournamentStatus}
        isOwner={isOwner}
      />

      {/* Main Content Area */}
      <main
        className={cn(
          "flex-1 flex flex-col",
          "lg:ml-56", // Account for desktop sidebar width (reduced from ml-64)
          "w-full",
          "pb-20 lg:pb-0", // Space for mobile FAB button
          "overflow-hidden" // Prevent layout shifts
        )}
      >
        {/* Content Container - Single scroll container */}
        <div className="flex-1 bg-white lg:rounded-tl-xl shadow-sm lg:ml-2 h-full overflow-y-auto overflow-x-hidden">
          {/* Tab Content */}
          {renderContent()}
        </div>
      </main>
    </div>
  )
} 
