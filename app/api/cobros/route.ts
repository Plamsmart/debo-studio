import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe, SITE_URL } from '@/lib/stripe'

// POST /api/cobros
// Body: { concepto, monto }
// Genera un link de pago de Stripe para cobrar en el local (sin cita asociada).
// Solo accesible para admins autenticados.
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: esAdmin } = await supabase
    .from('usuarios_admin')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!esAdmin) {
    return NextResponse.json({ error: 'Solo el equipo del estudio puede generar cobros' }, { status: 403 })
  }

  const body = await request.json()
  const { concepto, monto } = body

  if (!concepto?.trim() || !monto || monto <= 0) {
    return NextResponse.json({ error: 'Faltan datos: concepto y monto son requeridos' }, { status: 400 })
  }

  const montoEnCentavos = Math.round(Number(monto) * 100)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: { name: concepto.trim() },
          unit_amount: montoEnCentavos,
        },
        quantity: 1,
      },
    ],
    success_url: `${SITE_URL}/pago-exitoso`,
    cancel_url: `${SITE_URL}/pago-cancelado`,
    metadata: {
      tipo: 'cobro_local',
      concepto: concepto.trim(),
    },
  })

  // Insertamos con service_role, igual que hacemos con los pagos de citas confirmadas
  const supabaseService = createServiceClient()
  const { data: pago, error: errorPago } = await supabaseService
    .from('pagos')
    .insert({
      cita_id: null,
      concepto: concepto.trim(),
      stripe_session_id: session.id,
      monto: Number(monto),
      estado: 'pendiente',
    })
    .select('id')
    .single()

  if (errorPago || !pago) {
    return NextResponse.json({ error: 'No se pudo registrar el cobro' }, { status: 500 })
  }

  return NextResponse.json({
    url: session.url,
    sessionId: session.id,
    pagoId: pago.id,
  })
}
