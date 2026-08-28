export const TPE_TERMS_VERSION = "2026-08-28"
export const TPE_TERMS_PATH = "/tournaments/terms"

export const getTpeTermsUrl = () => {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")
  return baseUrl ? `${baseUrl}${TPE_TERMS_PATH}` : TPE_TERMS_PATH
}
