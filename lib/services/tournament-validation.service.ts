/**
 * Unified Tournament Validation Service
 * Combines legacy system with new simplified state system
 * Handles both old tournaments and new simplified flow
 */

import { createClient, createClientServiceRole } from '@/utils/supabase/server';
import {
  buildTournamentCapacitySummary,
  getTournamentCoupleCount,
} from '@/lib/services/tournament-capacity.service';
import type { 
  TournamentStatus, 
  TournamentFormat,
  ValidationResult 
} from '../domain/types/tournament.types';

export interface TournamentValidationResult {
  canAddCouples: boolean;
  canMoveCouples: boolean;
  canCreateMatches: boolean;
  canStartBracket: boolean;
  reason?: string;
  system: 'NEW' | 'LEGACY';
}

export interface RegistrationValidationResult {
  allowed: boolean;
  reason?: string;
  details?: string;
  system: 'NEW' | 'LEGACY';
}

export class TournamentValidationService {
  
  // ============================================================================
  // UNIFIED REGISTRATION VALIDATION
  // ============================================================================

  /**
   * Unified validation for couple registration
   * Intelligently chooses between new system and legacy system
   */
  static async validateCoupleRegistration(tournamentId: string): Promise<RegistrationValidationResult> {
    const supabase = await createClientServiceRole();
    
    try {
      // Get tournament with all relevant fields
      const { data: tournament, error } = await supabase
        .from('tournaments')
        .select(`
          id,
          status,
          registration_locked,
          registration_locked_by_capacity,
          bracket_status,
          bracket_generated_at,
          max_participants,
          created_at
        `)
        .eq('id', tournamentId)
        .single();

      if (error || !tournament) {
        return {
          allowed: false,
          reason: 'Tournament not found',
          system: 'NEW'
        };
      }

      // Determine which system to use
      const useNewSystem = this.shouldUseNewSystem(tournament);
      
      const currentParticipants = await getTournamentCoupleCount(supabase, tournamentId);
      const capacity = buildTournamentCapacitySummary(tournament.max_participants, currentParticipants);

      if (useNewSystem) {
        return await this.validateWithNewSystem(tournament, capacity);
      } else {
        return await this.validateWithLegacySystem(tournament, capacity);
      }

    } catch (error: any) {
      console.error('[TournamentValidationService] validateCoupleRegistration error:', error);
      return {
        allowed: false,
        reason: `Validation error: ${error.message}`,
        system: 'NEW'
      };
    }
  }

  // ============================================================================
  // NEW SIMPLIFIED SYSTEM VALIDATION
  // ============================================================================

  private static async validateWithNewSystem(
    tournament: any,
    capacity: { isFull: boolean; remainingSlots: number | null }
  ): Promise<RegistrationValidationResult> {
    const status = tournament.status as TournamentStatus;

    if (tournament.registration_locked && !tournament.registration_locked_by_capacity) {
      return {
        allowed: false,
        reason: 'Registration locked by tournament organizer',
        details: 'Tournament owner has explicitly locked registrations',
        system: 'NEW'
      };
    }

    // New system rules based on simplified states
    switch (status) {
      case 'NOT_STARTED':
        if (capacity.isFull) {
          return {
            allowed: false,
            reason: 'Tournament full',
            details: 'No quedan cupos disponibles para nuevas parejas',
            system: 'NEW'
          };
        }
        return {
          allowed: true,
          reason: 'Tournament accepts registrations',
          system: 'NEW'
        };

      case 'ZONE_PHASE':
        // Key feature: ZONE_PHASE allows late registration
        if (capacity.isFull) {
          return {
            allowed: false,
            reason: 'Tournament full',
            details: 'No quedan cupos disponibles para nuevas parejas',
            system: 'NEW'
          };
        }
        return {
          allowed: true,
          reason: 'Late registration allowed during zone phase',
          details: 'Couples will be added to unassigned pool',
          system: 'NEW'
        };

      case 'BRACKET_PHASE':
        return {
          allowed: false,
          reason: 'Registration closed - tournament in bracket phase',
          details: 'Cannot add couples during elimination phase',
          system: 'NEW'
        };

      case 'FINISHED':
      case 'FINISHED_POINTS_PENDING':
      case 'FINISHED_POINTS_CALCULATED':
        return {
          allowed: false,
          reason: 'Tournament has finished',
          system: 'NEW'
        };

      case 'CANCELED':
        return {
          allowed: false,
          reason: 'Tournament is canceled',
          system: 'NEW'
        };

      // Legacy states - use hybrid validation
      case 'PAIRING':
      case 'ZONE_REGISTRATION':
        return {
          allowed: true,
          reason: 'Legacy state allows registration',
          system: 'NEW'
        };

      case 'IN_PROGRESS':
      case 'ELIMINATION':
        return {
          allowed: false,
          reason: 'Legacy state blocks registration',
          system: 'NEW'
        };

      default:
        console.warn(`[TournamentValidationService] Unknown status: ${status}`);
        return {
          allowed: false,
          reason: `Unknown tournament status: ${status}`,
          system: 'NEW'
        };
    }
  }

  // ============================================================================
  // LEGACY SYSTEM VALIDATION (Backward Compatibility)
  // ============================================================================

