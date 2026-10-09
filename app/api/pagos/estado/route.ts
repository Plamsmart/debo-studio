import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Los ids de sesión de Stripe Checkout son "cs_test_…" / "cs_live_…".
const FORMATO_SESSION_ID = /^cs_[A-Za-z0-9_]{1,255}$/

// GET /api/pagos/estado?session_id=xxx
// Devuelve SOLO el estado de un pago. Usado por la pantalla de cobro en el
// local (/admin/cobrar, admin y staff) para saber cuándo el cliente completó
// el pago (polling simple).
//
// La lectura va con service_role a propósito: así no depende de que la
// política RLS de `pagos` deje leer al staff (está previsto restringirla a
// rol 'admin'). Por eso aquí se comprueba antes que quien pregunta es del
// equipo, y solo se pide y se devuelve la columna `estado`.
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: miembro, error: errorMiembro } = await supabase
    .from('usuarios_admin')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (errorMiembro) {
    console.error('Error comprobando usuarios_admin en /api/pagos/estado:', errorMiembro)
    return NextResponse.json({ error: 'No se pudo comprobar el pago' }, { status: 500 })
  }
  if (!miembro) {
    return NextResponse.json({ error: 'Solo el equipo del estudio puede consultar cobros' }, { status: 403 })
  }

  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (!sessionId || !FORMATO_SESSION_ID.test(sessionId)) {
    return NextResponse.json({ error: 'Falta session_id o no es válido' }, { status: 400 })
  }

  const supabaseService = createServiceClient()
  const { data: pago, error } = await supabaseService
    .from('pagos')
    .select('estado')
    .eq('stripe_session_id', sessionId)
    .maybeSingle()

  if (error) {
    console.error(`Error leyendo el estado del pago de la sesión ${sessionId}:`, error)
    return NextResponse.json({ error: 'No se pudo comprobar el pago' }, { status: 500 })
  }
  if (!pago) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ estado: pago.estado })
}
