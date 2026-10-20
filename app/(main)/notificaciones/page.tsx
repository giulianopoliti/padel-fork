import { notFound } from "next/navigation"
import { isSoloPlayersEnabled } from "@/config/solo-players"
import { SoloNotificationList } from "@/components/solo-players/notification-list"

export const metadata = { title: "Notificaciones", robots: { index: false, follow: false } }
const NotificationsPage = () => {
  if (!isSoloPlayersEnabled()) notFound()
  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12"><SoloNotificationList /></main>
}
export default NotificationsPage
