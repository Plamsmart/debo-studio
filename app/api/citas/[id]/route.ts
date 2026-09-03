import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getResend } from '@/lib/resend'
import { stripe, SITE_URL } from '@/lib/stripe'

// PATCH /api/citas/[id]
// Body: { accion: 'confirmar' | 'cancelar' }
// Al confirmar: crea una Stripe Checkout Session para el pago, guarda el registro
// en `pagos`, y envía al cliente el link de pago por email.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = await request.json()
  const { accion } = body

  if (accion !== 'confirmar' && accion !== 'cancelar') {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }

  const nuevoEstado = accion === 'confirmar' ? 'confirmada' : 'cancelada'

  const { data: citaActualizada, error } = await supabase
    .from('citas')
    .update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() })
    .eq('id', id)
    .select('*, clientes(nombre, email), servicios(nombre, precio)')
    .single()

  if (error || !citaActualizada) {
    return NextResponse.json(
      { error: 'No se pudo actualizar la cita (verifica permisos de administrador)' },
      { status: 403 }
    )
  }

  if (accion !== 'confirmar') {
    return NextResponse.json({ cita: citaActualizada })
  }

  // --- A partir de aquí, solo pasa cuando se CONFIRMA la cita ---

  if (!citaActualizada.clientes?.email) {
    // Sin email no podemos mandar link de pago; la cita queda confirmada igual,
    // el cobro habría que gestionarlo manualmente (ej. en el local).
    return NextResponse.json({
      cita: citaActualizada,
      aviso: 'Cita confirmada, pero el cliente no tiene email para enviarle el link de pago.',
    })
  }

  const precio = citaActualizada.servicios?.precio ?? 0
  const montoEnCentavos = Math.round(precio * 100)

  // Creamos la sesión de pago en Stripe
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: citaActualizada.servicios?.nombre || 'Servicio',
          },
          unit_amount: montoEnCentavos,
        },
        quantity: 1,
      },
    ],
    customer_email: citaActualizada.clientes.email,
    success_url: `${SITE_URL}/pago-exitoso?cita_id=${citaActualizada.id}`,
    cancel_url: `${SITE_URL}/pago-cancelado?cita_id=${citaActualizada.id}`,
    metadata: {
      cita_id: citaActualizada.id,
    },
  })

  // Guardamos el registro de pago en 'pendiente'. Usamos service_role porque
  // la tabla `pagos` solo tiene policy de SELECT para admin — el insert real
  // de pagos está pensado para pasar por procesos de servidor controlados
  // (este endpoint, y el webhook de Stripe), nunca desde el navegador.
  const supabaseService = createServiceClient()
  const { error: errorPago } = await supabaseService.from('pagos').insert({
    cita_id: citaActualizada.id,
    stripe_session_id: session.id,
    monto: precio,
    estado: 'pendiente',
    concepto: citaActualizada.servicios?.nombre || 'Cita',
    cliente_id: citaActualizada.cliente_id,
    servicio_id: citaActualizada.servicio_id,
  })

  if (errorPago) {
    console.error('Error guardando el registro de pago:', errorPago)
    // No bloqueamos la respuesta por esto — la cita ya está confirmada y el
    // link de pago existe en Stripe; el webhook igual podrá reconciliarlo
    // si se resuelve el problema de inserción, pero lo dejamos registrado.
  }

  // Enviamos el email con el link de pago real
  const resend = getResend()
  if (resend) {
    try {
      const { error: errorResend } = await resend.emails.send({
        from: 'Estudio Débora Pereira <onboarding@resend.dev>',
        to: citaActualizada.clientes.email,
        subject: 'Tu cita fue confirmada ✨ — Completa tu pago',
        html: `
          <h2>¡Tu cita quedó confirmada!</h2>
          <p><strong>Servicio:</strong> ${citaActualizada.servicios?.nombre}</p>
          <p><strong>Fecha:</strong> ${citaActualizada.fecha}</p>
          <p><strong>Hora:</strong> ${citaActualizada.hora_inicio}</p>
          <p>Para completar tu reserva, realiza el pago aquí:</p>
          <p><a href="${session.url}" style="display:inline-block;padding:12px 20px;background:#b08d57;color:#fff;text-decoration:none;border-radius:8px;">Pagar ahora</a></p>
        `,
      })
      if (errorResend) {
        console.error('Error de Resend al enviar email:', errorResend)
      }
    } catch (errorEmail) {
      console.error('Error enviando email de confirmación al cliente:', errorEmail)
    }
  } else {
    console.warn('RESEND_API_KEY no configurada, se omite el envío de email')
  }

  return NextResponse.json({ cita: citaActualizada, linkPago: session.url })
}
