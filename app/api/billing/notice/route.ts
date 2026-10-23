import { NextResponse } from "next/server"
import { BillingAccessError, getBillingNotice } from "@/lib/billing/portal-service"

export const dynamic = "force-dynamic"

export const GET = async (): Promise<NextResponse> => {
  try {
    return NextResponse.json(await getBillingNotice(), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (error instanceof BillingAccessError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[billing] Notice read failed", error)
    return NextResponse.json({ error: "No se pudo cargar el aviso" }, { status: 500 })
  }
}
