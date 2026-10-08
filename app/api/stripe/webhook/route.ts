import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { getResend } from '@/lib/resend'
import { escaparHtml } from '@/lib/html'
import Stripe from 'stripe'

type SupabaseService = ReturnType<typeof createServiceClient>

// Se llega aquí cuando Stripe cobró una sesión que no tiene fila en `pagos`
// (falló el insert en /api/citas/[id] o /api/cobros). Se reconstruye desde la
// metadata de la sesión para que el pago no se pierda. Las sesiones creadas
// antes de añadir cliente_id/servicio_id a la metadata solo traen cita_id:
// en ese caso se completan desde la cita.
async function crearPagoDesdeSesion(supabase: SupabaseService, session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {}
  const citaId = metadata.cita_id || null
  let clienteId = metadata.cliente_id || null
  let servicioId = metadata.servicio_id || null
  let concepto = metadata.concepto || null

  if (citaId && (!clienteId || !servicioId || !concepto)) {
    const { data: cita, error } = await supabase
      .from('citas')
      .select('cliente_id, servicio_id, servicios(nombre)')
      .eq('id', citaId)
      .maybeSingle()
    if (error) {
      console.error(`Error leyendo la cita ${citaId} para reconstruir el pago:`, error)
    }
    clienteId ??= cita?.cliente_id ?? null
    servicioId ??= cita?.servicio_id ?? null
    concepto ??= cita?.servicios?.nombre ?? null
  }

  return supabase
    .from('pagos')
    .insert({
      cita_id: citaId,
      cliente_id: clienteId,
      servicio_id: servicioId,
      concepto: concepto ?? 'Pago con tarjeta',
      monto: (session.amount_total ?? 0) / 100,
      estado: 'pagado',
      metodo_pago: citaId ? 'web' : 'qr_local',
      stripe_session_id: session.id,
      stripe_payment_intent_id:
        typeof session.payment_intent === 'string' ? session.payment_intent : null,
    })
    .select('id')
}

