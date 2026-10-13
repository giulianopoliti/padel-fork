"use client"

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'

const ListRetryButton = () => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? 'Reintentando…' : 'Reintentar'}</Button>
}
export default ListRetryButton
