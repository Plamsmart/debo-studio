import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe, SITE_URL } from '@/lib/stripe'

// Stripe no acepta cobros en EUR por debajo de 0,50 €.
const MONTO_MINIMO_TARJETA = 0.5

// POST /api/cobros
// Body: { concepto, monto, servicio_id?, nombre?, email?, telefono? }
// Genera un link de pago de Stripe para cobrar en el local (sin cita asociada).
// Los datos de cliente son opcionales — si se dan, se registra o encuentra
// el cliente y se vincula al pago. Solo accesible para admins autenticados.
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

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la petición no es JSON válido' }, { status: 400 })
  }
  const { concepto, monto, servicio_id, nombre, email, telefono } = body

  const montoNumero = Number(monto)
  if (typeof concepto !== 'string' || !concepto.trim() || !Number.isFinite(montoNumero)) {
    return NextResponse.json({ error: 'Faltan datos: concepto y monto son requeridos' }, { status: 400 })
  }
  if (montoNumero < MONTO_MINIMO_TARJETA) {
    return NextResponse.json(
      { error: 'El monto mínimo para cobrar con tarjeta es 0,50 €' },
      { status: 400 }
    )
  }

  const montoEnCentavos = Math.round(montoNumero * 100)
  const supabaseService = createServiceClient()

  // Si se dieron datos de cliente, buscamos o creamos su registro
  let clienteId: string | null = null
  if (nombre?.trim()) {
    if (email?.trim()) {
      const { data: existente, error: errorBusqueda } = await supabaseService
        .from('clientes')
        .select('id')
        .eq('email', email.trim())
        .maybeSingle()
      if (errorBusqueda) {
        console.error('Error buscando cliente existente (cobro QR):', errorBusqueda)
      }
      if (existente) clienteId = existente.id
    }

    if (!clienteId) {
      const { data: nuevoCliente, error: errorCliente } = await supabaseService
        .from('clientes')
        .insert({
          nombre: nombre.trim(),
          email: email?.trim() || null,
          telefono: telefono?.trim() || null,
        })
        .select('id')
        .single()

      if (errorCliente) {
        console.error('Error creando cliente durante cobro QR:', errorCliente)
      } else if (nuevoCliente) {
        clienteId = nuevoCliente.id
      }
    }
  }

  let session
  try {
    session = await stripe.checkout.sessions.create({
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
      // Con esto el webhook puede reconstruir la fila de `pagos` si el insert
      // de abajo fallara (ver app/api/stripe/webhook/route.ts).
      metadata: {
        tipo: 'cobro_local',
        concepto: concepto.trim(),
        cliente_id: clienteId ?? '',
        servicio_id: servicio_id || '',
      },
    })
  } catch (errorStripe) {
    console.error('Error creando la sesión de pago en Stripe (cobro QR):', errorStripe)
    return NextResponse.json(
      { error: 'No se pudo generar el cobro en Stripe. Inténtalo de nuevo en unos minutos o cobra en efectivo.' },
      { status: 502 }
    )
  }

  const { data: pago, error: errorPago } = await supabaseService
    .from('pagos')
    .insert({
      cita_id: null,
      cliente_id: clienteId,
      servicio_id: servicio_id || null,
      concepto: concepto.trim(),
      stripe_session_id: session.id,
      monto: montoNumero,
      estado: 'pendiente',
      metodo_pago: 'qr_local',
    })
    .select('id')
    .single()

  if (errorPago || !pago) {
    console.error(`Error registrando el cobro QR (sesión ${session.id}):`, errorPago)
    // Sin fila en `pagos` el panel no podría ver el pago: la sesión no debe quedar pagable.
    try {
      await stripe.checkout.sessions.expire(session.id)
    } catch (errorExpirar) {
      console.error(`Error expirando la sesión de Stripe ${session.id}:`, errorExpirar)
    }
    return NextResponse.json({ error: 'No se pudo registrar el cobro. Inténtalo de nuevo.' }, { status: 500 })
  }

  return NextResponse.json({
    url: session.url,
    sessionId: session.id,
    pagoId: pago.id,
  })
}
