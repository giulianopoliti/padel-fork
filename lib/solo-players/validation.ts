import { z } from "zod"
import { parsePhoneNumberFromString } from "libphonenumber-js"

export const soloPostSchema = z.object({
  postId: z.string().uuid().optional(),
  tournamentId: z.string().uuid().nullable(),
  category: z.string().trim().min(1).max(80),
  side: z.enum(["DRIVE", "REVES"]),
  hand: z.enum(["RIGHT", "LEFT"]),
  duration: z.enum(["1_DAY", "1_WEEK", "2_WEEKS", "1_MONTH"]),
  phone: z.string().trim().max(40).transform((value, ctx) => {
    const phone = parsePhoneNumberFromString(value, "AR")
    if (!phone?.isValid()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ingresá un teléfono válido con código de país y área." })
      return z.NEVER
    }
    return phone.number
  }),
  publicPhone: z.boolean(),
  contactAccepted: z.literal(true, { errorMap: () => ({ message: "Aceptá el consentimiento de contacto." }) }),
  termsAccepted: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.tournamentId && !value.termsAccepted) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["termsAccepted"], message: "Aceptá las condiciones de búsqueda para el torneo." })
})

export const soloStatusSchema = z.object({ postId: z.string().uuid(), status: z.enum(["ACTIVE", "PAUSED", "WITHDRAWN"]) })

export const soloRequestSchema = z.object({
  postId: z.string().uuid(), phone: soloPostSchema.innerType().shape.phone,
  side: z.enum(["DRIVE", "REVES"]).optional(), hand: z.enum(["RIGHT", "LEFT"]).optional(),
  contactAccepted: z.literal(true), termsAccepted: z.boolean(),
}).refine(value => !!value.side === !!value.hand, { message: "Completá el lado de juego y la mano hábil." })
export const soloResolveSchema = z.object({
  requestId: z.string().uuid(), action: z.enum(["ACCEPT", "REJECT", "WITHDRAW", "INVALIDATE"]),
  termsAccepted: z.boolean().default(false), paymentMethod: z.enum(["CASH", "TRANSFER"]).optional(),
})

export const getOrganizationWhatsappUrl = (phone: string | null | undefined): string | null => {
  const parsed = phone ? parsePhoneNumberFromString(phone, "AR") : null
  return parsed?.isValid() ? `https://wa.me/${parsed.number.slice(1)}` : null
}
