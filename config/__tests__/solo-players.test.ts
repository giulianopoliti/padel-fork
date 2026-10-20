import { isSoloPlayersEnabled, isSoloPlayersProductionBackend } from "../solo-players"

const previous = { ...process.env }
beforeEach(() => { delete process.env.NEXT_PUBLIC_SOLO_PLAYERS_ENABLED; delete process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW; delete process.env.NEXT_PUBLIC_TENANT_KEY })
afterEach(() => { process.env = { ...previous } })
describe("solo player release", () => {
  it.each(["development", "production"])("enables local opt-in in a %s build", mode => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = mode
    process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW = "true"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:8011"
    expect(isSoloPlayersEnabled()).toBe(true)
    expect(isSoloPlayersProductionBackend()).toBe(false)
  })
  it.each([["padel-fv", "bfmaqrythlwbfjuqumom"], ["padel-elite", "lzowflvgnspjdbvdxliy"]])("enables %s only on its own project", (tenant, project) => {
    process.env.NEXT_PUBLIC_TENANT_KEY = tenant
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${project}.supabase.co`
    expect(isSoloPlayersEnabled()).toBe(true)
    process.env.NEXT_PUBLIC_SOLO_PLAYERS_ENABLED = "false"
    expect(isSoloPlayersEnabled()).toBe(false)
  })
  it.each([["padel-fv", "lzowflvgnspjdbvdxliy"], ["padel-elite", "bfmaqrythlwbfjuqumom"]])("rejects a mismatched project for %s", (tenant, project) => {
    process.env.NEXT_PUBLIC_TENANT_KEY = tenant
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${project}.supabase.co`
    process.env.NEXT_PUBLIC_SOLO_PLAYERS_ENABLED = "true"
    expect(isSoloPlayersEnabled()).toBe(false)
  })
  it.each(["https://vulusxqgknaejdxnhiex.supabase.co", "https://unknown.supabase.co", "https://localhost.example.com", "ftp://localhost", "https://bfmaqrythlwbfjuqumom.supabase.co.evil.test", "https://bfmaqrythlwbfjuqumom.supabase.co/not-root", "invalid"])("rejects an unsupported backend %s", url => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url
    process.env.NEXT_PUBLIC_SOLO_PLAYERS_PREVIEW = "true"
    expect(isSoloPlayersEnabled()).toBe(false)
  })
  it("still requires opt-in locally", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:8011"
    expect(isSoloPlayersEnabled()).toBe(false)
  })
})
