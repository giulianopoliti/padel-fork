"use client"

import { Button } from "@/components/ui/button"

const CobrosError = ({ reset }: { reset: () => void }) => <main className="mx-auto max-w-4xl space-y-4 px-4 py-12">
  <h1 className="text-2xl font-semibold">No se pudieron cargar los cobros</h1>
  <p className="text-muted-foreground">Reintentá para consultar el detalle y descargar el PDF.</p>
  <Button onClick={reset}>Reintentar</Button>
</main>

export default CobrosError
