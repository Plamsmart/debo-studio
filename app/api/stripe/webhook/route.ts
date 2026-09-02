import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { getResend } from '@/lib/resend'
import Stripe from 'stripe'

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

    const { error } = await supabase
      .from('pagos')
      .update({
        estado: 'pagado',
        stripe_payment_intent_id:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
      })
      .eq('stripe_session_id', session.id)

    if (error) {
      console.error('Error actualizando el pago tras checkout.session.completed:', error)
      // Devolvemos 500 para que Stripe reintente el webhook automáticamente
      return NextResponse.json({ error: 'Error actualizando el pago' }, { status: 500 })
    }

    // Enviar confirmación de pago al cliente
    const citaId = session.metadata?.cita_id
    if (citaId) {
      const { data: cita } = await supabase
        .from('citas')
        .select('fecha, hora_inicio, clientes(nombre, email), servicios(nombre, precio)')
        .eq('id', citaId)
        .single()

      if (cita?.clientes?.email) {
        const resend = getResend()
        if (resend) {
          try {
            await resend.emails.send({
              from: 'Estudio Débora Pereira <onboarding@resend.dev>',
              to: cita.clientes.email,
              subject: '¡Pago recibido! Tu cita está lista ✨',
              html: `
                <h2>¡Pago confirmado!</h2>
                <p>Hola ${cita.clientes.nombre}, recibimos tu pago correctamente.</p>
                <p><strong>Servicio:</strong> ${cita.servicios?.nombre}</p>
                <p><strong>Fecha:</strong> ${cita.fecha}</p>
                <p><strong>Hora:</strong> ${cita.hora_inicio}</p>
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
      const { data: pagoConCliente } = await supabase
        .from('pagos')
        .select('concepto, monto, clientes(nombre, email)')
        .eq('stripe_session_id', session.id)
        .single()

      if (pagoConCliente?.clientes?.email) {
        const resend = getResend()
        if (resend) {
          try {
            await resend.emails.send({
              from: 'Estudio Débora Pereira <onboarding@resend.dev>',
              to: pagoConCliente.clientes.email,
              subject: 'Recibo de tu compra ✨',
              html: `
                <h2>¡Gracias por tu compra!</h2>
                <p>Hola ${pagoConCliente.clientes.nombre || ''}, este es tu recibo.</p>
                <p><strong>Concepto:</strong> ${pagoConCliente.concepto}</p>
                <p><strong>Monto:</strong> ${new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(pagoConCliente.monto)}</p>
                <p><strong>Método de pago:</strong> Tarjeta (en el estudio)</p>
                <p>Gracias por confiar en Estudio Débora Pereira.</p>
              `,
            })
          } catch (errorEmail) {
            console.error('Error enviando recibo por email (QR local):', errorEmail)
          }
        }
      }
    }
  }

  if (evento.type === 'checkout.session.expired') {
    const session = evento.data.object as Stripe.Checkout.Session

    await supabase
      .from('pagos')
      .update({ estado: 'fallido' })
      .eq('stripe_session_id', session.id)
  }

  return NextResponse.json({ received: true })
}
