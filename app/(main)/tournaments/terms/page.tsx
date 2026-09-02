import { redirect } from "next/navigation"

import { getTenantBranding } from "@/config/tenant"
import { TPE_TERMS_VERSION } from "@/lib/tpe/terms"

export const metadata = {
  title: "Términos y condiciones | TPE Padel",
}

export default function TournamentTermsPage() {
  if (getTenantBranding().key !== "padel-elite") {
    redirect("/torneos")
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <article className="rounded-display border bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-medium text-muted-foreground">
          TPE Padel · versión {TPE_TERMS_VERSION}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Términos y condiciones de inscripción
        </h1>

        <div className="mt-8 space-y-5 text-sm leading-6 text-muted-foreground">
          <p>
            <strong className="text-foreground">1.1:</strong> Al realizar la
            inscripción, declaro que tanto mi compañero/a como yo pertenecemos
            a la categoría seleccionada, teniendo en cuenta que la
            categorización se evalúa de manera individual. Si durante el torneo
            se detectara una categoría incorrecta, TPE Padel podrá
            descalificar a la pareja sin reintegrar el importe abonado. Si la
            situación fuera detectada una vez finalizada la competencia, TPE
            Padel podrá dejar sin efecto la entrega de premios correspondiente.
          </p>

          <p>
            <strong className="text-foreground">1.2:</strong> Las cancelaciones
            deberán informarse con un mínimo de 3 horas de anticipación respecto
            del horario de inicio del torneo. En caso contrario, deberá abonarse
            el 50% del valor de la inscripción.
          </p>

          <p>
            <strong className="text-foreground">1.3:</strong> Declaro que tanto
            mi compañero/a como yo participamos voluntariamente y bajo nuestra
            propia responsabilidad, encontrándonos en condiciones físicas
            adecuadas para realizar actividad deportiva. TPE Padel no será
            responsable por lesiones, accidentes ni daños físicos o materiales
            que pudieran producirse durante la participación en el torneo.
          </p>

          <p>
            <strong className="text-foreground">1.4:</strong> TPE Padel y el
            club donde se desarrolle el torneo no asumirán responsabilidad por
            pérdidas, extravíos, hurtos o robos de objetos personales de los
            participantes.
          </p>
        </div>
      </article>
    </main>
  )
}