  private static async validateWithLegacySystem(
    tournament: any,
    capacity: { isFull: boolean; remainingSlots: number | null }
  ): Promise<RegistrationValidationResult> {
    // Legacy system logic (existing canAddNewCouple logic)
    if (capacity.isFull) {
      return {
        allowed: false,
        reason: 'Tournament full',
        details: 'No quedan cupos disponibles para nuevas parejas',
        system: 'LEGACY'
      };
    }
    
    if (tournament.registration_locked) {
      return {
        allowed: false,
        reason: tournament.registration_locked_by_capacity
          ? 'Tournament full'
          : 'Registration locked by tournament organizer',
        details: tournament.registration_locked_by_capacity
          ? 'No quedan cupos disponibles para nuevas parejas'
          : 'Tournament owner has explicitly locked registrations',
        system: 'LEGACY'
      };
    }

    if (tournament.bracket_status === 'BRACKET_GENERATED' || tournament.bracket_status === 'BRACKET_ACTIVE') {
      return {
        allowed: false,
        reason: 'Bracket already generated',
        details: 'Cannot add couples after bracket generation',
        system: 'LEGACY'
      };
    }

    return {
      allowed: true,
      reason: 'Legacy system allows registration',
      system: 'LEGACY'
    };
  }

  // ============================================================================
  // SYSTEM DETECTION LOGIC
  // ============================================================================

  /**
   * Intelligently determines whether to use new simplified system or legacy system
   */
  private static shouldUseNewSystem(tournament: any): boolean {
    // NEW SYSTEM INDICATORS:
    // 1. Tournament uses new simplified states (ZONE_PHASE, BRACKET_PHASE)
    // 2. Tournament created after new system implementation
    // 3. Tournament explicitly flagged for new system

    const newSystemStates = ['ZONE_PHASE', 'BRACKET_PHASE'];
    const hasNewSystemState = newSystemStates.includes(tournament.status);

    // If tournament is in a new simplified state, use new system
    if (hasNewSystemState) {
      return true;
    }

    // For legacy states, check creation date or other indicators
    const createdAt = new Date(tournament.created_at);
    const newSystemImplementationDate = new Date('2025-07-01'); // Adjust based on when new system was implemented
    
    const isRecentTournament = createdAt >= newSystemImplementationDate;

    // Use new system for recent tournaments, even if they're in legacy states
    return isRecentTournament;
  }

  // ============================================================================
  // COMPREHENSIVE TOURNAMENT CAPABILITIES
  // ============================================================================

  /**
   * Get complete tournament capabilities (what actions are allowed)
   */
  static async getTournamentCapabilities(tournamentId: string): Promise<TournamentValidationResult> {
    const registrationResult = await this.validateCoupleRegistration(tournamentId);
    
    // For now, use registration validation to determine other capabilities
    // This can be expanded with more specific validations
    
    return {
      canAddCouples: registrationResult.allowed,
      canMoveCouples: registrationResult.allowed, // For simplicity, same rules
      canCreateMatches: registrationResult.allowed,
      canStartBracket: !registrationResult.allowed, // Inverse logic
      reason: registrationResult.reason,
      system: registrationResult.system
    };
  }

  // ============================================================================
  // MIGRATION HELPERS
  // ============================================================================

  /**
   * Helper to migrate tournament from legacy to new system
   */
  static async migrateTournamentToNewSystem(tournamentId: string): Promise<boolean> {
    const supabase = await createClient();
    
    try {
      // Get current tournament state
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('status, registration_locked')
        .eq('id', tournamentId)
        .single();

      if (!tournament) return false;

      // Determine appropriate new system state
      let newStatus: TournamentStatus;
      
      if (tournament.status === 'NOT_STARTED') {
        newStatus = 'NOT_STARTED';
      } else if (['PAIRING', 'ZONE_REGISTRATION', 'IN_PROGRESS'].includes(tournament.status)) {
        newStatus = 'ZONE_PHASE';
      } else if (tournament.status === 'ELIMINATION') {
        newStatus = 'BRACKET_PHASE';
      } else {
        newStatus = tournament.status; // Keep current if already new system
      }

      // Update tournament to new system
      const { error } = await supabase
        .from('tournaments')
        .update({
          status: newStatus,
          registration_locked: false // Reset legacy lock for new system
        })
        .eq('id', tournamentId);

      if (error) {
        console.error('[TournamentValidationService] Migration error:', error);
        return false;
      }

      console.log(`[TournamentValidationService] Migrated tournament ${tournamentId} to new system with status: ${newStatus}`);
      return true;

    } catch (error) {
      console.error('[TournamentValidationService] Migration failed:', error);
      return false;
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS (Backward Compatible)
// ============================================================================

/**
 * Drop-in replacement for existing canAddNewCouple function
 */
export async function canAddNewCouple(tournamentId: string): Promise<{
  canAdd: boolean;
  reason?: string;
}> {
  const result = await TournamentValidationService.validateCoupleRegistration(tournamentId);
  
  return {
    canAdd: result.allowed,
    reason: result.reason
  };
}

/**
 * Enhanced validation that includes system information
 */
export async function validateLateRegistration(tournamentId: string): Promise<RegistrationValidationResult> {
  return await TournamentValidationService.validateCoupleRegistration(tournamentId);
}
