import { soloPostSchema, getOrganizationWhatsappUrl } from "../validation"
import { getSoloPostLabel, getSoloPairLabel } from "../presentation"
import { isSoloPlayersEnabled, isSoloPlayersLocalBackend } from "@/config/solo-players"
import type { SoloOwnPost } from "@/types/solo-player-ui"

const input = { tournamentId: null, category: "9na", side: "DRIVE", hand: "RIGHT", duration: "1_WEEK", phone: "+54 9 11 2345-6789", publicPhone: false, contactAccepted: true, termsAccepted: false }

describe("solo player publication boundaries", () => {
  it("normalizes a valid contact without requiring it to be public", () => {
    expect(soloPostSchema.parse(input)).toMatchObject({ phone: "+5491123456789", publicPhone: false })
  })
  it.each(["", "123456", "invalid", "+111111111111111"])('rejects invalid phone %s', phone => {
    expect(soloPostSchema.safeParse({ ...input, phone }).success).toBe(false)
  })
  it("requires explicit contact consent even for a hidden phone", () => {
    expect(soloPostSchema.safeParse({ ...input, contactAccepted: false }).success).toBe(false)
  })
  it("requires tournament terms but not for general posts", () => {
    expect(soloPostSchema.safeParse({ ...input, tournamentId: "650e8400-e29b-41d4-a716-446655440000" }).success).toBe(false)
    expect(soloPostSchema.safeParse(input).success).toBe(true)
  })
  it.each(["1_DAY", "1_WEEK", "2_WEEKS", "1_MONTH"])("accepts the agreed duration %s", duration => {
    expect(soloPostSchema.safeParse({ ...input, duration }).success).toBe(true)
  })
  it("discards a forged profile, owner, or terms version", () => {
    const parsed = soloPostSchema.parse({ ...input, playerId: "victim", ownerId: "victim", termsVersion: "forged" })
    expect(parsed).not.toHaveProperty("playerId")
    expect(parsed).not.toHaveProperty("ownerId")
    expect(parsed).not.toHaveProperty("termsVersion")
  })
  it("constructs WhatsApp only from a valid organization phone", () => {
    expect(getOrganizationWhatsappUrl("+54 9 11 2345 6789")).toBe("https://wa.me/5491123456789")
    expect(getOrganizationWhatsappUrl("javascript:alert(1)")).toBeNull()
    expect(getOrganizationWhatsappUrl(null)).toBeNull()
  })
  it("shows expiry even when the stored post is still ACTIVE", () => {
    const post = { status: "ACTIVE", expires_at: "2026-10-15T00:00:00Z" } as SoloOwnPost
    expect(getSoloPostLabel(post, Date.parse("2026-10-16T00:00:00Z"))).toBe("Vencida")
  })
  it.each([
    [true, true, "Inscripción confirmada · Seña pendiente"],
    [true, false, "Inscripción confirmada"],
    [false, true, "Inscripción confirmada · Seña pendiente"],
    [false, false, "Inscripción confirmada"],
  ])("keeps couple requirements separate (%s, %s)", (pendingApproval, pendingProof, label) => {
    expect(getSoloPairLabel({ tournament_id: "t", inscription_id: "i", pendingApproval: Boolean(pendingApproval), pendingProof: Boolean(pendingProof) })).toBe(label)
  })
  it('identifies a formed couple that has not obtained a place yet',()=>{
    expect(getSoloPairLabel({tournament_id:'t',inscription_id:'i',pendingApproval:false,pendingProof:true,occupiesSlot:false})).toBe('Pareja sin cupo reservado')
  })
  it("distinguishes matching production and local backends", () => {
    const previous = { ...process.env }
    try {
      Object.assign(process.env, { NODE_ENV: "production", NEXT_PUBLIC_TENANT_KEY: "padel-fv", NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW: "true", NEXT_PUBLIC_SUPABASE_URL: "https://bfmaqrythlwbfjuqumom.supabase.co" })
      expect(isSoloPlayersEnabled()).toBe(true)
      expect(isSoloPlayersLocalBackend()).toBe(false)
      Object.assign(process.env, { NODE_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:8011" })
      expect(isSoloPlayersEnabled()).toBe(true)
      expect(isSoloPlayersLocalBackend()).toBe(true)
    } finally { process.env = previous }
  })
  it("does not describe an eliminated pair as a confirmed inscription", () => {
    expect(getSoloPairLabel({ tournament_id: "t", inscription_id: "i", pendingApproval: true, pendingProof: true, isEliminated: true })).toBe("Pareja eliminada")
  })
})
