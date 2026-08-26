import {
  calculateBillingSnapshot,
  countBillableCouples,
  countBillablePlayers,
  getMondayForDateOnly,
  getWeekRange,
  isStartDateInWeek,
  isTournamentEligibleForBilling,
  FV_BACKFILL_CUTOFF_ISO,
  TPE_BACKFILL_END_EXCLUSIVE_ISO,
} from "@/lib/billing/rules"
import type { BillingInscription, BillingSettings } from "@/lib/billing/types"

const settings: BillingSettings = {
  organizationId: "org-1",
  billingModel: "FV_LEAGUE",
  currency: "ARS",
  fvAmountUpTo16: 50_000,
  fvAmountOver16: 70_000,
  tpeAmountPerPlayer: 1_000,
  updatedAt: "2026-08-21T12:00:00Z",
}

const coupleInscription = (
  index: number,
  overrides: Partial<BillingInscription> = {},
): BillingInscription => ({
  tournament_id: "tournament-1",
  player_id: `owner-${index}`,
  couple_id: `couple-${index}`,
  es_prueba: false,
  couple: {
    id: `couple-${index}`,
    player1_id: `player-${index}-1`,
    player2_id: `player-${index}-2`,
    es_prueba: false,
    player1: { id: `player-${index}-1`, es_prueba: false },
    player2: { id: `player-${index}-2`, es_prueba: false },
  },
  ...overrides,
})

describe("billing rules", () => {
  it("applies the FV lower tier through 16 couples and upper tier at 17", () => {
    const sixteen = Array.from({ length: 16 }, (_, index) => coupleInscription(index))
    const seventeen = [...sixteen, coupleInscription(16)]

    expect(calculateBillingSnapshot("FV_LEAGUE", settings, [], null).amountArs).toBe(50_000)
    expect(calculateBillingSnapshot("FV_LEAGUE", settings, sixteen, null)).toMatchObject({
      billableUnits: 16,
      pricingRule: "FV_UP_TO_16",
      amountArs: 50_000,
    })
    expect(calculateBillingSnapshot("FV_LEAGUE", settings, seventeen, null)).toMatchObject({
      billableUnits: 17,
      pricingRule: "FV_OVER_16",
      amountArs: 70_000,
    })
  })

  it("uses edited rates for newly calculated pending snapshots", () => {
    const editedSettings = {
      ...settings,
      fvAmountUpTo16: 55_000,
      fvAmountOver16: 75_000,
      tpeAmountPerPlayer: 1_500,
    }

    expect(calculateBillingSnapshot("FV_LEAGUE", editedSettings, [], null).amountArs).toBe(55_000)
    expect(
      calculateBillingSnapshot("TPE_PLAYER", editedSettings, [coupleInscription(1)], "2026-08-09T20:00:00Z").amountArs,
    ).toBe(3_000)
  })

  it("deduplicates couples and excludes test couples or players", () => {
    const valid = coupleInscription(1)
    const duplicate = { ...valid }
    const testCouple = coupleInscription(2, {
      couple: { ...coupleInscription(2).couple!, es_prueba: true },
    })
    const testPlayer = coupleInscription(3, {
      couple: {
        ...coupleInscription(3).couple!,
        player2: { id: "player-3-2", es_prueba: true },
      },
    })

    expect(countBillableCouples([valid, duplicate, testCouple, testPlayer])).toBe(1)
  })

  it("counts unique players per tournament from couples and individual inscriptions", () => {
    const couple = coupleInscription(1)
    const duplicateCouple = { ...couple }
    const individual: BillingInscription = {
      tournament_id: "tournament-1",
      player_id: "individual-1",
      couple_id: null,
      es_prueba: false,
      player: { id: "individual-1", es_prueba: false },
    }
    const testIndividual: BillingInscription = {
      ...individual,
      player_id: "test-player",
      player: { id: "test-player", es_prueba: true },
    }

    expect(countBillablePlayers([couple, duplicateCouple, individual, testIndividual])).toBe(3)
    expect(
      calculateBillingSnapshot("TPE_PLAYER", settings, [couple, individual], "2026-08-09T20:00:00Z"),
    ).toMatchObject({ billableUnits: 3, unitAmountArs: 1_000, amountArs: 3_000 })
  })

  it("uses Monday through Sunday in Argentina", () => {
    expect(getMondayForDateOnly("2026-08-09")).toBe("2026-08-03")
    expect(getWeekRange("2026-08-09")).toEqual({ start: "2026-08-03", end: "2026-08-09" })
    expect(isStartDateInWeek("2026-08-10T02:59:59Z", "2026-08-03", "2026-08-09")).toBe(true)
    expect(isStartDateInWeek("2026-08-10T03:00:00Z", "2026-08-03", "2026-08-09")).toBe(false)
  })

  it("defines the requested Argentina backfill cutoffs", () => {
    expect(FV_BACKFILL_CUTOFF_ISO).toBe("2026-06-01T03:00:00.000Z")
    expect(TPE_BACKFILL_END_EXCLUSIVE_ISO).toBe("2026-08-10T03:00:00.000Z")
  })

  it("filters exact type, status and test tournament rules per tenant", () => {
    expect(isTournamentEligibleForBilling({ type: "LONG", status: "ZONE_PHASE", es_prueba: false }, "FV_LEAGUE")).toBe(true)
    expect(isTournamentEligibleForBilling({ type: "LONG", status: "NOT_STARTED", es_prueba: false }, "FV_LEAGUE")).toBe(false)
    for (const status of [
      "NOT_STARTED",
      "ZONE_PHASE",
      "BRACKET_PHASE",
      "FINISHED_POINTS_PENDING",
      "FINISHED_POINTS_CALCULATED",
    ]) {
      expect(
        isTournamentEligibleForBilling({ type: "AMERICAN", status, es_prueba: false }, "TPE_PLAYER"),
      ).toBe(true)
    }
    expect(isTournamentEligibleForBilling({ type: "AMERICAN", status: "CANCELED", es_prueba: false }, "TPE_PLAYER")).toBe(false)
    expect(isTournamentEligibleForBilling({ type: "AMERICAN", status: "BRACKET_PHASE", es_prueba: true }, "TPE_PLAYER")).toBe(false)
  })
})
