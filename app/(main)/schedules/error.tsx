'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

const ScheduleError = ({ reset }: { error: Error; reset: () => void }) => (
  <section role="alert" className="space-y-4 rounded-xl border bg-card p-6">
    <h1 className="text-2xl font-semibold">No pudimos cargar las fechas</h1>
    <p className="text-sm text-muted-foreground">Volvé a intentar o regresá al panel.</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={reset}>Reintentar</Button>
      <Button asChild variant="outline"><Link href="/panel">Mi panel</Link></Button>
    </div>
  </section>
)

export default ScheduleError
