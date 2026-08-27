import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/pagos/estado?session_id=xxx
// Devuelve el estado actual de un pago. Usado por la pantalla de cobro en el
// local para saber cuándo el cliente completó el pago (polling simple).
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ error: 'Falta session_id' }, { status: 400 })
  }

  const { data: pago, error } = await supabase
    .from('pagos')
    .select('estado')
    .eq('stripe_session_id', sessionId)
    .single()

  if (error || !pago) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ estado: pago.estado })
}