// POST /api/stripe/webhook
// Stripe llama a este endpoint cuando ocurre un evento (pago completado, fallido, etc).
// Usa service_role porque no hay un usuario logueado en este contexto — es
// Stripe hablando directo con el servidor, verificado por firma criptográfica.
export async function POST(request: NextRequest) {
  const body = await request.text()
  const firma = request.headers.get('stripe-signature')

  if (!firma) {
    return NextResponse.json({ error: 'Falta la firma de Stripe' }, { status: 400 })
  }

  let evento: Stripe.Event

  try {
    evento = stripe.webhooks.constructEvent(
      body,
      firma,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Firma de webhook inválida:', err)
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 })
  }

  const supabase = createServiceClient()

  if (evento.type === 'checkout.session.completed') {
    const session = evento.data.object as Stripe.Checkout.Session

    const { data: pagosActualizados, error } = await supabase
      .from('pagos')
      .update({
        estado: 'pagado',
        stripe_payment_intent_id:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
      })
      .eq('stripe_session_id', session.id)
      .select('id')

    if (error) {
      console.error('Error actualizando el pago tras checkout.session.completed:', error)
      // Devolvemos 500 para que Stripe reintente el webhook automáticamente
      return NextResponse.json({ error: 'Error actualizando el pago' }, { status: 500 })
    }

    if (!pagosActualizados || pagosActualizados.length === 0) {
      console.error(
        `checkout.session.completed sin fila en pagos para la sesión ${session.id}: se crea desde la metadata`,
        session.metadata
      )
      const { error: errorInsert } = await crearPagoDesdeSesion(supabase, session)
      if (errorInsert) {
        console.error(`Error creando el pago desde la sesión ${session.id}:`, errorInsert)
        return NextResponse.json({ error: 'Error registrando el pago' }, { status: 500 })
      }
    }

    // Enviar confirmación de pago al cliente
    const citaId = session.metadata?.cita_id
    if (citaId) {
      const { data: cita, error: errorCita } = await supabase
        .from('citas')
        .select('fecha, hora_inicio, clientes(nombre, email), servicios(nombre, precio)')
        .eq('id', citaId)
        .maybeSingle()

      if (errorCita) {
        console.error(`Error leyendo la cita ${citaId} para el email de pago:`, errorCita)
      }

      if (cita?.clientes?.email) {
        const resend = getResend()
        if (resend) {
          try {
            const { error: errorResend } = await resend.emails.send({
              from: 'Estudio Débora Pereira <reservas@estudiodeborapereira.com>',
              to: cita.clientes.email,
              subject: '¡Pago recibido! Tu cita está lista ✨',
              html: `
                <h2>¡Pago confirmado!</h2>
                <p>Hola ${escaparHtml(cita.clientes.nombre)}, recibimos tu pago correctamente.</p>
                <p><strong>Servicio:</strong> ${escaparHtml(cita.servicios?.nombre ?? '')}</p>
                <p><strong>Fecha:</strong> ${escaparHtml(cita.fecha)}</p>
                <p><strong>Hora:</strong> ${escaparHtml(cita.hora_inicio)}</p>
                ${
                  cita.servicios?.precio != null
                    ? `<p><strong>Monto pagado:</strong> ${new Intl.NumberFormat('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(cita.servicios.precio)}</p>`
                    : ''
                }
                <p>Te esperamos en el estudio. ¡Gracias por tu reserva!</p>
              `,
            })
            if (errorResend) {
              console.error('Error de Resend al enviar email:', errorResend)
            }
          } catch (errorEmail) {
            console.error('Error enviando email de confirmación de pago:', errorEmail)
          }
        } else {
          console.warn('RESEND_API_KEY no configurada, se omite el envío de email')
        }
      }
    }

    if (!citaId) {
      // Pago de QR local (sin cita) — buscamos el cliente vinculado directo
      // en la fila de pagos, si lo hay.
      const { data: pagoConCliente, error: errorPagoCliente } = await supabase
        .from('pagos')
        .select('concepto, monto, clientes(nombre, email)')
        .eq('stripe_session_id', session.id)
        .maybeSingle()

      if (errorPagoCliente) {
        console.error(`Error leyendo el pago de la sesión ${session.id} para el recibo:`, errorPagoCliente)
      }

      if (pagoConCliente?.clientes?.email) {
        const resend = getResend()
        if (resend) {
          try {
            const { error: errorResend } = await resend.emails.send({
              from: 'Estudio Débora Pereira <reservas@estudiodeborapereira.com>',
              to: pagoConCliente.clientes.email,
              subject: 'Recibo de tu compra ✨',
              html: `
                <h2>¡Gracias por tu compra!</h2>
                <p>Hola ${escaparHtml(pagoConCliente.clientes.nombre || '')}, este es tu recibo.</p>
                <p><strong>Concepto:</strong> ${escaparHtml(pagoConCliente.concepto ?? '')}</p>
                <p><strong>Monto:</strong> ${new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(pagoConCliente.monto)}</p>
                <p><strong>Método de pago:</strong> Tarjeta (en el estudio)</p>
                <p>Gracias por confiar en Estudio Débora Pereira.</p>
              `,
            })
            if (errorResend) {
              console.error('Error de Resend al enviar email:', errorResend)
            }
          } catch (errorEmail) {
            console.error('Error enviando recibo por email (QR local):', errorEmail)
          }
        }
      }
    }
  }

  if (evento.type === 'checkout.session.expired') {
    const session = evento.data.object as Stripe.Checkout.Session

    const { data: pagosExpirados, error } = await supabase
      .from('pagos')
      .update({ estado: 'fallido' })
      .eq('stripe_session_id', session.id)
      .select('id')

    if (error) {
      console.error(`Error marcando como fallido el pago de la sesión ${session.id}:`, error)
      return NextResponse.json({ error: 'Error actualizando el pago' }, { status: 500 })
    }

    if (!pagosExpirados || pagosExpirados.length === 0) {
      // Esperable si la expiramos nosotros porque su fila nunca llegó a crearse
      // (ver /api/citas/[id] y /api/cobros); se registra por si no fuera el caso.
      console.warn(`checkout.session.expired sin fila en pagos para la sesión ${session.id}`)
    }
  }

  return NextResponse.json({ received: true })
}
