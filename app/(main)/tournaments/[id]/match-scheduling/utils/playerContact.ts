import { parsePhoneNumberFromString } from 'libphonenumber-js'

export const AVAILABILITY_REMINDER = 'Buenas, te recuerdo que aun no cargaste tus horarios para el finde'

export const getPlayerContact = (rawPhone: string | null | undefined): { phone: string; whatsappUrl: string | null } => {
  const phone = rawPhone?.trim() || ''
  const parsed = phone ? parsePhoneNumberFromString(phone, 'AR') : undefined
  if (!parsed?.isValid()) return { phone, whatsappUrl: null }
  return {
    phone: parsed.number,
    whatsappUrl: `https://wa.me/${parsed.number.slice(1)}?text=${encodeURIComponent(AVAILABILITY_REMINDER)}`,
  }
}
