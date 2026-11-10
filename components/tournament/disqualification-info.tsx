import { ChevronDown, Info } from 'lucide-react'

const explanations = {
  zones: 'La pareja queda fuera de la clasificación y se cancelan sus partidos pendientes. Al armar la llave, si queda un cupo libre, puede entrar la siguiente pareja según las reglas del torneo.',
  bracket: 'La pareja queda eliminada. Su rival gana el partido por descalificación y avanza si hay otra ronda.',
}

export const DisqualificationInfo = ({ phase }: { phase: keyof typeof explanations }) => (
  <details open className="group rounded-control bg-muted px-3 py-1.5 text-left text-sm text-muted-foreground">
    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      <Info aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      ¿Qué pasa al descalificar?
      <ChevronDown aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground group-open:rotate-180" />
    </summary>
    <p className="pb-2 pl-6">{explanations[phase]}</p>
  </details>
)
